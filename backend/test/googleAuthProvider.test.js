"use strict";

/**
 * Só testa os caminhos de VALIDAÇÃO (env incompleta/inválida), que lançam
 * ANTES de qualquer chamada de rede — nunca testamos o caminho de credencial
 * válida (não existe nenhuma neste ambiente, nem deveria: ver Seção 43 do
 * Bloco 4, nenhuma integração real pode ser ativada).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createGoogleAuthProvider } = require("../src/modules/automations/storage/googleAuthProvider");

test("modo ausente/vazio lança CONFIGURACAO_INCOMPLETA sem tentar autenticar", async () => {
  const provider = createGoogleAuthProvider({ env: {} });
  await assert.rejects(() => provider.getAuthHeaders(), (err) => {
    assert.equal(err.code, "CONFIGURACAO_INCOMPLETA");
    assert.equal(err.storageErrorClass, "DEFINITIVE");
    return true;
  });
});

test("modo inválido (nem SERVICE_ACCOUNT nem OAUTH_USER) lança erro claro", async () => {
  const provider = createGoogleAuthProvider({ env: { GOOGLE_DRIVE_AUTH_MODE: "QUALQUER_COISA" } });
  await assert.rejects(() => provider.getAuthHeaders(), /GOOGLE_DRIVE_AUTH_MODE inválido/);
});

test("SERVICE_ACCOUNT sem email/chave lança CONFIGURACAO_INCOMPLETA", async () => {
  const provider = createGoogleAuthProvider({ env: { GOOGLE_DRIVE_AUTH_MODE: "SERVICE_ACCOUNT" } });
  await assert.rejects(() => provider.getAuthHeaders(), (err) => {
    assert.equal(err.code, "CONFIGURACAO_INCOMPLETA");
    return true;
  });
});

test("OAUTH_USER sem client id/secret/refresh token lança CONFIGURACAO_INCOMPLETA", async () => {
  const provider = createGoogleAuthProvider({ env: { GOOGLE_DRIVE_AUTH_MODE: "OAUTH_USER" } });
  await assert.rejects(() => provider.getAuthHeaders(), (err) => {
    assert.equal(err.code, "CONFIGURACAO_INCOMPLETA");
    return true;
  });
});

test("SERVICE_ACCOUNT com email+chave construídos não lança na CONSTRUÇÃO do client (só falharia numa chamada real, nunca exercida aqui)", () => {
  // Regressão: garantir que passar por validação não lança nem tenta emitir JWT
  // de verdade — a criação do objeto JWT do google-auth-library é local.
  const provider = createGoogleAuthProvider({
    env: {
      GOOGLE_DRIVE_AUTH_MODE: "SERVICE_ACCOUNT",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "conta@example.iam.gserviceaccount.com",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nZmFrZQ==\\n-----END PRIVATE KEY-----\\n",
    },
  });
  assert.equal(typeof provider.getAuthHeaders, "function");
  assert.equal(provider.mode, "SERVICE_ACCOUNT");
});

test("createGoogleAuthProvider nunca lança na própria criação (só getAuthHeaders lança)", () => {
  assert.doesNotThrow(() => createGoogleAuthProvider({ env: {} }));
  assert.doesNotThrow(() => createGoogleAuthProvider({ env: { GOOGLE_DRIVE_AUTH_MODE: "OAUTH_USER" } }));
});
