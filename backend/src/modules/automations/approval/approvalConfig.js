"use strict";

/**
 * Configuração do módulo de aprovação via Telegram (Bloco 8) — mesmo padrão
 * de `storage/automationStorageConfig.js` e `documents/documentGenerationConfig.js`:
 * tudo opcional, com default seguro, nunca lança por falta de configuração.
 */

function parsePositiveIntEnv(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getApprovalMaxSendAttempts(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_APPROVAL_MAX_SEND_ATTEMPTS, 3);
}

function getApprovalTelegramTimeoutMs(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_APPROVAL_TELEGRAM_TIMEOUT_MS, 15000);
}

// Teto de segurança para o tamanho de um documento enviado via sendDocument —
// nunca depende cegamente do limite real da Bot API (Seção 35), que pode
// mudar sem aviso; este valor é sempre <= o que a API aceitaria.
function getApprovalTelegramMaxDocumentBytes(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_TELEGRAM_MAX_DOCUMENT_BYTES, 45 * 1024 * 1024);
}

module.exports = {
  getApprovalMaxSendAttempts,
  getApprovalTelegramTimeoutMs,
  getApprovalTelegramMaxDocumentBytes,
};
