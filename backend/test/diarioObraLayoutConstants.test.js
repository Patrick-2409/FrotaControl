"use strict";

/**
 * Teste "golden" das constantes de layout do template v1 (Bloco 7B) — trava
 * os valores auditados no Bloco 7A (linhas/colunas/textos fixos/hash) para
 * que uma edição futura desavisada em `diarioObraLayoutConstants.js` quebre
 * um teste em vez de silenciosamente divergir do arquivo de referência
 * auditado.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const constants = require("../src/modules/automations/documents/diarioObraLayoutConstants");

test("template v1: identidade e hash auditados no Bloco 7A permanecem estáveis", () => {
  assert.equal(constants.TEMPLATE_CODIGO, "diario_obra_ppflora");
  assert.equal(constants.TEMPLATE_VERSAO, 1);
  assert.equal(constants.TEMPLATE_GENERATOR_ID, "diario_obra_ppflora_v1");
  assert.equal(constants.TEMPLATE_TIPO, "EXCEL_PDF_HIBRIDO");
  assert.equal(constants.TEMPLATE_V1_HASH, "ca7ffdf2af3ab73f4f4012ee6c2053c60ccc6bf4ffdb6626009811a22d589f18");
  assert.match(constants.TEMPLATE_V1_HASH, /^[0-9a-f]{64}$/);
  assert.equal(constants.TEMPLATE_SOURCE_FILENAME, "PPFlora_DO_07-09-2026_TESTE_R01.xlsx");
});

test("template v1: paginação auditada (32 atividades / 13 fotos por página)", () => {
  assert.equal(constants.ACTIVITIES_PER_PAGE, 32);
  assert.equal(constants.PHOTOS_PER_PAGE, 13);
});

test("template v1: tetos de segurança nunca são removidos silenciosamente", () => {
  assert.equal(typeof constants.MAX_ACTIVITY_TEXT_LENGTH, "number");
  assert.ok(constants.MAX_ACTIVITY_TEXT_LENGTH > 0);
  assert.ok(constants.MAX_ACTIVITIES_TOTAL > 0);
  assert.ok(constants.MAX_PHOTOS_TOTAL > 0);
});

test("template v1: textos fixos auditados nunca vêm de config/dados", () => {
  assert.equal(constants.FIXED_TEXT.titulo, "DIÁRIO DE OBRA");
  assert.equal(constants.FIXED_TEXT.subtitulo, "ANDAMENTO DOS SERVIÇOS");
  assert.equal(constants.FIXED_TEXT.rotuloObra, "OBRA");
  assert.equal(constants.FIXED_TEXT.atividadesTitulo, "FORAM REALIZADAS AS SEGUINTES ATIVIDADES:");
  assert.equal(constants.FIXED_TEXT.registroFotograficoTitulo, "REGISTRO FOTOGRÁFICO");
  assert.ok(Object.isFrozen(constants.FIXED_TEXT));
});

test("template v1: larguras de coluna auditadas têm a contagem certa de colunas", () => {
  assert.equal(constants.RDO_COLUMN_WIDTHS.length, 8);
  assert.equal(constants.RDF_COLUMN_WIDTHS.length, 5);
});

test("template v1: page setup declara A4 retrato com fitToWidth=1 (Seção 29)", () => {
  assert.equal(constants.PAGE_SETUP.paperSize, 9);
  assert.equal(constants.PAGE_SETUP.orientation, "portrait");
  assert.equal(constants.PAGE_SETUP.fitToWidth, 1);
  assert.equal(constants.PDF_PAGE_SIZE, "A4");
});

test("template v1: defaults de expediente pertencem ao template, não ao motor genérico", () => {
  assert.equal(constants.DEFAULT_EXPEDIENTE_INICIO, "07:00");
  assert.equal(constants.DEFAULT_EXPEDIENTE_FIM, "17:00");
});
