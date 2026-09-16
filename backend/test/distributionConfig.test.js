"use strict";

/**
 * Testes puros (sem banco/rede) de `distribution/distributionConfig.js` —
 * foco no provedor selecionável (Seção "GMAIL_API + fallback SMTP") e na
 * regra de independência de credenciais Gmail x Drive.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAutomationEmailProvider,
  getEmailFrom,
  getEmailFromName,
  getGmailClientId,
  getGmailClientSecret,
  getGmailRefreshToken,
} = require("../src/modules/automations/distribution/distributionConfig");

test("getAutomationEmailProvider: ausente/vazio/desconhecido sempre resolve para SMTP (default retrocompatível)", () => {
  assert.equal(getAutomationEmailProvider({}), "SMTP");
  assert.equal(getAutomationEmailProvider({ AUTOMATION_EMAIL_PROVIDER: "" }), "SMTP");
  assert.equal(getAutomationEmailProvider({ AUTOMATION_EMAIL_PROVIDER: "OUTRO" }), "SMTP");
});

test("getAutomationEmailProvider: só GMAIL_API (case-insensitive) ativa o provedor Gmail", () => {
  assert.equal(getAutomationEmailProvider({ AUTOMATION_EMAIL_PROVIDER: "GMAIL_API" }), "GMAIL_API");
  assert.equal(getAutomationEmailProvider({ AUTOMATION_EMAIL_PROVIDER: "gmail_api" }), "GMAIL_API");
});

test("getEmailFrom/getEmailFromName: provider SMTP usa AUTOMATION_EMAIL_FROM*, nunca as variáveis Gmail", () => {
  const env = {
    AUTOMATION_EMAIL_FROM: "smtp@example.com",
    AUTOMATION_EMAIL_FROM_NAME: "SMTP Sender",
    AUTOMATION_GMAIL_FROM: "gmail@example.com",
    AUTOMATION_GMAIL_FROM_NAME: "Gmail Sender",
  };
  assert.equal(getEmailFrom(env), "smtp@example.com");
  assert.equal(getEmailFromName(env), "SMTP Sender");
});

test("getEmailFrom/getEmailFromName: provider GMAIL_API usa AUTOMATION_GMAIL_FROM*, nunca as variáveis SMTP", () => {
  const env = {
    AUTOMATION_EMAIL_PROVIDER: "GMAIL_API",
    AUTOMATION_EMAIL_FROM: "smtp@example.com",
    AUTOMATION_EMAIL_FROM_NAME: "SMTP Sender",
    AUTOMATION_GMAIL_FROM: "gmail@example.com",
    AUTOMATION_GMAIL_FROM_NAME: "Gmail Sender",
  };
  assert.equal(getEmailFrom(env), "gmail@example.com");
  assert.equal(getEmailFromName(env), "Gmail Sender");
});

test("getEmailFrom: sem remetente configurado para o provedor ativo, retorna null (nunca inventa um)", () => {
  assert.equal(getEmailFrom({}), null);
  assert.equal(getEmailFrom({ AUTOMATION_EMAIL_PROVIDER: "GMAIL_API" }), null);
});

test("getGmailClientId/getGmailClientSecret: caem para as variáveis do Drive quando as próprias do Gmail estão ausentes", () => {
  const env = { GOOGLE_CLIENT_ID: "drive-id", GOOGLE_CLIENT_SECRET: "drive-secret" };
  assert.equal(getGmailClientId(env), "drive-id");
  assert.equal(getGmailClientSecret(env), "drive-secret");
});

test("getGmailClientId/getGmailClientSecret: variáveis próprias do Gmail têm prioridade sobre as do Drive", () => {
  const env = {
    GOOGLE_GMAIL_CLIENT_ID: "gmail-id",
    GOOGLE_GMAIL_CLIENT_SECRET: "gmail-secret",
    GOOGLE_CLIENT_ID: "drive-id",
    GOOGLE_CLIENT_SECRET: "drive-secret",
  };
  assert.equal(getGmailClientId(env), "gmail-id");
  assert.equal(getGmailClientSecret(env), "gmail-secret");
});

test("getGmailRefreshToken: NUNCA cai para GOOGLE_REFRESH_TOKEN do Drive — só GOOGLE_GMAIL_REFRESH_TOKEN, ou null", () => {
  assert.equal(getGmailRefreshToken({ GOOGLE_REFRESH_TOKEN: "drive-refresh-token" }), null);
  assert.equal(getGmailRefreshToken({ GOOGLE_GMAIL_REFRESH_TOKEN: "gmail-refresh-token", GOOGLE_REFRESH_TOKEN: "drive-refresh-token" }), "gmail-refresh-token");
});
