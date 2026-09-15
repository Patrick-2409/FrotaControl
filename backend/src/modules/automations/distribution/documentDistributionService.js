"use strict";

/**
 * Orquestração da distribuição por e-mail do Diário de Obra APROVADO (Bloco
 * 9) — `distributeApprovedDocument` transforma uma execução APPROVED em SENT
 * (ou ERROR recuperável). Só uma versão documental com aprovação
 * EXPLICITAMENTE registrada (`automacao_aprovacoes.decisao = 'APROVADO'`)
 * pode ser distribuída — nunca "o documento mais recente" (Seção 3), e nunca
 * quando a entrada (snapshot/inteligência) que a sustentou ficou obsoleta
 * por um late input (Seção 4).
 *
 * NENHUM e-mail é enviado automaticamente por este módulo (Seção 45) — a
 * função fica pronta, chamada só por teste/API administrativa; um
 * orquestrador/scheduler futuro decide quando invocá-la.
 *
 * Reaproveita os mesmos padrões dos Blocos 5-8: advisory lock de sessão,
 * claim atômico via UPDATE...RETURNING, evento de auditoria por etapa. Ao
 * contrário do Bloco 8 (que nunca toca `automacao_execucoes.status` antes do
 * envio ao Telegram ser confirmado), aqui a execução acompanha a
 * distribuição em lockstep (APPROVED -> SENDING -> SENT, Seção 23) — a
 * claim atômica na própria execução já é a proteção primária contra duas
 * instâncias enviarem a mesma versão (Seção 24).
 */

const { z } = require("zod");
const { logInfo, logWarn } = require("../../../services/loggerService");
const { getCurrentSnapshotForEmpresa } = require("../closing/automationClosingService");
const { formatCivilDate } = require("../approval/approvalMessageBuilder");
const { AUTOMATION_DISTRIBUTION_RECOVERABLE_ERROR_CODES } = require("../constants/automationEnums");
const { DistributionError, classifyDistributionError } = require("./distributionErrorClassification");
const { renderTemplate } = require("./distributionTemplating");
const { DEFAULT_SUBJECT_TEMPLATE, DEFAULT_BODY_TEMPLATE, buildPlaceholderValues, buildDistributionMessageId } = require("./distributionMessageBuilder");
const { getDistributionMaxAttempts, getEmailMaxAttachmentBytes, getEmailMaxTotalAttachmentBytes, getEmailFrom, getEmailFromName, STALE_SENDING_MINUTES } = require("./distributionConfig");

const emailSchema = z.string().trim().email();

function distributionLockKey(automacaoExecucaoId) {
  return `automacao_distribuicao:${automacaoExecucaoId}`;
}

async function withDistributionLock(pool, lockKeyText, fn) {
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

/** A aprovação é do DOCUMENTO, nunca "a mais recente da execução" só por si (Seção 3/33) — decisão precisa ser explicitamente APROVADO. */
async function loadLatestApprovedApproval(pool, automacaoExecucaoId) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_aprovacoes WHERE automacao_execucao_id = $1 AND decisao = 'APROVADO' ORDER BY created_at DESC LIMIT 1`,
    [automacaoExecucaoId]
  );
  return rows[0] || null;
}

async function loadDocumentoById(pool, documentoId) {
  const { rows } = await pool.query(`SELECT * FROM automacao_execucao_documentos WHERE id = $1`, [documentoId]);
  return rows[0] || null;
}

async function loadSolicitacaoByDocumentoId(pool, documentoId) {
  const { rows } = await pool.query(`SELECT * FROM automacao_solicitacoes_aprovacao WHERE automacao_documento_id = $1`, [documentoId]);
  return rows[0] || null;
}

async function loadLatestCompletedIntelligenceForSnapshot(pool, snapshotId) {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_execucao_inteligencias WHERE snapshot_id = $1 AND status = 'COMPLETED' ORDER BY versao DESC LIMIT 1`,
    [snapshotId]
  );
  return rows[0] || null;
}

async function loadActiveRecipients(pool, automacaoConfigId) {
  const { rows } = await pool.query(`SELECT * FROM automacao_destinatarios WHERE automacao_config_id = $1 AND ativo = true`, [automacaoConfigId]);
  return rows;
}

