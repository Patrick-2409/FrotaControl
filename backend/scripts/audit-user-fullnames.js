require("dotenv").config();
const { Pool } = require("pg");

const hasFullName = (value) => {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  return normalized.split(" ").filter(Boolean).length >= 2;
};

const isGenericName = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.startsWith("motorista ") ||
    normalized.startsWith("admin ") ||
    normalized.startsWith("administrador ") ||
    normalized.includes("teste")
  );
};

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `SELECT id, nome, email, cpf_id, role, empresa_id
       FROM usuarios
       WHERE role IN ('MOTORISTA', 'ADMIN_EMPRESA', 'SUPER_ADMIN')
       ORDER BY created_at DESC`
    );
    const invalid = result.rows
      .filter((row) => !hasFullName(row.nome) || isGenericName(row.nome))
      .map((row) => ({
        ...row,
        motivo: !hasFullName(row.nome) ? "nome_incompleto" : "nome_generico",
      }));
    console.log({
      totalUsuariosAuditados: result.rows.length,
      totalNomesInvalidos: invalid.length,
      usuariosComNomeIncompleto: invalid,
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
