const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { pool } = require("../db");

const createMotoristaSchema = z.object({
  login: z.string().trim().min(3),
  senha: z.string().min(6),
});

const ensureCompanyForDevUser = async () => {
  const existing = await pool.query("SELECT id FROM empresas ORDER BY id ASC LIMIT 1");
  if (existing.rowCount) {
    return existing.rows[0].id;
  }

  const created = await pool.query(
    "INSERT INTO empresas (nome) VALUES ($1) RETURNING id",
    ["Empresa Dev FrotaControl"]
  );
  return created.rows[0].id;
};

const createMotoristaDev = async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      success: false,
      error: "Endpoint de desenvolvimento indisponivel em producao.",
      message: "Endpoint de desenvolvimento indisponivel em producao.",
    });
  }

  const data = createMotoristaSchema.parse(req.body);
  const login = data.login.trim();
  const senha_hash = await bcrypt.hash(data.senha, 10);
  const empresa_id = await ensureCompanyForDevUser();

  const existing = await pool.query(
    `SELECT id, empresa_id
     FROM usuarios
     WHERE role = 'MOTORISTA'
       AND (cpf_id = $1 OR LOWER(COALESCE(email, '')) = LOWER($1))
     ORDER BY id ASC`,
    [login]
  );

  if (existing.rowCount > 1) {
    return res.status(409).json({
      success: false,
      error: "Mais de um motorista encontrado para este login. Limpe os dados duplicados antes de continuar.",
      message: "Mais de um motorista encontrado para este login. Limpe os dados duplicados antes de continuar.",
    });
  }

  const email = login.includes("@") ? login.toLowerCase() : null;
  const nome = `Motorista Teste ${login}`;

  if (existing.rowCount === 1) {
    const userId = existing.rows[0].id;
    const companyId = existing.rows[0].empresa_id || empresa_id;
    const { rows } = await pool.query(
      `UPDATE usuarios
       SET empresa_id = $2,
           nome = $3,
           email = $4,
           cpf_id = $5,
           senha_hash = $6,
           role = 'MOTORISTA',
           veiculo_id = NULL
       WHERE id = $1
       RETURNING id, empresa_id, nome, email, cpf_id, role`,
      [userId, companyId, nome, email, login, senha_hash]
    );

    return res.status(200).json({
      success: true,
      message: "Motorista de teste atualizado com sucesso.",
      endpoint: "/api/auth/motorista-login",
      credentials: { login, senha: data.senha },
      user: rows[0],
    });
  }

  const { rows } = await pool.query(
    `INSERT INTO usuarios (empresa_id, nome, email, cpf_id, senha_hash, role, veiculo_id)
     VALUES ($1, $2, $3, $4, $5, 'MOTORISTA', NULL)
     RETURNING id, empresa_id, nome, email, cpf_id, role`,
    [empresa_id, nome, email, login, senha_hash]
  );

  return res.status(201).json({
    success: true,
    message: "Motorista de teste criado com sucesso.",
    endpoint: "/api/auth/motorista-login",
    credentials: { login, senha: data.senha },
    user: rows[0],
  });
};

module.exports = {
  createMotoristaDev,
};
