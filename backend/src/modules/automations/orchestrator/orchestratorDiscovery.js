"use strict";

/**
 * Descoberta de trabalho ACIONÁVEL para o orquestrador (Bloco 10, Seção
 * 10-13/43-47) — nunca carrega o histórico inteiro de execuções, só
 * candidatas potencialmente elegíveis AGORA, uma query pequena e dedicada por
 * categoria (nunca uma mega-query — mais fácil de auditar e testar
 * isoladamente). `discoverEligibleExecutions` combina tudo, resolve conflito
 * de prioridade quando a MESMA execução aparece em mais de uma categoria e
 * aplica um ORDER BY explícito (nunca a ordem incidental do Postgres) antes
 * de cortar pelo tamanho do lote.
 *
 * Prioridade (Seção 45 — ação humana explícita nunca fica atrás de um
 * backlog de atividade rotineira):
 *   1. STALE_INPUT_PENDING        — late input invalida um documento ainda não enviado
 *   1. POST_SEND_LATE_INPUT_PENDING — idem, mas já SENT (só sinaliza, nunca reenvia)
 *   2. REGENERATION_PENDING       — REGENERAR clicado pelo aprovador
 *   3. DISTRIBUTION_PENDING       — aprovado, pronto para e-mail
 *   4. CLOSING_DUE                — fechamento diário no horário
 *   5. AI_PENDING                 — estruturação por IA
 *   6. DOCUMENT_PENDING           — geração de Excel/PDF
 *   7. APPROVAL_SEND_PENDING      — envio ao aprovador via Telegram
 *   8. RETRY_PENDING              — erro recuperável de qualquer domínio (com cooldown)
 *
 * Fairness (Seção 47): dentro da MESMA prioridade, ordena por `updatedAt`
 * ASC — o item esperando há mais tempo vence, independente de empresa/config,
 * nunca a ordem incidental de um índice. Isto já evita que uma empresa com
 * centenas de execuções monopolize o lote inteiro sem precisar de uma fila
 * complexa por empresa (nenhuma execução de uma empresa X pode "furar a
 * fila" na frente de uma esperando há mais tempo de outra empresa Y).
 */

const { findExecutionsDueForClosing } = require("../closing/automationClosingService");
const {
  AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES,
  AUTOMATION_AI_RECOVERABLE_ERROR_CODES,
  AUTOMATION_DOCUMENT_RECOVERABLE_ERROR_CODES,
  AUTOMATION_DISTRIBUTION_RECOVERABLE_ERROR_CODES,
} = require("../constants/automationEnums");

const CATEGORY_PRIORITY = Object.freeze({
  STALE_INPUT_PENDING: 1,
  POST_SEND_LATE_INPUT_PENDING: 1,
  REGENERATION_PENDING: 2,
  DISTRIBUTION_PENDING: 3,
  CLOSING_DUE: 4,
  AI_PENDING: 5,
  DOCUMENT_PENDING: 6,
  APPROVAL_SEND_PENDING: 7,
  RETRY_PENDING: 8,
});

// Mesmo conjunto usado por `isEligibleForRebuildClaim`/`claimExecutionForRebuild`
// (automationClosingService.js) — nunca duplica a decisão de quais estágios
// aceitam rebuild, só re-lista os STATUS (não os códigos de erro, tratados à
// parte) para a query de descoberta.
const REBUILD_ELIGIBLE_BASE_STATUSES = ["READY_FOR_GENERATION", "READY_FOR_DOCUMENT", "DOCUMENT_READY", "AWAITING_APPROVAL", "APPROVED", "SENDING", "REJECTED"];
const REBUILD_RECOVERABLE_ERROR_CODES = [...AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES, ...AUTOMATION_AI_RECOVERABLE_ERROR_CODES];
const ALL_DOMAIN_RECOVERABLE_ERROR_CODES = [
  ...AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES,
  ...AUTOMATION_AI_RECOVERABLE_ERROR_CODES,
  ...AUTOMATION_DOCUMENT_RECOVERABLE_ERROR_CODES,
  ...AUTOMATION_DISTRIBUTION_RECOVERABLE_ERROR_CODES,
];

function toCandidate(row, category) {
  return {
    execucaoId: row.execucao_id,
    empresaId: row.empresa_id ?? null,
    automacaoConfigId: row.automacao_config_id,
    category,
    priority: CATEGORY_PRIORITY[category],
    updatedAt: row.updated_at,
  };
}

