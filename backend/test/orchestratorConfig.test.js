"use strict";

/**
 * Bloco 10 — testes puros (sem banco) da configuração do orquestrador,
 * especialmente o KILL SWITCH (Seção 8-9): ausente ou qualquer valor
 * diferente de "true" precisa significar DESLIGADO, nunca o contrário.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getOrchestratorEnabled,
  getOrchestratorBatchSize,
  getOrchestratorConcurrency,
  getOrchestratorMaxStepsPerExecution,
  getOrchestratorRetryCooldownSeconds,
} = require("../src/modules/automations/orchestrator/orchestratorConfig");

test("getOrchestratorEnabled: ausente é DESLIGADO", () => {
  assert.equal(getOrchestratorEnabled({}), false);
});

test("getOrchestratorEnabled: 'false' é DESLIGADO", () => {
  assert.equal(getOrchestratorEnabled({ AUTOMATION_ORCHESTRATOR_ENABLED: "false" }), false);
});

test("getOrchestratorEnabled: valor arbitrário (typo) nunca é interpretado como ligado", () => {
  assert.equal(getOrchestratorEnabled({ AUTOMATION_ORCHESTRATOR_ENABLED: "1" }), false);
  assert.equal(getOrchestratorEnabled({ AUTOMATION_ORCHESTRATOR_ENABLED: "yes" }), false);
});

test("getOrchestratorEnabled: 'true' (e variação de caixa) é LIGADO", () => {
  assert.equal(getOrchestratorEnabled({ AUTOMATION_ORCHESTRATOR_ENABLED: "true" }), true);
  assert.equal(getOrchestratorEnabled({ AUTOMATION_ORCHESTRATOR_ENABLED: "TRUE" }), true);
});

test("defaults seguros quando env vazia", () => {
  assert.equal(getOrchestratorBatchSize({}), 50);
  assert.equal(getOrchestratorConcurrency({}), 2);
  assert.equal(getOrchestratorMaxStepsPerExecution({}), 8);
  assert.equal(getOrchestratorRetryCooldownSeconds({}), 120);
});

test("valores explícitos sobrescrevem o default", () => {
  assert.equal(getOrchestratorBatchSize({ AUTOMATION_ORCHESTRATOR_BATCH_SIZE: "10" }), 10);
  assert.equal(getOrchestratorConcurrency({ AUTOMATION_ORCHESTRATOR_CONCURRENCY: "5" }), 5);
  assert.equal(getOrchestratorMaxStepsPerExecution({ AUTOMATION_ORCHESTRATOR_MAX_STEPS_PER_EXECUTION: "3" }), 3);
  assert.equal(getOrchestratorRetryCooldownSeconds({ AUTOMATION_ORCHESTRATOR_RETRY_COOLDOWN_SECONDS: "30" }), 30);
});

test("valores inválidos (não numéricos, negativos, zero) caem no default", () => {
  assert.equal(getOrchestratorBatchSize({ AUTOMATION_ORCHESTRATOR_BATCH_SIZE: "abc" }), 50);
  assert.equal(getOrchestratorBatchSize({ AUTOMATION_ORCHESTRATOR_BATCH_SIZE: "-5" }), 50);
  assert.equal(getOrchestratorBatchSize({ AUTOMATION_ORCHESTRATOR_BATCH_SIZE: "0" }), 50);
});
