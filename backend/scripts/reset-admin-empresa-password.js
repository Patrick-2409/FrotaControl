const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];
  if (!email || !newPassword) {
    console.error("Uso: node scripts/reset-admin-empresa-password.js <email> <nova_senha>");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `UPDATE usuarios
       SET senha_hash = $2
       WHERE LOWER(COALESCE(email, '')) = LOWER($1)
         AND role = 'ADMIN_EMPRESA'
       RETURNING id, nome, email, role, empresa_id`,
      [email, hash]
    );
    console.log("updated", result.rowCount);
    if (result.rowCount) {
      console.log(result.rows[0]);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
