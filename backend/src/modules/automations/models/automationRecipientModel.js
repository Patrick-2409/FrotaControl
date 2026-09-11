/**
 * Acesso a dados de `automacao_destinatarios`. Mesmo princípio de
 * `automationApproverModel.js`: sempre escopado por `automacao_config_id`,
 * cuja posse já foi validada pelo controller antes de chegar aqui.
 */

const { pool } = require("../../../db");

const listRecipients = async (configId) => {
  const { rows } = await pool.query(
    `SELECT id, automacao_config_id, tipo, nome, email, ativo, created_at, updated_at
     FROM automacao_destinatarios
     WHERE automacao_config_id = $1
     ORDER BY tipo ASC, created_at ASC`,
    [configId]
  );
  return rows;
};

const createRecipient = async (configId, empresaId, data) => {
  const { rows } = await pool.query(
    `INSERT INTO automacao_destinatarios (empresa_id, automacao_config_id, tipo, nome, email, ativo)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, automacao_config_id, tipo, nome, email, ativo, created_at, updated_at`,
    [empresaId, configId, data.tipo || "TO", data.nome ?? null, data.email, data.ativo ?? true]
  );
  return rows[0];
};

const updateRecipient = async (recipientId, configId, data) => {
  const { rows } = await pool.query(
    `UPDATE automacao_destinatarios SET
       tipo = COALESCE($3, tipo),
       nome = COALESCE($4, nome),
       email = COALESCE($5, email),
       ativo = COALESCE($6, ativo),
       updated_at = NOW()
     WHERE id = $1 AND automacao_config_id = $2
     RETURNING id, automacao_config_id, tipo, nome, email, ativo, created_at, updated_at`,
    [recipientId, configId, data.tipo ?? null, data.nome ?? null, data.email ?? null, data.ativo ?? null]
  );
  return rows[0] || null;
};

const deleteRecipient = async (recipientId, configId) => {
  const { rowCount } = await pool.query(
    `DELETE FROM automacao_destinatarios WHERE id = $1 AND automacao_config_id = $2`,
    [recipientId, configId]
  );
  return rowCount > 0;
};

module.exports = { listRecipients, createRecipient, updateRecipient, deleteRecipient };
