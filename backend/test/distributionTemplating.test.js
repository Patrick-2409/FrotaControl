"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ALLOWED_PLACEHOLDERS, extractPlaceholders, findUnknownPlaceholders, renderTemplate } = require("../src/modules/automations/distribution/distributionTemplating");

test("extractPlaceholders: encontra todos os placeholders sem duplicar", () => {
  assert.deepEqual(extractPlaceholders("{projeto} - {data} - {projeto}"), ["projeto", "data"]);
  assert.deepEqual(extractPlaceholders("sem placeholder aqui"), []);
  assert.deepEqual(extractPlaceholders(""), []);
  assert.deepEqual(extractPlaceholders(undefined), []);
});

test("findUnknownPlaceholders: só reporta os que não estão na lista permitida", () => {
  assert.deepEqual(findUnknownPlaceholders("{projeto} {data}"), []);
  assert.deepEqual(findUnknownPlaceholders("{projeto} {senha_admin}"), ["senha_admin"]);
  assert.deepEqual(findUnknownPlaceholders("{token} {api_key}").sort(), ["api_key", "token"]);
});

test("todos os ALLOWED_PLACEHOLDERS são reconhecidos como conhecidos", () => {
  for (const name of ALLOWED_PLACEHOLDERS) {
    assert.deepEqual(findUnknownPlaceholders(`{${name}}`), []);
  }
});

test("renderTemplate: substitui só placeholders conhecidos com valor definido", () => {
  const result = renderTemplate("Diário de Obra — {projeto} — {data}", { projeto: "Obra Central", data: "12/09/2026" });
  assert.equal(result, "Diário de Obra — Obra Central — 12/09/2026");
});

test("renderTemplate: placeholder desconhecido permanece explicitamente identificado, nunca lança (Seção 12)", () => {
  const result = renderTemplate("Olá {nome_pessoal}, projeto {projeto}", { projeto: "X" });
  assert.equal(result, "Olá {nome_pessoal}, projeto X");
});

test("renderTemplate: placeholder conhecido sem valor definido permanece literal, nunca vira 'undefined'/'null'", () => {
  const result = renderTemplate("Cliente: {cliente}", {});
  assert.equal(result, "Cliente: {cliente}");
});

test("renderTemplate: nunca executa código — não é eval/Function, só substituição de string (sem template injection)", () => {
  const malicious = "{projeto}${process.exit()}{data}";
  const result = renderTemplate(malicious, { projeto: "X", data: "Y" });
  assert.equal(result, "X${process.exit()}Y");
  assert.equal(typeof result, "string");
});

test("renderTemplate: nunca lança para entrada vazia/undefined", () => {
  assert.equal(renderTemplate(undefined, { projeto: "X" }), "");
  assert.equal(renderTemplate("", {}), "");
});

// ------------------------------------------------ chave dupla {{...}} (sem quebrar a sintaxe histórica {...})

test("extractPlaceholders: reconhece chave dupla {{x}} igual à chave única {x}, sem duplicar", () => {
  assert.deepEqual(extractPlaceholders("{{projeto}} - {data}"), ["projeto", "data"]);
});

test("renderTemplate: {{placeholder}} (chave dupla) substitui por inteiro, NUNCA deixa chave residual de nenhum dos lados", () => {
  assert.equal(renderTemplate("{{projeto}}", { projeto: "Obra Central" }), "Obra Central");
  assert.equal(renderTemplate("Projeto: {{projeto}}!", { projeto: "Obra Central" }), "Projeto: Obra Central!");
});

test("renderTemplate: mistura de chave única e dupla no MESMO texto funciona para ambas, sem resíduo", () => {
  const result = renderTemplate("{projeto} / {{data}} / {{cliente}}", {
    projeto: "Obra X",
    data: "14/09/2026",
    cliente: "Cliente LTDA",
  });
  assert.equal(result, "Obra X / 14/09/2026 / Cliente LTDA");
});

test("renderTemplate: {{placeholder}} desconhecido permanece INTEIRO e literal (nunca vira {placeholder} com uma chave a menos)", () => {
  const result = renderTemplate("Olá {{nome_pessoal}}, projeto {{projeto}}", { projeto: "X" });
  assert.equal(result, "Olá {{nome_pessoal}}, projeto X");
});

test("renderTemplate: {{placeholder}} conhecido sem valor definido permanece INTEIRO e literal (nunca resíduo de uma chave só)", () => {
  const result = renderTemplate("Cliente: {{cliente}}", {});
  assert.equal(result, "Cliente: {{cliente}}");
});

test("todos os ALLOWED_PLACEHOLDERS funcionam também na forma de chave dupla {{x}}", () => {
  for (const name of ALLOWED_PLACEHOLDERS) {
    const result = renderTemplate(`{{${name}}}`, { [name]: `valor-${name}` });
    assert.equal(result, `valor-${name}`, `chave dupla falhou para {{${name}}}`);
    assert.ok(!result.includes("{"), `resíduo de chave encontrado para {{${name}}}: "${result}"`);
  }
});
