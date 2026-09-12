"use strict";

/**
 * Textos e teclado da mensagem de aprovação (Bloco 8, Seções 11/32/33/37) —
 * nenhum dado aqui é hardcoded de um cliente específico (Seção 11): tudo vem de
 * `projeto_nome`/métricas reais da execução. Nunca inclui token, hash, ID
 * interno de banco, Drive file id ou e-mail de gestor (Seção 33).
 *
 * Timestamps são sempre persistidos em UTC (Postgres `TIMESTAMPTZ`) — a
 * formatação exibida ao aprovador usa o timezone da PRÓPRIA config, nunca
 * UTC-3 hardcoded (Seção 37), reaproveitando a mesma técnica de
 * `Intl.DateTimeFormat` já usada em `telegram/telegramWebhookService.js` e
 * `closing/closingTimeHelper.js`.
 */

const { buildApprovalCallbackData } = require("./approvalCallbackParser");

/** "YYYY-MM-DD" (já civil, sem timezone a resolver) -> "DD/MM/YYYY". */
function formatCivilDate(dataReferencia) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataReferencia ?? ""));
  if (!match) return String(dataReferencia ?? "");
  const [, ano, mes, dia] = match;
  return `${dia}/${mes}/${ano}`;
}

/** Instante (Date/UTC) -> "DD/MM/YYYY HH:mm" no timezone informado — nunca UTC-3 hardcoded. */
function formatInstantInTimezone(instant, timezone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(instant).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/**
 * Resumo do dia (Seção 11) — só dados operacionais já existentes
 * (projeto_nome, data, versão, métricas do snapshot, contagem de
 * pendências). Nunca hardcoda dado de cliente específico, nunca segredo/ID interno.
 */
function buildApprovalSummaryText({ projetoNome, dataReferencia, versao, metrics, alertsCount }) {
  const linhas = [
    "Diário de Obra pronto para validação",
    `Projeto: ${projetoNome || "(sem nome definido)"}`,
    `Data: ${formatCivilDate(dataReferencia)}`,
    `Versão: ${versao}`,
    `Mensagens processadas: ${metrics?.messagesTotal ?? 0}`,
    `Fotos: ${metrics?.photosTotal ?? 0}`,
    `Fotos armazenadas: ${metrics?.photosStored ?? 0}`,
    `Pendências/alertas: ${alertsCount ?? 0}`,
    "",
    "Revise os documentos anexados antes de decidir.",
  ];
  return linhas.join("\n");
}

/** Teclado inline com os 3 botões — callback_data compacto/opaco (Seção 15). */
function buildApprovalKeyboard(solicitacaoId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ APROVAR", callback_data: buildApprovalCallbackData(solicitacaoId, "APPROVE") },
        { text: "❌ REJEITAR", callback_data: buildApprovalCallbackData(solicitacaoId, "REJECT") },
        { text: "🔄 REGENERAR", callback_data: buildApprovalCallbackData(solicitacaoId, "REGENERATE") },
      ],
    ],
  };
}

/** Nome do arquivo enviado ao Telegram (Seção 36) — deliberadamente curto, distinto do nome usado no Drive (documentGenerationService.js). */
function buildTelegramFileName(versao, extension) {
  return `DO_v${versao}.${extension}`;
}

const DECISION_LABELS = Object.freeze({
  APPROVE: "✅ APROVADO",
  REJECT: "❌ REJEITADO",
});

/** Texto final da mensagem de decisão (Seção 32) — nunca deixa os botões ativos visualmente após decidir. */
function buildDecisionAnnotationText({ baseText, action, aprovadorNome, instant, timezone }) {
  const quando = formatInstantInTimezone(instant, timezone);
  if (action === "REGENERATE") {
    return `${baseText}\n\n— VERSÃO SUPERADA — nova versão enviada para aprovação. (${quando})`;
  }
  const label = DECISION_LABELS[action] || action;
  return `${baseText}\n\n— ${label} por ${aprovadorNome || "aprovador"} em ${quando}`;
}

module.exports = {
  formatCivilDate,
  formatInstantInTimezone,
  buildApprovalSummaryText,
  buildApprovalKeyboard,
  buildDecisionAnnotationText,
  buildTelegramFileName,
};
