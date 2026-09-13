"use strict";

/**
 * `runAutomationCycle` — coordenador central do pipeline (Bloco 10, Seção
 * 4-9/33-50). NUNCA um scheduler em si (nenhum `setInterval`/`node-cron`/loop
 * infinito aqui — Seção 6): processa UM lote e termina. Um gatilho externo
 * futuro (Render Cron Job ou equivalente) é quem decide QUANDO chamar isto —
 * este bloco só deixa a função pronta, nunca a ativa (Seção 7-9).
 *
 * Responsabilidades PRÓPRIAS do orquestrador (nunca delegadas a um serviço de
 * domínio, porque nenhum bloco anterior tinha motivo para tê-las):
 *   - Kill switch (Seção 8-9).
 *   - Lock global não-bloqueante de UM ciclo por vez (Seção 49 —
 *     `pg_try_advisory_lock`, nunca a variante bloqueante usada pelos locks
 *     por execução dos Blocos 5-9).
 *   - Descoberta em lote + concorrência limitada + isolamento de falha por
 *     item (Seção 10-14/46).
 *   - Auditoria agregada da execução do ciclo (Seção 33-36).
 *   - Modo dry-run (Seção 37).
 *
 * Tudo o mais (o que fazer com CADA execução) é decidido por
 * `orchestratorStageActions.js`, que só chama serviços já existentes.
 */

const { logInfo, logWarn } = require("../../../services/loggerService");
const { discoverEligibleExecutions } = require("./orchestratorDiscovery");
const { decideAction, runAction } = require("./orchestratorStageActions");
const {
  getOrchestratorEnabled,
  getOrchestratorBatchSize,
  getOrchestratorConcurrency,
  getOrchestratorMaxStepsPerExecution,
  getOrchestratorRetryCooldownSeconds,
} = require("./orchestratorConfig");

const GLOBAL_CYCLE_LOCK_KEY = "automationsOrchestrator_cycle_v1";

function emptyByStage() {
  return {};
}

function bumpByStage(byStage, category, outcome) {
  if (!byStage[category]) byStage[category] = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  byStage[category].processed += 1;
  if (outcome === "SUCCEEDED") byStage[category].succeeded += 1;
  else if (outcome === "FAILED") byStage[category].failed += 1;
  else byStage[category].skipped += 1;
}

function buildResult({ outcome, runId = null, startedAt, completedAt = new Date(), scanned = 0, processed = 0, succeeded = 0, failed = 0, skipped = 0, byStage = emptyByStage() }) {
  return { outcome, runId, startedAt, completedAt, scanned, processed, succeeded, failed, skipped, byStage };
}

