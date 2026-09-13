"use strict";

const { pool } = require("../src/db");

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
