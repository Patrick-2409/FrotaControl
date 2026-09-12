"use strict";

/**
 * Classificação de erros da geração de documento (Bloco 7B) — mesmo espírito
 * de `ai/aiErrorClassification.js` e `storage/errorClassification.js`.
 */

const { AUTOMATION_DOCUMENT_RECOVERABLE_ERROR_CODES } = require("../constants/automationEnums");

class DocumentError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message);
    this.name = "DocumentError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

function isRecoverableDocumentErrorCode(code) {
  return AUTOMATION_DOCUMENT_RECOVERABLE_ERROR_CODES.includes(code);
}

/** Classifica uma exceção genérica (ex.: lançada pelo Drive) num erro_codigo do domínio de documento. */
function classifyDocumentError(err) {
  if (!err) return "DOCUMENT_STORAGE_FAILED";
  if (err.code && err.code.startsWith?.("DOCUMENT_")) return err.code;
  return "DOCUMENT_STORAGE_FAILED";
}

module.exports = { DocumentError, isRecoverableDocumentErrorCode, classifyDocumentError };
