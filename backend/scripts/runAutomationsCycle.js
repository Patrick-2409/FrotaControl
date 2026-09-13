/**
 * Entrypoint de UM ciclo do orquestrador automático do pipeline de
 * automações (Bloco 10). NUNCA fica residente — carrega env, checa o kill
 * switch, (se ligado) roda EXATAMENTE UM ciclo, loga o resultado e encerra.
 * Nenhum `setInterval`/`node-cron`/loop aqui — um gatilho externo futuro
 * (Render Cron Job ou equivalente) decide QUANDO chamar este script; nada
 * disso é criado/ativado por este bloco.
 *
 * Kill switch (AUTOMATION_ORCHESTRATOR_ENABLED): checado ANTES de qualquer
 * conexão com o banco ou construção de cliente de produção
 * (Telegram/Google/OpenAI/SMTP) — ausente ou diferente de "true" (case
 * insensitive) sempre significa DESLIGADO. Rodar este script sem essa
 * variável (o cenário "executado por acidente") nunca toca rede nem banco.
 *
 * Uso:
 *   node scripts/runAutomationsCycle.js
 *
 * Política de exit code (Seção 40):
 *   - DISABLED / ALREADY_RUNNING / COMPLETED -> exit 0 (nada exige atenção humana agora).
 *   - PARTIAL_FAILURE / FAILED -> exit 1 (visível para o monitoramento do cron externo).
 *   - Exceção não tratada -> exit 1.
 */
const path = require("path");
const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional(path.join(__dirname, ".."));

const { getOrchestratorEnabled } = require("../src/modules/automations/orchestrator/orchestratorConfig");

/** Mapeamento puro outcome -> exit code (Seção 40) — extraído para ser testável sem precisar rodar o processo real. */
function resolveExitCode(outcome) {
  return outcome === "PARTIAL_FAILURE" || outcome === "FAILED" ? 1 : 0;
}

async function main() {
  if (!getOrchestratorEnabled()) {
    console.log(JSON.stringify({ outcome: "DISABLED", message: "AUTOMATION_ORCHESTRATOR_ENABLED não é 'true' — nenhuma conexão de banco ou cliente de produção foi iniciada." }));
    process.exitCode = 0;
    return;
  }

  const { pool, initDb } = require("../src/db");
  const { runAutomationCycle } = require("../src/modules/automations/orchestrator/orchestratorRunService");
  const {
    createDefaultTelegramFileClient,
    createDefaultGoogleDriveClient,
    createDefaultTelegramBotClient,
    createDefaultAutomationEmailClient,
  } = require("../src/modules/automations/storage/productionClients");
  const { createAutomationAiClient } = require("../src/modules/automations/ai/automationAiClient");

  try {
    await initDb();

    // Construídos só agora, DEPOIS do kill switch confirmar que o ciclo vai
    // rodar de verdade (Seção 39) — nenhuma destas fábricas faz chamada de
    // rede nem valida segredo ao ser CRIADA (só numa chamada de verdade), mas
    // evita até a criação desnecessária do objeto quando desligado.
    const dependencies = {
      telegramFileClient: createDefaultTelegramFileClient(),
      driveClient: createDefaultGoogleDriveClient(),
      telegramClient: createDefaultTelegramBotClient(),
      emailClient: createDefaultAutomationEmailClient(),
      aiClient: createAutomationAiClient(),
    };

    const result = await runAutomationCycle({ pool, dependencies, options: { trigger: "CLI" } });
    console.log(JSON.stringify(result));

    process.exitCode = resolveExitCode(result.outcome);
  } catch (err) {
    console.error(JSON.stringify({ outcome: "FATAL", message: err.message }));
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

module.exports = { resolveExitCode };

if (require.main === module) {
  main();
}
