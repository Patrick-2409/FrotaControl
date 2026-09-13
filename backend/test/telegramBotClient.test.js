"use strict";

/**
 * 100% offline — `fetchImpl` é sempre uma fake injetada, nunca o `fetch`
 * global real (mesma disciplina de telegramFileClient.test.js, Bloco 4).
 * Nenhum destes testes deve, em nenhuma hipótese, resolver `api.telegram.org`
 * de verdade.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createTelegramBotClient } = require("../src/modules/automations/approval/telegramBotClient");

function fakeResponse({ ok = true, status = 200, json } = {}) {
  return {
    ok,
    status,
    json: async () => {
      if (json === undefined) throw new Error("sem corpo JSON");
      return json;
    },
  };
}

test("sendMessage: token ausente falha imediatamente sem chamar fetch", async () => {
  let called = false;
  const client = createTelegramBotClient({ fetchImpl: async () => { called = true; }, tokenProvider: () => "" });
  await assert.rejects(() => client.sendMessage({ chatId: -1, text: "x" }), (err) => {
    assert.equal(err.code, "TELEGRAM_NOT_CONFIGURED");
    return true;
  });
  assert.equal(called, false);
});

test("sendMessage: sucesso retorna messageId/chatId, nunca vaza o token na URL logada por erro", async () => {
  const client = createTelegramBotClient({
    tokenProvider: () => "SEGREDO-BOT-123",
    fetchImpl: async (url, options) => {
      assert.ok(String(url).includes("SEGREDO-BOT-123"), "a chamada real precisa do token na URL");
      const body = JSON.parse(options.body);
      assert.equal(body.chat_id, -100);
      assert.equal(body.text, "Resumo do dia");
      return fakeResponse({ json: { ok: true, result: { message_id: 55, chat: { id: -100 } } } });
    },
  });
  const result = await client.sendMessage({ chatId: -100, text: "Resumo do dia" });
  assert.deepEqual(result, { messageId: 55, chatId: -100 });
});

test("sendMessage: inclui reply_markup quando informado", async () => {
  const keyboard = { inline_keyboard: [[{ text: "OK", callback_data: "appr:1:a" }]] };
  const client = createTelegramBotClient({
    tokenProvider: () => "tok",
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.reply_markup, keyboard);
      return fakeResponse({ json: { ok: true, result: { message_id: 1, chat: { id: -1 } } } });
    },
  });
  await client.sendMessage({ chatId: -1, text: "Decisão:", replyMarkup: keyboard });
});

test("sendMessage: erro da API (ok:false) nunca vaza o token na mensagem de erro", async () => {
  const client = createTelegramBotClient({
    tokenProvider: () => "TOKEN-SUPER-SECRETO",
    fetchImpl: async () => fakeResponse({ ok: false, status: 400, json: { ok: false, description: "Bad Request: chat not found (token TOKEN-SUPER-SECRETO leaked?)" } }),
  });
  await assert.rejects(() => client.sendMessage({ chatId: -1, text: "x" }), (err) => {
    assert.ok(!err.message.includes("TOKEN-SUPER-SECRETO"), "token nunca deveria aparecer na mensagem de erro");
    assert.equal(err.code, "TELEGRAM_API_ERROR");
    return true;
  });
});

test("sendMessage: timeout é classificado TELEGRAM_TIMEOUT", async () => {
  const client = createTelegramBotClient({
    tokenProvider: () => "tok",
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
  await assert.rejects(() => client.sendMessage({ chatId: -1, text: "x" }), (err) => {
    assert.equal(err.code, "TELEGRAM_TIMEOUT");
    return true;
  });
});

test("sendDocument: envia multipart com chat_id/document/caption via FormData nativo", async () => {
  const buffer = Buffer.from([1, 2, 3, 4]);
  const client = createTelegramBotClient({
    tokenProvider: () => "tok",
    fetchImpl: async (url, options) => {
      assert.ok(String(url).includes("sendDocument"));
      assert.ok(options.body instanceof FormData);
      assert.equal(options.body.get("chat_id"), "-100");
      const file = options.body.get("document");
      assert.equal(file.name, "DO_v1.xlsx");
      assert.equal(await file.arrayBuffer().then((ab) => Buffer.from(ab).equals(buffer)), true);
      return fakeResponse({ json: { ok: true, result: { message_id: 77, chat: { id: -100 } } } });
    },
  });
  const result = await client.sendDocument({ chatId: -100, buffer, filename: "DO_v1.xlsx" });
  assert.deepEqual(result, { messageId: 77, chatId: -100 });
});

test("answerCallbackQuery: envia callback_query_id e texto opcional", async () => {
  const client = createTelegramBotClient({
    tokenProvider: () => "tok",
    fetchImpl: async (url, options) => {
      assert.ok(String(url).includes("answerCallbackQuery"));
      const body = JSON.parse(options.body);
      assert.equal(body.callback_query_id, "cb-1");
      assert.equal(body.text, "Documento aprovado.");
      assert.equal(body.show_alert, false);
      return fakeResponse({ json: { ok: true, result: true } });
    },
  });
  await client.answerCallbackQuery({ callbackQueryId: "cb-1", text: "Documento aprovado." });
});

test("editMessageReplyMarkup: sem replyMarkup remove os botões (inline_keyboard vazio)", async () => {
  const client = createTelegramBotClient({
    tokenProvider: () => "tok",
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.reply_markup, { inline_keyboard: [] });
      return fakeResponse({ json: { ok: true, result: {} } });
    },
  });
  await client.editMessageReplyMarkup({ chatId: -1, messageId: 10 });
});

test("editMessageText: atualiza o texto e remove o teclado por padrão", async () => {
  const client = createTelegramBotClient({
    tokenProvider: () => "tok",
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.text, "APROVADO por Fulano em 12/09/2026 10:00");
      assert.deepEqual(body.reply_markup, { inline_keyboard: [] });
      return fakeResponse({ json: { ok: true, result: {} } });
    },
  });
  await client.editMessageText({ chatId: -1, messageId: 10, text: "APROVADO por Fulano em 12/09/2026 10:00", replyMarkup: null });
});
