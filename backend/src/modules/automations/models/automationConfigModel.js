/**
 * Acesso a dados de `automacao_configs` — uma instância configurada de uma
 * automação para uma empresa (ex.: "Diário de Obra — PPFlora").
 *
 * Toda função aceita `empresaId` podendo ser `null` (SUPER_ADMIN sem escopo
 * explícito, ver domain/tenantContext.js) — quando null, nenhuma linha é
 * excluída por empresa (comportamento já usado em dashboardController.js);
 * quando numérico, toda query aplica `empresa_id = $2`. A resolução de QUAL
 * valor passar (null vs. o empresa_id do usuário) é sempre feita no controller
 * via tenantContext — este model nunca reimplementa isolamento próprio.
 *
 * Soft delete: nenhuma função aqui executa `DELETE`; `softDeleteConfig` marca
 * `deleted_at`/`ativo=false`, e toda leitura filtra `deleted_at IS NULL`.
 */

const { pool } = require("../../../db");

const CONFIG_COLUMNS = `
  c.id, c.empresa_id, c.automacao_id, c.automacao_template_id, c.nome, c.label,
  c.projeto_nome, c.ativo, c.timezone, c.horario_fechamento, c.telegram_chat_id,
  c.google_drive_pasta_raiz_id, c.usa_ia, c.configuracao, c.created_at, c.updated_at,
  a.codigo AS automacao_codigo, a.nome AS automacao_nome
`;

/** configuracao.documento (Bloco 7B) — nunca sobrescreve outras chaves futuras de configuracao. */
const documentoJsonOrNull = (configuracaoDocumento) =>
  configuracaoDocumento ? JSON.stringify({ documento: configuracaoDocumento }) : null;

const createConfig = async (data) => {
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs
       (empresa_id, automacao_id, automacao_template_id, nome, label, projeto_nome,
        ativo, timezone, horario_fechamento, telegram_chat_id, google_drive_pasta_raiz_id, usa_ia, configuracao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::jsonb, '{}'::jsonb))
     RETURNING id`,
    [
      data.empresa_id,
      data.automacao_id,
      data.automacao_template_id ?? null,
      data.nome,
      data.label ?? null,
      data.projeto_nome ?? null,
      data.ativo ?? true,
      data.timezone || "America/Sao_Paulo",
      data.horario_fechamento ?? null,
      data.telegram_chat_id ?? null,
      data.google_drive_pasta_raiz_id ?? null,
      data.usa_ia ?? true,
      documentoJsonOrNull(data.configuracao_documento),
    ]
  );
  return getConfigById(rows[0].id, null);
};

const listConfigsByEmpresa = async (empresaId) => {
  const { rows } = await pool.query(
    `SELECT ${CONFIG_COLUMNS},
       (SELECT COUNT(*)::int FROM automacao_aprovadores ap WHERE ap.automacao_config_id = c.id AND ap.ativo = true) AS aprovadores_ativos,
       (SELECT COUNT(*)::int FROM automacao_destinatarios d WHERE d.automacao_config_id = c.id AND d.ativo = true) AS destinatarios_ativos
     FROM automacao_configs c
     JOIN automacoes a ON a.id = c.automacao_id
     WHERE c.deleted_at IS NULL AND ($1::int IS NULL OR c.empresa_id = $1)
     ORDER BY c.created_at DESC`,
    [empresaId]
  );
  return rows;
};

const getConfigById = async (id, empresaId) => {
  const { rows } = await pool.query(
    `SELECT ${CONFIG_COLUMNS}
     FROM automacao_configs c
     JOIN automacoes a ON a.id = c.automacao_id
     WHERE c.id = $1 AND c.deleted_at IS NULL AND ($2::int IS NULL OR c.empresa_id = $2)`,
    [id, empresaId]
  );
  return rows[0] || null;
};

const updateConfig = async (id, empresaId, data) => {
  const { rows } = await pool.query(
    `UPDATE automacao_configs SET
       automacao_id = COALESCE($3, automacao_id),
       automacao_template_id = $4,
       nome = $5,
       label = $6,
       projeto_nome = $7,
       ativo = COALESCE($8, ativo),
       timezone = COALESCE($9, timezone),
       horario_fechamento = $10,
       telegram_chat_id = $11,
       google_drive_pasta_raiz_id = $12,
       usa_ia = COALESCE($13, usa_ia),
       -- Merge raso: só a chave "documento" é substituída, qualquer outra
       -- chave futura de configuracao permanece intacta (Bloco 7B).
       configuracao = CASE WHEN $14::jsonb IS NOT NULL THEN configuracao || $14::jsonb ELSE configuracao END,
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL AND ($2::int IS NULL OR empresa_id = $2)
     RETURNING id`,
    [
      id,
      empresaId,
      data.automacao_id ?? null,
      data.automacao_template_id ?? null,
      data.nome,
      data.label ?? null,
      data.projeto_nome ?? null,
      data.ativo ?? null,
      data.timezone ?? null,
      data.horario_fechamento ?? null,
      data.telegram_chat_id ?? null,
      data.google_drive_pasta_raiz_id ?? null,
      data.usa_ia ?? null,
      documentoJsonOrNull(data.configuracao_documento),
    ]
  );
  if (!rows.length) return null;
  return getConfigById(id, empresaId);
};

const updateConfigStatus = async (id, empresaId, ativo) => {
  const { rows } = await pool.query(
    `UPDATE automacao_configs
     SET ativo = $3, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL AND ($2::int IS NULL OR empresa_id = $2)
     RETURNING id`,
    [id, empresaId, ativo]
  );
  if (!rows.length) return null;
  return getConfigById(id, empresaId);
};

/** Soft delete: nunca DELETE físico (ver nota no topo do arquivo e automationSchema.js). */
const softDeleteConfig = async (id, empresaId) => {
  const { rows } = await pool.query(
    `UPDATE automacao_configs
     SET deleted_at = NOW(), ativo = false, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL AND ($2::int IS NULL OR empresa_id = $2)
     RETURNING id`,
    [id, empresaId]
  );
  return rows.length > 0;
};

module.exports = {
  createConfig,
  listConfigsByEmpresa,
  getConfigById,
  updateConfig,
  updateConfigStatus,
  softDeleteConfig,
};
