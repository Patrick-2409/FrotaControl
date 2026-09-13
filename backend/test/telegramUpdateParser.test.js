"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseTelegramJson,
  protectLargeIntegers,
  normalizeUpdate,
  resolveMessageType,
  hasRelevantContent,
  selectBestPhoto,
} = require("../src/modules/automations/telegram/telegramUpdateParser");
const fixtures = require("./fixtures/telegramUpdates");

// ------------------------------------------------- precisão de inteiros (BigInt)

test("parseTelegramJson preserva chat_id grande sem perder precisão", () => {
  // Escrito literalmente no texto (nunca via JSON.stringify de um Number JS,
  // que já teria perdido precisão antes mesmo de chegar ao parser).
  const chatId = "-1009999999999999"; // além de Number.MAX_SAFE_INTEGER
  const raw = `{"update_id":1,"message":{"chat":{"id":${chatId}}}}`;
  const parsed = parseTelegramJson(raw);
  assert.equal(parsed.message.chat.id, chatId);
  assert.equal(typeof parsed.message.chat.id, "string");
});

test("protectLargeIntegers não corrompe números de 16+ dígitos dentro de texto livre", () => {
  const raw = JSON.stringify({ text: "meu numero de protocolo e 12345678901234567890, obrigado" });
  const protectedRaw = protectLargeIntegers(raw);
  const parsed = JSON.parse(protectedRaw);
  assert.equal(parsed.text, "meu numero de protocolo e 12345678901234567890, obrigado");
});

test("protectLargeIntegers não protege números curtos (mantém como number)", () => {
  const raw = JSON.stringify({ width: 1280, height: 853 });
  const parsed = JSON.parse(protectLargeIntegers(raw));
  assert.equal(parsed.width, 1280);
  assert.equal(typeof parsed.width, "number");
});

test("protectLargeIntegers não mexe em floats/exponenciais", () => {
  const raw = '{"valor": 123456789012345.5, "outro": 1e20}';
  const parsed = JSON.parse(protectLargeIntegers(raw));
  assert.equal(typeof parsed.valor, "number");
  assert.equal(typeof parsed.outro, "number");
});

test("IDs grandes do Telegram (chat_id, message_id, user_id) mantêm precisão total no parse", () => {
  // Valores escritos literalmente no texto — um literal Number no código JS já
  // teria perdido precisão antes mesmo de chegar ao parser, o que invalidaria o teste.
  const raw =
    '{"update_id":42,"message":{"message_id":99999999999999999,' +
    '"date":1735689600,"chat":{"id":-1009999999999999},' +
    '"from":{"id":88888888888888888,"first_name":"Teste"},"text":"oi"}}';
  const parsed = parseTelegramJson(raw);
  assert.equal(parsed.message.chat.id, "-1009999999999999");
  assert.equal(parsed.message.message_id, "99999999999999999");
  assert.equal(parsed.message.from.id, "88888888888888888");

  const normalized = normalizeUpdate(parsed);
  assert.equal(normalized.message.chatId, "-1009999999999999");
  assert.equal(normalized.message.messageId, "99999999999999999");
  assert.equal(normalized.message.from.id, "88888888888888888");
});

// --------------------------------------------------------------- normalizeUpdate

test("normalizeUpdate classifica mensagem de texto simples", () => {
  const result = normalizeUpdate(fixtures.textUpdate({ text: "Concluído sem intercorrências." }));
  assert.equal(result.kind, "message");
  assert.equal(result.message.text, "Concluído sem intercorrências.");
  assert.equal(result.message.caption, null);
  assert.equal(result.message.isServiceMessage, false);
});

test("normalizeUpdate preserva text e caption separadamente (nunca concatena)", () => {
  const update = fixtures.photoUpdate({ caption: "Legenda da foto" });
  update.message.text = undefined;
  const result = normalizeUpdate(update);
  assert.equal(result.message.caption, "Legenda da foto");
  assert.equal(result.message.text, null);
});