/** Nunca aceita um arquivo fora do escopo (empresa/execução) do documento aprovado (mesmo padrão do Bloco 8, Seção 18/24). */
async function loadArquivoTenantSafe(pool, { id, empresaId, automacaoExecucaoId }) {
  if (!id) return null;
  const { rows } = await pool.query(
    `SELECT * FROM automacao_arquivos WHERE id = $1 AND empresa_id = $2 AND automacao_execucao_id = $3`,
    [id, empresaId, automacaoExecucaoId]
  );
  return rows[0] || null;
}

/**
 * Claim atômico APPROVED|ERROR(recuperável)|SENDING(abandonado) -> SENDING
 * (Seção 23/24). O guard de tentativas máximas é escopado pela linha de
 * distribuição desta VERSÃO documental (`automacao_documento_id`) — nunca
 * pela execução como um todo, que poderia ter tentativas esgotadas de uma
 * versão ANTERIOR (já rejeitada/superada).
 */
async function claimExecutionForSending(pool, automacaoExecucaoId, { automacaoDocumentoId, maxAttempts }) {
  const { rows } = await pool.query(
    `UPDATE automacao_execucoes e
     SET status = 'SENDING', updated_at = NOW()
     WHERE e.id = $1
       AND (
         e.status = 'APPROVED'
         OR (
           (
             (e.status = 'ERROR' AND e.erro_codigo = ANY($2::text[]))
             OR (e.status = 'SENDING' AND e.updated_at < NOW() - ($3 || ' minutes')::interval)
           )
           AND NOT EXISTS (
             SELECT 1 FROM automacao_distribuicoes d WHERE d.automacao_documento_id = $4 AND d.attempts >= $5
           )
         )
       )
     RETURNING e.*`,
    [automacaoExecucaoId, AUTOMATION_DISTRIBUTION_RECOVERABLE_ERROR_CODES, STALE_SENDING_MINUTES, automacaoDocumentoId, maxAttempts]
  );
  return rows[0] || null;
}

/**
 * Cria (ou reaproveita, num retry) a linha de distribuição desta versão —
 * nunca precisa de um `WHERE` de elegibilidade próprio como o Bloco 8
 * (a claim atômica acima já garante exclusividade: só um processo por vez
 * chega aqui para esta execução).
 */
