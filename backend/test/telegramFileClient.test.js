"use strict";

/**
 * 100% offline — `fetchImpl` é sempre uma fake injetada, nunca o `fetch`
 * global real. Nenhum destes testes deve, em nenhuma hipótese, resolver
 * `api.telegram.org` de verdade (ver também safeguard em
 * automationStorageNoInternet.test.js).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createTelegramFileClient } = require("../src/modules/automations/storage/telegramFileClient");

function fakeResponse({ ok = true, status = 200, json, headers = {}, arrayBuffer } = {}) {
  return {
    ok,
    status,
    headers: { get: (key) => headers[key.toLowerCase()] ?? null },
    json: async () => {
      if (json === undefined) throw new Error("sem corpo JSON");
      return json;
    },
    arrayBuffer: async () => {
      if (arrayBuffer === undefined) throw new Error("sem corpo binário");
      return arrayBuffer;
    },
  };
}

test("getFile: token ausente falha imediatamente como CONFIGURACAO_INCOMPLETA, sem chamar fetch", async () => {
  let called = false;
  const client = createTelegramFileClient({ fetchImpl: async () => { called = true; }, tokenProvider: () => "" });
  await assert.rejects(() => client.getFile("file123"), (err) => {
    assert.equal(err.code, "CONFIGURACAO_INCOMPLETA");
    assert.equal(err.storageErrorClass, "DEFINITIVE");
    return true;
  });
  assert.equal(called, false);
});

test("getFile: sucesso retorna filePath/fileSize/fileUniqueId sem vazar a URL com token", async () => {
  const client = createTelegramFileClient({
    tokenProvider: () => "SEGREDO123",
    fetchImpl: async (url) => {
      assert.ok(String(url).includes("SEGREDO123"), "a chamada real precisa do token na URL");
      return fakeResponse({ json: { ok: true, result: { file_id: "f1", file_unique_id: "u1", file_size: 1000, file_path: "photos/f1.jpg" } } });
    },
  });
  const result = await client.getFile("f1");
  assert.deepEqual(result, { filePath: "photos/f1.jpg", fileSize: 1000, fileId: "f1", fileUniqueId: "u1" });
});

test("getFile: arquivo maior que maxBytes é DEFINITIVE (ARQUIVO_MUITO_GRANDE), detectado antes do download", async () => {
  const client = createTelegramFileClient({
    tokenProvider: () => "tok-abcXYZ789",
    maxBytes: 100,
    fetchImpl: async () => fakeResponse({ json: { ok: true, result: { file_id: "f1", file_unique_id: "u1", file_size: 999, file_path: "x.jpg" } } }),
  });
  await assert.rejects(() => client.getFile("f1"), (err) => {
    assert.equal(err.code, "ARQUIVO_MUITO_GRANDE");
    assert.equal(err.storageErrorClass, "DEFINITIVE");
    return true;
  });
});

test("getFile: 'file is too big' do Telegram é classificado como DEFINITIVE", async () => {
  const client = createTelegramFileClient({
    tokenProvider: () => "tok-abcXYZ789",
    fetchImpl: async () => fakeResponse({ ok: false, status: 400, json: { ok: false, description: "Bad Request: file is too big" } }),
  });
  await assert.rejects(() => client.getFile("f1"), (err) => {
    assert.equal(err.code, "ARQUIVO_MUITO_GRANDE");
    return true;
  });
});

test("getFile: 404/400 genérico é DEFINITIVE (TELEGRAM_FILE_NOT_FOUND)", async () => {
  const client = createTelegramFileClient({
    tokenProvider: () => "tok-abcXYZ789",
    fetchImpl: async () => fakeResponse({ ok: false, status: 404, json: { ok: false, description: "Not Found" } }),
  });
  await assert.rejects(() => client.getFile("f1"), (err) => {
    assert.equal(err.code, "TELEGRAM_FILE_NOT_FOUND");
    assert.equal(err.storageErrorClass, "DEFINITIVE");
    return true;
  });
});

test("getFile: erro de rede nunca vaza o token na mensagem", async () => {
  const client = createTelegramFileClient({
    tokenProvider: () => "SEGREDO-XYZ",
    retries: 0,
    fetchImpl: async (url) => {
      throw new Error(`falha ao conectar em ${url}`);
    },
  });
  await assert.rejects(() => client.getFile("f1"), (err) => {
    assert.ok(!err.message.includes("SEGREDO-XYZ"), "token não pode aparecer na mensagem de erro");
    assert.equal(err.storageErrorClass, "TEMPORARY");
    return true;
  });
});

test("getFile: timeout (abort) é classificado TEMPORARY", async () => {
  const client = createTelegramFileClient({
    tokenProvider: () => "tok-abcXYZ789",
    retries: 0,
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
  await assert.rejects(() => client.getFile("f1"), (err) => {
    assert.equal(err.storageErrorClass, "TEMPORARY");
    assert.equal(err.code, "TELEGRAM_TIMEOUT");
    return true;
  });
});

test("getFile: retry interno recupera de uma falha temporária isolada", async () => {
  let attempts = 0;
  const client = createTelegramFileClient({
    tokenProvider: () => "tok-abcXYZ789",
    retries: 2,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 2) throw new Error("instabilidade momentânea");
      return fakeResponse({ json: { ok: true, result: { file_id: "f1", file_unique_id: "u1", file_size: 10, file_path: "x.jpg" } } });
    },
  });
  const result = await client.getFile("f1");
  assert.equal(attempts, 2);
  assert.equal(result.filePath, "x.jpg");
});

test("downloadFile: sucesso retorna um Buffer", async () => {
  const client = createTelegramFileClient({
    tokenProvider: () => "tok-abcXYZ789",
    fetchImpl: async () => fakeResponse({ headers: { "content-length": "4" }, arrayBuffer: new Uint8Array([1, 2, 3, 4]).buffer }),
  });
  const buffer = await client.downloadFile("photos/x.jpg");
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.length, 4);
});

test("downloadFile: Content-Length acima do limite rejeita sem baixar o corpo inteiro", async () => {
  let arrayBufferCalled = false;
  const client = createTelegramFileClient({
    tokenProvider: () => "tok-abcXYZ789",
    maxBytes: 10,
    fetchImpl: async () =>
      fakeResponse({
        headers: { "content-length": "999999" },
        arrayBuffer: (() => {
          arrayBufferCalled = true;
          return new ArrayBuffer(0);
        })(),
      }),
  });
  await assert.rejects(() => client.downloadFile("x.jpg"), (err) => {
    assert.equal(err.code, "ARQUIVO_MUITO_GRANDE");
    return true;
  });
});

test("downloadFile: corpo real maior que o limite é rejeitado mesmo sem Content-Length confiável", async () => {
  const bigBuffer = new Uint8Array(50).fill(1).buffer;
  const client = createTelegramFileClient({
    tokenProvider: () => "tok-abcXYZ789",
    maxBytes: 10,
    fetchImpl: async () => fakeResponse({ headers: {}, arrayBuffer: bigBuffer }),
  });
  await assert.rejects(() => client.downloadFile("x.jpg"), (err) => {
    assert.equal(err.code, "ARQUIVO_MUITO_GRANDE");
    return true;
  });
});

test("downloadFile: 404 é DEFINITIVE", async () => {
  const client = createTelegramFileClient({
    tokenProvider: () => "tok-abcXYZ789",
    fetchImpl: async () => fakeResponse({ ok: false, status: 404 }),
  });
  await assert.rejects(() => client.downloadFile("x.jpg"), (err) => {
    assert.equal(err.code, "TELEGRAM_FILE_NOT_FOUND");
    assert.equal(err.storageErrorClass, "DEFINITIVE");
    return true;
  });
});
