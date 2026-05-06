const { pool } = require("../db");

const logAudit = async ({ usuario_id, acao, tabela, registro_id }) => {
  await pool.query(
    `INSERT INTO audit_logs (usuario_id, acao, tabela, registro_id)
     VALUES ($1, $2, $3, $4)`,
    [usuario_id || null, acao, tabela, String(registro_id)]
  );
};

module.exports = { logAudit };
