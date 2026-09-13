"use strict";

/**
 * Decisão e execução de UM passo do orquestrador para UMA execução (Bloco
 * 10, Seção 15-32) — nunca duplica lógica de domínio: `decideAction` só lê
 * estado (fresco, direto do banco) e escolhe QUAL serviço já existente
 * chamar; `runAction` só chama esse serviço e interpreta o outcome padrão
 * (`READY`/`SENT` = avançou; qualquer outra coisa = não avançou, para o
 * chamador decidir se para o loop desta execução).
 *
 * Cada serviço de domínio continua sendo o único responsável por
 * idempotência/tenant/locks/estado/auditoria/efeitos externos — este módulo
 * nunca grava em `automacao_execucoes`/`automacao_execucao_documentos`
 * diretamente, EXCETO para as duas responsabilidades que são genuinamente do
 * orquestrador e de mais nenhum bloco anterior: marcar a pendência pós-envio
 * (`post_send_late_input`) e reivindicar/registrar uma regeneração pendente
 * (`regeneration_processed_at`/`successor_documento_id`).
 */

const { closeDailyExecution, rebuildDailySnapshot } = require("../closing/automationClosingService");
const { isExecutionDueForClosing } = require("../closing/closingTimeHelper");
const { processExecutionIntelligence } = require("../ai/automationAiService");
const { generateExecutionDocument } = require("../documents/documentGenerationService");
const { sendDocumentForApproval, regenerateAndResendForApproval } = require("../approval/documentApprovalService");
const { distributeApprovedDocument } = require("../distribution/documentDistributionService");
const {
  AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES,
  AUTOMATION_AI_RECOVERABLE_ERROR_CODES,
  AUTOMATION_DOCUMENT_RECOVERABLE_ERROR_CODES,
  AUTOMATION_DISTRIBUTION_RECOVERABLE_ERROR_CODES,
} = require("../constants/automationEnums");

// Mesmo conjunto de `automationClosingService.js::isEligibleForRebuildClaim`
// — repetido aqui só como STATUS (não código de erro) porque a decisão de
// rebuild do orquestrador precisa da MESMA lista para saber se deve tentar;
// a elegibilidade DE FATO continua sendo decidida pelo claim atômico dentro
// de `rebuildDailySnapshot` — isto é só a checagem antecipada, igual ao
// próprio `isEligibleForRebuildClaim` já faz para o caso não-automático.
const REBUILD_ELIGIBLE_BASE_STATUSES = new Set(["READY_FOR_GENERATION", "READY_FOR_DOCUMENT", "DOCUMENT_READY", "AWAITING_APPROVAL", "APPROVED", "SENDING", "REJECTED"]);
const REBUILD_RECOVERABLE_ERROR_CODES = new Set([...AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES, ...AUTOMATION_AI_RECOVERABLE_ERROR_CODES]);

function isRebuildEligible(execucao) {
  if (REBUILD_ELIGIBLE_BASE_STATUSES.has(execucao.status)) return true;
  if (execucao.status === "ERROR" && REBUILD_RECOVERABLE_ERROR_CODES.has(execucao.erro_codigo)) return true;
  if (execucao.status === "AI_PROCESSING" && new Date(execucao.updated_at).getTime() < Date.now() - 15 * 60 * 1000) return true;
  return false;
}

function isInCooldown(updatedAt, now, cooldownSeconds) {
  if (!updatedAt) return false;
  return new Date(updatedAt).getTime() > new Date(now).getTime() - cooldownSeconds * 1000;
}

function classifyRecoverableErrorDomain(erroCodigo) {
  if (AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES.includes(erroCodigo)) return "CLOSE";
  if (AUTOMATION_AI_RECOVERABLE_ERROR_CODES.includes(erroCodigo)) return "AI";
  if (AUTOMATION_DOCUMENT_RECOVERABLE_ERROR_CODES.includes(erroCodigo)) return "DOCUMENT";
  if (AUTOMATION_DISTRIBUTION_RECOVERABLE_ERROR_CODES.includes(erroCodigo)) return "DISTRIBUTE";
  return null;
}

