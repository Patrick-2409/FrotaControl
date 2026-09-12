"use strict";

/**
 * Classificação de erros da aprovação via Telegram (Bloco 8) — mesmo espírito
 * de `documents/documentErrorClassification.js` e `ai/aiErrorClassification.js`.
 */

const { AUTOMATION_APPROVAL_RECOVERABLE_ERROR_CODES } = require("../constants/automationEnums");

class ApprovalError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

function isRecoverableApprovalErrorCode(code) {
  return AUTOMATION_APPROVAL_RECOVERABLE_ERROR_CODES.includes(code);
}

/** Classifica uma exceção genérica (ex.: lançada pelo cliente Telegram) num erro_codigo do domínio de aprovação. */
function classifyApprovalError(err) {
  if (!err) return "APPROVAL_TELEGRAM_SEND_FAILED";
  if (err.code && err.code.startsWith?.("APPROVAL_")) return err.code;
  return "APPROVAL_TELEGRAM_SEND_FAILED";
}

module.exports = { ApprovalError, isRecoverableApprovalErrorCode, classifyApprovalError };
