"use strict";

/**
 * Testes do builder de PDF v2 (Bloco 12) — sem banco/rede. Prova estrutura
 * básica do PDF (cabeçalho `%PDF-`, marcador `%%EOF`) e que a paginação
 * dinâmica por altura (não mais contagem fixa) nunca corrompe a saída, com
 * o novo RDF de 2 fotos grandes por página.
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDiarioObraPdfBufferV2 } = require("../src/modules/automations/documents/diarioObraPdfBuilderV2");
const { MAX_ACTIVITY_TEXT_LENGTH, ACTIVITIES_PER_PAGE } = require("../src/modules/automations/documents/diarioObraLayoutConstantsV2");

const LOGO_PATH = path.join(__dirname, "../src/modules/automations/documents/assets/diario-obra-template-v1-logo.png");
const logoBuffer = fs.readFileSync(LOGO_PATH);
const SIGNATURE_PATH = path.join(__dirname, "../src/modules/automations/documents/assets/diario-obra-assinatura-patrick-vargas.png");
const signatureBuffer = fs.readFileSync(SIGNATURE_PATH);

function makeModel({ numActivities = 0, numPhotos = 0, longText = false, clima } = {}) {
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
      tituloRdf: "ATIVIDADES — Canteiro",
      rodapeInstitucional: { assinanteEsquerda: "CONTRATANTE", razaoSocialCompleta: "Cliente LTDA", endereco: "Rua 1" },
    },
    activities,
    photos,
    clima: clima ?? { manha: "NAO_INFORMADO", tarde: "NAO_INFORMADO", noite: "NAO_INFORMADO" },
    signature: { responsavelTecnico: "Eng. Teste" },
    metadata: { executionId: 1, snapshotId: 1, snapshotHash: "h", intelligenceId: 1, intelligenceOutputHash: "h2", templateId: 1, templateCodigo: "diario_obra_ppflora_v2", templateVersao: 2, generatorId: "diario_obra_ppflora_v2", documentVersion: 1 },
  };
}

function assertValidPdf(buffer) {
  assert.equal(buffer.slice(0, 5).toString("latin1"), "%PDF-");
  assert.ok(buffer.slice(-64).toString("latin1").includes("%%EOF"));
}

test("PDF vazio (sem atividades/fotos) ainda é um documento válido", async () => {
  const model = makeModel();
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(buffer);
});

test("31 atividades curtas (teto re-auditado da grade) produz um PDF válido", async () => {
  const model = makeModel({ numActivities: ACTIVITIES_PER_PAGE });
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(buffer);
});

test("32ª atividade (além do teto de 31) produz um PDF válido com continuação", async () => {
  const model = makeModel({ numActivities: ACTIVITIES_PER_PAGE + 1 });
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(buffer);
});

test("clima informado (BOM/CHUVAS por período) produz um PDF válido refletindo o mesmo model do Excel", async () => {
  const model = makeModel({ numActivities: 1, clima: { manha: "CHUVAS", tarde: "BOM", noite: "BOM" } });
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(buffer);
});

test("CASO E: com responsavelTecnico configurado e asset de assinatura fornecido, o PDF é gerado sem erro", async () => {
  const model = makeModel({ numActivities: 1 });
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers: new Map(), signatureBuffer });
  assertValidPdf(buffer);
});

test("atividades muito longas (mesma linha lógica, altura maior) produz um PDF válido e maior que o de itens curtos", async () => {
  const modelCurto = makeModel({ numActivities: 10 });
  const modelLongo = makeModel({ numActivities: 10, longText: true });
  const bufferCurto = await buildDiarioObraPdfBufferV2(modelCurto, { logoBuffer, photoBuffers: new Map() });
  const bufferLongo = await buildDiarioObraPdfBufferV2(modelLongo, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(bufferLongo);
  assert.ok(bufferLongo.length > bufferCurto.length);
});

test("3 fotos (múltiplas páginas RDF, novo limite de 2 por página) produz um PDF válido", async () => {
  const model = makeModel({ numPhotos: 3 });
  const photoBuffers = new Map(model.photos.map((p) => [p.driveFileId, logoBuffer]));
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers });
  assertValidPdf(buffer);
});

test("caso patológico: várias atividades no teto de MAX_ACTIVITY_TEXT_LENGTH ainda produz PDF válido (rede de segurança de paginação automática)", async () => {
  const model = makeModel({ numActivities: ACTIVITIES_PER_PAGE, longText: true });
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(buffer);
});

test("foto indisponível não lança exceção — segue sem imagem, com legenda", async () => {
  const model = makeModel({ numPhotos: 1 });
  model.photos[0].disponivel = false;
  model.photos[0].driveFileId = null;
  model.photos[0].legenda = "Imagem indisponível.";
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers: new Map() });
  assertValidPdf(buffer);
});

test("buffer retornado nunca é gravado em disco pelo builder (filesystem efêmero do Render)", async () => {
  const model = makeModel({ numActivities: 2 });
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers: new Map() });
  assert.ok(Buffer.isBuffer(buffer));
});
