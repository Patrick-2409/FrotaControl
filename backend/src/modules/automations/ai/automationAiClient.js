"use strict";

/**
 * Cliente OpenAI isolado do módulo de automações (Bloco 6) — encapsula TODA
 * comunicação externa com a OpenAI. Nenhum controller/service de domínio
 * deste módulo pode chamar `fetch("https://api.openai.com/...")`
 * diretamente; tudo passa por aqui (Seção 11).
 *
 * Usa `fetch` nativo (mesmo padrão de `intelligenceAiService.js`, já
 * existente no projeto) — não adiciona o SDK oficial da OpenAI: a
 * comunicação necessária (chat completions com texto + imagem + saída
 * estruturada) é um punhado de requisições HTTP bem definidas, e escrevê-las
 * à mão mantém a mesma pegada mínima de dependências já estabelecida nos
 * Blocos 4/5 (ver relatório final para a justificativa completa).
 *
 * 100% injetável (`fetchImpl`, `apiKeyProvider`) — nenhum teste deste bloco
 * chama a internet de verdade (ver automationAiNoInternet.test.js).
 */

const { AiError } = require("./aiErrorClassification");
const { getAutomationOpenAiModel, getAutomationOpenAiTimeoutMs, getAutomationOpenAiMaxOutputTokens } = require("./automationAiConfig");

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const PHOTO_OBSERVATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceRef: { type: "string" },
    description: { type: "string" },
    visibleElements: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: ["sourceRef", "description", "visibleElements", "limitations"],
};

const PHOTO_BATCH_JSON_SCHEMA = {
  name: "photo_batch_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { observations: { type: "array", items: PHOTO_OBSERVATION_JSON_SCHEMA } },
    required: ["observations"],
  },
};

const DAILY_INTELLIGENCE_JSON_SCHEMA = {
  name: "daily_intelligence_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      schemaVersion: { const: 1 },
      summary: {
        type: "object",
        additionalProperties: false,
        properties: { text: { type: "string" }, sourceRefs: { type: "array", items: { type: "string" } } },
        required: ["text", "sourceRefs"],
      },
      facts: { type: "array", items: { type: "object" } },
      photoObservations: { type: "array", items: PHOTO_OBSERVATION_JSON_SCHEMA },
      conflicts: { type: "array", items: { type: "object" } },
      missingInformation: { type: "array", items: { type: "object" } },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["schemaVersion", "summary", "facts", "photoObservations", "conflicts", "missingInformation", "warnings"],
  },
};

function requireApiKey(apiKeyProvider) {
  const apiKey = String(apiKeyProvider() || "").trim();
  if (!apiKey) {
    throw new AiError("OPENAI_API_KEY não configurado — integração de IA desativada.", { code: "AI_DISABLED" });
  }
  return apiKey;
}

function imageToDataUrl({ mimeType, buffer }) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/** Corpo da requisição de análise visual em lote — função pura, testável sem rede. */
function buildPhotoBatchRequestBody({ model, maxOutputTokens, systemPrompt, images, buildUserPromptForImage }) {
  const content = [];
  for (const image of images) {
    content.push({ type: "text", text: buildUserPromptForImage(image) });
    content.push({ type: "image_url", image_url: { url: imageToDataUrl(image) } });
  }
  return {
    model,
    max_tokens: maxOutputTokens,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
    response_format: { type: "json_schema", json_schema: PHOTO_BATCH_JSON_SCHEMA },
  };
}

/** Corpo da requisição de consolidação diária — função pura, testável sem rede. */
function buildConsolidationRequestBody({ model, maxOutputTokens, systemPrompt, userPrompt }) {
  return {
    model,
    max_tokens: maxOutputTokens,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_schema", json_schema: DAILY_INTELLIGENCE_JSON_SCHEMA },
  };
}

function createAutomationAiClient({
  fetchImpl = fetch,
  apiKeyProvider = () => process.env.OPENAI_API_KEY,
  model = getAutomationOpenAiModel(),
  timeoutMs = getAutomationOpenAiTimeoutMs(),
  maxOutputTokens = getAutomationOpenAiMaxOutputTokens(),
} = {}) {
  async function callChatCompletions(body) {
    const apiKey = requireApiKey(apiKeyProvider);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new AiError("Timeout ao comunicar com a OpenAI.", { code: "AI_TIMEOUT", cause: err });
      }
      throw new AiError(`Falha de rede ao comunicar com a OpenAI: ${err.message}`, { code: "AI_PROVIDER_ERROR", cause: err });
    } finally {
      clearTimeout(timer);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) {
        throw new AiError("Rate limit da OpenAI.", { code: "AI_RATE_LIMIT" });
      }
      const err = new AiError(`OpenAI respondeu ${response.status}: ${payload?.error?.message || "erro desconhecido"}`, {
        code: "AI_PROVIDER_ERROR",
      });
      err.status = response.status;
      throw err;
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new AiError("Resposta da OpenAI sem conteúdo.", { code: "AI_INVALID_OUTPUT" });
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new AiError("Resposta da OpenAI não é um JSON válido.", { code: "AI_INVALID_OUTPUT", cause: err });
    }

    const usage = payload?.usage || {};
    return {
      parsed,
      usage: {
        inputTokens: usage.prompt_tokens ?? null,
        outputTokens: usage.completion_tokens ?? null,
        totalTokens: usage.total_tokens ?? null,
      },
    };
  }

  /** `images`: [{ sourceRef, caption, mimeType, buffer }]. Retorna { observations, usage }. */
  async function analyzePhotoBatch({ systemPrompt, images, buildUserPromptForImage }) {
    const body = buildPhotoBatchRequestBody({ model, maxOutputTokens, systemPrompt, images, buildUserPromptForImage });
    const { parsed, usage } = await callChatCompletions(body);
    return { observations: Array.isArray(parsed?.observations) ? parsed.observations : [], usage };
  }

  /** Retorna { structuredOutput, usage } — validação Zod acontece FORA do client (ver dailyIntelligenceValidator.js). */
  async function consolidateDailyIntelligence({ systemPrompt, userPrompt }) {
    const body = buildConsolidationRequestBody({ model, maxOutputTokens, systemPrompt, userPrompt });
    const { parsed, usage } = await callChatCompletions(body);
    return { structuredOutput: parsed, usage };
  }

  return { model, analyzePhotoBatch, consolidateDailyIntelligence };
}

module.exports = {
  createAutomationAiClient,
  buildPhotoBatchRequestBody,
  buildConsolidationRequestBody,
  imageToDataUrl,
  PHOTO_OBSERVATION_JSON_SCHEMA,
  PHOTO_BATCH_JSON_SCHEMA,
  DAILY_INTELLIGENCE_JSON_SCHEMA,
};
