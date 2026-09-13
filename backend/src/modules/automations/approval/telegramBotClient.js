"use strict";

/**
 * Cliente injetável para as operações de MENSAGERIA da Bot API do Telegram
 * (Bloco 8) — `sendMessage`, `sendDocument`, `editMessageReplyMarkup`,
 * `editMessageText`, `answerCallbackQuery`. Deliberadamente separado de
 * `storage/telegramFileClient.js` (Bloco 4, só download de mídia via
 * `getFile`/download binário) — responsabilidades distintas, nenhum dos dois
 * reimplementa o outro.
 *
 * Mesma disciplina do Bloco 4: só `fetch` nativo (Node 22), nunca SDK do
 * Telegram; nunca loga nem inclui o token em mensagem de erro
 * (`redactToken`); 100% injetável (`fetchImpl`, `tokenProvider`) para nunca
 * bater na internet de verdade em teste — ver
 * test/telegramBotClient.test.js.
 *
 * `sendDocument` usa `FormData`/`Blob` nativos do Node 22 (undici) — sem
 * nenhuma dependência nova, sem montar multipart/boundary à mão.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

class TelegramBotError extends Error {
  constructor(message, { code, status, cause } = {}) {
    super(message);
    this.name = "TelegramBotError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

function redactToken(text, token) {
  if (!token) return text;
  return String(text).split(token).join("[REDACTED]");
}

function createTelegramBotClient({
  fetchImpl = fetch,
  tokenProvider = () => process.env.TELEGRAM_BOT_TOKEN,
  timeoutMs = 15000,
} = {}) {
  function requireToken() {
    const token = tokenProvider();
    if (!token) {
      throw new TelegramBotError("TELEGRAM_BOT_TOKEN não configurado — integração Telegram desativada.", {
        code: "TELEGRAM_NOT_CONFIGURED",
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
        throw new TelegramBotError("Timeout ao comunicar com a API do Telegram.", { code: "TELEGRAM_TIMEOUT", cause: err });
      }
      throw new TelegramBotError(redactToken(`Falha de rede ao comunicar com a API do Telegram: ${err.message}`, token), {
        code: "TELEGRAM_NETWORK_ERROR",
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function callJson(method, payload) {
    const token = requireToken();
    const response = await fetchWithTimeout(
      `${TELEGRAM_API_BASE}/bot${token}/${method}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      token
    );
    return parseTelegramResponse(response, method, token);
  }

  async function parseTelegramResponse(response, method, token) {
    let body;
    try {
      body = await response.json();
    } catch {
      throw new TelegramBotError(`Resposta inválida da API do Telegram (${method}).`, { code: "TELEGRAM_INVALID_RESPONSE", status: response.status });
    }
    if (!response.ok || !body.ok) {
      const description = redactToken(String(body?.description || `HTTP ${response.status}`), token);
      throw new TelegramBotError(`Telegram ${method} falhou: ${description}`, { code: "TELEGRAM_API_ERROR", status: response.status });
    }
    return body.result;
  }

  /** Retorna { messageId, chatId }. `replyMarkup`, quando informado, é o objeto `{ inline_keyboard: [...] }` já pronto. */
  async function sendMessage({ chatId, text, replyMarkup } = {}) {
    const result = await callJson("sendMessage", {
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return { messageId: result.message_id, chatId: result.chat?.id ?? chatId };
  }

  /** `buffer`/`filename` do documento a enviar — nunca grava em disco (Seção 34). Retorna { messageId, chatId }. */
  async function sendDocument({ chatId, buffer, filename, caption } = {}) {
    const token = requireToken();
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", new Blob([buffer]), filename);
    if (caption) form.append("caption", caption);
    const response = await fetchWithTimeout(`${TELEGRAM_API_BASE}/bot${token}/sendDocument`, { method: "POST", body: form }, token);
    const result = await parseTelegramResponse(response, "sendDocument", token);
    return { messageId: result.message_id, chatId: result.chat?.id ?? chatId };
  }

  /** Remove/atualiza o teclado inline de uma mensagem já enviada. `replyMarkup: null` remove os botões. */
  async function editMessageReplyMarkup({ chatId, messageId, replyMarkup = null } = {}) {
    return callJson("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup || { inline_keyboard: [] },
    });
  }

  /** Atualiza o texto de uma mensagem já enviada (ex.: anexar "APROVADO por X em <data>"). */
  async function editMessageText({ chatId, messageId, text, replyMarkup } = {}) {
    return callJson("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(replyMarkup !== undefined ? { reply_markup: replyMarkup || { inline_keyboard: [] } } : {}),
    });
  }

  /** Confirma o recebimento de um callback (obrigatório pela Bot API, mesmo sem alterar nada). */
  async function answerCallbackQuery({ callbackQueryId, text, showAlert = false } = {}) {
    return callJson("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
      show_alert: showAlert,
    });
  }

  return { sendMessage, sendDocument, editMessageReplyMarkup, editMessageText, answerCallbackQuery };
}

module.exports = { createTelegramBotClient, TelegramBotError };
