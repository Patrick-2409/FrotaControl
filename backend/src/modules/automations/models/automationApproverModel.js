/**
 * Acesso a dados de `automacao_aprovadores`. Sempre escopado por
 * `automacao_config_id` — o controller garante previamente (via
 * automationConfigModel.getConfigById) que a config pertence ao tenant do
 * usuário autenticado antes de chamar qualquer função deste model, então
 * "aprovador global por acidente" é estruturalmente impossível: a coluna é
 * NOT NULL e toda query exige o id da config.
 */

const { pool } = require("../../../db");

const listApprovers = async (configId) => {
  const { rows } = await pool.query(
    `SELECT id, automacao_config_id, nome, telegram_user_id, ativo, created_at, updated_at
     FROM automacao_aprovadores
     WHERE automacao_config_id = $1
     ORDER BY created_at ASC`,
    [configId]
  );
  return rows;
};

const createApprover = async (configId, empresaId, data) => {
  const { rows } = await pool.query(
    `INSERT INTO automacao_aprovadores (empresa_id, automacao_config_id, nome, telegram_user_id, ativo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, automacao_config_id, nome, telegram_user_id, ativo, created_at, updated_at`,
    [empresaId, configId, data.nome ?? null, data.telegram_user_id, data.ativo ?? true]
  );
  return rows[0];
};

const updateApprover = async (approverId, configId, data) => {
  const { rows } = await pool.query(
    `UPDATE automacao_aprovadores SET
       nome = COALESCE($3, nome),
       telegram_user_id = COALESCE($4, telegram_user_id),
       ativo = COALESCE($5, ativo),
       updated_at = NOW()
     WHERE id = $1 AND automacao_config_id = $2
     RETURNING id, automacao_config_id, nome, telegram_user_id, ativo, created_at, updated_at`,
    [approverId, configId, data.nome ?? null, data.telegram_user_id ?? null, data.ativo ?? null]
  );
  return rows[0] || null;
};

const deleteApprover = async (approverId, configId) => {
  const { rowCount } = await pool.query(
    `DELETE FROM automacao_aprovadores WHERE id = $1 AND automacao_config_id = $2`,
    [approverId, configId]
  );
  return rowCount > 0;
};

module.exports = { listApprovers, createApprover, updateApprover, deleteApprover };
