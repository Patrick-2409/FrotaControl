"use strict";

/**
 * Cliente injetável para baixar mídia do Telegram (Bloco 4) — `getFile` +
 * download do binário via URL com token de bot. Não usa SDK do Telegram (o
 * projeto já decidiu no Bloco 3 não depender de uma lib pesada para algo tão
 * pontual); só `fetch` nativo do Node 22.
 *
 * Nunca loga nem inclui o token em mensagens de erro — `redactToken` substitui
 * qualquer ocorrência literal do valor antes de compor qualquer texto que
 * possa chegar a `automacao_eventos.dados`, `telegram_mensagens.storage_last_error`
 * ou ao logger.
 *
 * 100% injetável (`fetchImpl`, `tokenProvider`) para que nenhum teste bata na
 * internet de verdade — ver test/telegramFileClient.test.js.
 */

const { StorageError } = require("./errorClassification");
const { withInternalRetry } = require("./internalRetry");
const { getTelegramApiTimeoutMs, getTelegramMediaMaxBytes } = require("./automationStorageConfig");

const TELEGRAM_API_BASE = "https://api.telegram.org";

function redactToken(text, token) {
  if (!token) return text;
  return String(text).split(token).join("[REDACTED]");
}

function createTelegramFileClient({
  fetchImpl = fetch,
  tokenProvider = () => process.env.TELEGRAM_BOT_TOKEN,
  timeoutMs = getTelegramApiTimeoutMs(),
  maxBytes = getTelegramMediaMaxBytes(),
  retries = 2,
} = {}) {
  function requireToken() {
    const token = tokenProvider();
    if (!token) {
      throw new StorageError("TELEGRAM_BOT_TOKEN não configurado — integração Telegram desativada.", {
        code: "CONFIGURACAO_INCOMPLETA",
        storageErrorClass: "DEFINITIVE",
      });
    }
    return token;
  }

  async function fetchWithTimeout(url, options, token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new StorageError("Timeout ao comunicar com a API do Telegram.", {
          code: "TELEGRAM_TIMEOUT",
          storageErrorClass: "TEMPORARY",
          cause: err,
        });
      }
      throw new StorageError(redactToken(`Falha de rede ao comunicar com a API do Telegram: ${err.message}`, token), {
        code: "TELEGRAM_NETWORK_ERROR",
        storageErrorClass: "TEMPORARY",
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Retorna { filePath, fileSize, fileId, fileUniqueId } — nunca o binário em si. */
  async function getFile(fileId) {
    const token = requireToken();
    return withInternalRetry(
      async () => {
        const url = `${TELEGRAM_API_BASE}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`;
        const response = await fetchWithTimeout(url, { method: "GET" }, token);
        let body;
        try {
          body = await response.json();
        } catch {
          throw new StorageError("Resposta inválida da API do Telegram (getFile).", {
            code: "TELEGRAM_INVALID_RESPONSE",
            storageErrorClass: "TEMPORARY",
          });
        }
        if (!response.ok || !body.ok) {
          const description = redactToken(String(body?.description || `HTTP ${response.status}`), token);
          if (/file is too big/i.test(description)) {
            throw new StorageError(`Telegram getFile: ${description}`, {
              code: "ARQUIVO_MUITO_GRANDE",
              storageErrorClass: "DEFINITIVE",
            });
          }
          if (response.status === 400 || response.status === 404) {
            throw new StorageError(`Telegram getFile: ${description}`, {
              code: "TELEGRAM_FILE_NOT_FOUND",
              storageErrorClass: "DEFINITIVE",
            });
          }
          const err = new StorageError(`Telegram getFile falhou: ${description}`, { code: "TELEGRAM_GET_FILE_FAILED" });
          err.status = response.status;
          throw err;
        }

        const result = body.result || {};
        if (!result.file_path) {
          throw new StorageError("Telegram getFile não retornou file_path.", {
            code: "TELEGRAM_FILE_NOT_FOUND",
            storageErrorClass: "DEFINITIVE",
          });
        }
        if (typeof result.file_size === "number" && result.file_size > maxBytes) {
          throw new StorageError(
            `Arquivo do Telegram (${result.file_size} bytes) excede o limite configurado (${maxBytes} bytes).`,
            { code: "ARQUIVO_MUITO_GRANDE", storageErrorClass: "DEFINITIVE" }
          );
        }
        return {
          filePath: result.file_path,
          fileSize: typeof result.file_size === "number" ? result.file_size : null,
          fileId: result.file_id ?? fileId,
          fileUniqueId: result.file_unique_id ?? null,
        };
      },
      { retries }
    );
  }

  /** Baixa o binário de um `filePath` já resolvido por getFile(). Retorna um Buffer único. */
  async function downloadFile(filePath) {
    const token = requireToken();
    return withInternalRetry(
      async () => {
        const url = `${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`;
        const response = await fetchWithTimeout(url, { method: "GET" }, token);
        if (!response.ok) {
          throw new StorageError(`Download do Telegram falhou (HTTP ${response.status}).`, {
            code: response.status === 404 ? "TELEGRAM_FILE_NOT_FOUND" : "TELEGRAM_DOWNLOAD_FAILED",
            storageErrorClass: response.status === 404 ? "DEFINITIVE" : undefined,
          });
        }

        const contentLengthHeader =
          response.headers && typeof response.headers.get === "function" ? response.headers.get("content-length") : null;
        if (contentLengthHeader && Number(contentLengthHeader) > maxBytes) {
          throw new StorageError(
            `Download do Telegram excede o limite configurado (Content-Length ${contentLengthHeader}).`,
            { code: "ARQUIVO_MUITO_GRANDE", storageErrorClass: "DEFINITIVE" }
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.byteLength > maxBytes) {
          throw new StorageError(`Download do Telegram excede o limite configurado (${buffer.byteLength} bytes).`, {
            code: "ARQUIVO_MUITO_GRANDE",
            storageErrorClass: "DEFINITIVE",
          });
        }
        return buffer;
      },
      { retries }
    );
  }

  return { getFile, downloadFile };
}

module.exports = { createTelegramFileClient };
