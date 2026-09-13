"use strict";

/**
 * Configuração do módulo de distribuição por e-mail (Bloco 9) — mesmo padrão
 * dos demais `*Config.js` do módulo (Blocos 4/6/7B/8): tudo opcional, com
 * default seguro, nunca lança por falta de configuração. Nenhuma função
 * aqui lê um secret além de repassar seu VALOR (nunca logado) para quem
 * efetivamente conecta ao SMTP (`automationEmailClient.js`).
 *
 * Credenciais (SMTP_USER/SMTP_PASSWORD) e remetente técnico
 * (AUTOMATION_EMAIL_FROM*) ficam SOMENTE em variável de ambiente — nunca em
 * `automacao_configs` (Seção 13).
 */

function parsePositiveIntEnv(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getDistributionMaxAttempts(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_EMAIL_MAX_ATTEMPTS, 3);
}

function getEmailMaxAttachmentBytes(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_EMAIL_MAX_ATTACHMENT_BYTES, 20 * 1024 * 1024);
}

function getEmailMaxTotalAttachmentBytes(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_EMAIL_MAX_TOTAL_ATTACHMENT_BYTES, 35 * 1024 * 1024);
}

/** Nunca tem default — sem remetente configurado, a distribuição é bloqueada (DISTRIBUTION_CONFIG_INCOMPLETE), nunca inventa um. */
function getEmailFrom(env = process.env) {
  return env.AUTOMATION_EMAIL_FROM || null;
}

function getEmailFromName(env = process.env) {
  return env.AUTOMATION_EMAIL_FROM_NAME || null;
}

/** Domínio usado só para compor um Message-ID legível (Seção 25) — nunca uma garantia de deduplicação do provedor. */
function getEmailMessageIdDomain(env = process.env) {
  if (env.AUTOMATION_EMAIL_MESSAGE_ID_DOMAIN) return env.AUTOMATION_EMAIL_MESSAGE_ID_DOMAIN;
  const from = getEmailFrom(env);
  if (from && from.includes("@")) return from.split("@")[1];
  return "frotamax.local";
}

// Minutos após os quais uma execução travada em SENDING (processo morreu no
// meio do envio, sem marcar SENT nem ERROR) volta a ser elegível para uma
// nova claim — mesmo espírito de STALE_DOCUMENT_PROCESSING_MINUTES (Bloco 7B).
const STALE_SENDING_MINUTES = 15;

module.exports = {
  getDistributionMaxAttempts,
  getEmailMaxAttachmentBytes,
  getEmailMaxTotalAttachmentBytes,
  getEmailFrom,
  getEmailFromName,
  getEmailMessageIdDomain,
  STALE_SENDING_MINUTES,
};
