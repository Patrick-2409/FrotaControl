require("dotenv").config();
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const companies = await pool.query(
      `SELECT
         e.id,
         e.nome,
         e.created_at,
         COUNT(u.id) FILTER (WHERE u.role = 'ADMIN_EMPRESA')::int AS admins,
         COUNT(u.id) FILTER (WHERE u.role = 'MOTORISTA')::int AS motoristas
       FROM empresas e
       LEFT JOIN usuarios u ON u.empresa_id = e.id
       GROUP BY e.id, e.nome, e.created_at
       ORDER BY e.id DESC
       LIMIT 100`
    );

    const users = await pool.query(
      `SELECT id, nome, email, cpf_id, role, empresa_id, created_at
       FROM usuarios
       ORDER BY id DESC
       LIMIT 200`
    );

    console.log("=== EMPRESAS ===");
    for (const row of companies.rows) {
      console.log(row);
    }

    console.log("=== USUARIOS ===");
    for (const row of users.rows) {
      console.log(row);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
require("dotenv").config();
const { pool } = require("../src/db");

async function run() {
  const empresas = await pool.query(
    "SELECT id, nome, logo_url, created_at FROM empresas ORDER BY id DESC LIMIT 20"
  );
  const usuarios = await pool.query(
    "SELECT id, empresa_id, nome, email, cpf_id, role, created_at FROM usuarios ORDER BY id DESC LIMIT 80"
  );
  const adminsPorEmpresa = await pool.query(
    `SELECT
      e.id AS empresa_id,
      e.nome AS empresa_nome,
      COUNT(*) FILTER (WHERE u.role = 'ADMIN_EMPRESA')::int AS admins,
      COUNT(*) FILTER (WHERE u.role = 'MOTORISTA')::int AS motoristas
    FROM empresas e
    LEFT JOIN usuarios u ON u.empresa_id = e.id
    GROUP BY e.id, e.nome
    ORDER BY e.id DESC
    LIMIT 50`
  );
  const admins = await pool.query(
    "SELECT id, empresa_id, nome, email, cpf_id, role FROM usuarios WHERE role = 'ADMIN_EMPRESA' ORDER BY id DESC LIMIT 50"
  );

  console.log("EMPRESAS");
  console.log(JSON.stringify(empresas.rows, null, 2));
  console.log("USUARIOS");
  console.log(JSON.stringify(usuarios.rows, null, 2));
  console.log("ADMINS_POR_EMPRESA");
  console.log(JSON.stringify(adminsPorEmpresa.rows, null, 2));
  console.log("ADMIN_EMPRESA_USERS");
  console.log(JSON.stringify(admins.rows, null, 2));
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
