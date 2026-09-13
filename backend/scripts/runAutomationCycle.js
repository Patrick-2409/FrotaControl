"use strict";

const { pool } = require("../src/db");
const { getOrchestratorEnabled } = require("../src/modules/automations/orchestrator/orchestratorConfig");

const {
  runAutomationCycle,
} = require("../src/modules/automations/orchestrator/orchestratorRunService");

const {
  createDefaultTelegramBotClient,
  createDefaultTelegramFileClient,
  createDefaultGoogleDriveClient,
  createDefaultAutomationEmailClient,
} = require("../src/modules/automations/storage/productionClients");

const {
  createAutomationAiClient,
} = require("../src/modules/automations/ai/automationAiClient");

async function main() {
  // Kill switch checado ANTES de qualquer cliente de produção ser construído
  // (Bloco 10, Seção 39) — nenhuma das fábricas abaixo faz chamada de rede
  // ao ser CRIADA hoje, mas o ponto de entrada do Cron Job é exatamente onde
  // essa garantia precisa ser explícita e nunca reintroduzida por acidente:
  // rodando a cada 5 minutos, para sempre, o caminho "desabilitado" precisa
  // ser o mais curto e óbvio possível.
  if (!getOrchestratorEnabled()) {
    console.log(JSON.stringify({ event: "automation_orchestrator_cron", outcome: "DISABLED" }));
    process.exitCode = 0;
    return;
  }

  const dependencies = {
    telegramFileClient: createDefaultTelegramFileClient(),
    telegramClient: createDefaultTelegramBotClient(),
    driveClient: createDefaultGoogleDriveClient(),
    aiClient: createAutomationAiClient(),
    emailClient: createDefaultAutomationEmailClient(),
  };

  const result = await runAutomationCycle({
    pool,
    dependencies,
    options: {
      trigger: "RENDER_CRON",
    },
  });

  console.log(JSON.stringify({
    event: "automation_orchestrator_cron",
    ...result,
  }, null, 2));

  if (["FAILED", "PARTIAL_FAILURE"].includes(result.outcome)) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("AUTOMATION_CRON_FAILED:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
