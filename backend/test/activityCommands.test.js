"use strict";

/**
 * Testes de integração dos comandos explícitos de atividade enviados pelo
 * Telegram (Seção "comandos explícitos de atividade") — cobre os itens A-K
 * do enunciado da correção: ATIVIDADE SEM FOTO / INSERIR-ADICIONAR NA
 * ATIVIDADE N, sua interação com dedup/ordem/RDF, e a preservação de quebras
 * de linha no Excel e no PDF. O parser em si (reconhecimento de cabeçalho,
 * divisão em blocos) é testado isoladamente em `activityCommandParser.test.js`.
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");

const { buildActivities, buildPhotos } = require("../src/modules/automations/documents/diarioObraDocumentModel");
const { buildDiarioObraExcelWorkbookV2, computeActivityRowHeight } = require("../src/modules/automations/documents/diarioObraExcelBuilderV2");
const { buildDiarioObraPdfBufferV2 } = require("../src/modules/automations/documents/diarioObraPdfBuilderV2");
const { extractPdfPageTexts } = require("./helpers/pdfTextExtractor");

const LOGO_PATH = path.join(__dirname, "../src/modules/automations/documents/assets/diario-obra-template-v1-logo.png");
const logoBuffer = fs.readFileSync(LOGO_PATH);

function msg({ id, timestamp, type = "TEXT", text = null, caption = null, photo = null }) {
  return { telegramMessageId: id, timestamp, type, text, caption, photo };
}

function makeModel({ activities = [], photos = [] } = {}) {
  return {
    identification: {
      projetoNome: "Obra Teste",
      referenciaContratual: "Contrato 1",
      local: "Canteiro",
      clienteRazaoSocial: "Cliente LTDA",
      clienteEndereco: "Rua 1",
      dataReferencia: "2026-09-17",
      expedienteInicio: "07:00",
      expedienteFim: "17:00",
      expedienteEhDefaultDoTemplate: true,
      tituloRdf: "ATIVIDADES — Canteiro",
      rodapeInstitucional: { assinanteEsquerda: "CONTRATANTE", razaoSocialCompleta: "Cliente LTDA", endereco: "Rua 1" },
    },
    activities,
    photos,
    clima: { manha: "BOM", tarde: "BOM", noite: "BOM" },
    signature: { responsavelTecnico: "Eng. Teste" },
    metadata: { executionId: 1, snapshotId: 1, snapshotHash: "h", intelligenceId: 1, intelligenceOutputHash: "h2", templateId: 1, templateCodigo: "diario_obra_ppflora_v2", templateVersao: 2, generatorId: "diario_obra_ppflora_v2", documentVersion: 1 },
  };
}

// --------------------------------------------------------------- A-C: ATIVIDADE SEM FOTO

test("(A) 'ATIVIDADE SEM FOTO:' com um único bloco cria UMA atividade no RDO, sem foto associada", () => {
  const snapshot = { messages: [msg({ id: "1", timestamp: "t1", text: "ATIVIDADE SEM FOTO:\nInspeção do canteiro 4." })] };
  const items = buildActivities({ facts: [] }, snapshot);
  assert.equal(items.length, 1);
  assert.equal(items[0].texto, "Inspeção do canteiro 4.");
});

test("(B) 'ATIVIDADE SEM FOTO:' com duas atividades na mesma mensagem cria 2 atividades distintas, na ordem informada", () => {
  const texto = [
    "ATIVIDADE SEM FOTO:",
    "",
    "Atividade X...",
    "- 78 sementes beneficiadas",
    "",
    "Atividade Y...",
    "- 67 mudas de aroeira transportadas para rustificação",
  ].join("\n");
  const snapshot = { messages: [msg({ id: "1", timestamp: "t1", text: texto })] };

  const items = buildActivities({ facts: [] }, snapshot);
  assert.equal(items.length, 2, "cada bloco vira uma célula/atividade própria");
  assert.equal(items[0].texto, "Atividade X...\n- 78 sementes beneficiadas");
  assert.equal(items[1].texto, "Atividade Y...\n- 67 mudas de aroeira transportadas para rustificação");
  assert.deepEqual(items.map((i) => i.numero), [1, 2], "preserva a ordem em que foram informadas");
});

test("(C) atividade multilinha (3+ linhas) preserva EXATAMENTE o texto e todas as quebras de linha, sem paráfrase", () => {
  const texto = "ATIVIDADE SEM FOTO:\nLinha 1 da atividade.\nLinha 2 com detalhe.\nLinha 3 com mais um detalhe.";
  const snapshot = { messages: [msg({ id: "1", timestamp: "t1", text: texto })] };
  const items = buildActivities({ facts: [] }, snapshot);
  assert.equal(items.length, 1);
  assert.equal(items[0].texto, "Linha 1 da atividade.\nLinha 2 com detalhe.\nLinha 3 com mais um detalhe.");
});

test("(G) 'ATIVIDADE SEM FOTO:' nunca aparece no RDF (buildPhotos não é afetado — não há foto para essa mensagem)", () => {
  const snapshot = { messages: [msg({ id: "1", timestamp: "t1", text: "ATIVIDADE SEM FOTO:\nInspeção do canteiro 4." })] };
  const photos = buildPhotos(snapshot, { arquivosByDriveFileId: new Map(), photoObservationsByRef: new Map() });
  assert.equal(photos.length, 0);
});

// --------------------------------------------------------------- D-F: complemento

test("(D) 'INSERIR NA ATIVIDADE 1:' anexa o texto na MESMA célula da atividade 1, sem criar nova atividade", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "t1", type: "PHOTO", caption: "Plantio de sementes", photo: { stored: true, driveFileId: "d1" } }),
      msg({ id: "2", timestamp: "t2", text: "INSERIR NA ATIVIDADE 1:\n- 93 sementes de aroeira plantadas" }),
    ],
  };
  const items = buildActivities({ facts: [] }, snapshot);
  assert.equal(items.length, 1, "nunca cria uma nova atividade — só complementa a existente");
  assert.equal(items[0].texto, "Plantio de sementes\n- 93 sementes de aroeira plantadas");
});

test("(E) complemento com duas linhas preserva AMBAS as quebras de linha na mesma célula", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "t1", type: "PHOTO", caption: "Plantio de sementes", photo: { stored: true, driveFileId: "d1" } }),
      msg({ id: "2", timestamp: "t2", text: "INSERIR NA ATIVIDADE 1:\n- 93 sementes de aroeira plantadas\n- 156 sementes de pau-brasil plantadas" }),
    ],
  };
  const items = buildActivities({ facts: [] }, snapshot);
  assert.equal(items.length, 1);
  assert.equal(items[0].texto, "Plantio de sementes\n- 93 sementes de aroeira plantadas\n- 156 sementes de pau-brasil plantadas");
});

test("(F) complemento nunca aparece no RDF — a legenda da foto continua sendo exatamente a original", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "t1", type: "PHOTO", caption: "Plantio de sementes", photo: { stored: true, driveFileId: "d1" } }),
      msg({ id: "2", timestamp: "t2", text: "ADICIONAR À ATIVIDADE 1:\n- 93 sementes de aroeira plantadas" }),
    ],
  };
  buildActivities({ facts: [] }, snapshot); // aplica o complemento no RDO — não deve afetar buildPhotos
  const photos = buildPhotos(snapshot, { arquivosByDriveFileId: new Map(), photoObservationsByRef: new Map() });
  assert.equal(photos.length, 1);
  assert.equal(photos[0].legenda, "Plantio de sementes", "RDF continua mostrando SOMENTE a legenda original da foto");
});

// --------------------------------------------------------------- H: ordem

test("(H) ordem PHOTO / TEXT (ATIVIDADE SEM FOTO) / PHOTO segue estritamente a sequência cronológica de chegada", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "t1", type: "PHOTO", caption: "Primeira foto.", photo: { stored: true, driveFileId: "d1" } }),
      msg({ id: "2", timestamp: "t2", text: "ATIVIDADE SEM FOTO:\nAtividade intermediária sem foto." }),
      msg({ id: "3", timestamp: "t3", type: "PHOTO", caption: "Terceira foto.", photo: { stored: true, driveFileId: "d3" } }),
    ],
  };
  const items = buildActivities({ facts: [] }, snapshot);
  assert.deepEqual(items.map((i) => i.texto), ["Primeira foto.", "Atividade intermediária sem foto.", "Terceira foto."]);
  assert.deepEqual(items.map((i) => i.numero), [1, 2, 3]);
});

// --------------------------------------------------------------- K: comando inválido

test("(K) 'INSERIR NA ATIVIDADE N:' referenciando uma atividade inexistente é ignorado — nunca corrompe o documento nem lança", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "t1", type: "PHOTO", caption: "Única atividade.", photo: { stored: true, driveFileId: "d1" } }),
      msg({ id: "2", timestamp: "t2", text: "INSERIR NA ATIVIDADE 5:\nTexto perdido, atividade 5 não existe." }),
    ],
  };
  assert.doesNotThrow(() => buildActivities({ facts: [] }, snapshot));
  const result = buildActivities({ facts: [] }, snapshot);
  assert.equal(result.length, 1, "comando inválido não cria atividade fantasma");
  assert.equal(result[0].texto, "Única atividade.", "comando inválido nunca modifica uma atividade existente");
});

test("(K) 'INSERIR NA ATIVIDADE 0:' (fora do intervalo 1-based) também é ignorado sem lançar", () => {
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "t1", type: "PHOTO", caption: "Única atividade.", photo: { stored: true, driveFileId: "d1" } }),
      msg({ id: "2", timestamp: "t2", text: "INSERIR NA ATIVIDADE 0:\nTexto perdido." }),
    ],
  };
  assert.doesNotThrow(() => buildActivities({ facts: [] }, snapshot));
  const result = buildActivities({ facts: [] }, snapshot);
  assert.equal(result.length, 1);
  assert.equal(result[0].texto, "Única atividade.");
});

// --------------------------------------------------------------- I: quebra de linha no XLSX

test("(I) quebra de linha explícita é preservada literalmente na célula do XLSX (wrapText + altura dinâmica)", async () => {
  const activities = [{ numero: 1, tipo: "FACT", texto: "Plantio de sementes\n- 93 sementes de aroeira plantadas\n- 156 sementes de pau-brasil plantadas" }];
  const model = makeModel({ activities });
  const workbook = buildDiarioObraExcelWorkbookV2(model, { logoBuffer, photoBuffers: new Map() });
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);

  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  const cell = rdo.getCell("A15");
  assert.equal(cell.value, "1. Plantio de sementes\n- 93 sementes de aroeira plantadas\n- 156 sementes de pau-brasil plantadas", "\\n preservado literalmente no valor da célula");
  assert.equal(cell.alignment.wrapText, true, "wrapText sempre ativo na grade de atividades");

  const singleLineHeight = computeActivityRowHeight("Atividade curta numa linha só.");
  const rowHeight = rdo.getRow(15).height;
  assert.ok(rowHeight > singleLineHeight, "altura da linha cresce para acomodar as 3 linhas explícitas, nunca achata");
});

// --------------------------------------------------------------- J: quebra de linha no PDF

test("(J) computeActivityRowHeight reserva MAIS altura para texto com quebras de linha explícitas do que para uma linha só — nunca achata", () => {
  const oneLine = computeActivityRowHeight("Atividade curta numa linha só.");
  const threeLines = computeActivityRowHeight("Plantio de sementes\n- 93 sementes de aroeira plantadas\n- 156 sementes de pau-brasil plantadas");
  assert.ok(threeLines > oneLine, "3 linhas explícitas devem reservar mais altura que 1 linha");
});

test("(J) PDF: atividade multilinha renderiza TODAS as linhas e a atividade seguinte continua íntegra, sem sobreposição/corrupção", async () => {
  const activities = [
    { numero: 1, tipo: "FACT", texto: "Plantio de sementes\n- 93 sementes de aroeira plantadas\n- 156 sementes de pau-brasil plantadas" },
    { numero: 2, tipo: "FACT", texto: "Atividade seguinte intacta." },
  ];
  const model = makeModel({ activities });
  const buffer = await buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers: new Map() });
  assert.equal(buffer.slice(0, 5).toString("latin1"), "%PDF-");

  const pageTexts = extractPdfPageTexts(buffer);
  const fullText = pageTexts.join(" ");
  assert.ok(fullText.includes("Plantio de sementes"), "primeira linha da atividade 1 presente");
  assert.ok(fullText.includes("93 sementes de aroeira plantadas"), "segunda linha da atividade 1 presente");
  assert.ok(fullText.includes("156 sementes de pau-brasil plantadas"), "terceira linha da atividade 1 presente");
  assert.ok(fullText.includes("Atividade seguinte intacta"), "atividade 2 continua íntegra, sem sobreposição pela atividade 1 multilinha");
});