test("normalizeUpdate reconhece callback_query sem tratar", () => {
  const result = normalizeUpdate(fixtures.callbackQueryUpdate());
  assert.equal(result.kind, "callback_query");
  assert.equal(result.message, null);
});

test("normalizeUpdate marca service message (entrada de membro) como irrelevante para o D.O.", () => {
  const result = normalizeUpdate(fixtures.serviceMessageUpdate("new_chat_members"));
  assert.equal(result.kind, "message");
  assert.equal(result.message.isServiceMessage, true);
});

test("normalizeUpdate tolera campos desconhecidos sem rejeitar o update inteiro", () => {
  const update = fixtures.textUpdate();
  update.message.campo_futuro_desconhecido = { qualquer: "coisa" };
  update.novo_campo_top_level = 123;
  const result = normalizeUpdate(update);
  assert.equal(result.kind, "message");
  assert.equal(result.message.text, update.message.text);
});

test("normalizeUpdate devolve 'invalid' para payload sem estrutura mínima, sem lançar", () => {
  assert.doesNotThrow(() => normalizeUpdate({ lixo: true }));
  const result = normalizeUpdate({ lixo: true });
  assert.equal(result.kind, "invalid");
});

test("normalizeUpdate preserva media_group_id do álbum", () => {
  const [first] = fixtures.albumUpdates({ count: 2, mediaGroupId: "album-xyz" });
  const result = normalizeUpdate(first);
  assert.equal(result.message.mediaGroupId, "album-xyz");
});

test("normalizeUpdate prepara estrutura de document sem processá-lo funcionalmente", () => {
  const result = normalizeUpdate(fixtures.documentUpdate());
  assert.equal(result.kind, "message");
  assert.ok(result.message.document);
  assert.equal(result.message.document.mimeType, "application/pdf");
});

// ----------------------------------------------------------- tipo / conteúdo

test("resolveMessageType prioriza PHOTO quando há foto e texto/caption", () => {
  const result = normalizeUpdate(fixtures.photoUpdate({ caption: "legenda" }));
  assert.equal(resolveMessageType(result.message), "PHOTO");
});

test("resolveMessageType retorna TEXT para mensagem só de texto", () => {
  const result = normalizeUpdate(fixtures.textUpdate());
  assert.equal(resolveMessageType(result.message), "TEXT");
});

test("resolveMessageType retorna DOCUMENT quando não há foto", () => {
  const result = normalizeUpdate(fixtures.documentUpdate());
  assert.equal(resolveMessageType(result.message), "DOCUMENT");
});

test("hasRelevantContent é falso para service message vazia de conteúdo", () => {
  const result = normalizeUpdate(fixtures.serviceMessageUpdate("new_chat_title"));
  assert.equal(hasRelevantContent(result.message), false);
});

// --------------------------------------------------------- seleção de foto

test("selectBestPhoto escolhe a maior variante por área, independente da ordem do array", () => {
  const sizes = [
    { fileId: "big", fileUniqueId: "u-big", width: 1280, height: 853, fileSize: 180000 },
    { fileId: "small", fileUniqueId: "u-small", width: 90, height: 60, fileSize: 1200 },
    { fileId: "medium", fileUniqueId: "u-medium", width: 320, height: 213, fileSize: 15000 },
  ];
  const best = selectBestPhoto(sizes);
  assert.equal(best.fileId, "big");
});

test("selectBestPhoto resolve empate de área pelo maior file_size", () => {
  const sizes = [
    { fileId: "a", fileUniqueId: "u-a", width: 100, height: 100, fileSize: 500 },
    { fileId: "b", fileUniqueId: "u-b", width: 100, height: 100, fileSize: 9000 },
  ];
  const best = selectBestPhoto(sizes);
  assert.equal(best.fileId, "b");
});

test("selectBestPhoto retorna null sem fotos", () => {
  assert.equal(selectBestPhoto([]), null);
  assert.equal(selectBestPhoto(undefined), null);
});
