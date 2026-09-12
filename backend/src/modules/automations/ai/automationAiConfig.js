"use strict";

/**
 * Configuração do módulo de IA das automações (Bloco 6) — tudo opcional, com
 * fallback seguro, seguindo o mesmo padrão de `storage/automationStorageConfig.js`
 * (Bloco 4): nunca lança por falta de configuração, "sem configurar" só
 * significa "usa o default ou fica desativado".
 *
 * Precedência do modelo (Seção 10): `AUTOMATION_OPENAI_MODEL` (específico
 * deste módulo) > `OPENAI_MODEL` (já usado por `intelligenceAiService.js`,
 * reaproveitado como fallback razoável) > default hardcoded. Isso permite
 * operar o módulo de automações com um modelo diferente do resto do
 * FrotaMax (ex.: um modelo com visão, se o padrão da IA operacional não
 * tiver) sem exigir configuração nova quando os dois devem coincidir.
 */

function parsePositiveIntEnv(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getAutomationOpenAiModel(env = process.env) {
  return String(env.AUTOMATION_OPENAI_MODEL || env.OPENAI_MODEL || "gpt-4o-mini").trim();
}

function getAutomationOpenAiTimeoutMs(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_OPENAI_TIMEOUT_MS || env.OPENAI_TIMEOUT_MS, 40000);
}

function getAutomationOpenAiMaxOutputTokens(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_OPENAI_MAX_OUTPUT_TOKENS, 4000);
}

// Quantas fotos, no máximo, entram num único batch de análise visual
// (Seção 24/25) — evita carregar dezenas de imagens grandes simultaneamente
// numa só chamada.
function getAutomationAiMaxImagesPerBatch(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_AI_MAX_IMAGES_PER_BATCH, 10);
}

// Teto de tamanho por imagem enviada à IA (bytes) — mesma família de
// proteção do `TELEGRAM_MEDIA_MAX_BYTES` do Bloco 4, aqui do lado da saída
// (o que sai para a OpenAI), não da entrada (o que entra do Telegram).
function getAutomationAiMaxImageBytes(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_AI_MAX_IMAGE_BYTES, 5 * 1024 * 1024);
}

function getAutomationAiMaxAttempts(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_AI_MAX_ATTEMPTS, 3);
}

module.exports = {
  getAutomationOpenAiModel,
  getAutomationOpenAiTimeoutMs,
  getAutomationOpenAiMaxOutputTokens,
  getAutomationAiMaxImagesPerBatch,
  getAutomationAiMaxImageBytes,
  getAutomationAiMaxAttempts,
};
