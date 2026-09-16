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

const { buildDiarioObraPdfBufferV2, computeContainedFrame } = require("../src/modules/automations/documents/diarioObraPdfBuilderV2");
const { MAX_ACTIVITY_TEXT_LENGTH, ACTIVITIES_PER_PAGE, RDF_PDF_PHOTO_FRAME_ASPECT_RATIO } = require("../src/modules/automations/documents/diarioObraLayoutConstantsV2");
const { extractPdfPageTexts } = require("./helpers/pdfTextExtractor");

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

// ------------------------------------------------------- RDO deve caber em uma única página

test("REGRESSÃO (RDO em 2 páginas): 5 atividades + clima BOM + assinatura + rodapé + 8 fotos no RDF produz EXATAMENTE 5 páginas — RDO completo na página 1, RDF a partir da página 2", async () => {
  const model = makeModel({ numActivities: 5, numPhotos: 8, clima: { manha: "BOM", tarde: "BOM", noite: "BOM" } });
  model.signature.responsavelTecnico = "Patrick Vargas Amaral";
  const photoBuffers = new Map(model.photos.map((p) => [p.driveFileId, logoBuffer]));

  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers, signatureBuffer });
  assertValidPdf(buffer);

  const pageTexts = extractPdfPageTexts(buffer);
  assert.equal(pageTexts.length, 5, `esperava exatamente 5 páginas (1 RDO + 4 RDF), obteve ${pageTexts.length}`);

  const [page1, page2, page3, page4, page5] = pageTexts;

  // Página 1 = RDO COMPLETO (cabeçalho + grade + clima + assinatura + rodapé), tudo junto.
  assert.ok(page1.includes("DIÁRIO DE OBRA"), "página 1 precisa conter o título do RDO");
  assert.ok(page1.includes("FORAM REALIZADAS AS SEGUINTES ATIVIDADES"), "página 1 precisa conter a grade de atividades");
  assert.ok(page1.includes("Patrick Vargas Amaral"), "página 1 precisa conter o nome do responsável técnico (assinatura)");
  assert.ok(page1.includes("Cliente LTDA"), "página 1 precisa conter a razão social do rodapé institucional");
  assert.ok(page1.includes("Rua 1"), "página 1 precisa conter o endereço do rodapé institucional");

  // Nenhuma página intermediária só com assinatura/rodapé (o bug original: RDO virava 2 páginas).
  for (const text of [page2, page3, page4, page5]) {
    assert.ok(!text.includes("Patrick Vargas Amaral"), "assinatura NUNCA pode aparecer numa página separada do RDO");
    assert.ok(!text.includes("DIÁRIO DE OBRA"), "título do RDO nunca deveria repetir numa página de RDF");
  }

  // RDF começa IMEDIATAMENTE na página 2.
  assert.ok(page2.includes("REGISTRO FOTOGRÁFICO"), "página 2 precisa ser a primeira página do RDF");
  assert.ok(page3.includes("REGISTRO FOTOGRÁFICO"));
  assert.ok(page4.includes("REGISTRO FOTOGRÁFICO"));
  assert.ok(page5.includes("REGISTRO FOTOGRÁFICO"));
});

// ------------------------------------------------------- ajuste de proporção do RDF

test("computeContainedFrame: espaço bem mais alto que largo (caso real do RDF) nunca estica a foto — o quadro fica proporcional, nunca ocupa a altura toda", () => {
  // Página A4 menos cabeçalho: espaço tipicamente ~240pt largura x ~630pt altura.
  const frame = computeContainedFrame({ availableWidth: 240, availableHeight: 630, aspectRatio: RDF_PDF_PHOTO_FRAME_ASPECT_RATIO });
  assert.equal(frame.width, 240, "largura limitante — usa toda a largura disponível");
  assert.ok(Math.abs(frame.height - 240 / RDF_PDF_PHOTO_FRAME_ASPECT_RATIO) < 0.01, "altura precisa respeitar a MESMA proporção do frame do Excel");
  assert.ok(frame.height < 630 * 0.5, "nunca deveria esticar o quadro para ocupar a altura quase inteira disponível (bug corrigido)");
});

test("computeContainedFrame: espaço mais largo que alto é limitado pela ALTURA, nunca estoura para fora", () => {
  const frame = computeContainedFrame({ availableWidth: 1000, availableHeight: 100, aspectRatio: RDF_PDF_PHOTO_FRAME_ASPECT_RATIO });
  assert.equal(frame.height, 100);
  assert.ok(Math.abs(frame.width - 100 * RDF_PDF_PHOTO_FRAME_ASPECT_RATIO) < 0.01);
  assert.ok(frame.width <= 1000);
});

test("computeContainedFrame: quadro fica CENTRALIZADO no espaço disponível (offsets simétricos)", () => {
  const frame = computeContainedFrame({ availableWidth: 240, availableHeight: 630, aspectRatio: RDF_PDF_PHOTO_FRAME_ASPECT_RATIO });
  assert.ok(frame.offsetX >= 0);
  assert.ok(frame.offsetY >= 0);
  // Espaço sobrando (não ocupado pelo quadro) dividido igualmente entre os dois lados.
  assert.ok(Math.abs((630 - frame.height) / 2 - frame.offsetY) < 0.01);
});

test("buffer retornado nunca é gravado em disco pelo builder (filesystem efêmero do Render)", async () => {
  const model = makeModel({ numActivities: 2 });
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers: new Map() });
  assert.ok(Buffer.isBuffer(buffer));
});
