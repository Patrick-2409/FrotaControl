"use strict";

/**
 * Testes da fiação de produção do e-mail institucional (Seção "provider
 * selecionável" — Gmail API aditivo). Mesma disciplina dos demais testes de
 * `storage/productionClients.js`: nunca toca a internet. Por isso NUNCA
 * chamamos `sendMail()` do lado SMTP real aqui (o transporter do nodemailer
 * tentaria uma conexão de rede de verdade) — só provamos que a CONSTRUÇÃO
 * nunca lança e que a seleção de provedor está correta.
 *
 * O lado Gmail É seguro de exercitar até `sendMail()`: sem credenciais
 * configuradas, `gmailAuthProvider.getAuthHeaders()` lança
 * `GMAIL_CONFIG_INCOMPLETE` ANTES de qualquer `fetch` — usamos essa
 * propriedade para provar (item B) que `AUTOMATION_EMAIL_PROVIDER=GMAIL_API`
 * realmente troca de implementação (só o caminho Gmail pode produzir esse
 * código de erro específico).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createDefaultAutomationEmailClient } = require("../src/modules/automations/storage/productionClients");

test("(A) sem AUTOMATION_EMAIL_PROVIDER configurado, a fábrica ÚNICA continua retornando o cliente SMTP sem lançar (retrocompatibilidade total)", () => {
  const client = createDefaultAutomationEmailClient({});
  assert.equal(typeof client.sendMail, "function");
});

test("(A) AUTOMATION_EMAIL_PROVIDER=SMTP explícito continua funcionando sem lançar", () => {
  const client = createDefaultAutomationEmailClient({ AUTOMATION_EMAIL_PROVIDER: "SMTP" });
  assert.equal(typeof client.sendMail, "function");
});

test("(A) valor desconhecido de AUTOMATION_EMAIL_PROVIDER nunca troca de provedor sozinho — cai no default SMTP sem lançar", () => {
  const client = createDefaultAutomationEmailClient({ AUTOMATION_EMAIL_PROVIDER: "QUALQUER_COISA" });
  assert.equal(typeof client.sendMail, "function");
});

test("(B) AUTOMATION_EMAIL_PROVIDER=GMAIL_API seleciona o novo cliente Gmail — construção nunca lança, mesmo sem nenhuma credencial", () => {
  const client = createDefaultAutomationEmailClient({ AUTOMATION_EMAIL_PROVIDER: "GMAIL_API" });
  assert.equal(typeof client.sendMail, "function");
});

test("(B) prova de que o provedor GMAIL_API é realmente o cliente Gmail: sem credenciais, sendMail rejeita com GMAIL_CONFIG_INCOMPLETE (nunca tenta SMTP)", async () => {
  const client = createDefaultAutomationEmailClient({ AUTOMATION_EMAIL_PROVIDER: "GMAIL_API" });
  await assert.rejects(
    () => client.sendMail({ from: "a@example.com", to: "b@example.com", subject: "s", text: "t" }),
    (err) => {
      assert.equal(err.code, "GMAIL_CONFIG_INCOMPLETE");
      return true;
    }
  );
});

test("(B) credenciais Gmail nunca caem para GOOGLE_REFRESH_TOKEN do Drive — refresh token exige a variável própria GOOGLE_GMAIL_REFRESH_TOKEN", async () => {
  const client = createDefaultAutomationEmailClient({
    AUTOMATION_EMAIL_PROVIDER: "GMAIL_API",
    GOOGLE_GMAIL_CLIENT_ID: "id-gmail",
    GOOGLE_GMAIL_CLIENT_SECRET: "secret-gmail",
    // GOOGLE_REFRESH_TOKEN do Drive presente NÃO deve ser usado pelo Gmail.
    GOOGLE_REFRESH_TOKEN: "refresh-token-do-drive-nao-deve-ser-usado",
  });
  await assert.rejects(
    () => client.sendMail({ from: "a@example.com", to: "b@example.com", subject: "s", text: "t" }),
    (err) => {
      assert.equal(err.code, "GMAIL_CONFIG_INCOMPLETE");
      return true;
    }
  );
});

test("client id/secret do Gmail PODEM cair para as variáveis do Drive (mesmo OAuth Client) sem impedir a construção, quando o refresh token próprio do Gmail está presente", () => {
  const client = createDefaultAutomationEmailClient({
    AUTOMATION_EMAIL_PROVIDER: "GMAIL_API",
    GOOGLE_CLIENT_ID: "id-do-drive",
    GOOGLE_CLIENT_SECRET: "secret-do-drive",
    GOOGLE_GMAIL_REFRESH_TOKEN: "refresh-token-proprio-do-gmail",
  });
  assert.equal(typeof client.sendMail, "function");
});
