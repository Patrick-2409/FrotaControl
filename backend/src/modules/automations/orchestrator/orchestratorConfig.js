"use strict";

/**
 * Configuração do orquestrador automático do pipeline (Bloco 10) — mesmo
 * padrão dos demais `*Config.js` do módulo: tudo opcional, com default
 * seguro, função pura de `env` para facilitar teste sem mutar
 * `process.env` global.
 *
 * `getOrchestratorEnabled` é o KILL SWITCH (Seção 8-9): ausente OU qualquer
 * valor diferente de "true" (case-insensitive) é tratado como DESLIGADO —
 * nunca o contrário. Nenhum valor real é escrito em `.env.example` (Seção 9).
 */

function parsePositiveIntEnv(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getOrchestratorEnabled(env = process.env) {
  return String(env.AUTOMATION_ORCHESTRATOR_ENABLED || "").toLowerCase() === "true";
}

function getOrchestratorBatchSize(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_ORCHESTRATOR_BATCH_SIZE, 50);
}

// Nunca disparar 20 chamadas simultâneas de IA/Drive/Telegram/SMTP contra
// recursos limitados (Seção 11) — default conservador.
function getOrchestratorConcurrency(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_ORCHESTRATOR_CONCURRENCY, 2);
}

// Teto de segurança contra loop acidental dentro de UMA execução por ciclo
// (Seção 15-16) — nunca deveria ser alcançado no caminho normal (a máquina de
// estados real da execução tem bem menos de 8 estágios).
function getOrchestratorMaxStepsPerExecution(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_ORCHESTRATOR_MAX_STEPS_PER_EXECUTION, 8);
}

// Intervalo mínimo entre duas tentativas automáticas de um MESMO erro
// recuperável (Seção 41) — evita martelar OpenAI/Telegram/SMTP/Drive todo
// ciclo sem intervalo nenhum quando a falha é persistente por alguns minutos.
function getOrchestratorRetryCooldownSeconds(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_ORCHESTRATOR_RETRY_COOLDOWN_SECONDS, 120);
}

module.exports = {
  getOrchestratorEnabled,
  getOrchestratorBatchSize,
  getOrchestratorConcurrency,
  getOrchestratorMaxStepsPerExecution,
  getOrchestratorRetryCooldownSeconds,
};