/** Late input ainda não incorporado, numa execução que nunca chegou a SENT (Seção 26-28). */
async function findStaleInputPendingCandidates(pool) {
  const { rows } = await pool.query(
    `SELECT id AS execucao_id, empresa_id, automacao_config_id, updated_at
     FROM automacao_execucoes
     WHERE needs_reprocessing = true
       AND (
         status = ANY($1::text[])
         OR (status = 'ERROR' AND erro_codigo = ANY($2::text[]))
         OR (status = 'AI_PROCESSING' AND updated_at < NOW() - INTERVAL '15 minutes')
       )`,
    [REBUILD_ELIGIBLE_BASE_STATUSES, REBUILD_RECOVERABLE_ERROR_CODES]
  );
  return rows.map((r) => toCandidate(r, "STALE_INPUT_PENDING"));
}

/** Late input chegado DEPOIS do envio por e-mail (Seção 29) — só sinaliza UMA vez, nunca reenvia. */
async function findPostSendLateInputCandidates(pool) {
  const { rows } = await pool.query(
    `SELECT id AS execucao_id, empresa_id, automacao_config_id, updated_at
     FROM automacao_execucoes
     WHERE status = 'SENT' AND needs_reprocessing = true AND post_send_late_input = false`
  );
  return rows.map((r) => toCandidate(r, "POST_SEND_LATE_INPUT_PENDING"));
}

/** REGENERAR clicado pelo aprovador, ainda não processado pelo orquestrador (Seção 24-25). */
async function findRegenerationPendingCandidates(pool) {
  const { rows } = await pool.query(
    `SELECT s.id AS solicitacao_id, e.id AS execucao_id, e.empresa_id, e.automacao_config_id, s.updated_at
     FROM automacao_solicitacoes_aprovacao s
     JOIN automacao_execucoes e ON e.id = s.automacao_execucao_id
     WHERE s.status = 'SUPERSEDED' AND s.superseded_reason = 'REGENERATION' AND s.regeneration_processed_at IS NULL`
  );
  return rows.map((r) => ({ ...toCandidate(r, "REGENERATION_PENDING"), solicitacaoId: r.solicitacao_id }));
}

/** Aprovado, pronto para distribuição por e-mail (Seção 22). */
async function findDistributionPendingCandidates(pool) {
  const { rows } = await pool.query(
    `SELECT id AS execucao_id, empresa_id, automacao_config_id, updated_at
     FROM automacao_execucoes WHERE status = 'APPROVED' AND needs_reprocessing = false`
  );
  return rows.map((r) => toCandidate(r, "DISTRIBUTION_PENDING"));
}

