"use strict";

/**
 * Testes unitários (sem banco/rede) dos placeholders de e-mail relacionados
 * a data/dia da semana (Bloco 12, Seção "placeholders do e-mail") —
 * `resolveWeekdayLabel`/`buildPlaceholderValues` NUNCA usam `new Date()`
 * (relógio do servidor), só `dataReferencia` (YYYY-MM-DD) + timezone da
 * configuração.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPlaceholderValues, resolveWeekdayLabel } = require("../src/modules/automations/distribution/distributionMessageBuilder");
const { renderTemplate } = require("../src/modules/automations/distribution/distributionTemplating");

// CASO F (Bloco 12): dataReferencia=2026-09-14, timezone=America/Sao_Paulo -> segunda-feira.
test("CASO F: resolveWeekdayLabel(2026-09-14, America/Sao_Paulo) = segunda-feira", () => {
  assert.equal(resolveWeekdayLabel("2026-09-14", "America/Sao_Paulo"), "segunda-feira");
});

test("resolveWeekdayLabel: cobre os 7 dias da semana corretamente (semana de referência conhecida)", () => {
  const expected = {
    "2026-09-13": "domingo",
    "2026-09-14": "segunda-feira",
    "2026-09-15": "terça-feira",
    "2026-09-16": "quarta-feira",
    "2026-09-17": "quinta-feira",
    "2026-09-18": "sexta-feira",
    "2026-09-19": "sábado",
  };
  for (const [data, esperado] of Object.entries(expected)) {
    assert.equal(resolveWeekdayLabel(data, "America/Sao_Paulo"), esperado, `dia da semana errado para ${data}`);
  }
});

test("resolveWeekdayLabel: o dia da semana de uma data civil já resolvida não muda com o timezone (propriedade do calendário)", () => {
  assert.equal(resolveWeekdayLabel("2026-09-14", "America/Sao_Paulo"), resolveWeekdayLabel("2026-09-14", "Asia/Tokyo"));
});

test("resolveWeekdayLabel: timezone inválido lança (nunca inventa um dia da semana com timezone desconhecido)", () => {
  assert.throws(() => resolveWeekdayLabel("2026-09-14", "Nao/Existe"));
});

test("resolveWeekdayLabel: dataReferencia malformada lança", () => {
  assert.throws(() => resolveWeekdayLabel("14/09/2026", "America/Sao_Paulo"));
});

// CASO F completo via buildPlaceholderValues: {data}, {dia_semana}, {data_com_dia_semana}.
test("CASO F: buildPlaceholderValues produz data/dia_semana/data_com_dia_semana consistentes", () => {
  const values = buildPlaceholderValues({
    projetoNome: "Obra Teste",
    dataReferencia: "14/09/2026",
    dataReferenciaRaw: "2026-09-14",
    timezone: "America/Sao_Paulo",
    versao: 1,
  });
  assert.equal(values.data, "14/09/2026");
  assert.equal(values.dia_semana, "segunda-feira");
  assert.equal(values.data_com_dia_semana, "14/09/2026 (segunda-feira)");
});

test("buildPlaceholderValues: sem dataReferenciaRaw/timezone (chamador antigo), dia_semana fica vazio mas nunca lança", () => {
  const values = buildPlaceholderValues({ projetoNome: "Obra Teste", dataReferencia: "14/09/2026", versao: 1 });
  assert.equal(values.dia_semana, "");
  assert.equal(values.data_com_dia_semana, "14/09/2026");
});

test("buildPlaceholderValues: timezone inválido nunca impede o envio — dia_semana fica vazio, resto segue normal", () => {
  const values = buildPlaceholderValues({
    projetoNome: "Obra Teste",
    dataReferencia: "14/09/2026",
    dataReferenciaRaw: "2026-09-14",
    timezone: "Nao/Existe",
    versao: 1,
  });
  assert.equal(values.dia_semana, "");
  assert.equal(values.data_com_dia_semana, "14/09/2026");
  assert.equal(values.data, "14/09/2026");
});

// Pedido explícito de correção: os placeholders novos devem funcionar na
// forma de CHAVE DUPLA {{...}} (sintaxe pedida pelo usuário), sem quebrar a
// sintaxe histórica de chave única {...} já usada pelos demais placeholders.
test("CASO F (chave dupla): {{dia_semana}} e {{data_com_dia_semana}} renderizam corretamente, sem chave residual", () => {
  const values = buildPlaceholderValues({
    projetoNome: "Obra Teste",
    dataReferencia: "14/09/2026",
    dataReferenciaRaw: "2026-09-14",
    timezone: "America/Sao_Paulo",
    versao: 1,
  });
  assert.equal(renderTemplate("{{dia_semana}}", values), "segunda-feira");
  assert.equal(renderTemplate("{{data_com_dia_semana}}", values), "14/09/2026 (segunda-feira)");
});

test("CASO F (chave dupla): texto completo do e-mail com {{data}}/{{dia_semana}} renderiza sem NENHUMA chave remanescente", () => {
  const values = buildPlaceholderValues({
    projetoNome: "Obra Teste",
    dataReferencia: "14/09/2026",
    dataReferenciaRaw: "2026-09-14",
    timezone: "America/Sao_Paulo",
    versao: 1,
  });
  const template = "Segue, anexo a este, o D.O. referente ao dia {{data}} ({{dia_semana}}).";
  const result = renderTemplate(template, values);
  assert.equal(result, "Segue, anexo a este, o D.O. referente ao dia 14/09/2026 (segunda-feira).");
  assert.ok(!result.includes("{") && !result.includes("}"), `não pode sobrar nenhuma chave: "${result}"`);
});

test("buildPlaceholderValues: preserva todos os placeholders já existentes (nunca quebra templates antigos)", () => {
  const values = buildPlaceholderValues({
    projetoNome: "Obra X",
    dataReferencia: "14/09/2026",
    dataReferenciaRaw: "2026-09-14",
    timezone: "America/Sao_Paulo",
    versao: 3,
    clienteRazaoSocial: "Cliente LTDA",
    referenciaContratual: "Contrato 1",
    responsavelTecnico: "Eng. Ana",
  });
  assert.equal(values.projeto, "Obra X");
  assert.equal(values.versao, "3");
  assert.equal(values.cliente, "Cliente LTDA");
  assert.equal(values.referenciaContratual, "Contrato 1");
  assert.equal(values.identificacao, "Eng. Ana");
});
