const { pool } = require("../db");

const ADMIN_AUDIT_TABLES = ["empresas", "usuarios", "veiculos"];

const logAudit = async ({ usuario_id, acao, tabela, registro_id }) => {
  await pool.query(
    `INSERT INTO audit_logs (usuario_id, acao, tabela, registro_id)
     VALUES ($1, $2, $3, $4)`,
    [usuario_id || null, acao, tabela, String(registro_id)]
  );
};

/** Histórico de alterações feitas no painel super-admin (empresas, utilizadores, veículos). */
const listPlatformAdminAuditLogs = async ({ page = 1, limit = 25 }) => {
  const safeLimit = Math.min(100, Math.max(5, Number(limit) || 25));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM audit_logs a
     WHERE a.tabela = ANY($1::text[])`,
    [ADMIN_AUDIT_TABLES]
  );
  const total = count.rows[0].total;
  const { rows } = await pool.query(
    `SELECT
       a.id,
       a.usuario_id,
       a.acao,
       a.tabela,
       a.registro_id,
       a.created_at,
       u.nome AS usuario_nome,
       u.email AS usuario_email
     FROM audit_logs a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.tabela = ANY($1::text[])
     ORDER BY a.created_at DESC
     LIMIT $2 OFFSET $3`,
    [ADMIN_AUDIT_TABLES, safeLimit, offset]
  );
  return {
    items: rows,
    total,
    page: safePage,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

module.exports = { logAudit, listPlatformAdminAuditLogs };
