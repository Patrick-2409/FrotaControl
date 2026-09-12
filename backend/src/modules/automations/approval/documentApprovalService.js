"use strict";

/**
 * Orquestração do envio do Diário de Obra ao aprovador via Telegram e da
 * aprovação humana (Bloco 8) — `sendDocumentForApproval` transforma uma
 * execução DOCUMENT_READY em AWAITING_APPROVAL (só depois do envio ao
 * Telegram ser CONFIRMADO — nunca antes, Seção 3); `handleApprovalCallback`
 * processa a decisão (APROVAR/REJEITAR/REGENERAR) vinda de um callback_query
 * do Telegram.
 *
 * Reaproveita deliberadamente os mesmos padrões já validados nos Blocos
 * 5/6/7B: advisory lock de sessão pela duração da operação, claim atômico via
 * UPDATE/INSERT...RETURNING, evento de auditoria por etapa, nunca confiar em
 * dado externo (callback_data) sem resolver tudo contra o banco.
 *
 * NENHUM E-MAIL É ENVIADO NESTE MÓDULO (Seção 2) — o estado APPROVED
 * significa apenas "o aprovador autorizou o documento"; a distribuição aos
 * gestores é responsabilidade de um bloco futuro.
 */

const { logInfo, logWarn } = require("../../../services/loggerService");
const { getCurrentSnapshotForEmpresa } = require("../closing/automationClosingService");
const { getCurrentIntelligenceForEmpresa } = require("../ai/automationAiService");
const { generateExecutionDocument } = require("../documents/documentGenerationService");
const { getApprovalMaxSendAttempts, getApprovalTelegramMaxDocumentBytes } = require("./approvalConfig");
const { classifyApprovalError } = require("./approvalErrorClassification");
const { parseApprovalCallbackData } = require("./approvalCallbackParser");
const { buildApprovalSummaryText, buildApprovalKeyboard, buildDecisionAnnotationText, buildTelegramFileName } = require("./approvalMessageBuilder");

function approvalLockKey(automacaoExecucaoId) {
  return `automacao_approval:${automacaoExecucaoId}`;
}

async function withApprovalLock(pool, lockKeyText, fn) {
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [lockKeyText]);
    try {
      return await fn();
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKeyText]).catch(() => {});
    }
  } finally {
    lockClient.release();
  }
}

async function loadExecucaoById(pool, automacaoExecucaoId) {
  const { rows } = await pool.query(`SELECT * FROM automacao_execucoes WHERE id = $1`, [automacaoExecucaoId]);
  return rows[0] || null;
}

async function loadConfigById(pool, automacaoConfigId) {
  const { rows } = await pool.query(`SELECT * FROM automacao_configs WHERE id = $1`, [automacaoConfigId]);
  return rows[0] || null;
}

async function loadCurrentDocumento(pool, automacaoExecucaoId, snapshotId) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_execucao_documentos
     WHERE automacao_execucao_id = $1 AND snapshot_id = $2 AND status = 'COMPLETED'
     ORDER BY versao DESC LIMIT 1`,
    [automacaoExecucaoId, snapshotId]
  );
  return rows[0] || null;
}

/** Nunca aceita um arquivo fora do escopo (empresa/execução) do documento sendo enviado (Seção 13). */
async function loadArquivoTenantSafe(pool, { id, empresaId, automacaoExecucaoId }) {
  if (!id) return null;
  const { rows } = await pool.query(
    `SELECT * FROM automacao_arquivos WHERE id = $1 AND empresa_id = $2 AND automacao_execucao_id = $3`,
    [id, empresaId, automacaoExecucaoId]
  );
  return rows[0] || null;
}

async function loadActiveApprovers(pool, automacaoConfigId) {
  const { rows } = await pool.query(`SELECT * FROM automacao_aprovadores WHERE automacao_config_id = $1 AND ativo = true`, [automacaoConfigId]);
  return rows;
}

/** Único ponto de verdade de "quem pode decidir" (Seção 9/17) — nunca responsavelTecnico/e-mail/criador/ADMIN_EMPRESA. */
async function findActiveApproverByTelegramUserId(pool, automacaoConfigId, telegramUserId) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_aprovadores WHERE automacao_config_id = $1 AND telegram_user_id = $2 AND ativo = true LIMIT 1`,
    [automacaoConfigId, telegramUserId]
  );
  return rows[0] || null;
}

