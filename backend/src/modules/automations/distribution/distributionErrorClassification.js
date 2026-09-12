"use strict";

/**
 * Classificação de erros da distribuição por e-mail (Bloco 9) — mesmo
 * espírito de `documents/documentErrorClassification.js` e
 * `approval/approvalErrorClassification.js`.
 */

const { AUTOMATION_DISTRIBUTION_RECOVERABLE_ERROR_CODES } = require("../constants/automationEnums");

class DistributionError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message);
    this.name = "DistributionError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

function isRecoverableDistributionErrorCode(code) {
  return AUTOMATION_DISTRIBUTION_RECOVERABLE_ERROR_CODES.includes(code);
}

/** Classifica uma exceção genérica (ex.: lançada pelo transporte SMTP) num erro_codigo do domínio de distribuição. */
function classifyDistributionError(err) {
  if (!err) return "DISTRIBUTION_EMAIL_SEND_FAILED";
  if (err.code && err.code.startsWith?.("DISTRIBUTION_")) return err.code;
  return "DISTRIBUTION_EMAIL_SEND_FAILED";
}

module.exports = { DistributionError, isRecoverableDistributionErrorCode, classifyDistributionError };
