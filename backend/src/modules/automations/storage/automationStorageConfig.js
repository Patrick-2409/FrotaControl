"use strict";

/**
 * Leitura centralizada das variáveis de ambiente do Bloco 4 — todas opcionais,
 * com fallback seguro, para que o módulo nunca lance por falta de configuração
 * (a ausência de credenciais reais é tratada como "integração desativada", não
 * como bug). Nenhuma função aqui lê um secret; apenas números/limites.
 *
 * `env` é injetável (default `process.env`) só para permitir testar um valor
 * inválido/ausente sem precisar mexer em `process.env` de verdade.
 */

function parsePositiveIntEnv(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getMaxStorageAttempts(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_STORAGE_MAX_ATTEMPTS, 5);
}

function getTelegramApiTimeoutMs(env = process.env) {
  return parsePositiveIntEnv(env.TELEGRAM_API_TIMEOUT_MS, 15000);
}

// 20MB é o teto de download de arquivo via token de bot local da própria
// Bot API do Telegram — o valor de ambiente pode reduzir, nunca ampliar essa
// realidade (a Bot API rejeitaria antes mesmo de chegarmos a validar aqui).
function getTelegramMediaMaxBytes(env = process.env) {
  return parsePositiveIntEnv(env.TELEGRAM_MEDIA_MAX_BYTES, 20 * 1024 * 1024);
}

function getGoogleDriveTimeoutMs(env = process.env) {
  return parsePositiveIntEnv(env.GOOGLE_DRIVE_TIMEOUT_MS, 20000);
}

// Minutos após os quais uma linha travada em storage_status = 'PROCESSING' é
// considerada abandonada (processo morreu no meio do trabalho, sem marcar
// COMPLETED nem FAILED) e volta a ser elegível para uma nova claim. Constante
// interna (não um requisito de configuração por ambiente no Bloco 4).
const STALE_PROCESSING_MINUTES = 10;

module.exports = {
  getMaxStorageAttempts,
  getTelegramApiTimeoutMs,
  getTelegramMediaMaxBytes,
  getGoogleDriveTimeoutMs,
  STALE_PROCESSING_MINUTES,
};
