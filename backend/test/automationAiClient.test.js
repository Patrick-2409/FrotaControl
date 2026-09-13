"use strict";

/**
 * 100% offline — `fetchImpl`/`apiKeyProvider` são sempre fakes injetadas.
 * Nenhum teste aqui deve resolver `api.openai.com` de verdade.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAutomationAiClient,
  buildPhotoBatchRequestBody,
  buildConsolidationRequestBody,
  DAILY_INTELLIGENCE_JSON_SCHEMA,
  PHOTO_BATCH_JSON_SCHEMA,
} = require("../src/modules/automations/ai/automationAiClient");
const { findStrictSchemaViolations } = require("../src/modules/automations/ai/jsonSchemaStrictCompliance");

function fakeResponse({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: async () => json };
}

function chatCompletionPayload(content, usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }) {
  return { choices: [{ message: { content: JSON.stringify(content) } }], usage };
}

// ------------------------------------------------------- construção pura do corpo

test("buildConsolidationRequestBody: usa response_format json_schema e as mensagens corretas", () => {
  const body = buildConsolidationRequestBody({ model: "gpt-x", maxOutputTokens: 1000, systemPrompt: "SYS", userPrompt: "USER" });
  assert.equal(body.model, "gpt-x");
  assert.equal(body.max_tokens, 1000);
  assert.equal(body.temperature, 0);
  assert.deepEqual(body.messages, [
    { role: "system", content: "SYS" },
    { role: "user", content: "USER" },
  ]);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.name, "daily_intelligence_v1");
});

// ------------------------------------------ compatibilidade real com Structured Outputs (Bloco 11)

/**
 * Causa raiz real de produção: `DAILY_INTELLIGENCE_JSON_SCHEMA.schema` tinha
 * `schemaVersion: { const: 1 }` (sem `type`) e `facts`/`conflicts`/
 * `missingInformation` como `items: { type: "object" }` sem `properties` —
 * a OpenAI rejeitou com HTTP 400 antes de gerar qualquer coisa. Este teste
 * roda o MESMO checker usado no Bloco 11 direto contra os schemas REAIS
 * exportados — falha se qualquer um voltar a ficar incompatível, sem
 * precisar de rede nem de crédito.
 */
test("DAILY_INTELLIGENCE_JSON_SCHEMA.schema é 100% compatível com Structured Outputs (strict) — nunca mais o HTTP 400 real de produção", () => {
  const violations = findStrictSchemaViolations(DAILY_INTELLIGENCE_JSON_SCHEMA.schema);
  assert.deepEqual(violations, [], `schema incompatível:\n${violations.join("\n")}`);
});

test("PHOTO_BATCH_JSON_SCHEMA.schema é 100% compatível com Structured Outputs (strict)", () => {
  const violations = findStrictSchemaViolations(PHOTO_BATCH_JSON_SCHEMA.schema);
  assert.deepEqual(violations, [], `schema incompatível:\n${violations.join("\n")}`);
});

test("buildPhotoBatchRequestBody: intercala texto e image_url por imagem, na ordem do array", () => {
  const images = [
    { sourceRef: "a", caption: null, mimeType: "image/jpeg", buffer: Buffer.from([1]) },
    { sourceRef: "b", caption: "legenda", mimeType: "image/png", buffer: Buffer.from([2]) },
  ];
  const body = buildPhotoBatchRequestBody({
    model: "gpt-x",
    maxOutputTokens: 500,
    systemPrompt: "SYS",
    images,
    buildUserPromptForImage: (img) => `prompt-para-${img.sourceRef}`,
  });
  const userContent = body.messages[1].content;
  assert.equal(userContent.length, 4);
  assert.deepEqual(userContent[0], { type: "text", text: "prompt-para-a" });
  assert.equal(userContent[1].type, "image_url");
  assert.ok(userContent[1].image_url.url.startsWith("data:image/jpeg;base64,"));
  assert.deepEqual(userContent[2], { type: "text", text: "prompt-para-b" });
  assert.ok(userContent[3].image_url.url.startsWith("data:image/png;base64,"));
});

// ------------------------------------------------------------------- client

test("client: sem OPENAI_API_KEY falha imediatamente (AI_DISABLED), sem chamar fetch", async () => {
  let called = false;
  const client = createAutomationAiClient({ apiKeyProvider: () => "", fetchImpl: async () => { called = true; } });
  await assert.rejects(() => client.consolidateDailyIntelligence({ systemPrompt: "s", userPrompt: "u" }), (err) => {
    assert.equal(err.code, "AI_DISABLED");
    return true;
  });
  assert.equal(called, false);
});

