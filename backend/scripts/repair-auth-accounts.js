const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const SUPER_ADMIN_EMAIL = "admin@frotacontrol.com";
const SUPER_ADMIN_PASSWORD = "AdminSistema123";
const ADMIN_EMPRESA_PASSWORD = "AdminEmpresa123";
const MOTORISTA_PASSWORD = "Motorista123";

async function ensureCompany(pool) {
  const existing = await pool.query("SELECT id, nome FROM empresas ORDER BY id ASC LIMIT 1");
  if (existing.rowCount) return existing.rows[0];
  const created = await pool.query(
    "INSERT INTO empresas (nome, logo_url) VALUES ($1, $2) RETURNING id, nome",
    ["Porto Central", null]
  );
  return created.rows[0];
}

async function ensureVehicle(pool, empresaId) {
  const existing = await pool.query(
    "SELECT id, nome, placa FROM veiculos WHERE empresa_id = $1 ORDER BY id ASC LIMIT 1",
    [empresaId]
  );
  if (existing.rowCount) return existing.rows[0];
  const created = await pool.query(
    "INSERT INTO veiculos (empresa_id, nome, placa) VALUES ($1, $2, $3) RETURNING id, nome, placa",
    [empresaId, "Veiculo Operacional", "AAA1A11"]
  );
  return created.rows[0];
}

async function ensureSuperAdmin(pool) {
  const hash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
  const existing = await pool.query(
    "SELECT id FROM usuarios WHERE LOWER(COALESCE(email, '')) = LOWER($1) AND role = 'SUPER_ADMIN' LIMIT 1",
    [SUPER_ADMIN_EMAIL]
  );
  if (existing.rowCount) {
    await pool.query("UPDATE usuarios SET senha_hash = $2 WHERE id = $1", [existing.rows[0].id, hash]);
    return { id: existing.rows[0].id, email: SUPER_ADMIN_EMAIL, created: false };
  }

  const created = await pool.query(
    `INSERT INTO usuarios (empresa_id, nome, email, cpf_id, senha_hash, role, veiculo_id)
     VALUES (NULL, $1, $2, $3, $4, 'SUPER_ADMIN', NULL)
     RETURNING id`,
    ["Administrador Frota", SUPER_ADMIN_EMAIL, SUPER_ADMIN_EMAIL, hash]
  );
  return { id: created.rows[0].id, email: SUPER_ADMIN_EMAIL, created: true };
}

async function ensureAdminEmpresa(pool, empresa) {
  const email = `admin.${empresa.id}@frotacontrol.com`;
  const hash = await bcrypt.hash(ADMIN_EMPRESA_PASSWORD, 10);
  const existing = await pool.query(
    "SELECT id FROM usuarios WHERE empresa_id = $1 AND role = 'ADMIN_EMPRESA' ORDER BY id ASC LIMIT 1",
    [empresa.id]
  );
  if (existing.rowCount) {
    await pool.query(
      `UPDATE usuarios
       SET nome = $2, email = COALESCE(email, $3), cpf_id = COALESCE(cpf_id, $3), senha_hash = $4, veiculo_id = NULL
       WHERE id = $1`,
      [existing.rows[0].id, `Admin ${empresa.nome}`, email, hash]
    );
    const updated = await pool.query("SELECT id, email FROM usuarios WHERE id = $1", [existing.rows[0].id]);
    return { id: updated.rows[0].id, email: updated.rows[0].email, created: false };
  }

  const created = await pool.query(
    `INSERT INTO usuarios (empresa_id, nome, email, cpf_id, senha_hash, role, veiculo_id)
     VALUES ($1, $2, $3, $3, $4, 'ADMIN_EMPRESA', NULL)
     RETURNING id, email`,
    [empresa.id, `Admin ${empresa.nome}`, email, hash]
  );
  return { id: created.rows[0].id, email: created.rows[0].email, created: true };
}

async function ensureMotorista(pool, empresa, veiculo) {
  const cpf = "11111111111";
  const email = `motorista.${empresa.id}@frotacontrol.com`;
  const hash = await bcrypt.hash(MOTORISTA_PASSWORD, 10);
  const existing = await pool.query(
    "SELECT id FROM usuarios WHERE empresa_id = $1 AND role = 'MOTORISTA' ORDER BY id ASC LIMIT 1",
    [empresa.id]
  );
  if (existing.rowCount) {
    await pool.query(
      `UPDATE usuarios
       SET nome = $2, email = COALESCE(email, $3), cpf_id = COALESCE(cpf_id, $4), senha_hash = $5, veiculo_id = $6
       WHERE id = $1`,
      [existing.rows[0].id, `Motorista ${empresa.nome}`, email, cpf, hash, veiculo.id]
    );
    const updated = await pool.query("SELECT id, email, cpf_id FROM usuarios WHERE id = $1", [existing.rows[0].id]);
    return {
      id: updated.rows[0].id,
      email: updated.rows[0].email,
      cpf_id: updated.rows[0].cpf_id,
      created: false,
    };
  }

  const created = await pool.query(
    `INSERT INTO usuarios (empresa_id, nome, email, cpf_id, senha_hash, role, veiculo_id)
     VALUES ($1, $2, $3, $4, $5, 'MOTORISTA', $6)
     RETURNING id, email, cpf_id`,
    [empresa.id, `Motorista ${empresa.nome}`, email, cpf, hash, veiculo.id]
  );
  return {
    id: created.rows[0].id,
    email: created.rows[0].email,
    cpf_id: created.rows[0].cpf_id,
    created: true,
  };
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const empresa = await ensureCompany(pool);
    const veiculo = await ensureVehicle(pool, empresa.id);
    const superAdmin = await ensureSuperAdmin(pool);
    const adminEmpresa = await ensureAdminEmpresa(pool, empresa);
    const motorista = await ensureMotorista(pool, empresa, veiculo);

    console.log("=== AUTH ACCOUNTS READY ===");
    console.log({ empresa, veiculo });
    console.log({
      superAdmin: {
        email: superAdmin.email,
        senha: SUPER_ADMIN_PASSWORD,
      },
    });
    console.log({
      adminEmpresa: {
        email: adminEmpresa.email,
        senha: ADMIN_EMPRESA_PASSWORD,
      },
    });
    console.log({
      motorista: {
        login_email: motorista.email,
        login_cpf: motorista.cpf_id,
        senha: MOTORISTA_PASSWORD,
      },
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
