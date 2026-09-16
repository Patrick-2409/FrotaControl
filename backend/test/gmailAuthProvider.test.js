"use strict";

/**
 * Mesma disciplina de `googleAuthProvider.test.js`: só testa os caminhos de
 * VALIDAÇÃO (credenciais ausentes), que lançam ANTES de qualquer chamada de
 * rede — nunca exercitamos aqui a troca refresh_token->access_token real do
 * `google-auth-library` (faria uma chamada de rede de verdade).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createGmailAuthProvider, GmailAuthConfigError, GMAIL_SEND_SCOPE } = require("../src/modules/automations/distribution/gmailAuthProvider");

test("createGmailAuthProvider nunca lança na própria criação (só getAuthHeaders lança)", () => {
  assert.doesNotThrow(() => createGmailAuthProvider({}));
  assert.doesNotThrow(() => createGmailAuthProvider({ clientId: "id", clientSecret: "secret", refreshToken: "token" }));
});

test("credenciais completamente ausentes: getAuthHeaders lança GMAIL_CONFIG_INCOMPLETE sem tentar autenticar", async () => {
  const provider = createGmailAuthProvider({});
  await assert.rejects(() => provider.getAuthHeaders(), (err) => {
    assert.ok(err instanceof GmailAuthConfigError);
    assert.equal(err.code, "GMAIL_CONFIG_INCOMPLETE");
    return true;
  });
});

test("faltando só o refresh token: ainda lança GMAIL_CONFIG_INCOMPLETE (nunca reutiliza implicitamente outro token)", async () => {
  const provider = createGmailAuthProvider({ clientId: "id", clientSecret: "secret" });
  await assert.rejects(() => provider.getAuthHeaders(), { code: "GMAIL_CONFIG_INCOMPLETE" });
});

test("faltando client id/secret: lança GMAIL_CONFIG_INCOMPLETE mesmo com refresh token presente", async () => {
  const provider = createGmailAuthProvider({ refreshToken: "token" });
  await assert.rejects(() => provider.getAuthHeaders(), { code: "GMAIL_CONFIG_INCOMPLETE" });
});

test("escopo exportado é EXCLUSIVAMENTE gmail.send — nunca readonly/modify/compose/mail.google.com", () => {
  assert.equal(GMAIL_SEND_SCOPE, "https://www.googleapis.com/auth/gmail.send");
});