async function claimOrCreateDistribution(pool, { empresaId, automacaoConfigId, automacaoExecucaoId, automacaoDocumentoId, automacaoAprovacaoId, versaoDocumento, recipientsSnapshot, subject, body }) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_distribuicoes
       (empresa_id, automacao_config_id, automacao_execucao_id, automacao_documento_id, automacao_aprovacao_id,
        versao_documento, status, recipients_snapshot, subject_snapshot, body_snapshot, attempts, last_attempt_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'SENDING',$7::jsonb,$8,$9,1,NOW(),NOW(),NOW())
     ON CONFLICT (automacao_documento_id) DO UPDATE
       SET status = 'SENDING', attempts = automacao_distribuicoes.attempts + 1, last_attempt_at = NOW(), updated_at = NOW(),
           recipients_snapshot = EXCLUDED.recipients_snapshot, subject_snapshot = EXCLUDED.subject_snapshot, body_snapshot = EXCLUDED.body_snapshot
     RETURNING *, (xmax = 0) AS inserted`,
    [empresaId, automacaoConfigId, automacaoExecucaoId, automacaoDocumentoId, automacaoAprovacaoId, versaoDocumento, JSON.stringify(recipientsSnapshot), subject, body]
  );
  return { row: rows[0], isNew: rows[0].inserted };
}

async function markDistributionSent(pool, distribuicaoId, { provider, providerMessageId }) {
  await pool.query(
    `UPDATE automacao_distribuicoes SET status = 'SENT', provider = $2, provider_message_id = $3, sent_at = NOW(), erro_codigo = NULL, erro_mensagem = NULL, updated_at = NOW() WHERE id = $1`,
    [distribuicaoId, provider, providerMessageId]
  );
}

async function markDistributionError(pool, distribuicaoId, { code, message }) {
  await pool.query(
    `UPDATE automacao_distribuicoes SET status = 'ERROR', erro_codigo = $2, erro_mensagem = $3, updated_at = NOW() WHERE id = $1`,
    [distribuicaoId, code, String(message || "").slice(0, 4000)]
  );
}

async function finalizeExecutionSent(pool, automacaoExecucaoId) {
  await pool.query(`UPDATE automacao_execucoes SET status = 'SENT', erro_codigo = NULL, erro_mensagem = NULL, updated_at = NOW() WHERE id = $1 AND status = 'SENDING'`, [automacaoExecucaoId]);
}

async function markExecutionDistributionError(pool, automacaoExecucaoId, { code, message }) {
  await pool.query(`UPDATE automacao_execucoes SET status = 'ERROR', erro_codigo = $2, erro_mensagem = $3, updated_at = NOW() WHERE id = $1`, [automacaoExecucaoId, code, String(message || "").slice(0, 4000)]);
}

async function logDistributionEvent(pool, { empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, dados }) {
  await pool.query(
    `INSERT INTO automacao_eventos (empresa_id, automacao_config_id, automacao_execucao_id, tipo_evento, origem, dados)
     VALUES ($1,$2,$3,$4,'SISTEMA',$5::jsonb)`,
    [empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, JSON.stringify(dados || {})]
  );
}

/**
 * Pré-checagens de consistência (Seções 4/33/34/35/36) — todas ANTES do
 * claim atômico, nunca mutam `automacao_execucoes` nem criam linha de
 * distribuição (mesmo espírito de NO_SNAPSHOT/NO_APPROVER dos Blocos 7B/8):
 * uma execução que falha aqui continua exatamente como estava, elegível de
 * novo assim que a causa for corrigida (rebuild+reaprovação, destinatário
 * cadastrado, etc.).
 */
async function resolveApprovedDocumentoOrOutcome(pool, execucao) {
  const approvalRow = await loadLatestApprovedApproval(pool, execucao.id);
  if (!approvalRow) {
    return { outcome: { outcome: "NOT_APPROVED", code: "DISTRIBUTION_DOCUMENT_NOT_APPROVED", currentStatus: execucao.status, execucaoId: execucao.id } };
  }

  const documento = await loadDocumentoById(pool, approvalRow.automacao_documento_id);
  if (!documento || documento.automacao_execucao_id !== execucao.id || documento.empresa_id !== execucao.empresa_id || documento.status !== "COMPLETED") {
    return { outcome: { outcome: "NOT_APPROVED", code: "DISTRIBUTION_DOCUMENT_NOT_APPROVED", execucaoId: execucao.id } };
  }

  // Seção 34: o pedido de aprovação (Telegram) da MESMA versão também
  // precisa estar consistente — nunca basta a linha de decisão isolada.
  const solicitacao = await loadSolicitacaoByDocumentoId(pool, documento.id);
  if (!solicitacao || solicitacao.status !== "APPROVED" || solicitacao.versao_documento !== documento.versao || approvalRow.versao_documento !== documento.versao) {
    return { outcome: { outcome: "APPROVAL_INCONSISTENT", code: "DISTRIBUTION_APPROVAL_INCONSISTENT", execucaoId: execucao.id } };
  }

  // Seção 4: entrada obsoleta — um late input AINDA NÃO INCORPORADO bloqueia
  // (`needs_reprocessing`, que só fica true enquanto o late input não passou
  // por um rebuild). `has_late_inputs` sozinho NÃO é usado aqui de propósito:
  // ao contrário de `needs_reprocessing`, ele nunca é limpo por
  // `finalizeExecutionReady` (Bloco 5) — permanece true para sempre como
  // histórico de "esta execução já recebeu late input alguma vez", mesmo
  // depois de um rebuild já ter incorporado tudo. Tratá-lo como bloqueio
  // permanente impediria QUALQUER distribuição futura de uma execução que já
  // teve um late input reconciliado — exatamente o oposto do que a Seção 4
  // pede ("e ainda não incorporados"). A checagem de snapshot/inteligência
  // divergente abaixo já cobre estruturalmente qualquer entrada realmente
  // obsoleta, então esta condição isolada seria redundante e incorreta.
  if (execucao.needs_reprocessing) {
    return { outcome: { outcome: "INPUT_STALE", code: "DISTRIBUTION_INPUT_STALE", execucaoId: execucao.id } };
  }
  if (documento.snapshot_id !== execucao.current_snapshot_id) {
    return { outcome: { outcome: "INPUT_STALE", code: "DISTRIBUTION_INPUT_STALE", execucaoId: execucao.id } };
  }
  const latestIntelligence = await loadLatestCompletedIntelligenceForSnapshot(pool, documento.snapshot_id);
  if (!latestIntelligence || latestIntelligence.id !== documento.intelligence_id) {
    return { outcome: { outcome: "INPUT_STALE", code: "DISTRIBUTION_INPUT_STALE", execucaoId: execucao.id } };
  }

  return { approvalRow, documento };
}

function resolveRecipientsOrOutcome(recipientRows, execucaoId) {
  const toRows = recipientRows.filter((r) => r.tipo === "TO");
  if (!toRows.length) {
    return { outcome: { outcome: "NO_PRIMARY_RECIPIENT", code: "DISTRIBUTION_NO_PRIMARY_RECIPIENT", execucaoId } };
  }
  const invalid = recipientRows.find((r) => !emailSchema.safeParse(r.email).success);
  if (invalid) {
    return { outcome: { outcome: "INVALID_RECIPIENT_EMAIL", code: "DISTRIBUTION_INVALID_RECIPIENT_EMAIL", execucaoId } };
  }
  const ccRows = recipientRows.filter((r) => r.tipo === "CC");
  const recipientsSnapshot = recipientRows.map((r) => ({ name: r.nome, email: r.email, type: r.tipo }));
  return { toRows, ccRows, recipientsSnapshot };
}

/**
 * Núcleo do envio — assume que o claim atômico (execução -> SENDING) e a
 * criação/reaproveitamento da linha de distribuição já aconteceram. Nunca
 * mantém a distribuição por e-mail dentro de uma transação Postgres aberta
 * (Seção 22) — cada leitura/escrita de banco aqui é sua própria instrução
 * autocommitada; o download dos arquivos e o envio SMTP acontecem SEM
 * nenhuma transação em aberto.
 */
async function sendDistributionEmail({ pool, execucao, distribuicaoRow, documento, excelArquivo, pdfArquivo, subject, body, toRows, ccRows, driveClient, emailClient }) {
  const eventBase = { empresaId: execucao.empresa_id, automacaoConfigId: execucao.automacao_config_id, automacaoExecucaoId: execucao.id };
  const maxAttachmentBytes = getEmailMaxAttachmentBytes();
  const maxTotalBytes = getEmailMaxTotalAttachmentBytes();

  // Seção 20: valida pelo TAMANHO JÁ PERSISTIDO (automacao_arquivos.tamanho_bytes)
  // antes de sequer baixar — nunca envia parcialmente.
  const excelSize = Number(excelArquivo.tamanho_bytes) || 0;
  const pdfSize = Number(pdfArquivo.tamanho_bytes) || 0;
  if ((excelArquivo.tamanho_bytes != null && excelSize > maxAttachmentBytes) || (pdfArquivo.tamanho_bytes != null && pdfSize > maxAttachmentBytes)) {
    throw new DistributionError("Anexo individual excede o limite configurado.", { code: "DISTRIBUTION_ATTACHMENT_TOO_LARGE" });
  }
  if (excelArquivo.tamanho_bytes != null && pdfArquivo.tamanho_bytes != null && excelSize + pdfSize > maxTotalBytes) {
    throw new DistributionError("Soma dos anexos excede o limite total configurado.", { code: "DISTRIBUTION_ATTACHMENT_TOO_LARGE" });
  }

  const [excelBuffer, pdfBuffer] = await Promise.all([
    driveClient.downloadFileContent({ fileId: excelArquivo.drive_file_id, maxBytes: maxAttachmentBytes }),
    driveClient.downloadFileContent({ fileId: pdfArquivo.drive_file_id, maxBytes: maxAttachmentBytes }),
  ]);
  if (excelBuffer.length + pdfBuffer.length > maxTotalBytes) {
    throw new DistributionError("Soma dos anexos (bytes reais) excede o limite total configurado.", { code: "DISTRIBUTION_ATTACHMENT_TOO_LARGE" });
  }

  const messageId = buildDistributionMessageId(distribuicaoRow.id);
  const fromAddress = getEmailFrom();
  const fromName = getEmailFromName();

  const info = await emailClient.sendMail({
    from: fromAddress,
    fromName,
    to: toRows.map((r) => r.email),
    cc: ccRows.map((r) => r.email),
    subject,
    text: body,
    attachments: [
      { filename: excelArquivo.nome_arquivo, content: excelBuffer, contentType: excelArquivo.mime_type },
      { filename: pdfArquivo.nome_arquivo, content: pdfBuffer, contentType: pdfArquivo.mime_type },
    ],
    messageId,
  });

  await markDistributionSent(pool, distribuicaoRow.id, { provider: info.provider, providerMessageId: info.providerMessageId });
  await finalizeExecutionSent(pool, execucao.id);
  await logDistributionEvent(pool, { ...eventBase, tipoEvento: "DISTRIBUTION_EMAIL_SENT", dados: { distribuicaoId: distribuicaoRow.id, versao: documento.versao, providerMessageId: info.providerMessageId } });

  logInfo("automation_distribution_email_sent", { execucaoId: execucao.id, distribuicaoId: distribuicaoRow.id, versao: documento.versao });
  return { outcome: "SENT", execucaoId: execucao.id, distribuicaoId: distribuicaoRow.id, versao: documento.versao, providerMessageId: info.providerMessageId };
}

/**
 * Ponto de entrada principal (Seção 45 — só chamado por teste/API
 * administrativa, nunca automaticamente ao aprovar). `empresaId`, se
 * informado, nunca revela se a execução existe quando pertence a outro
 * tenant (mesmo padrão dos Blocos 5-8).
 */
async function distributeApprovedDocument({ pool, empresaId = null, automacaoExecucaoId, emailClient, driveClient, maxAttempts = getDistributionMaxAttempts() }) {
  const preCheck = await loadExecucaoById(pool, automacaoExecucaoId);
  if (!preCheck || (empresaId != null && preCheck.empresa_id !== empresaId)) {
    return { outcome: "NOT_FOUND" };
  }

  return withDistributionLock(pool, distributionLockKey(automacaoExecucaoId), async () => {
    const execucao = await loadExecucaoById(pool, automacaoExecucaoId);
    if (!execucao) return { outcome: "NOT_FOUND" };

    // Regra de segurança (Seção 2): só APPROVED pode iniciar (ou um retry
    // recuperável — resolvido dentro do claim atômico abaixo). Qualquer
    // outro estado nunca chega perto de enviar e-mail.
    const eligibleStatuses = new Set(["APPROVED", "ERROR", "SENDING", "SENT"]);
    if (!eligibleStatuses.has(execucao.status)) {
      return { outcome: "NOT_APPROVED", currentStatus: execucao.status, execucaoId: execucao.id };
    }
    if (execucao.status === "SENT") {
      return { outcome: "ALREADY_SENT", execucaoId: execucao.id };
    }

    const resolved = await resolveApprovedDocumentoOrOutcome(pool, execucao);
    if (resolved.outcome) return resolved.outcome;
    const { approvalRow, documento } = resolved;

    const config = await loadConfigById(pool, execucao.automacao_config_id);
    const recipientRows = await loadActiveRecipients(pool, execucao.automacao_config_id);
    const recipientsResolved = resolveRecipientsOrOutcome(recipientRows, execucao.id);
    if (recipientsResolved.outcome) return recipientsResolved.outcome;
    const { toRows, ccRows, recipientsSnapshot } = recipientsResolved;

    const fromAddress = getEmailFrom();
    if (!fromAddress) {
      return { outcome: "CONFIG_INCOMPLETE", code: "DISTRIBUTION_CONFIG_INCOMPLETE", execucaoId: execucao.id };
    }

    const snapshotRow = await getCurrentSnapshotForEmpresa(pool, { empresaId: execucao.empresa_id, automacaoExecucaoId: execucao.id });
    const documentoConfig = config?.configuracao?.documento || {};
    const emailConfig = config?.configuracao?.email || {};
    const placeholderValues = buildPlaceholderValues({
      projetoNome: config.projeto_nome,
      dataReferencia: formatCivilDate(snapshotRow.snapshot.referenceDate),
      dataReferenciaRaw: snapshotRow.snapshot.referenceDate,
      timezone: config.timezone,
      versao: documento.versao,
      clienteRazaoSocial: documentoConfig.clienteRazaoSocial,
      referenciaContratual: documentoConfig.referenciaContratual,
      responsavelTecnico: documentoConfig.responsavelTecnico,
    });
    const subject = renderTemplate(emailConfig.assunto || DEFAULT_SUBJECT_TEMPLATE, placeholderValues);
    const body = renderTemplate(emailConfig.corpo || DEFAULT_BODY_TEMPLATE, placeholderValues);

    const claimed = await claimExecutionForSending(pool, execucao.id, { automacaoDocumentoId: documento.id, maxAttempts });
    if (!claimed) {
      const fresh = await loadExecucaoById(pool, execucao.id);
      if (fresh.status === "SENDING") return { outcome: "IN_PROGRESS", execucaoId: fresh.id };
      if (fresh.status === "SENT") return { outcome: "ALREADY_SENT", execucaoId: fresh.id };
      return { outcome: "NOT_ELIGIBLE", currentStatus: fresh.status, execucaoId: fresh.id };
    }

    const eventBase = { empresaId: execucao.empresa_id, automacaoConfigId: execucao.automacao_config_id, automacaoExecucaoId: execucao.id };
    const { row: distribuicaoRow, isNew } = await claimOrCreateDistribution(pool, {
      empresaId: execucao.empresa_id,
      automacaoConfigId: execucao.automacao_config_id,
      automacaoExecucaoId: execucao.id,
      automacaoDocumentoId: documento.id,
      automacaoAprovacaoId: approvalRow.id,
      versaoDocumento: documento.versao,
      recipientsSnapshot,
      subject,
      body,
    });
    if (isNew) {
      await logDistributionEvent(pool, { ...eventBase, tipoEvento: "DISTRIBUTION_CREATED", dados: { distribuicaoId: distribuicaoRow.id, versao: documento.versao } });
    }
    await logDistributionEvent(pool, { ...eventBase, tipoEvento: "DISTRIBUTION_SENDING_STARTED", dados: { distribuicaoId: distribuicaoRow.id, versao: documento.versao } });

    // Seção 18/24: resolve exclusivamente pelo vínculo do documento APROVADO
    // — nunca "o Excel/PDF mais atual" da execução.
    const [excelArquivo, pdfArquivo] = await Promise.all([
      loadArquivoTenantSafe(pool, { id: documento.excel_arquivo_id, empresaId: execucao.empresa_id, automacaoExecucaoId: execucao.id }),
      loadArquivoTenantSafe(pool, { id: documento.pdf_arquivo_id, empresaId: execucao.empresa_id, automacaoExecucaoId: execucao.id }),
    ]);
    if (!excelArquivo || !pdfArquivo) {
      await markDistributionError(pool, distribuicaoRow.id, { code: "DISTRIBUTION_FILE_NOT_FOUND", message: "Arquivo Excel/PDF do documento aprovado não encontrado ou fora do escopo da execução." });
      await markExecutionDistributionError(pool, execucao.id, { code: "DISTRIBUTION_FILE_NOT_FOUND", message: "Arquivo Excel/PDF do documento aprovado não encontrado." });
      await logDistributionEvent(pool, { ...eventBase, tipoEvento: "DISTRIBUTION_SEND_FAILED", dados: { distribuicaoId: distribuicaoRow.id, code: "DISTRIBUTION_FILE_NOT_FOUND" } });
      return { outcome: "ERROR", code: "DISTRIBUTION_FILE_NOT_FOUND", execucaoId: execucao.id, distribuicaoId: distribuicaoRow.id };
    }

    try {
      return await sendDistributionEmail({ pool, execucao, distribuicaoRow, documento, excelArquivo, pdfArquivo, subject, body, toRows, ccRows, driveClient, emailClient });
    } catch (err) {
      const code = classifyDistributionError(err);
      await markDistributionError(pool, distribuicaoRow.id, { code, message: err.message });
      await markExecutionDistributionError(pool, execucao.id, { code, message: err.message });
      await logDistributionEvent(pool, { ...eventBase, tipoEvento: "DISTRIBUTION_SEND_FAILED", dados: { distribuicaoId: distribuicaoRow.id, code, message: err.message } });
      logWarn("automation_distribution_send_failed", { execucaoId: execucao.id, distribuicaoId: distribuicaoRow.id, code, message: err.message });
      return { outcome: "ERROR_RECOVERABLE", code, execucaoId: execucao.id, distribuicaoId: distribuicaoRow.id };
    }
  });
}

async function getDistributionStatusForEmpresa(pool, { empresaId, automacaoExecucaoId }) {
  const { rows } = await pool.query(
    `SELECT e.id AS execucao_id, e.status AS execution_status,
            d.id AS distribuicao_id, d.status AS distribution_status, d.versao_documento,
            d.sent_at, d.provider, d.provider_message_id,
            jsonb_array_length(COALESCE(d.recipients_snapshot, '[]'::jsonb)) AS recipient_count,
            d.erro_codigo AS last_error_code
     FROM automacao_execucoes e
     LEFT JOIN automacao_distribuicoes d ON d.automacao_execucao_id = e.id
     WHERE e.id = $1 AND e.empresa_id = $2
     ORDER BY d.versao_documento DESC NULLS LAST
     LIMIT 1`,
    [automacaoExecucaoId, empresaId]
  );
  return rows[0] || null;
}

module.exports = {
  distributionLockKey,
  distributeApprovedDocument,
  getDistributionStatusForEmpresa,
};