async function loadExecucaoWithConfig(pool, execucaoId) {
  const { rows } = await pool.query(
    `SELECT e.*, to_char(e.data_referencia, 'YYYY-MM-DD') AS "dataReferencia",
            c.timezone, c.horario_fechamento, c.ativo AS config_ativo, c.deleted_at AS config_deleted_at, c.usa_ia
     FROM automacao_execucoes e
     JOIN automacao_configs c ON c.id = e.automacao_config_id
     WHERE e.id = $1`,
    [execucaoId]
  );
  return rows[0] || null;
}

async function findPendingRegenerationForExecucao(pool, execucaoId) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_solicitacoes_aprovacao
     WHERE automacao_execucao_id = $1 AND status = 'SUPERSEDED' AND superseded_reason = 'REGENERATION' AND regeneration_processed_at IS NULL
     LIMIT 1`,
    [execucaoId]
  );
  return rows[0] || null;
}

/**
 * Cooldown do envio ao aprovador (Seção 41) — só se aplica quando o
 * DOCUMENTO CORRENTE já teve uma tentativa de envio recente com ERROR (o
 * envio nunca move `automacao_execucoes.status`, Bloco 8, então isto nunca
 * aparece como ERROR na execução — precisa de checagem própria aqui).
 */
async function isApprovalSendInCooldown(pool, execucaoId, now, cooldownSeconds) {
  const { rows } = await pool.query(
    `SELECT s.updated_at FROM automacao_solicitacoes_aprovacao s
     WHERE s.automacao_documento_id = (
       SELECT d.id FROM automacao_execucao_documentos d
       WHERE d.automacao_execucao_id = $1 AND d.status = 'COMPLETED'
       ORDER BY d.versao DESC LIMIT 1
     )
     AND s.status = 'ERROR'`,
    [execucaoId]
  );
  return rows[0] ? isInCooldown(rows[0].updated_at, now, cooldownSeconds) : false;
}

/**
 * Decide QUAL ação (se alguma) aplicar AGORA a uma execução — sempre lê o
 * estado FRESCO do banco (nunca confia em nada calculado na descoberta,
 * Seção 15: "o estado persistido confirma a transição"). Retorna `null`
 * quando nada deve ser feito neste passo (Seção 21/22: AWAITING_APPROVAL sem
 * pendência, REJECTED, SENT sem pendência, erro não-recuperável, cooldown
 * ainda ativo, etc.).
 */
async function decideAction(pool, execucaoId, { now, retryCooldownSeconds }) {
  const execucao = await loadExecucaoWithConfig(pool, execucaoId);
  if (!execucao) return null;

  // Prioridade 1 (Seção 45): late input invalidando um documento AINDA NÃO enviado por e-mail.
  if (execucao.needs_reprocessing && execucao.status !== "SENT" && isRebuildEligible(execucao)) {
    return { type: "REBUILD", execucao };
  }

  // Prioridade 1: late input chegado DEPOIS do envio — só sinaliza, nunca reenvia (Seção 29).
  if (execucao.status === "SENT" && execucao.needs_reprocessing && !execucao.post_send_late_input) {
    return { type: "FLAG_POST_SEND_LATE_INPUT", execucao };
  }

  // Prioridade 2: REGENERAR humano pendente (Seção 24-25).
  const pendingRegen = await findPendingRegenerationForExecucao(pool, execucao.id);
  if (pendingRegen) {
    return { type: "REGENERATE", execucao, solicitacao: pendingRegen };
  }

  switch (execucao.status) {
    case "COLLECTING": {
      const due = isExecutionDueForClosing(
        { ativo: execucao.config_ativo, deleted_at: execucao.config_deleted_at, timezone: execucao.timezone, horario_fechamento: execucao.horario_fechamento },
        { status: execucao.status, dataReferencia: execucao.dataReferencia },
        now
      );
      return due ? { type: "CLOSE", execucao } : null;
    }
    case "READY_FOR_GENERATION":
      return { type: "AI", execucao };
    case "READY_FOR_DOCUMENT":
      return { type: "DOCUMENT", execucao };
    case "DOCUMENT_READY":
      return (await isApprovalSendInCooldown(pool, execucao.id, now, retryCooldownSeconds)) ? null : { type: "APPROVAL_SEND", execucao };
    case "APPROVED":
      return { type: "DISTRIBUTE", execucao };
    case "ERROR": {
      const domain = classifyRecoverableErrorDomain(execucao.erro_codigo);
      if (!domain) return null; // não-recuperável: exige ação humana, nunca resolve sozinho (Seção 41)
      return isInCooldown(execucao.updated_at, now, retryCooldownSeconds) ? null : { type: domain, execucao };
    }
    // AWAITING_APPROVAL sem late input/regen: nunca pressiona o aprovador (Seção 21).
    // REJECTED: nunca ação automática, aguarda intervenção humana (Seção 23).
    // SENT sem pendência nova: estado TERMINAL automático (Seção 28).
    // PROCESSING/AI_PROCESSING(fresco)/DOCUMENT_PROCESSING/SENDING: em andamento, nunca tocado no meio.
    default:
      return null;
  }
}

async function flagPostSendLateInput(pool, execucao) {
  const { rows } = await pool.query(
    `UPDATE automacao_execucoes SET post_send_late_input = true, updated_at = NOW()
     WHERE id = $1 AND status = 'SENT' AND needs_reprocessing = true AND post_send_late_input = false
     RETURNING id`,
    [execucao.id]
  );
  if (!rows.length) return false;
  await pool.query(
    `INSERT INTO automacao_eventos (empresa_id, automacao_config_id, automacao_execucao_id, tipo_evento, origem, dados)
     VALUES ($1,$2,$3,'LATE_INPUT_AFTER_DISTRIBUTION','SISTEMA',$4::jsonb)`,
    [execucao.empresa_id, execucao.automacao_config_id, execucao.id, JSON.stringify({ note: "Late input recebido após a distribuição — correção exige ação humana explícita." })]
  );
  return true;
}

async function claimRegenerationRequest(pool, solicitacaoId) {
  const { rows } = await pool.query(
    `UPDATE automacao_solicitacoes_aprovacao
     SET regeneration_processed_at = NOW()
     WHERE id = $1 AND status = 'SUPERSEDED' AND superseded_reason = 'REGENERATION' AND regeneration_processed_at IS NULL
     RETURNING *`,
    [solicitacaoId]
  );
  return rows[0] || null;
}

async function setSuccessorDocumento(pool, solicitacaoId, successorDocumentoId) {
  await pool.query(`UPDATE automacao_solicitacoes_aprovacao SET successor_documento_id = $2 WHERE id = $1`, [solicitacaoId, successorDocumentoId]);
}

/**
 * Executa a ação decidida — em `dryRun`, classifica sem qualquer efeito
 * colateral (Seção 37: zero UPDATE de estado, zero chamada a
 * IA/Drive/Telegram/SMTP/geração de documento). Retorna `advanced=true`
 * apenas quando o outcome padrão do domínio (`READY`/`SENT`) confirma que a
 * execução realmente progrediu — nunca inferido de outra forma.
 */
async function runAction(pool, decision, { dependencies = {}, dryRun = false } = {}) {
  if (dryRun) {
    return { advanced: false, dryRun: true, type: decision.type, outcome: "DRY_RUN" };
  }

  switch (decision.type) {
    case "REBUILD": {
      const result = await rebuildDailySnapshot({
        pool,
        automacaoExecucaoId: decision.execucao.id,
        telegramFileClient: dependencies.telegramFileClient,
        googleDriveClient: dependencies.driveClient,
      });
      return { advanced: result.outcome === "READY", type: decision.type, outcome: result.outcome, raw: result };
    }

    case "FLAG_POST_SEND_LATE_INPUT": {
      const flagged = await flagPostSendLateInput(pool, decision.execucao);
      // Nunca "avança" um estágio (SENT continua terminal) — só sinaliza.
      return { advanced: false, type: decision.type, outcome: flagged ? "FLAGGED" : "ALREADY_FLAGGED", raw: null };
    }

    case "REGENERATE": {
      const claimed = await claimRegenerationRequest(pool, decision.solicitacao.id);
      if (!claimed) {
        return { advanced: false, type: decision.type, outcome: "ALREADY_CLAIMED", raw: null };
      }
      const result = await regenerateAndResendForApproval({
        pool,
        automacaoExecucaoId: decision.execucao.id,
        telegramClient: dependencies.telegramClient,
        driveClient: dependencies.driveClient,
      });
      if (result.outcome === "REGENERATED") {
        const { rows } = await pool.query(
          `SELECT id FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1 AND versao = $2`,
          [decision.execucao.id, result.novaVersao]
        );
        if (rows[0]) await setSuccessorDocumento(pool, claimed.id, rows[0].id);
      }
      // Se `regenerateAndResendForApproval` falhar de forma recuperável, a
      // PRÓPRIA `generateExecutionDocument` já deixou a execução em
      // ERROR+código recuperável do domínio DOCUMENT — a categoria
      // RETRY_PENDING de um ciclo futuro assume o retry a partir daí (Seção
      // 41: nunca uma política de retry própria do orquestrador). Esta
      // solicitação de regeneração em si nunca é reclaimada de novo — evita
      // duplicar o claim idempotente descrito na Seção 25.
      return { advanced: result.outcome === "REGENERATED", type: decision.type, outcome: result.outcome, raw: result };
    }

    case "CLOSE": {
      const result = await closeDailyExecution({
        pool,
        automacaoConfigId: decision.execucao.automacao_config_id,
        referenceDate: decision.execucao.dataReferencia,
        telegramFileClient: dependencies.telegramFileClient,
        googleDriveClient: dependencies.driveClient,
      });
      return { advanced: result.outcome === "READY", type: decision.type, outcome: result.outcome, raw: result };
    }

    case "AI": {
      const result = await processExecutionIntelligence({
        pool,
        automacaoExecucaoId: decision.execucao.id,
        aiClient: dependencies.aiClient,
        driveClient: dependencies.driveClient,
      });
      return { advanced: result.outcome === "READY", type: decision.type, outcome: result.outcome, raw: result };
    }

    case "DOCUMENT": {
      const result = await generateExecutionDocument({
        pool,
        automacaoExecucaoId: decision.execucao.id,
        driveClient: dependencies.driveClient,
      });
      return { advanced: result.outcome === "READY", type: decision.type, outcome: result.outcome, raw: result };
    }

    case "APPROVAL_SEND": {
      const result = await sendDocumentForApproval({
        pool,
        automacaoExecucaoId: decision.execucao.id,
        telegramClient: dependencies.telegramClient,
        driveClient: dependencies.driveClient,
      });
      return { advanced: result.outcome === "SENT", type: decision.type, outcome: result.outcome, raw: result };
    }

    case "DISTRIBUTE": {
      const result = await distributeApprovedDocument({
        pool,
        automacaoExecucaoId: decision.execucao.id,
        emailClient: dependencies.emailClient,
        driveClient: dependencies.driveClient,
      });
      return { advanced: result.outcome === "SENT", type: decision.type, outcome: result.outcome, raw: result };
    }

    default:
      return { advanced: false, type: decision.type, outcome: "UNKNOWN_ACTION", raw: null };
  }
}

module.exports = {
  decideAction,
  runAction,
  isRebuildEligible,
  classifyRecoverableErrorDomain,
  isInCooldown,
  claimRegenerationRequest,
  findPendingRegenerationForExecucao,
};
