const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { Pool } = require("pg");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const duplicateAdminEmails = await pool.query(
      `SELECT LOWER(COALESCE(email, '')) AS email_norm, role, COUNT(*)::int AS total, ARRAY_AGG(id ORDER BY id) AS ids
       FROM usuarios
       WHERE role IN ('ADMIN_EMPRESA', 'SUPER_ADMIN')
       GROUP BY LOWER(COALESCE(email, '')), role
       HAVING COUNT(*) > 1`
    );
    const duplicateMotoristaCpf = await pool.query(
      `SELECT cpf_id, COUNT(*)::int AS total, ARRAY_AGG(id ORDER BY id) AS ids
       FROM usuarios
       WHERE role = 'MOTORISTA'
       GROUP BY cpf_id
       HAVING COUNT(*) > 1`
    );
    const invalidHashes = await pool.query(
      `SELECT id, role, email, cpf_id
       FROM usuarios
       WHERE senha_hash IS NULL OR senha_hash !~ '^\\$2[aby]\\$'`
    );

    console.log("duplicateAdminEmails:", duplicateAdminEmails.rows);
    console.log("duplicateMotoristaCpf:", duplicateMotoristaCpf.rows);
    console.log("invalidHashes:", invalidHashes.rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