test("client: consolidateDailyIntelligence retorna structuredOutput + usage a partir da resposta fake", async () => {
  const structuredOutput = { schemaVersion: 1, summary: { text: "x", sourceRefs: [] }, facts: [], photoObservations: [], conflicts: [], missingInformation: [], warnings: [] };
  const client = createAutomationAiClient({
    apiKeyProvider: () => "fake-key",
    fetchImpl: async () => fakeResponse({ json: chatCompletionPayload(structuredOutput) }),
  });
  const result = await client.consolidateDailyIntelligence({ systemPrompt: "s", userPrompt: "u" });
  assert.deepEqual(result.structuredOutput, structuredOutput);
  assert.equal(result.usage.inputTokens, 10);
  assert.equal(result.usage.outputTokens, 5);
  assert.equal(result.usage.totalTokens, 15);
});

test("client: analyzePhotoBatch retorna observations a partir da resposta fake", async () => {
  const observations = [{ sourceRef: "a", description: "x", visibleElements: [], limitations: [] }];
  const client = createAutomationAiClient({
    apiKeyProvider: () => "fake-key",
    fetchImpl: async () => fakeResponse({ json: chatCompletionPayload({ observations }) }),
  });
  const result = await client.analyzePhotoBatch({
    systemPrompt: "s",
    images: [{ sourceRef: "a", caption: null, mimeType: "image/jpeg", buffer: Buffer.from([1]) }],
    buildUserPromptForImage: () => "prompt",
  });
  assert.deepEqual(result.observations, observations);
});

test("client: 429 é classificado AI_RATE_LIMIT", async () => {
  const client = createAutomationAiClient({
    apiKeyProvider: () => "fake-key",
    fetchImpl: async () => fakeResponse({ ok: false, status: 429, json: { error: { message: "rate limited" } } }),
  });
  await assert.rejects(() => client.consolidateDailyIntelligence({ systemPrompt: "s", userPrompt: "u" }), (err) => {
    assert.equal(err.code, "AI_RATE_LIMIT");
    return true;
  });
});

test("client: 500 é classificado AI_PROVIDER_ERROR", async () => {
  const client = createAutomationAiClient({
    apiKeyProvider: () => "fake-key",
    fetchImpl: async () => fakeResponse({ ok: false, status: 500, json: { error: { message: "boom" } } }),
  });
  await assert.rejects(() => client.consolidateDailyIntelligence({ systemPrompt: "s", userPrompt: "u" }), (err) => {
    assert.equal(err.code, "AI_PROVIDER_ERROR");
    return true;
  });
});

test("client: timeout (abort) é classificado AI_TIMEOUT", async () => {
  const client = createAutomationAiClient({
    apiKeyProvider: () => "fake-key",
    timeoutMs: 5,
    fetchImpl: (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
  });
  await assert.rejects(() => client.consolidateDailyIntelligence({ systemPrompt: "s", userPrompt: "u" }), (err) => {
    assert.equal(err.code, "AI_TIMEOUT");
    return true;
  });
});

test("client: resposta sem conteúdo válido é AI_INVALID_OUTPUT", async () => {
  const client = createAutomationAiClient({
    apiKeyProvider: () => "fake-key",
    fetchImpl: async () => fakeResponse({ json: { choices: [{ message: { content: "não é json {" } }] } }),
  });
  await assert.rejects(() => client.consolidateDailyIntelligence({ systemPrompt: "s", userPrompt: "u" }), (err) => {
    assert.equal(err.code, "AI_INVALID_OUTPUT");
    return true;
  });
});

test("client: nunca loga/inclui o buffer da imagem em nenhum lugar do corpo textual do erro", async () => {
  const bigBuffer = Buffer.alloc(1000, 7);
  const client = createAutomationAiClient({
    apiKeyProvider: () => "fake-key",
    fetchImpl: async () => fakeResponse({ ok: false, status: 500, json: { error: { message: "boom" } } }),
  });
  try {
    await client.analyzePhotoBatch({
      systemPrompt: "s",
      images: [{ sourceRef: "a", caption: null, mimeType: "image/jpeg", buffer: bigBuffer }],
      buildUserPromptForImage: () => "prompt",
    });
    assert.fail("deveria ter lançado");
  } catch (err) {
    assert.ok(!err.message.includes(bigBuffer.toString("base64").slice(0, 50)));
  }
});
