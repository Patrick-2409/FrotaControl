"use strict";

/**
 * Guarda estrutural do Bloco 8 — o módulo de aprovação (mensageria Telegram +
 * orquestração de envio/decisão) precisa permanecer 100% genérico, nunca
 * hardcodando o nome do cliente auditado no Bloco 7A. Mesma disciplina de
 * `documentEngineGeneric.test.js`.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { readFileSync } = require("fs");

const ENGINE_FILES = [
  "../src/modules/automations/approval/documentApprovalService.js",
  "../src/modules/automations/approval/telegramBotClient.js",
  "../src/modules/automations/approval/approvalCallbackParser.js",
  "../src/modules/automations/approval/approvalMessageBuilder.js",
  "../src/modules/automations/approval/approvalErrorClassification.js",
  "../src/modules/automations/approval/approvalConfig.js",
];

test("motor de aprovação nunca hardcoda 'PPFlora' — só reflete projeto_nome/dados reais da execução", () => {
  for (const relativePath of ENGINE_FILES) {
    const absolutePath = path.join(__dirname, relativePath);
    const content = readFileSync(absolutePath, "utf8");
    assert.ok(!/ppflora/i.test(content), `${path.basename(absolutePath)} não deveria conter "PPFlora"`);
  }
});

test("cliente Telegram do Bloco 8 não importa nada do pipeline de armazenamento/Drive do Bloco 4 (responsabilidades separadas)", () => {
  const content = readFileSync(path.join(__dirname, "../src/modules/automations/approval/telegramBotClient.js"), "utf8");
  // Verifica ausência de `require(...)` para os módulos do Bloco 4 — checagem
  // por `require(` em vez de substring simples, já que o comentário do
  // próprio arquivo cita `telegramFileClient.js` a título de contraste
  // (decisão de design), o que não é uma dependência real.
  for (const token of ["require(\"../storage/googleDriveClient\")", "require(\"../storage/telegramFileClient\")", "require(\"../storage/folderProvisioningService\")"]) {
    assert.ok(!content.includes(token), `telegramBotClient.js não deveria importar ${token}`);
  }
});

test("webhook do Telegram (Bloco 3) continua sem referenciar nada do pipeline de Drive mesmo depois do roteamento de callback do Bloco 8", () => {
  const filesToCheck = [
    "../src/modules/automations/telegram/telegramWebhookService.js",
    "../src/modules/automations/telegram/telegramWebhookController.js",
    "../src/modules/automations/telegram/telegramWebhookRoutes.js",
    "../src/app.js",
  ];
  const forbiddenTokens = ["photoStorageService", "googleDriveClient", "telegramFileClient", "folderProvisioningService", "productionClients"];
  for (const relativePath of filesToCheck) {
    const content = readFileSync(path.join(__dirname, relativePath), "utf8");
    for (const token of forbiddenTokens) {
      assert.ok(!content.includes(token), `${relativePath} não deveria referenciar ${token} (regenerar é sempre um passo separado — Seção 40)`);
    }
  }
});
