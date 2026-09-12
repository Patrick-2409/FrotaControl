"use strict";

/**
 * Safeguard exigido pela especificação do Bloco 6 (Seção 12, mesmo espírito
 * do Bloco 4): prova que construir/usar o client de IA de produção com env
 * vazia NUNCA chega a chamar `fetch` de verdade. `global.fetch` é
 * substituído por uma função que FALHA o teste se for chamada.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAutomationAiClient } = require("../src/modules/automations/ai/automationAiClient");

let originalFetch;

test.before(() => {
  originalFetch = global.fetch;
  global.fetch = async (...args) => {
    throw new Error(`TESTE VIOLADO: fetch real foi chamado com ${JSON.stringify(args[0])}`);
  };
});

test.after(() => {
  global.fetch = originalFetch;
});

test("criar o client de produção com env vazia nunca lança nem chama fetch", () => {
  assert.doesNotThrow(() => createAutomationAiClient({ apiKeyProvider: () => process.env.OPENAI_API_KEY }));
});

test("consolidateDailyIntelligence com env vazia falha por configuração, nunca por rede", async () => {
  const client = createAutomationAiClient({ apiKeyProvider: () => "" });
  await assert.rejects(() => client.consolidateDailyIntelligence({ systemPrompt: "s", userPrompt: "u" }), (err) => {
    assert.equal(err.code, "AI_DISABLED");
    return true;
  });
});

test("analyzePhotoBatch com env vazia falha por configuração, nunca por rede", async () => {
  const client = createAutomationAiClient({ apiKeyProvider: () => "" });
  await assert.rejects(
    () =>
      client.analyzePhotoBatch({
        systemPrompt: "s",
        images: [{ sourceRef: "a", caption: null, mimeType: "image/jpeg", buffer: Buffer.from([1]) }],
        buildUserPromptForImage: () => "x",
      }),
    (err) => {
      assert.equal(err.code, "AI_DISABLED");
      return true;
    }
  );
});
