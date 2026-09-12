"use strict";

/**
 * Testes do builder de Excel (Bloco 7B) — sem banco/rede. Prova que o
 * workbook gerado é um ExcelJS válido que a PRÓPRIA ExcelJS consegue reabrir
 * (round-trip via `xlsx.writeBuffer()` -> `xlsx.load()`), nunca uma mutação
 * do arquivo original auditado no Bloco 7A (que a ExcelJS nem consegue abrir
 * — ver relatório do Bloco 7A sobre `richData`/`_localImage`).
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");

const { buildDiarioObraExcelWorkbook } = require("../src/modules/automations/documents/diarioObraExcelBuilder");
const { ACTIVITIES_PER_PAGE, PHOTOS_PER_PAGE } = require("../src/modules/automations/documents/diarioObraLayoutConstants");

const LOGO_PATH = path.join(__dirname, "../src/modules/automations/documents/assets/diario-obra-template-v1-logo.png");
const logoBuffer = fs.readFileSync(LOGO_PATH);

function makeModel({ numActivities = 0, numPhotos = 0 } = {}) {
  const activities = Array.from({ length: numActivities }, (_, i) => ({ numero: i + 1, tipo: "FACT", texto: `Atividade ${i + 1}.` }));
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
    },
    activities,
    photos,
    signature: { responsavelTecnico: "Eng. Teste" },
    metadata: { executionId: 1, snapshotId: 1, snapshotHash: "h", intelligenceId: 1, intelligenceOutputHash: "h2", templateId: 1, templateCodigo: "diario_obra_ppflora", templateVersao: 1, generatorId: "diario_obra_ppflora_v1", documentVersion: 1 },
  };
}

async function buildAndReload(model, extraOptions = {}) {
  const photoBuffers = new Map(model.photos.filter((p) => p.disponivel).map((p) => [p.driveFileId, logoBuffer]));
  const workbook = buildDiarioObraExcelWorkbook(model, { logoBuffer, photoBuffers, ...extraOptions });
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  return { buffer, reloaded };
}

test("workbook vazio (sem atividades/fotos) ainda produz RDO+RDF válidos e reabríveis", async () => {
  const { reloaded } = await buildAndReload(makeModel());
  assert.deepEqual(reloaded.worksheets.map((w) => w.name), ["RDO", "RDF"]);
});

test("exatamente 32 atividades cabe em UMA página RDO (limite auditado, sem continuação)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ numActivities: 32 }));
  assert.equal(reloaded.worksheets.filter((w) => w.name.startsWith("RDO")).length, 1);
});

test("33 atividades gera página de continuação RDO_CONT_2", async () => {
  const { reloaded } = await buildAndReload(makeModel({ numActivities: ACTIVITIES_PER_PAGE + 1 }));
  const rdoSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDO"));
  assert.deepEqual(rdoSheets.map((w) => w.name), ["RDO", "RDO_CONT_2"]);
});

test("65 atividades gera duas páginas de continuação (RDO_CONT_2 e RDO_CONT_3)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ numActivities: ACTIVITIES_PER_PAGE * 2 + 1 }));
  const rdoSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDO"));
  assert.deepEqual(rdoSheets.map((w) => w.name), ["RDO", "RDO_CONT_2", "RDO_CONT_3"]);
});

test("exatamente 13 fotos cabe em UMA página RDF (limite auditado, sem continuação)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ numPhotos: 13 }));
  assert.equal(reloaded.worksheets.filter((w) => w.name.startsWith("RDF")).length, 1);
});

test("14 fotos gera página de continuação RDF_2", async () => {
  const { reloaded } = await buildAndReload(makeModel({ numPhotos: PHOTOS_PER_PAGE + 1 }));
  const rdfSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDF"));
  assert.deepEqual(rdfSheets.map((w) => w.name), ["RDF", "RDF_2"]);
});

test("27 fotos gera três páginas RDF (13+13+1)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ numPhotos: 27 }));
  const rdfSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDF"));
  assert.deepEqual(rdfSheets.map((w) => w.name), ["RDF", "RDF_2", "RDF_3"]);
});

test("assinatura só aparece na ÚLTIMA página RDO (nunca nas páginas de continuação)", async () => {
  const model = makeModel({ numActivities: ACTIVITIES_PER_PAGE + 5 });
  const { reloaded } = await buildAndReload(model);
  const [firstPage, lastPage] = reloaded.worksheets.filter((w) => w.name.startsWith("RDO"));
  const firstPageText = firstPage.getSheetValues().flat().filter(Boolean).join(" | ");
  const lastPageText = lastPage.getSheetValues().flat().filter(Boolean).join(" | ");
  assert.ok(!firstPageText.includes("Eng. Teste"), "assinatura não deveria estar na primeira página quando há continuação");
  assert.ok(lastPageText.includes("Eng. Teste"), "assinatura deveria estar na última página");
});

test("foto indisponível não tenta desenhar imagem — a legenda ainda aparece", async () => {
  const model = makeModel({ numPhotos: 2 });
  model.photos[0].disponivel = false;
  model.photos[0].driveFileId = null;
  model.photos[0].legenda = "Imagem indisponível.";
  const { reloaded } = await buildAndReload(model);
  const rdf = reloaded.worksheets.find((w) => w.name === "RDF");
  const text = rdf.getSheetValues().flat().filter(Boolean).join(" | ");
  assert.ok(text.includes("Imagem indisponível"));
});

test("page setup do workbook gerado é A4 retrato com fitToWidth=1 (Seção 29)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ numActivities: 3 }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  assert.equal(rdo.pageSetup.paperSize, 9);
  assert.equal(rdo.pageSetup.orientation, "portrait");
  assert.equal(rdo.pageSetup.fitToWidth, 1);
});

test("larguras de coluna reproduzem exatamente as auditadas do Bloco 7A", async () => {
  const { reloaded } = await buildAndReload(makeModel({ numActivities: 1 }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  const widths = rdo.columns.slice(0, 8).map((c) => c.width);
  assert.deepEqual(widths, [8.43, 8.43, 8.43, 15.66, 8.43, 8.43, 8.43, 8.43]);
});
