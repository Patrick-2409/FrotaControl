"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { EmailConfigSchema } = require("../src/modules/automations/distribution/emailConfigSchema");

test("aceita objeto vazio (tudo opcional)", () => {
  assert.equal(EmailConfigSchema.safeParse({}).success, true);
});

test("aceita assunto/corpo válidos com placeholders permitidos", () => {
  const result = EmailConfigSchema.safeParse({ assunto: "Diário — {projeto} — {data}", corpo: "Olá, {cliente}. Versão {versao}." });
  assert.equal(result.success, true);
});

test("rejeita placeholder desconhecido no assunto (Seção 31)", () => {
  const result = EmailConfigSchema.safeParse({ assunto: "Olá {senha_admin}" });
  assert.equal(result.success, false);
});

test("rejeita placeholder desconhecido no corpo", () => {
  const result = EmailConfigSchema.safeParse({ corpo: "Segredo: {api_key}" });
  assert.equal(result.success, false);
});

test("rejeita string vazia (min 1) quando o campo é informado", () => {
  assert.equal(EmailConfigSchema.safeParse({ assunto: "" }).success, false);
  assert.equal(EmailConfigSchema.safeParse({ corpo: "" }).success, false);
});

test("rejeita assunto/corpo além do tamanho máximo", () => {
  assert.equal(EmailConfigSchema.safeParse({ assunto: "x".repeat(201) }).success, false);
  assert.equal(EmailConfigSchema.safeParse({ corpo: "x".repeat(5001) }).success, false);
});

test("nunca aceita campos de credencial (from/senha/smtp) — schema não os declara, Zod descarta silenciosamente", () => {
  const result = EmailConfigSchema.safeParse({ assunto: "Assunto válido", smtp_password: "segredo", from: "hacker@example.com" });
  assert.equal(result.success, true);
  assert.equal(result.data.smtp_password, undefined);
  assert.equal(result.data.from, undefined);
});
