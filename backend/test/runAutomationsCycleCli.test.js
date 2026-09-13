"use strict";

/**
 * Bloco 10, Seção 38-40 — testes do ENTRYPOINT CLI (`scripts/runAutomationsCycle.js`).
 *
 * O caminho DESLIGADO é testado via SUBPROCESSO REAL (`node scripts/...`) —
 * 100% seguro: o próprio script nunca conecta ao banco nem constrói cliente
 * de produção algum antes de confirmar o kill switch, então rodar isto de
 * verdade nunca toca rede nem Postgres. Deliberadamente NÃO testamos aqui o
 * caminho LIGADO via subprocesso real: fazer isso exigiria
 * AUTOMATION_ORCHESTRATOR_ENABLED=true contra o MESMO Postgres local
 * compartilhado com todos os outros arquivos de teste (rodando em paralelo)
 * — o script construiria clientes de PRODUÇÃO reais (Telegram/Drive/OpenAI/
 * SMTP) e tentaria processar candidatas de QUALQUER arquivo, violando a
 * proibição explícita deste bloco de nunca ativar uma integração real. O
 * mapeamento outcome->exit code (a parte determinística/testável do
 * caminho LIGADO) é coberto à parte, em unidade, via `resolveExitCode`.
 * O restante do caminho LIGADO (construção de clients, chamada ao ciclo)
 * já está coberto indiretamente por `orchestratorRunService.test.js`, que
 * testa a MESMA função (`runAutomationCycle`) que o script chama.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { execFileSync } = require("node:child_process");

const { resolveExitCode } = require("../scripts/runAutomationsCycle");

const SCRIPT_PATH = path.join(__dirname, "..", "scripts", "runAutomationsCycle.js");

function runCliSubprocess(env) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT_PATH], {
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 15000,
    });
    return { exitCode: 0, stdout };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout?.toString() || "" };
  }
}

test("CLI: AUTOMATION_ORCHESTRATOR_ENABLED ausente -> saída segura, exit 0, nunca conecta ao banco", () => {
  const env = { ...process.env };
  delete env.AUTOMATION_ORCHESTRATOR_ENABLED;
  const { exitCode, stdout } = runCliSubprocess({ AUTOMATION_ORCHESTRATOR_ENABLED: undefined });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.trim().split("\n").pop());
  assert.equal(parsed.outcome, "DISABLED");
});

test("CLI: AUTOMATION_ORCHESTRATOR_ENABLED=false -> saída segura, exit 0", () => {
  const { exitCode, stdout } = runCliSubprocess({ AUTOMATION_ORCHESTRATOR_ENABLED: "false" });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.trim().split("\n").pop());
  assert.equal(parsed.outcome, "DISABLED");
});

test("CLI: valor arbitrário (nunca 'true') continua DESLIGADO", () => {
  const { exitCode, stdout } = runCliSubprocess({ AUTOMATION_ORCHESTRATOR_ENABLED: "1" });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout.trim().split("\n").pop());
  assert.equal(parsed.outcome, "DISABLED");
});

test("resolveExitCode: mapeamento outcome -> exit code (Seção 40)", () => {
  assert.equal(resolveExitCode("DISABLED"), 0);
  assert.equal(resolveExitCode("ALREADY_RUNNING"), 0);
  assert.equal(resolveExitCode("COMPLETED"), 0);
  assert.equal(resolveExitCode("PARTIAL_FAILURE"), 1);
  assert.equal(resolveExitCode("FAILED"), 1);
});
