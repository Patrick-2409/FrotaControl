"use strict";

/**
 * Classificação de erros do pipeline de IA (Bloco 6) — mesmo espírito de
 * `storage/errorClassification.js` (Bloco 4), adaptada aos códigos deste
 * módulo (`AUTOMATION_AI_ERROR_CODES`). "Recuperável" aqui significa
 * "autoriza um novo claim automático" (ver AUTOMATION_AI_RECOVERABLE_ERROR_CODES
 * em constants/automationEnums.js) — a classificação de uma exceção não
 * capturada (`classifyAiError`) é o que decide qual `erro_codigo` gravar.
 */

const { AUTOMATION_AI_RECOVERABLE_ERROR_CODES } = require("../constants/automationEnums");

class AiError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message);
    this.name = "AiError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

function isRecoverableAiErrorCode(code) {
  return AUTOMATION_AI_RECOVERABLE_ERROR_CODES.includes(code);
}

/**
 * Classifica uma exceção genérica (ex.: lançada pelo client OpenAI/Drive) em
 * um `erro_codigo` do domínio de IA. Erros já classificados (AiError com
 * `.code` definido) são respeitados como estão.
 */
function classifyAiError(err) {
  if (!err) return "AI_PROVIDER_ERROR";
  if (err.code && err.code.startsWith?.("AI_")) return err.code;
  if (err.code === "IMAGE_DOWNLOAD_FAILED") return err.code;

  if (err.name === "AbortError" || err.code === "AI_TIMEOUT_INTERNAL") return "AI_TIMEOUT";

  const status = err.status ?? err.statusCode ?? err.response?.status;
  if (status === 429) return "AI_RATE_LIMIT";
  if (typeof status === "number" && status >= 500) return "AI_PROVIDER_ERROR";
  if (typeof status === "number" && status >= 400) return "AI_PROVIDER_ERROR";

  return "AI_PROVIDER_ERROR";
}

module.exports = { AiError, isRecoverableAiErrorCode, classifyAiError };
