"use strict";

/**
 * Classificação de erros do pipeline de armazenamento (download Telegram +
 * upload Drive) em dois grupos:
 *
 *   - "TEMPORARY": vale a pena tentar de novo mais tarde (rede, timeout,
 *     rate limit do Drive, 5xx). Consome uma tentativa de
 *     AUTOMATION_STORAGE_MAX_ATTEMPTS; ao esgotar o limite, também termina
 *     em FAILED, mas o erro em si não impede novas tentativas por si só.
 *   - "DEFINITIVE": não adianta tentar de novo sem intervenção humana
 *     (configuração incompleta, arquivo grande demais, credencial inválida,
 *     permissão negada, mime type não suportado). Vai direto para FAILED,
 *     independente de quantas tentativas ainda restariam.
 *
 * Erro não reconhecido é tratado como TEMPORARY por padrão: mais seguro gastar
 * algumas tentativas extras (sempre limitadas) do que desistir de algo que na
 * verdade era recuperável.
 */

const StorageError = class StorageError extends Error {
  constructor(message, { code, storageErrorClass, cause } = {}) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.storageErrorClass = storageErrorClass;
    if (cause !== undefined) this.cause = cause;
  }
};

const DEFINITIVE_CODES = new Set([
  "CONFIGURACAO_INCOMPLETA",
  "ARQUIVO_MUITO_GRANDE",
  "MIME_TYPE_NAO_SUPORTADO",
  "CREDENCIAL_INVALIDA",
  "PERMISSAO_NEGADA",
  "TELEGRAM_FILE_NOT_FOUND",
  "DATA_REFERENCIA_INVALIDA",
]);

function classifyStorageError(err) {
  if (!err) return "TEMPORARY";
  if (err.storageErrorClass === "DEFINITIVE" || err.storageErrorClass === "TEMPORARY") {
    return err.storageErrorClass;
  }
  if (DEFINITIVE_CODES.has(err.code)) return "DEFINITIVE";

  const status = err.status ?? err.statusCode ?? err.response?.status;
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 413) {
    return "DEFINITIVE";
  }
  if (status === 429) return "TEMPORARY";
  if (typeof status === "number" && status >= 500) return "TEMPORARY";

  if (
    err.name === "AbortError" ||
    err.code === "ETIMEDOUT" ||
    err.code === "ECONNRESET" ||
    err.code === "ECONNREFUSED" ||
    err.code === "ENOTFOUND"
  ) {
    return "TEMPORARY";
  }

  return "TEMPORARY";
}

module.exports = { classifyStorageError, StorageError, DEFINITIVE_CODES };
