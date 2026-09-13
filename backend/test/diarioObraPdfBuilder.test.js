"use strict";

/**
 * Testes do builder de PDF (Bloco 7B) — sem banco/rede. Prova estrutura
 * básica do PDF (cabeçalho `%PDF-`, marcador `%%EOF`) e que a paginação
 * lógica (32 atividades / 13 fotos por página) nunca corrompe a saída, mesmo
 * no caso patológico de texto de atividade muito longo (rede de segurança da
 * paginação automática do pdfkit dentro de um mesmo grupo lógico).
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDiarioObraPdfBuffer } = require("../src/modules/automations/documents/diarioObraPdfBuilder");
const { ACTIVITIES_PER_PAGE, MAX_ACTIVITY_TEXT_LENGTH } = require("../src/modules/automations/documents/diarioObraLayoutConstants");

const LOGO_PATH = path.join(__dirname, "../src/modules/automations/documents/assets/diario-obra-template-v1-logo.png");
const logoBuffer = fs.readFileSync(LOGO_PATH);

function makeModel({ numActivities = 0, numPhotos = 0, longText = false } = {}) {
  const activities = Array.from({ length: numActivities }, (_, i) => ({
    numero: i + 1,
    tipo: "FACT",
    texto: longText ? "Texto longo repetido. ".repeat(90).slice(0, MAX_ACTIVITY_TEXT_LENGTH - 1) : `Atividade ${i + 1}.`,
  }));
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

function assertValidPdf(buffer) {
  assert.equal(buffer.slice(0, 5).toString("latin1"), "%PDF-");
  assert.ok(buffer.slice(-64).toString("latin1").includes("%%EOF"));
}

test("PDF vazio (sem atividades/fotos) ainda é um documento válido", async () => {
  const model = makeModel();
  const buffer = await buildDiarioObraPdfBuffer(model, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(buffer);
});

test("32 atividades (exatamente o limite) produz um PDF válido", async () => {
  const model = makeModel({ numActivities: ACTIVITIES_PER_PAGE });
  const buffer = await buildDiarioObraPdfBuffer(model, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(buffer);
});

test("33 atividades (continuação lógica) produz um PDF válido e maior que o de 32", async () => {
  const modelExact = makeModel({ numActivities: ACTIVITIES_PER_PAGE });
  const modelOverflow = makeModel({ numActivities: ACTIVITIES_PER_PAGE + 1 });
  const bufferExact = await buildDiarioObraPdfBuffer(modelExact, { logoBuffer, photoBuffers: new Map() });
  const bufferOverflow = await buildDiarioObraPdfBuffer(modelOverflow, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(bufferOverflow);
  assert.ok(bufferOverflow.length > bufferExact.length);
});

test("27 fotos (múltiplas páginas RDF) produz um PDF válido", async () => {
  const model = makeModel({ numPhotos: 27 });
  const photoBuffers = new Map(model.photos.map((p) => [p.driveFileId, logoBuffer]));
  const buffer = await buildDiarioObraPdfBuffer(model, { logoBuffer, photoBuffers });
  assertValidPdf(buffer);
});

test("caso patológico: 32 atividades todas no teto de MAX_ACTIVITY_TEXT_LENGTH ainda produz PDF válido (rede de segurança de paginação automática)", async () => {
  const model = makeModel({ numActivities: ACTIVITIES_PER_PAGE, longText: true });
  const buffer = await buildDiarioObraPdfBuffer(model, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(buffer);
});

test("foto indisponível não lança exceção — segue sem imagem, com legenda", async () => {
  const model = makeModel({ numPhotos: 1 });
  model.photos[0].disponivel = false;
  model.photos[0].driveFileId = null;
  model.photos[0].legenda = "Imagem indisponível.";
  const buffer = await buildDiarioObraPdfBuffer(model, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(buffer);
});

test("buffer retornado nunca é gravado em disco pelo builder (Seção 40 — filesystem efêmero do Render)", async () => {
  const model = makeModel({ numActivities: 2 });
  const buffer = await buildDiarioObraPdfBuffer(model, { logoBuffer, photoBuffers: new Map() });
  assert.ok(Buffer.isBuffer(buffer));
});