/**
 * Claim atômico "criar ou reaproveitar" a solicitação desta VERSÃO (Seção
 * 29/30) — a UNIQUE(automacao_documento_id) faz o INSERT falhar em conflito;
 * o `ON CONFLICT ... DO UPDATE ... WHERE` só efetivamente atualiza (e
 * retorna a linha) quando a solicitação existente ainda está elegível para
 * (re)envio (`PENDING_SEND`/`ERROR` com tentativas restantes) — em qualquer
 * outro estado (SENT/APPROVED/REJECTED/SUPERSEDED, ou tentativas esgotadas),
 * a atualização não se aplica e a query não retorna linha nenhuma, sinal
 * inequívoco de "já existe, não é elegível" sem qualquer condição de corrida.
 */
async function claimOrCreateApprovalRequest(pool, { empresaId, automacaoConfigId, automacaoExecucaoId, automacaoDocumentoId, versaoDocumento, maxAttempts }) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_solicitacoes_aprovacao
       (empresa_id, automacao_config_id, automacao_execucao_id, automacao_documento_id, versao_documento, status, attempts, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'PENDING_SEND',1,NOW(),NOW())
     ON CONFLICT (automacao_documento_id) DO UPDATE
       SET status = 'PENDING_SEND', attempts = automacao_solicitacoes_aprovacao.attempts + 1, updated_at = NOW()
       WHERE automacao_solicitacoes_aprovacao.status IN ('PENDING_SEND', 'ERROR')
         AND automacao_solicitacoes_aprovacao.attempts < $6
     RETURNING *, (xmax = 0) AS inserted`,
    [empresaId, automacaoConfigId, automacaoExecucaoId, automacaoDocumentoId, versaoDocumento, maxAttempts]
  );
  if (rows.length) {
    return { claimed: true, row: rows[0], isNew: rows[0].inserted };
  }
  const { rows: existingRows } = await pool.query(`SELECT * FROM automacao_solicitacoes_aprovacao WHERE automacao_documento_id = $1`, [automacaoDocumentoId]);
  return { claimed: false, existing: existingRows[0] || null };
}

async function markSolicitacaoSent(pool, solicitacaoId, { telegramChatId, telegramMessageId }) {
  await pool.query(
    `UPDATE automacao_solicitacoes_aprovacao
     SET status = 'SENT', telegram_chat_id = $2, telegram_message_id = $3, sent_at = NOW(), erro_codigo = NULL, erro_mensagem = NULL, updated_at = NOW()
     WHERE id = $1`,
    [solicitacaoId, telegramChatId, telegramMessageId]
  );
}

async function markSolicitacaoError(pool, solicitacaoId, { code, message }) {
  await pool.query(
    `UPDATE automacao_solicitacoes_aprovacao SET status = 'ERROR', erro_codigo = $2, erro_mensagem = $3, updated_at = NOW() WHERE id = $1`,
    [solicitacaoId, code, String(message || "").slice(0, 4000)]
  );
}

/** Nunca reverte um estado posterior — só sai de DOCUMENT_READY (Seção 3: nunca antes do envio ser confirmado). */
async function finalizeExecutionAwaitingApproval(pool, automacaoExecucaoId) {
  await pool.query(`UPDATE automacao_execucoes SET status = 'AWAITING_APPROVAL', updated_at = NOW() WHERE id = $1 AND status = 'DOCUMENT_READY'`, [automacaoExecucaoId]);
}

async function finalizeExecutionApproved(pool, automacaoExecucaoId) {
  await pool.query(`UPDATE automacao_execucoes SET status = 'APPROVED', updated_at = NOW() WHERE id = $1 AND status = 'AWAITING_APPROVAL'`, [automacaoExecucaoId]);
}

async function finalizeExecutionRejected(pool, automacaoExecucaoId) {
  await pool.query(`UPDATE automacao_execucoes SET status = 'REJECTED', updated_at = NOW() WHERE id = $1 AND status = 'AWAITING_APPROVAL'`, [automacaoExecucaoId]);
}

async function logApprovalEvent(pool, { empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, dados }) {
  await pool.query(
    `INSERT INTO automacao_eventos (empresa_id, automacao_config_id, automacao_execucao_id, tipo_evento, origem, dados)
     VALUES ($1,$2,$3,$4,'SISTEMA',$5::jsonb)`,
    [empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, JSON.stringify(dados || {})]
  );
}

/**
 * Núcleo do envio — assume que o chamador já segura o advisory lock
 * (`approvalLockKey`). Nunca chamado diretamente por fora deste arquivo além
 * de `sendDocumentForApproval` (ponto de entrada público, que adquire o
 * lock) e do fluxo de REGENERAR de `handleApprovalCallback` (que já está
 * dentro do próprio lock — reusar o núcleo aqui evita adquirir o MESMO
 * advisory lock duas vezes na mesma operação, o que travaria a sessão).
 */
async function sendDocumentForApprovalCore({ pool, execucao, telegramClient, driveClient, maxSendAttempts }) {
  if (!execucao.current_snapshot_id) {
    return { outcome: "DOCUMENT_NOT_READY", execucaoId: execucao.id };
  }

  const documento = await loadCurrentDocumento(pool, execucao.id, execucao.current_snapshot_id);
  if (!documento) {
    return { outcome: "DOCUMENT_NOT_READY", execucaoId: execucao.id };
  }

  const config = await loadConfigById(pool, execucao.automacao_config_id);
  const approvers = await loadActiveApprovers(pool, execucao.automacao_config_id);
  if (!approvers.length) {
    return { outcome: "NO_APPROVER", execucaoId: execucao.id, documentoId: documento.id };
  }

  const claimResult = await claimOrCreateApprovalRequest(pool, {
    empresaId: execucao.empresa_id,
    automacaoConfigId: execucao.automacao_config_id,
    automacaoExecucaoId: execucao.id,
    automacaoDocumentoId: documento.id,
    versaoDocumento: documento.versao,
    maxAttempts: maxSendAttempts,
  });

  const eventBase = { empresaId: execucao.empresa_id, automacaoConfigId: execucao.automacao_config_id, automacaoExecucaoId: execucao.id };

  if (!claimResult.claimed) {
    const existing = claimResult.existing;
    if (!existing) return { outcome: "DOCUMENT_NOT_READY", execucaoId: execucao.id };
    if (existing.status === "SENT") return { outcome: "ALREADY_SENT", solicitacaoId: existing.id, versao: existing.versao_documento };
    if (existing.status === "APPROVED" || existing.status === "REJECTED") {
      return { outcome: "ALREADY_DECIDED", decision: existing.status, solicitacaoId: existing.id, versao: existing.versao_documento };
    }
    if (existing.status === "SUPERSEDED") return { outcome: "ALREADY_SUPERSEDED", solicitacaoId: existing.id, versao: existing.versao_documento };
    return { outcome: "MAX_ATTEMPTS_EXCEEDED", solicitacaoId: existing.id, versao: existing.versao_documento };
  }

  const solicitacao = claimResult.row;
  if (claimResult.isNew) {
    await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_REQUEST_CREATED", dados: { solicitacaoId: solicitacao.id, versao: documento.versao } });
  }

  const [excelArquivo, pdfArquivo] = await Promise.all([
    loadArquivoTenantSafe(pool, { id: documento.excel_arquivo_id, empresaId: execucao.empresa_id, automacaoExecucaoId: execucao.id }),
    loadArquivoTenantSafe(pool, { id: documento.pdf_arquivo_id, empresaId: execucao.empresa_id, automacaoExecucaoId: execucao.id }),
  ]);
  if (!excelArquivo || !pdfArquivo) {
    await markSolicitacaoError(pool, solicitacao.id, { code: "APPROVAL_FILE_NOT_FOUND", message: "Arquivo Excel/PDF do documento não encontrado ou fora do escopo da execução." });
    await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_TELEGRAM_SEND_FAILED", dados: { solicitacaoId: solicitacao.id, code: "APPROVAL_FILE_NOT_FOUND" } });
    return { outcome: "ERROR", code: "APPROVAL_FILE_NOT_FOUND", solicitacaoId: solicitacao.id };
  }

  try {
    const maxBytes = getApprovalTelegramMaxDocumentBytes();
    const [excelBuffer, pdfBuffer] = await Promise.all([
      driveClient.downloadFileContent({ fileId: excelArquivo.drive_file_id, maxBytes }),
      driveClient.downloadFileContent({ fileId: pdfArquivo.drive_file_id, maxBytes }),
    ]);

    const snapshotRow = await getCurrentSnapshotForEmpresa(pool, { empresaId: execucao.empresa_id, automacaoExecucaoId: execucao.id });
    const intelligenceRow = await getCurrentIntelligenceForEmpresa(pool, { empresaId: execucao.empresa_id, automacaoExecucaoId: execucao.id });
    const structuredOutput = intelligenceRow?.structured_output || {};
    const alertsCount =
      (snapshotRow?.metrics?.photosFailedPermanent || 0) +
      (structuredOutput.warnings?.length || 0) +
      (structuredOutput.conflicts?.length || 0) +
      (structuredOutput.missingInformation?.length || 0);

    const summaryText = buildApprovalSummaryText({
      projetoNome: config.projeto_nome,
      dataReferencia: snapshotRow.snapshot.referenceDate,
      versao: documento.versao,
      metrics: snapshotRow.metrics,
      alertsCount,
    });

    const chatId = config.telegram_chat_id;
    await telegramClient.sendMessage({ chatId, text: summaryText });
    await telegramClient.sendDocument({ chatId, buffer: excelBuffer, filename: buildTelegramFileName(documento.versao, "xlsx") });
    await telegramClient.sendDocument({ chatId, buffer: pdfBuffer, filename: buildTelegramFileName(documento.versao, "pdf") });
    const keyboard = buildApprovalKeyboard(solicitacao.id);
    const finalMessage = await telegramClient.sendMessage({ chatId, text: "Decisão:", replyMarkup: keyboard });

    await markSolicitacaoSent(pool, solicitacao.id, { telegramChatId: chatId, telegramMessageId: finalMessage.messageId });
    await finalizeExecutionAwaitingApproval(pool, execucao.id);
    await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_TELEGRAM_SENT", dados: { solicitacaoId: solicitacao.id, versao: documento.versao } });

    logInfo("automation_approval_telegram_sent", { execucaoId: execucao.id, solicitacaoId: solicitacao.id, versao: documento.versao });
    return { outcome: "SENT", solicitacaoId: solicitacao.id, execucaoId: execucao.id, versao: documento.versao, telegramMessageId: finalMessage.messageId };
  } catch (err) {
    const code = classifyApprovalError(err);
    await markSolicitacaoError(pool, solicitacao.id, { code, message: err.message });
    await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_TELEGRAM_SEND_FAILED", dados: { solicitacaoId: solicitacao.id, code, message: err.message } });
    logWarn("automation_approval_telegram_send_failed", { execucaoId: execucao.id, solicitacaoId: solicitacao.id, code, message: err.message });
    return { outcome: "ERROR_RECOVERABLE", code, solicitacaoId: solicitacao.id };
  }
}

/**
 * Ponto de entrada público (Seção 40 — só chamado por teste/API
 * administrativa, nunca por um scheduler automático). `empresaId`, se
 * informado, nunca revela se a execução existe quando pertence a outro
 * tenant (mesmo padrão dos Blocos 5-7B).
 */
async function sendDocumentForApproval({ pool, empresaId = null, automacaoExecucaoId, telegramClient, driveClient, maxSendAttempts = getApprovalMaxSendAttempts() }) {
  const preCheck = await loadExecucaoById(pool, automacaoExecucaoId);
  if (!preCheck || (empresaId != null && preCheck.empresa_id !== empresaId)) {
    return { outcome: "NOT_FOUND" };
  }

  return withApprovalLock(pool, approvalLockKey(automacaoExecucaoId), async () => {
    const execucao = await loadExecucaoById(pool, automacaoExecucaoId);
    if (!execucao) return { outcome: "NOT_FOUND" };
    return sendDocumentForApprovalCore({ pool, execucao, telegramClient, driveClient, maxSendAttempts });
  });
}

async function safeAnswerCallbackQuery(telegramClient, callbackQueryId, text, showAlert = false) {
  if (!callbackQueryId) return;
  try {
    await telegramClient.answerCallbackQuery({ callbackQueryId, text, showAlert });
  } catch (err) {
    logWarn("automation_approval_answer_callback_failed", { message: err.message });
  }
}

async function safeEditMessageText(telegramClient, { chatId, messageId, text }) {
  if (!chatId || !messageId) return;
  try {
    await telegramClient.editMessageText({ chatId, messageId, text, replyMarkup: null });
  } catch (err) {
    logWarn("automation_approval_edit_message_failed", { message: err.message });
  }
}

/** Carrega a solicitação com o suficiente de execução/config para autorizar e editar a mensagem (Seção 16/17). */
async function loadSolicitacaoFull(pool, solicitacaoId) {
  const { rows } = await pool.query(
    `SELECT s.*, c.timezone AS config_timezone
     FROM automacao_solicitacoes_aprovacao s
     JOIN automacao_configs c ON c.id = s.automacao_config_id
     WHERE s.id = $1`,
    [solicitacaoId]
  );
  return rows[0] || null;
}

async function insertAprovacaoRow(pool, data) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_aprovacoes
       (empresa_id, automacao_execucao_id, automacao_config_id, automacao_documento_id, automacao_solicitacao_id,
        automacao_aprovador_id, versao_documento, versao_arquivo, decisao, telegram_user_id, telegram_callback_id, observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      data.empresaId,
      data.automacaoExecucaoId,
      data.automacaoConfigId,
      data.automacaoDocumentoId,
      data.automacaoSolicitacaoId,
      data.automacaoAprovadorId,
      data.versaoDocumento,
      data.decisao,
      data.telegramUserId,
      data.telegramCallbackId,
      data.observacao ?? null,
    ]
  );
  return rows[0];
}

/** Claim atômico da DECISÃO — a primeira decisão válida vence (Seção 10/26/27); qualquer callback posterior encontra status != 'SENT' e não altera nada. */
async function claimSolicitacaoDecision(pool, solicitacaoId, newStatus) {
  const { rows } = await pool.query(
    `UPDATE automacao_solicitacoes_aprovacao SET status = $2, decided_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'SENT' RETURNING *`,
    [solicitacaoId, newStatus]
  );
  return rows[0] || null;
}

const ACTION_TO_REQUEST_STATUS = Object.freeze({ APPROVE: "APPROVED", REJECT: "REJECTED", REGENERATE: "SUPERSEDED" });
const ACTION_TO_DECISION = Object.freeze({ APPROVE: "APROVADO", REJECT: "REJEITADO", REGENERATE: "REGENERAR_SOLICITADO" });

/**
 * Processa um callback_query já validado como pertencente ao namespace
 * `appr:` (Seção 18 — o roteamento por namespace é feito por quem chama,
 * `telegramWebhookService.js`). NUNCA confia em nada do callback além do id
 * opaco — empresa/config/documento/estado/aprovador são sempre resolvidos
 * consultando o banco (Seção 16).
 */
async function handleApprovalCallback({ pool, telegramClient, callbackQuery }) {
  const parsed = parseApprovalCallbackData(callbackQuery?.data);
  if (!parsed.valid) {
    await safeAnswerCallbackQuery(telegramClient, callbackQuery?.id, "Ação inválida.");
    return { outcome: "INVALID_CALLBACK" };
  }

  const solicitacao = await loadSolicitacaoFull(pool, parsed.solicitacaoId);
  if (!solicitacao) {
    await safeAnswerCallbackQuery(telegramClient, callbackQuery.id, "Solicitação não encontrada.");
    return { outcome: "NOT_FOUND" };
  }

  const telegramUserId = callbackQuery.from?.id != null ? String(callbackQuery.from.id) : null;
  const approver = telegramUserId ? await findActiveApproverByTelegramUserId(pool, solicitacao.automacao_config_id, telegramUserId) : null;
  if (!approver) {
    await logApprovalEvent(pool, {
      empresaId: solicitacao.empresa_id,
      automacaoConfigId: solicitacao.automacao_config_id,
      automacaoExecucaoId: solicitacao.automacao_execucao_id,
      tipoEvento: "APPROVAL_UNAUTHORIZED_ATTEMPT",
      dados: { solicitacaoId: solicitacao.id, telegramUserId, action: parsed.action },
    });
    await safeAnswerCallbackQuery(telegramClient, callbackQuery.id, "Você não está autorizado a aprovar este documento.", true);
    return { outcome: "UNAUTHORIZED" };
  }

  return withApprovalLock(pool, approvalLockKey(solicitacao.automacao_execucao_id), async () => {
    const eventBase = {
      empresaId: solicitacao.empresa_id,
      automacaoConfigId: solicitacao.automacao_config_id,
      automacaoExecucaoId: solicitacao.automacao_execucao_id,
    };

    if (solicitacao.status !== "SENT") {
      await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_ALREADY_DECIDED", dados: { solicitacaoId: solicitacao.id, action: parsed.action, currentStatus: solicitacao.status } });
      await safeAnswerCallbackQuery(telegramClient, callbackQuery.id, "Esta versão já foi decidida.");
      return { outcome: "ALREADY_DECIDED", currentStatus: solicitacao.status };
    }

    const claimed = await claimSolicitacaoDecision(pool, solicitacao.id, ACTION_TO_REQUEST_STATUS[parsed.action]);
    if (!claimed) {
      // Perdeu a corrida para outro callback concorrente (Seção 27) — não é
      // um estado inconsistente, apenas "chegou depois".
      await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_ALREADY_DECIDED", dados: { solicitacaoId: solicitacao.id, action: parsed.action } });
      await safeAnswerCallbackQuery(telegramClient, callbackQuery.id, "Esta versão já foi decidida.");
      return { outcome: "ALREADY_DECIDED" };
    }

    await insertAprovacaoRow(pool, {
      empresaId: solicitacao.empresa_id,
      automacaoExecucaoId: solicitacao.automacao_execucao_id,
      automacaoConfigId: solicitacao.automacao_config_id,
      automacaoDocumentoId: solicitacao.automacao_documento_id,
      automacaoSolicitacaoId: solicitacao.id,
      automacaoAprovadorId: approver.id,
      versaoDocumento: solicitacao.versao_documento,
      decisao: ACTION_TO_DECISION[parsed.action],
      telegramUserId,
      telegramCallbackId: callbackQuery.id,
    });

    const annotated = buildDecisionAnnotationText({
      baseText: "Decisão:",
      action: parsed.action,
      aprovadorNome: approver.nome,
      instant: new Date(),
      timezone: solicitacao.config_timezone,
    });
    await safeEditMessageText(telegramClient, { chatId: solicitacao.telegram_chat_id, messageId: solicitacao.telegram_message_id, text: annotated });

    if (parsed.action === "APPROVE") {
      await finalizeExecutionApproved(pool, solicitacao.automacao_execucao_id);
      await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_APPROVED", dados: { solicitacaoId: solicitacao.id, versao: solicitacao.versao_documento } });
      await safeAnswerCallbackQuery(telegramClient, callbackQuery.id, "Documento aprovado.");
      logInfo("automation_approval_approved", { solicitacaoId: solicitacao.id, execucaoId: solicitacao.automacao_execucao_id });
      return { outcome: "APPROVED", solicitacaoId: solicitacao.id, versao: solicitacao.versao_documento };
    }

    if (parsed.action === "REJECT") {
      await finalizeExecutionRejected(pool, solicitacao.automacao_execucao_id);
      await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_REJECTED", dados: { solicitacaoId: solicitacao.id, versao: solicitacao.versao_documento } });
      await safeAnswerCallbackQuery(telegramClient, callbackQuery.id, "Documento rejeitado.");
      logInfo("automation_approval_rejected", { solicitacaoId: solicitacao.id, execucaoId: solicitacao.automacao_execucao_id });
      return { outcome: "REJECTED", solicitacaoId: solicitacao.id, versao: solicitacao.versao_documento };
    }

    // REGENERATE (Seções 23-25): a solicitação atual já foi marcada
    // SUPERSEDED acima — nunca reaproveitada como APPROVED. A geração da
    // nova versão em si (que precisa do Google Drive) é DELIBERADAMENTE
    // deferida para `regenerateAndResendForApproval` — o webhook do
    // Telegram nunca importa nada do pipeline de armazenamento/Drive
    // (mesma regra estática do Bloco 4 para o webhook de captura, Seção 40:
    // "não dispará-la automaticamente ainda" — só teste/API administrativa
    // chama a função que efetivamente regenera e reenvia). O aprovador só
    // vê a confirmação de que o pedido foi registrado; a nova versão chega
    // como um novo envio separado, quando o passo administrativo/de teste
    // for executado.
    await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_REGENERATION_REQUESTED", dados: { solicitacaoId: solicitacao.id, versaoAnterior: solicitacao.versao_documento } });
    await safeAnswerCallbackQuery(telegramClient, callbackQuery.id, "Solicitação de nova versão registrada.");
    logInfo("automation_approval_regeneration_requested", { solicitacaoId: solicitacao.id, execucaoId: solicitacao.automacao_execucao_id });
    return { outcome: "REGENERATION_REQUESTED", solicitacaoId: solicitacao.id, versaoAnterior: solicitacao.versao_documento };
  });
}

/**
 * Executa de fato a nova versão pedida via REGENERAR e a reenvia para
 * aprovação (Seção 23: mesmos snapshot/inteligência/template/config —
 * `force: true` do próprio `documentGenerationService`, nunca chama IA de
 * novo, nunca rebuilda snapshot). Ponto de entrada SEPARADO de propósito
 * (Seção 40): só teste ou API administrativa chama isto — nunca o webhook
 * do Telegram, que nunca referencia Drive (ver `handleApprovalCallback`
 * acima e o teste de acoplamento estático do Bloco 4).
 */
async function regenerateAndResendForApproval({ pool, empresaId = null, automacaoExecucaoId, telegramClient, driveClient, maxSendAttempts = getApprovalMaxSendAttempts() }) {
  const preCheck = await loadExecucaoById(pool, automacaoExecucaoId);
  if (!preCheck || (empresaId != null && preCheck.empresa_id !== empresaId)) {
    return { outcome: "NOT_FOUND" };
  }

  return withApprovalLock(pool, approvalLockKey(automacaoExecucaoId), async () => {
    const execucao = await loadExecucaoById(pool, automacaoExecucaoId);
    if (!execucao) return { outcome: "NOT_FOUND" };
    const eventBase = { empresaId: execucao.empresa_id, automacaoConfigId: execucao.automacao_config_id, automacaoExecucaoId: execucao.id };

    let regenResult;
    try {
      regenResult = await generateExecutionDocument({ pool, empresaId: execucao.empresa_id, automacaoExecucaoId: execucao.id, driveClient, force: true });
    } catch (err) {
      await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_REGENERATION_FAILED", dados: { message: err.message } });
      return { outcome: "REGENERATION_FAILED", code: "APPROVAL_REGENERATION_FAILED" };
    }

    if (regenResult.outcome !== "READY") {
      await logApprovalEvent(pool, { ...eventBase, tipoEvento: "APPROVAL_REGENERATION_FAILED", dados: { regenOutcome: regenResult.outcome, code: regenResult.code } });
      return { outcome: "REGENERATION_FAILED", code: regenResult.code || "APPROVAL_REGENERATION_FAILED", regenResult };
    }

    const execucaoAtualizada = await loadExecucaoById(pool, execucao.id);
    const sendResult = await sendDocumentForApprovalCore({ pool, execucao: execucaoAtualizada, telegramClient, driveClient, maxSendAttempts });
    return { outcome: "REGENERATED", novaVersao: regenResult.versao, sendResult };
  });
}

async function getApprovalStatusForEmpresa(pool, { empresaId, automacaoExecucaoId }) {
  const { rows } = await pool.query(
    `SELECT e.id AS execucao_id, e.status AS execution_status,
            s.id AS solicitacao_id, s.versao_documento, s.status AS approval_request_status, s.sent_at, s.decided_at,
            a.decisao, a.created_at AS decided_created_at, ap.nome AS aprovador_nome
     FROM automacao_execucoes e
     LEFT JOIN automacao_solicitacoes_aprovacao s ON s.automacao_execucao_id = e.id
     LEFT JOIN automacao_aprovacoes a ON a.automacao_solicitacao_id = s.id
     LEFT JOIN automacao_aprovadores ap ON ap.id = a.automacao_aprovador_id
     WHERE e.id = $1 AND e.empresa_id = $2
     ORDER BY s.versao_documento DESC NULLS LAST, a.created_at DESC NULLS LAST
     LIMIT 1`,
    [automacaoExecucaoId, empresaId]
  );
  return rows[0] || null;
}

module.exports = {
  approvalLockKey,
  claimOrCreateApprovalRequest,
  sendDocumentForApproval,
  handleApprovalCallback,
  regenerateAndResendForApproval,
  getApprovalStatusForEmpresa,
};