/** COLLECTING além do horário configurado (Seção 17) — reaproveita a descoberta já existente do Bloco 5. */
async function findClosingDueCandidates(pool, now) {
  const due = await findExecutionsDueForClosing(pool, now);
  if (!due.length) return [];
  const ids = due.map((d) => d.execucaoId);
  const { rows } = await pool.query(`SELECT id, empresa_id, updated_at FROM automacao_execucoes WHERE id = ANY($1::int[])`, [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return due.map((d) => {
    const fresh = byId.get(d.execucaoId);
    return {
      execucaoId: d.execucaoId,
      empresaId: fresh ? fresh.empresa_id : null,
      automacaoConfigId: d.automacaoConfigId,
      category: "CLOSING_DUE",
      priority: CATEGORY_PRIORITY.CLOSING_DUE,
      updatedAt: fresh ? fresh.updated_at : now,
      dataReferencia: d.dataReferencia,
    };
  });
}

/** Pronta para estruturação por IA (Seção 18). */
async function findAiPendingCandidates(pool) {
  const { rows } = await pool.query(
    `SELECT id AS execucao_id, empresa_id, automacao_config_id, updated_at
     FROM automacao_execucoes WHERE status = 'READY_FOR_GENERATION' AND needs_reprocessing = false`
  );
  return rows.map((r) => toCandidate(r, "AI_PENDING"));
}

/** Pronta para geração de Excel/PDF (Seção 19). */
async function findDocumentPendingCandidates(pool) {
  const { rows } = await pool.query(
    `SELECT id AS execucao_id, empresa_id, automacao_config_id, updated_at
     FROM automacao_execucoes WHERE status = 'READY_FOR_DOCUMENT' AND needs_reprocessing = false`
  );
  return rows.map((r) => toCandidate(r, "DOCUMENT_PENDING"));
}

/**
 * Documento pronto, ainda sem envio CONFIRMADO ao aprovador (Seção 20) — cobre
 * tanto o primeiro envio quanto um retry de uma tentativa anterior com ERROR
 * (o envio nunca move `automacao_execucoes.status`, Bloco 8, então o retry
 * SEMPRE aparece aqui, nunca em RETRY_PENDING). Aplica o cooldown (Seção 41)
 * só quando já existe uma tentativa ERROR recente para o documento CORRENTE —
 * nunca atrasa um envio que ainda nunca foi tentado.
 */
async function findApprovalSendPendingCandidates(pool, { now, cooldownSeconds }) {
  const { rows } = await pool.query(
    `SELECT e.id AS execucao_id, e.empresa_id, e.automacao_config_id, e.updated_at
     FROM automacao_execucoes e
     WHERE e.status = 'DOCUMENT_READY' AND e.needs_reprocessing = false
       AND NOT EXISTS (
         SELECT 1
         FROM automacao_solicitacoes_aprovacao s
         WHERE s.automacao_documento_id = (
           SELECT d.id FROM automacao_execucao_documentos d
           WHERE d.automacao_execucao_id = e.id AND d.status = 'COMPLETED'
           ORDER BY d.versao DESC LIMIT 1
         )
         AND s.status = 'ERROR' AND s.updated_at > $2::timestamptz - ($1 || ' seconds')::interval
       )`,
    [cooldownSeconds, now]
  );
  return rows.map((r) => toCandidate(r, "APPROVAL_SEND_PENDING"));
}

/** Erro recuperável de qualquer domínio (fechamento/IA/documento/distribuição), respeitando o cooldown (Seção 41). */
async function findRetryPendingCandidates(pool, { now, cooldownSeconds }) {
  const { rows } = await pool.query(
    `SELECT id AS execucao_id, empresa_id, automacao_config_id, updated_at
     FROM automacao_execucoes
     WHERE status = 'ERROR' AND needs_reprocessing = false
       AND erro_codigo = ANY($1::text[])
       AND updated_at <= $3::timestamptz - ($2 || ' seconds')::interval`,
    [ALL_DOMAIN_RECOVERABLE_ERROR_CODES, cooldownSeconds, now]
  );
  return rows.map((r) => toCandidate(r, "RETRY_PENDING"));
}

/**
 * Combina todas as categorias, resolve a MESMA execução aparecendo em mais
 * de uma (mantém só a de MAIOR prioridade — número menor), ordena por
 * (priority ASC, updatedAt ASC) e corta pelo tamanho do lote (Seção 12).
 */
async function discoverEligibleExecutions(pool, { now = new Date(), batchSize, retryCooldownSeconds }) {
  const [stale, postSend, regen, distribution, closingDue, ai, document, approvalSend, retry] = await Promise.all([
    findStaleInputPendingCandidates(pool),
    findPostSendLateInputCandidates(pool),
    findRegenerationPendingCandidates(pool),
    findDistributionPendingCandidates(pool),
    findClosingDueCandidates(pool, now),
    findAiPendingCandidates(pool),
    findDocumentPendingCandidates(pool),
    findApprovalSendPendingCandidates(pool, { now, cooldownSeconds: retryCooldownSeconds }),
    findRetryPendingCandidates(pool, { now, cooldownSeconds: retryCooldownSeconds }),
  ]);

  const all = [...stale, ...postSend, ...regen, ...distribution, ...closingDue, ...ai, ...document, ...approvalSend, ...retry];

  const byExecucao = new Map();
  for (const candidate of all) {
    const existing = byExecucao.get(candidate.execucaoId);
    if (!existing || candidate.priority < existing.priority) {
      byExecucao.set(candidate.execucaoId, candidate);
    }
  }

  const scanned = [...byExecucao.values()].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

  return { scanned, batch: scanned.slice(0, batchSize) };
}

module.exports = {
  discoverEligibleExecutions,
  findStaleInputPendingCandidates,
  findPostSendLateInputCandidates,
  findRegenerationPendingCandidates,
  findDistributionPendingCandidates,
  findClosingDueCandidates,
  findAiPendingCandidates,
  findDocumentPendingCandidates,
  findApprovalSendPendingCandidates,
  findRetryPendingCandidates,
  CATEGORY_PRIORITY,
};
