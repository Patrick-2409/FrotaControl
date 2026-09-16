"use strict";

/**
 * Configuração do módulo de distribuição por e-mail (Bloco 9) — mesmo padrão
 * dos demais `*Config.js` do módulo (Blocos 4/6/7B/8): tudo opcional, com
 * default seguro, nunca lança por falta de configuração. Nenhuma função
 * aqui lê um secret além de repassar seu VALOR (nunca logado) para quem
 * efetivamente conecta ao SMTP/Gmail API (`automationEmailClient.js` /
 * `gmailApiEmailClient.js`).
 *
 * Credenciais (SMTP_USER/SMTP_PASSWORD, GOOGLE_GMAIL_*) e remetente técnico
 * (AUTOMATION_EMAIL_FROM* / AUTOMATION_GMAIL_FROM*) ficam SOMENTE em
 * variável de ambiente — nunca em `automacao_configs` (Seção 13).
 *
 * Provedor selecionável (aditivo): `getAutomationEmailProvider()` decide
 * SMTP (default, retrocompatível) ou GMAIL_API — nunca troca sozinho sem
 * `AUTOMATION_EMAIL_PROVIDER=GMAIL_API` configurado explicitamente. As
 * credenciais Gmail (`GOOGLE_GMAIL_REFRESH_TOKEN`) são SEMPRE independentes
 * das credenciais do Drive (`GOOGLE_REFRESH_TOKEN`) — nunca compartilhadas,
 * nunca reutilizadas implicitamente, mesmo quando o mesmo OAuth Client do
 * Google Cloud é reaproveitado para ambos (client id/secret podem cair para
 * as variáveis do Drive; o refresh token nunca tem esse fallback).
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

/**
 * Provedor de envio institucional (aditivo — Seção "provider selecionável")
 * — "SMTP" é o default EXPLÍCITO quando a variável está ausente/vazia/
 * desconhecida (nunca muda de comportamento sem configuração explícita),
 * preservando 100% a retrocompatibilidade com o que já está em produção.
 */
function getAutomationEmailProvider(env = process.env) {
  const value = String(env.AUTOMATION_EMAIL_PROVIDER || "").trim().toUpperCase();
  return value === "GMAIL_API" ? "GMAIL_API" : "SMTP";
}

/**
 * Nunca tem default — sem remetente configurado, a distribuição é bloqueada
 * (DISTRIBUTION_CONFIG_INCOMPLETE), nunca inventa um. PROVIDER-AWARE (Seção
 * "AUTOMATION_GMAIL_FROM"): com o provedor Gmail ativo, o remetente é o
 * institucional (`AUTOMATION_GMAIL_FROM*`), nunca o SMTP pessoal — mas
 * `documentDistributionService.js` continua chamando só `getEmailFrom()`,
 * sem precisar saber qual provedor está ativo (nenhuma mudança lá).
 */
function getEmailFrom(env = process.env) {
  if (getAutomationEmailProvider(env) === "GMAIL_API") return env.AUTOMATION_GMAIL_FROM || null;
  return env.AUTOMATION_EMAIL_FROM || null;
}

function getEmailFromName(env = process.env) {
  if (getAutomationEmailProvider(env) === "GMAIL_API") return env.AUTOMATION_GMAIL_FROM_NAME || null;
  return env.AUTOMATION_EMAIL_FROM_NAME || null;
}

// Credenciais Gmail API — SEMPRE independentes do Drive (Seção "nunca
// reutilizar implicitamente GOOGLE_REFRESH_TOKEN do Drive"). Client
// ID/Secret podem opcionalmente cair para as variáveis do Drive (mesmo
// OAuth Client no Google Cloud é uma configuração válida), mas o refresh
// token NUNCA tem esse fallback — sempre uma variável própria e obrigatória.
function getGmailClientId(env = process.env) {
  return env.GOOGLE_GMAIL_CLIENT_ID || env.GOOGLE_CLIENT_ID || null;
}

function getGmailClientSecret(env = process.env) {
  return env.GOOGLE_GMAIL_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || null;
}

function getGmailRefreshToken(env = process.env) {
  return env.GOOGLE_GMAIL_REFRESH_TOKEN || null;
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
  getAutomationEmailProvider,
  getEmailFrom,
  getEmailFromName,
  getGmailClientId,
  getGmailClientSecret,
  getGmailRefreshToken,
  getEmailMessageIdDomain,
  STALE_SENDING_MINUTES,
};