async function insertOrchestrationRun(pool, { trigger, dryRun }) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_orquestracao_runs (started_at, status, trigger, dry_run, host_instance)
     VALUES (NOW(), 'RUNNING', $1, $2, $3) RETURNING *`,
    [trigger, dryRun, String(process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || "").slice(0, 120) || null]
  );
  return rows[0];
}

// Nunca grava a mensagem de erro bruta (poderia carregar dado sensível de
// uma exceção inesperada, ex.: parte de uma query) — só os primeiros 500
// caracteres, mesma disciplina de truncamento usada em `erro_mensagem` em
// todo o resto do módulo.
function sanitizeErrorMessage(message) {
  return String(message || "").slice(0, 500);
}

async function finalizeOrchestrationRun(pool, runId, { status, metrics, erroMensagem = null }) {
  await pool.query(
    `UPDATE automacao_orquestracao_runs SET status = $2, completed_at = NOW(), metrics = $3::jsonb, erro_mensagem = $4 WHERE id = $1`,
    [runId, status, JSON.stringify(metrics), erroMensagem ? sanitizeErrorMessage(erroMensagem) : null]
  );
}

/**
 * Eventos de orquestração (Seção 35-36: ORCHESTRATION_RUN_STARTED/
 * COMPLETED/PARTIAL_FAILURE) são de UM CICLO, nunca de uma empresa — ao
 * contrário de todo o resto do módulo, `automacao_eventos.empresa_id` é
 * `NOT NULL` (desenho tenant-scoped do Bloco 1, correto para tudo o mais),
 * então essa tabela nunca é o lugar certo para um evento verdadeiramente
 * global. O registro durável e consultável do ciclo é a própria linha de
 * `automacao_orquestracao_runs` (status/métricas/timestamps); estes eventos
 * são só log estruturado de aplicação (mesmo padrão de `logInfo`/`logWarn`
 * já usado no restante do módulo para observabilidade), nunca uma tabela.
 */
function logOrchestrationEvent({ runId, tipoEvento, dados }) {
  logInfo("automation_orchestrator_event", { runId, tipoEvento, ...dados });
}

/**
 * Processa UMA execução até `maxStepsPerExecution` passos (Seção 15-16) —
 * cada passo re-lê o estado FRESCO do banco (`decideAction`) e só continua
 * para o próximo quando o passo anterior de fato avançou. Isolamento total
 * (Seção 14/46): qualquer exceção aqui dentro é capturada por quem chama,
 * nunca propaga para interromper o lote inteiro.
 */
async function processCandidate(pool, candidate, { now, dependencies, maxStepsPerExecution, retryCooldownSeconds, dryRun }) {
  let lastOutcome = "NO_ACTION";
  let lastType = null;
  for (let step = 0; step < maxStepsPerExecution; step += 1) {
    const decision = await decideAction(pool, candidate.execucaoId, { now, retryCooldownSeconds });
    if (!decision) break;

    const result = await runAction(pool, decision, { dependencies, dryRun });
    lastOutcome = result.outcome;
    lastType = result.type;

    if (dryRun) break; // dry-run classifica só o PRIMEIRO passo — zero efeito, então nunca há "próximo estado" real para encadear.
    if (!result.advanced) break;
  }
  return { outcome: lastOutcome, type: lastType };
}

/** Resultado de UM item -> classificação agregada (Seção 33: succeeded/failed/skipped). */
function classifyItemResult(outcome) {
  if (outcome === "DRY_RUN") return "SKIPPED";
  const succeededOutcomes = new Set(["READY", "SENT", "REGENERATED", "FLAGGED", "ALREADY_READY"]);
  if (succeededOutcomes.has(outcome)) return "SUCCEEDED";
  const skippedOutcomes = new Set(["NO_ACTION", "ALREADY_CLAIMED", "ALREADY_FLAGGED", "NOT_ELIGIBLE", "NOT_ELIGIBLE_FOR_REBUILD", "ALREADY_SENT", "IN_PROGRESS"]);
  if (skippedOutcomes.has(outcome)) return "SKIPPED";
  return "FAILED";
}

/** Concorrência limitada SEM dependência externa (Seção 11) — nunca mais de `concurrency` itens em voo ao mesmo tempo. */
async function runWithConcurrency(items, concurrency, worker) {
  let cursor = 0;
  async function runNext() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);
}

async function runAutomationCycle({ pool, now = new Date(), dependencies = {}, options = {} }) {
  const startedAt = new Date();
  const enabled = options.enabled ?? getOrchestratorEnabled();
  if (!enabled) {
    return buildResult({ outcome: "DISABLED", startedAt, completedAt: new Date() });
  }

  const batchSize = options.batchSize ?? getOrchestratorBatchSize();
  const concurrency = options.concurrency ?? getOrchestratorConcurrency();
  const maxStepsPerExecution = options.maxStepsPerExecution ?? getOrchestratorMaxStepsPerExecution();
  const retryCooldownSeconds = options.retryCooldownSeconds ?? getOrchestratorRetryCooldownSeconds();
  const dryRun = Boolean(options.dryRun);
  const trigger = options.trigger || "MANUAL";

  const lockClient = await pool.connect();
  let gotLock = false;
  try {
    const { rows: lockRows } = await lockClient.query("SELECT pg_try_advisory_lock(hashtext($1)) AS got", [GLOBAL_CYCLE_LOCK_KEY]);
    gotLock = Boolean(lockRows[0]?.got);
    if (!gotLock) {
      return buildResult({ outcome: "ALREADY_RUNNING", startedAt, completedAt: new Date() });
    }

    const runRow = await insertOrchestrationRun(pool, { trigger, dryRun });
    logOrchestrationEvent({ runId: runRow.id, tipoEvento: "ORCHESTRATION_RUN_STARTED", dados: { trigger, dryRun, batchSize, concurrency } });

    let discovery;
    try {
      discovery = await discoverEligibleExecutions(pool, { now, batchSize, retryCooldownSeconds });
    } catch (err) {
      logWarn("automation_orchestrator_discovery_failed", { message: err.message });
      await finalizeOrchestrationRun(pool, runRow.id, { status: "FAILED", metrics: { scanned: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, byStage: {} }, erroMensagem: err.message });
      return buildResult({ outcome: "FAILED", runId: runRow.id, startedAt, completedAt: new Date() });
    }

    const metrics = { scanned: discovery.scanned.length, processed: 0, succeeded: 0, failed: 0, skipped: 0, byStage: emptyByStage() };

    await runWithConcurrency(discovery.batch, concurrency, async (candidate) => {
      try {
        const itemResult = await processCandidate(pool, candidate, { now, dependencies, maxStepsPerExecution, retryCooldownSeconds, dryRun });
        const bucket = classifyItemResult(itemResult.outcome);
        metrics.processed += 1;
        if (bucket === "SUCCEEDED") metrics.succeeded += 1;
        else if (bucket === "FAILED") metrics.failed += 1;
        else metrics.skipped += 1;
        bumpByStage(metrics.byStage, candidate.category, bucket);
      } catch (err) {
        // Isolamento por item (Seção 14/46): uma falha aqui NUNCA interrompe
        // o lote — só é registrada e o lote continua para os demais.
        metrics.processed += 1;
        metrics.failed += 1;
        bumpByStage(metrics.byStage, candidate.category, "FAILED");
        logWarn("automation_orchestrator_item_failed", { execucaoId: candidate.execucaoId, category: candidate.category, message: err.message });
      }
    });

    const status = metrics.failed > 0 ? "PARTIAL_FAILURE" : "COMPLETED";
    await finalizeOrchestrationRun(pool, runRow.id, { status, metrics });
    logOrchestrationEvent({
      runId: runRow.id,
      tipoEvento: status === "PARTIAL_FAILURE" ? "ORCHESTRATION_RUN_PARTIAL_FAILURE" : "ORCHESTRATION_RUN_COMPLETED",
      dados: { scanned: metrics.scanned, processed: metrics.processed, succeeded: metrics.succeeded, failed: metrics.failed, skipped: metrics.skipped },
    });

    logInfo("automation_orchestrator_run_completed", { runId: runRow.id, status, ...metrics, byStage: undefined });
    return buildResult({ outcome: status, runId: runRow.id, startedAt, completedAt: new Date(), ...metrics });
  } finally {
    if (gotLock) {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [GLOBAL_CYCLE_LOCK_KEY]).catch(() => {});
    }
    lockClient.release();
  }
}

module.exports = {
  runAutomationCycle,
  GLOBAL_CYCLE_LOCK_KEY,
};
