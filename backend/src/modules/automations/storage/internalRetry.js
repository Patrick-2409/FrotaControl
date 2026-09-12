"use strict";

const { classifyStorageError } = require("./errorClassification");

/**
 * Retry HTTP interno de UMA chamada (getFile, download, list, create, ...) —
 * distinto do retry "externo" via storage_attempts, que é entre CLAIMS
 * separadas (podem ficar horas ou dias distantes uma da outra, inclusive
 * entre reinícios de processo). Este aqui cobre só a instabilidade
 * momentânea de rede DENTRO de uma única tentativa de processamento, sem
 * gastar uma tentativa inteira de storage_attempts por causa de um timeout
 * isolado.
 *
 * Só re-tenta erros classificados como TEMPORARY; nunca re-tenta DEFINITIVE
 * (ex.: 404, config incompleta) nem excede `retries`.
 */
async function withInternalRetry(fn, { retries = 2, baseDelayMs = 200, sleep = defaultSleep } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt === retries;
      if (isLastAttempt || classifyStorageError(err) !== "TEMPORARY") {
        throw err;
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastErr;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { withInternalRetry };
