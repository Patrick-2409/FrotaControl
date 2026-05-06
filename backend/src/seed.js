const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const { logInfo } = require("./services/loggerService");

/** CPF interno só para satisfazer NOT NULL; super admin não usa login por CPF. */
const SUPER_ADMIN_SEED_CPF = "00000000001";

/**
 * Garante um usuário com role SUPER_ADMIN (enum do PostgreSQL; equivalente a "superadmin" no produto).
 * Roda em qualquer NODE_ENV, inclusive produção (Render).
 */
const ensureSuperAdminSeed = async () => {
  const existing = await pool.query(
    `SELECT 1 FROM usuarios WHERE role = 'SUPER_ADMIN' LIMIT 1`
  );
  if (existing.rowCount > 0) {
    console.log("Superadmin já existe");
    return;
  }

  const senha_hash = await bcrypt.hash("123456", 10);
  await pool.query(
    `INSERT INTO usuarios (empresa_id, nome, email, cpf_id, senha_hash, role, veiculo_id)
     VALUES (NULL, $1, $2, $3, $4, 'SUPER_ADMIN', NULL)`,
    ["Super Admin", "admin@frotacontrol.com", SUPER_ADMIN_SEED_CPF, senha_hash]
  );

  console.log("Superadmin criado automaticamente");
  logInfo("seed:super-admin-auto", {
    email: "admin@frotacontrol.com",
    message: "Superadmin criado automaticamente",
  });
};

const seedIfEmpty = async () => {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS total FROM empresas");
  if (rows[0].total > 0) return;

  const company = await pool.query(
    `INSERT INTO empresas (nome, logo_url)
     VALUES ($1, $2)
     RETURNING *`,
    ["Porto Central", null]
  );
  const empresa = company.rows[0];

  const v1 = await pool.query(
    "INSERT INTO veiculos (empresa_id, nome, placa, marca, modelo) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [empresa.id, "Escavadeira X1", "ABC1D23", "Caterpillar", "320"]
  );
  const v2 = await pool.query(
    "INSERT INTO veiculos (empresa_id, nome, placa, marca, modelo) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [empresa.id, "Caminhão C2", "EFG4H56", "Volvo", "FMX"]
  );

  const driverPass = await bcrypt.hash("123456", 10);

  await pool.query(
    `INSERT INTO usuarios (empresa_id, nome, email, cpf_id, senha_hash, role, veiculo_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7), ($1,$8,$9,$10,$11,$6,$12)`,
    [
      empresa.id,
      "Motorista João",
      "joao@frotacontrol.com",
      "11111111111",
      driverPass,
      "MOTORISTA",
      v1.rows[0].id,
      "Motorista Maria",
      "maria@frotacontrol.com",
      "22222222222",
      driverPass,
      v2.rows[0].id,
    ]
  );

  await pool.query(
    `INSERT INTO usuarios (empresa_id, nome, email, cpf_id, senha_hash, role, veiculo_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      empresa.id,
      "Admin Empresa Porto Central",
      "admin.porto@frotacontrol.com",
      "admin.porto@frotacontrol.com",
      await bcrypt.hash("Admin123", 10),
      "ADMIN_EMPRESA",
      v1.rows[0].id,
    ]
  );

  logInfo("seed:applied", { message: "Seed inicial dev: empresa + MOTORISTAS + ADMIN_EMPRESA (super admin via ensureSuperAdminSeed)." });
};

module.exports = { seedIfEmpty, ensureSuperAdminSeed };
