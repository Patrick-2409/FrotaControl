"use strict";

/**
 * Guarda estrutural do Bloco 9 — o módulo de distribuição por e-mail precisa
 * permanecer 100% genérico, nunca hardcodando nome pessoal, "Porto Central"
 * ou "PPFlora" (Seção 32). Mesma disciplina de `documentEngineGeneric.test.js`
 * e `approvalEngineGeneric.test.js`.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { readFileSync } = require("fs");

const ENGINE_FILES = [
  "../src/modules/automations/distribution/documentDistributionService.js",
  "../src/modules/automations/distribution/automationEmailClient.js",
  "../src/modules/automations/distribution/distributionTemplating.js",
  "../src/modules/automations/distribution/distributionMessageBuilder.js",
  "../src/modules/automations/distribution/distributionErrorClassification.js",
  "../src/modules/automations/distribution/distributionConfig.js",
  "../src/modules/automations/distribution/emailConfigSchema.js",
  "../src/modules/automations/controllers/automationExecutionController.js",
];

test("motor de distribuição nunca hardcoda 'PPFlora', 'Porto Central' ou um nome pessoal", () => {
  const forbidden = [/ppflora/i, /porto\s*central/i, /\bpatrick\b/i];
  for (const relativePath of ENGINE_FILES) {
    const absolutePath = path.join(__dirname, relativePath);
    const content = readFileSync(absolutePath, "utf8");
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(content), `${path.basename(absolutePath)} não deveria conter algo que bata com ${pattern}`);
    }
  }
});

test("motor de distribuição nunca contém credencial SMTP/e-mail real hardcoded", () => {
  const suspiciousPatterns = [/smtp\.gmail\.com.*password/i, /AUTOMATION_EMAIL_FROM\s*=\s*["'][^"']+@(?!example)/i];
  for (const relativePath of ENGINE_FILES) {
    const content = readFileSync(path.join(__dirname, relativePath), "utf8");
    for (const pattern of suspiciousPatterns) {
      assert.ok(!pattern.test(content), `${relativePath} parece conter uma credencial/endereço real hardcoded`);
    }
  }
});

test("nenhum arquivo do motor referencia Nodemailer diretamente fora de productionClients.js (domínio depende só da interface)", () => {
  for (const relativePath of ENGINE_FILES) {
    if (relativePath.includes("distribution/automationEmailClient")) continue; // a fábrica de produção real fica em storage/productionClients.js
    const content = readFileSync(path.join(__dirname, relativePath), "utf8");
    assert.ok(!content.includes("require(\"nodemailer\")") && !content.includes("require('nodemailer')"), `${relativePath} não deveria importar nodemailer diretamente`);
  }
});
