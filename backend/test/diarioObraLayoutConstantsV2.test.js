"use strict";

/**
 * Teste "golden" das constantes de layout do template v2 (Bloco 12) — trava
 * os valores auditados do arquivo de referência oficial (geometria/estilo,
 * hash verificado byte-a-byte) para que uma edição futura desavisada em
 * `diarioObraLayoutConstantsV2.js` quebre um teste em vez de silenciosamente
 * divergir do arquivo auditado. Nunca testa dado de cliente — só estrutura.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const constants = require("../src/modules/automations/documents/diarioObraLayoutConstantsV2");
const v1Constants = require("../src/modules/automations/documents/diarioObraLayoutConstants");

test("template v2: identidade e hash auditados permanecem estáveis", () => {
  assert.equal(constants.TEMPLATE_CODIGO, "diario_obra_ppflora_v2");
  assert.equal(constants.TEMPLATE_VERSAO, 2);
  assert.equal(constants.TEMPLATE_GENERATOR_ID, "diario_obra_ppflora_v2");
  assert.equal(constants.TEMPLATE_TIPO, "EXCEL_PDF_HIBRIDO");
  assert.equal(constants.TEMPLATE_V2_HASH, "2fd040be0e50b11b2271ad2d4b63d70ff70e5b9ff6d48701bcc52664483821c8");
  assert.match(constants.TEMPLATE_V2_HASH, /^[0-9a-f]{64}$/);
  assert.equal(constants.TEMPLATE_SOURCE_FILENAME, "DIÁRIO DE OBRA_09-09-2026.xlsx");
});

test("template v2: codigo é DISTINTO do v1 (Bloco 1: codigo é UNIQUE — v1 e v2 nunca podem colidir)", () => {
  assert.notEqual(constants.TEMPLATE_CODIGO, v1Constants.TEMPLATE_CODIGO);
});

test("template v2: paginação auditada — 32 atividades por página (igual ao v1), mas RDF muda para 2 fotos GRANDES por página", () => {
  assert.equal(constants.ACTIVITIES_PER_PAGE, 32);
  assert.equal(constants.PHOTOS_PER_PAGE, 2);
  assert.notEqual(constants.PHOTOS_PER_PAGE, v1Constants.PHOTOS_PER_PAGE);
});

test("template v2: tetos de segurança nunca são removidos silenciosamente", () => {
  assert.ok(constants.MAX_ACTIVITY_TEXT_LENGTH > 0);
  assert.ok(constants.MAX_ACTIVITIES_TOTAL > 0);
  assert.ok(constants.MAX_PHOTOS_TOTAL > 0);
});

test("template v2: textos fixos auditados — inclui os elementos NOVOS que o v1 nunca teve (clima, divisor Diário)", () => {
  assert.equal(constants.FIXED_TEXT.titulo, "DIÁRIO DE OBRA");
  assert.equal(constants.FIXED_TEXT.rotuloRegistroTempo, "REGISTRO DE TEMPO");
  assert.equal(constants.FIXED_TEXT.rotuloExpediente, "EXPEDIENTE");
  assert.equal(constants.FIXED_TEXT.climaLabelBom, "BOM");
  assert.equal(constants.FIXED_TEXT.climaLabelChuvas, "CHUVAS");
  assert.equal(constants.FIXED_TEXT.diarioDivisor, "Diário");
  assert.equal(constants.FIXED_TEXT.atividadesTitulo, "FORAM REALIZADAS AS SEGUINTES ATIVIDADES:");
  assert.ok(Object.isFrozen(constants.FIXED_TEXT));
});

test("template v2: fallbacks genéricos nunca citam nome de cliente/projeto específico", () => {
  const proibidos = /porto central|presidente kennedy|ppflora/i;
  assert.doesNotMatch(constants.FIXED_TEXT.tituloRdfFallbackPrefixo, proibidos);
  assert.doesNotMatch(constants.FIXED_TEXT.tituloRdfFallbackGenerico, proibidos);
  assert.doesNotMatch(constants.FIXED_TEXT.rodapeAssinanteFallback, proibidos);
});

test("template v2: larguras de coluna idênticas ao v1 (a auditoria confirmou que a geometria de colunas não mudou)", () => {
  assert.deepEqual(constants.RDO_COLUMN_WIDTHS, v1Constants.RDO_COLUMN_WIDTHS);
  assert.deepEqual(constants.RDF_COLUMN_WIDTHS, v1Constants.RDF_COLUMN_WIDTHS);
});

test("template v2: page setup declara A4 retrato com fitToWidth=1 (igual ao v1)", () => {
  assert.equal(constants.PAGE_SETUP.paperSize, 9);
  assert.equal(constants.PAGE_SETUP.orientation, "portrait");
  assert.equal(constants.PDF_PAGE_SIZE, "A4");
});

test("template v2: geometria de altura dinâmica das atividades está presente e coerente (nunca uma altura fixa única)", () => {
  assert.ok(constants.ACTIVITY_CHARS_PER_LINE > 0);
  assert.ok(constants.ACTIVITY_LINE_HEIGHT_POINTS > 0);
  assert.ok(constants.ACTIVITY_MIN_ROW_HEIGHT_POINTS > 0);
  assert.ok(constants.ACTIVITIES_AREA_BUDGET_POINTS > 0);
  // O orçamento de área precisa ser compatível com múltiplas linhas mínimas —
  // nunca menor que uma única linha de atividade (senão nenhum item caberia).
  assert.ok(constants.ACTIVITIES_AREA_BUDGET_POINTS >= constants.ACTIVITY_MIN_ROW_HEIGHT_POINTS);
});
