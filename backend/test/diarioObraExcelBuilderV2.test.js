"use strict";

/**
 * Testes do builder de Excel v2 (Bloco 12) — sem banco/rede. Prova que o
 * workbook gerado é um ExcelJS válido e reabrível, com a geometria auditada
 * do arquivo de referência oficial (merges, altura dinâmica por conteúdo,
 * paginação por orçamento de altura — nunca contagem fixa — e o novo RDF de
 * 2 fotos grandes por página). Nunca testa dado de cliente específico.
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");

const {
  buildDiarioObraExcelWorkbookV2,
  paginateActivitiesByHeight,
  estimateWrappedLineCount,
  computeActivityRowHeight,
} = require("../src/modules/automations/documents/diarioObraExcelBuilderV2");
const { ACTIVITIES_AREA_BUDGET_POINTS, ACTIVITY_MIN_ROW_HEIGHT_POINTS } = require("../src/modules/automations/documents/diarioObraLayoutConstantsV2");

const LOGO_PATH = path.join(__dirname, "../src/modules/automations/documents/assets/diario-obra-template-v1-logo.png");
const logoBuffer = fs.readFileSync(LOGO_PATH);

function makeModel({ activities = [], numPhotos = 0, tituloRdf, rodapeInstitucional } = {}) {
  const photos = Array.from({ length: numPhotos }, (_, i) => ({
    numero: i + 1,
    telegramMessageId: String(1000000000000 + i),
    driveFileId: `drive-${i}`,
    arquivoId: i + 1,
    legenda: `Legenda ${i + 1}`,
    legendaTipo: "ORIGINAL",
    disponivel: true,
  }));
  return {
    identification: {
      projetoNome: "Obra Teste",
      referenciaContratual: "Contrato 1",
      local: "Canteiro",
      clienteRazaoSocial: "Cliente LTDA",
      clienteEndereco: "Rua 1",
      dataReferencia: "2026-09-07",
      expedienteInicio: "07:00",
      expedienteFim: "17:00",
      expedienteEhDefaultDoTemplate: true,
      tituloRdf: tituloRdf ?? "ATIVIDADES — Canteiro",
      rodapeInstitucional: rodapeInstitucional ?? { assinanteEsquerda: "CONTRATANTE", razaoSocialCompleta: "Cliente LTDA", endereco: "Rua 1" },
    },
    activities,
    photos,
    signature: { responsavelTecnico: "Eng. Teste" },
    metadata: { executionId: 1, snapshotId: 1, snapshotHash: "h", intelligenceId: 1, intelligenceOutputHash: "h2", templateId: 1, templateCodigo: "diario_obra_ppflora_v2", templateVersao: 2, generatorId: "diario_obra_ppflora_v2", documentVersion: 1 },
  };
}

function makeActivities(count, textoFn = (i) => `Atividade ${i + 1}.`) {
  return Array.from({ length: count }, (_, i) => ({ numero: i + 1, tipo: "FACT", texto: textoFn(i) }));
}

async function buildAndReload(model, extraOptions = {}) {
  const photoBuffers = new Map(model.photos.filter((p) => p.disponivel).map((p) => [p.driveFileId, logoBuffer]));
  const workbook = buildDiarioObraExcelWorkbookV2(model, { logoBuffer, photoBuffers, ...extraOptions });
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  return { buffer, reloaded };
}

// --------------------------------------------------------------- geometria auditada

test("workbook vazio ainda produz RDO+RDF válidos e reabríveis", async () => {
  const { reloaded } = await buildAndReload(makeModel());
  assert.deepEqual(reloaded.worksheets.map((w) => w.name), ["RDO", "RDF"]);
});

test("larguras de coluna do RDO reproduzem exatamente as auditadas (idênticas ao v1)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1) }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  const widths = rdo.columns.slice(0, 8).map((c) => c.width);
  assert.deepEqual(widths, [8.43, 8.43, 8.43, 15.66, 8.43, 8.43, 8.43, 8.43]);
});

test("mesclagens auditadas do RDO estão presentes: logo, título, bloco de clima, divisor Diário, rodapé", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1) }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  const merges = Object.keys(rdo._merges || {});
  assert.ok(merges.includes("A1"), "logo A1:B3");
  assert.ok(merges.includes("C1"), "título C1:H1");
  assert.ok(merges.includes("C2"), "subtítulo C2:H3");
  assert.ok(merges.includes("A6"), "linha espaçadora A6:H6");
  assert.ok(merges.includes("A7"), "REGISTRO DE TEMPO A7:D7");
  assert.ok(merges.includes("E7"), "EXPEDIENTE E7:H7");
  assert.ok(merges.includes("E8"), "valor do expediente E8:H10");
  assert.ok(merges.includes("A11"), "divisor Diário A11:H12");
  assert.ok(merges.includes("A13"), "título de atividades A13:H13");
});

test("bloco de clima (BOM/CHUVAS x MANHÃ/TARDE/NOITE) aparece com rótulos, mas marcações SEMPRE vazias", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1) }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  assert.equal(rdo.getCell("A9").value, "BOM");
  assert.equal(rdo.getCell("A10").value, "CHUVAS");
  assert.equal(rdo.getCell("B8").value, "MANHÃ");
  assert.equal(rdo.getCell("C8").value, "TARDE");
  assert.equal(rdo.getCell("D8").value, "NOITE");
  // Nunca inferidas — sempre vazias (Seção "nunca inferidas").
  for (const addr of ["B9", "C9", "D9", "B10", "C10", "D10"]) {
    assert.ok(!rdo.getCell(addr).value, `${addr} deveria estar vazia`);
  }
});

test("divisor 'Diário' e título de atividades aparecem entre o bloco de clima e a grade", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1) }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  assert.equal(rdo.getCell("A11").value, "Diário");
  assert.equal(rdo.getCell("A13").value, "FORAM REALIZADAS AS SEGUINTES ATIVIDADES:");
});

// --------------------------------------------------------------- altura dinâmica

test("estimateWrappedLineCount: texto curto = 1 linha; texto longo = múltiplas linhas; quebras explícitas contam à parte", () => {
  assert.equal(estimateWrappedLineCount("curto"), 1);
  assert.ok(estimateWrappedLineCount("a".repeat(500)) > 1);
  assert.equal(estimateWrappedLineCount("linha 1\nlinha 2\nlinha 3"), 3);
});

test("computeActivityRowHeight: texto mais longo produz altura MAIOR, nunca uma constante única (Seção 'altura dinâmica')", () => {
  const alturaCurta = computeActivityRowHeight("Atividade curta.");
  const alturaLonga = computeActivityRowHeight("Atividade muito mais longa ".repeat(20));
  assert.ok(alturaLonga > alturaCurta, `esperava altura maior para texto longo: curta=${alturaCurta} longa=${alturaLonga}`);
  assert.ok(alturaCurta >= ACTIVITY_MIN_ROW_HEIGHT_POINTS);
});

test("linhas de atividade no workbook real têm alturas DIFERENTES conforme o conteúdo (nunca uma altura fixa igual para todas)", async () => {
  const activities = [
    { numero: 1, tipo: "FACT", texto: "Curta." },
    { numero: 2, tipo: "FACT", texto: "Atividade bem mais longa para forçar múltiplas linhas de verdade dentro da célula mesclada, repetindo bastante texto sem cortar nada em nenhum momento." },
  ];
  const { reloaded } = await buildAndReload(makeModel({ activities }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  const shortHeight = rdo.getRow(14).height;
  const longHeight = rdo.getRow(15).height;
  assert.ok(longHeight > shortHeight, `esperava linha longa mais alta: curta=${shortHeight} longa=${longHeight}`);
});

test("nenhum item de atividade nunca é cortado: wrapText sempre ligado na célula mesclada A:H", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(2) }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  const cell = rdo.getCell("A14");
  assert.equal(cell.alignment.wrapText, true);
});

// --------------------------------------------------------------- paginação por orçamento de altura

test("paginateActivitiesByHeight: itens curtos cabem juntos numa única página dentro do orçamento", () => {
  const activities = makeActivities(10, () => "Curta.");
  const pages = paginateActivitiesByHeight(activities, ACTIVITIES_AREA_BUDGET_POINTS);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].length, 10);
});

test("paginateActivitiesByHeight: itens muito longos abrem página nova ANTES de estourar o orçamento (nunca por contagem fixa)", () => {
  const textoLongo = "Texto longo repetido para ocupar bastante altura. ".repeat(15);
  const activities = makeActivities(6, () => textoLongo);
  const pages = paginateActivitiesByHeight(activities, ACTIVITIES_AREA_BUDGET_POINTS);
  assert.ok(pages.length > 1, "itens longos o suficiente precisam abrir continuação bem antes do teto de itens do v1");
  // Nenhuma página deveria conter TODOS os 6 itens (provaria que a decisão foi por altura, não por contagem).
  assert.ok(pages.every((p) => p.length < activities.length));
});

test("paginateActivitiesByHeight: nunca descarta um item, mesmo um único item maior que o orçamento inteiro", () => {
  const activities = [{ numero: 1, tipo: "FACT", texto: "x".repeat(3000) }];
  const pages = paginateActivitiesByHeight(activities, ACTIVITIES_AREA_BUDGET_POINTS);
  assert.equal(pages.flat().length, 1, "o item patológico ainda precisa aparecer em alguma página, nunca ser perdido");
});

test("workbook real: muitos itens curtos (32, igual ao teto do v1) ainda cabem numa única página RDO (sem continuação)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(32, () => "Curta.") }));
  const rdoSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDO"));
  assert.equal(rdoSheets.length, 1);
});

test("workbook real: itens longos o suficiente geram RDO_CONT_2 mesmo com MENOS de 32 itens (paginação por altura, não por contagem)", async () => {
  const textoLongo = "Texto de atividade bastante longo para consumir várias linhas de altura estimada. ".repeat(10);
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(10, () => textoLongo) }));
  const rdoSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDO"));
  assert.ok(rdoSheets.length > 1, `esperava continuação com poucos itens longos, teve ${rdoSheets.length} página(s)`);
});

test("assinatura/rodapé institucional só aparece na ÚLTIMA página RDO", async () => {
  const textoLongo = "Texto de atividade bastante longo. ".repeat(20);
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(10, () => textoLongo) }));
  const rdoSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDO"));
  assert.ok(rdoSheets.length > 1);
  const [firstPage, lastPage] = rdoSheets;
  const firstText = firstPage.getSheetValues().flat().filter(Boolean).join(" | ");
  const lastText = lastPage.getSheetValues().flat().filter(Boolean).join(" | ");
  assert.ok(!firstText.includes("CONTRATANTE"), "rodapé não deveria estar na primeira página quando há continuação");
  assert.ok(lastText.includes("CONTRATANTE"), "rodapé deveria estar na última página");
});

// --------------------------------------------------------------- RDF v2: 2 fotos grandes por página

test("exatamente 2 fotos cabem em UMA página RDF (novo limite oficial, nunca mais 13)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1), numPhotos: 2 }));
  assert.equal(reloaded.worksheets.filter((w) => w.name.startsWith("RDF")).length, 1);
});

test("3 fotos gera página de continuação RDF_2 (2 + 1)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1), numPhotos: 3 }));
  const rdfSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDF"));
  assert.deepEqual(rdfSheets.map((w) => w.name), ["RDF", "RDF_2"]);
});

test("título do RDF vem do model (tituloRdf), nunca uma constante de cliente", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1), numPhotos: 1, tituloRdf: "ATIVIDADES — Local Sintético" }));
  const rdf = reloaded.worksheets.find((w) => w.name === "RDF");
  assert.equal(rdf.getCell("B1").value, "ATIVIDADES — Local Sintético");
});

test("foto indisponível não tenta desenhar imagem — a legenda ainda aparece", async () => {
  const model = makeModel({ activities: makeActivities(1), numPhotos: 2 });
  model.photos[0].disponivel = false;
  model.photos[0].driveFileId = null;
  model.photos[0].legenda = "Imagem indisponível.";
  const { reloaded } = await buildAndReload(model);
  const rdf = reloaded.worksheets.find((w) => w.name === "RDF");
  const text = rdf.getSheetValues().flat().filter(Boolean).join(" | ");
  assert.ok(text.includes("Imagem indisponível"));
});

test("rodapé institucional (assinanteEsquerda/razaoSocialCompleta/endereco) do model aparece no RDO, nunca hardcoded", async () => {
  const { reloaded } = await buildAndReload(
    makeModel({
      activities: makeActivities(1),
      rodapeInstitucional: { assinanteEsquerda: "ASSINANTE SINTÉTICO", razaoSocialCompleta: "RAZAO SOCIAL SINTÉTICA", endereco: "ENDERECO SINTÉTICO" },
    })
  );
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  const text = rdo.getSheetValues().flat().filter(Boolean).join(" | ");
  assert.ok(text.includes("ASSINANTE SINTÉTICO"));
  assert.ok(text.includes("RAZAO SOCIAL SINTÉTICA"));
  assert.ok(text.includes("ENDERECO SINTÉTICO"));
});

test("page setup do workbook gerado é A4 retrato com fitToWidth=1", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(3) }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  assert.equal(rdo.pageSetup.paperSize, 9);
  assert.equal(rdo.pageSetup.orientation, "portrait");
  assert.equal(rdo.pageSetup.fitToWidth, 1);
});
