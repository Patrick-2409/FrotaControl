"use strict";

/**
 * Safeguard exigido pela especificação do Bloco 4 ("Testes Sem Internet"):
 * prova que, mesmo com env vazia, tentar USAR os clientes de produção nunca
 * chega a chamar `fetch` de verdade — a validação de configuração incompleta
 * sempre lança ANTES de qualquer tentativa de rede. `global.fetch` é
 * substituído por uma função que FALHA o teste se for chamada, então
 * qualquer regressão que remova essa validação e tente mesmo assim discar
 * para a internet quebra este teste imediatamente.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createDefaultTelegramFileClient, createDefaultGoogleDriveClient } = require("../src/modules/automations/storage/productionClients");

let originalFetch;

test.before(() => {
  originalFetch = global.fetch;
  global.fetch = async (...args) => {
    throw new Error(`TESTE VIOLADO: fetch real foi chamado com ${JSON.stringify(args[0])}`);
  };
});

test.after(() => {
  global.fetch = originalFetch;
});

test("construir os clientes de produção com env vazia nunca lança nem chama fetch", () => {
  assert.doesNotThrow(() => createDefaultTelegramFileClient({}));
  assert.doesNotThrow(() => createDefaultGoogleDriveClient({}));
});

test("telegramFileClient de produção com env vazia falha por configuração, nunca por rede", async () => {
  const client = createDefaultTelegramFileClient({});
  await assert.rejects(() => client.getFile("qualquer"), (err) => {
    assert.equal(err.code, "CONFIGURACAO_INCOMPLETA");
    assert.equal(err.storageErrorClass, "DEFINITIVE");
    return true;
  });
});

test("googleDriveClient de produção com env vazia falha por configuração, nunca por rede", async () => {
  const client = createDefaultGoogleDriveClient({});
  await assert.rejects(() => client.findFolder({ parentId: "x", name: "y" }), (err) => {
    assert.equal(err.code, "CONFIGURACAO_INCOMPLETA");
    assert.equal(err.storageErrorClass, "DEFINITIVE");
    return true;
  });
});

test("googleDriveClient de produção com GOOGLE_DRIVE_AUTH_MODE inválido também falha antes de qualquer rede", async () => {
  const client = createDefaultGoogleDriveClient({ GOOGLE_DRIVE_AUTH_MODE: "MODO_INEXISTENTE" });
  await assert.rejects(() => client.uploadFile({ parentId: "x", name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from([1]) }));
});
