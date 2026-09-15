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
  paginateByCount,
  computeRdfBlockRows,
  estimateWrappedLineCount,
  computeActivityRowHeight,
} = require("../src/modules/automations/documents/diarioObraExcelBuilderV2");
const { ACTIVITIES_PER_PAGE, ACTIVITY_MIN_ROW_HEIGHT_POINTS } = require("../src/modules/automations/documents/diarioObraLayoutConstantsV2");

const LOGO_PATH = path.join(__dirname, "../src/modules/automations/documents/assets/diario-obra-template-v1-logo.png");
const logoBuffer = fs.readFileSync(LOGO_PATH);
const SIGNATURE_PATH = path.join(__dirname, "../src/modules/automations/documents/assets/diario-obra-assinatura-patrick-vargas.png");
const signatureBuffer = fs.readFileSync(SIGNATURE_PATH);

function makeModel({ activities = [], numPhotos = 0, tituloRdf, rodapeInstitucional, clima } = {}) {
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
    clima: clima ?? { manha: "NAO_INFORMADO", tarde: "NAO_INFORMADO", noite: "NAO_INFORMADO" },
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

test("bloco de clima (BOM/CHUVAS x MANHÃ/TARDE/NOITE): sem clima informado, nenhuma marcação aparece (nunca inferida)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1) }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  assert.equal(rdo.getCell("A9").value, "BOM");
  assert.equal(rdo.getCell("A10").value, "CHUVAS");
  assert.equal(rdo.getCell("B8").value, "MANHÃ");
  assert.equal(rdo.getCell("C8").value, "TARDE");
  assert.equal(rdo.getCell("D8").value, "NOITE");
  for (const addr of ["B9", "C9", "D9", "B10", "C10", "D10"]) {
    assert.ok(!rdo.getCell(addr).value, `${addr} deveria estar vazia`);
  }
});

// CASO C/D — clima reflete exatamente model.clima, nunca vira atividade (essa parte é coberta em diarioObraDocumentModel.test.js).
test("bloco de clima: 'tempo bom o dia todo' marca X nas 3 colunas da linha BOM, nenhuma na linha CHUVAS", async () => {
  const { reloaded } = await buildAndReload(
    makeModel({ activities: makeActivities(1), clima: { manha: "BOM", tarde: "BOM", noite: "BOM" } })
  );
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  assert.equal(rdo.getCell("B9").value, "X");
  assert.equal(rdo.getCell("C9").value, "X");
  assert.equal(rdo.getCell("D9").value, "X");
  for (const addr of ["B10", "C10", "D10"]) {
    assert.ok(!rdo.getCell(addr).value, `${addr} deveria estar vazia`);
  }
});

test("bloco de clima: 'chuva de manhã, bom à tarde e à noite' marca cada período na linha correta", async () => {
  const { reloaded } = await buildAndReload(
    makeModel({ activities: makeActivities(1), clima: { manha: "CHUVAS", tarde: "BOM", noite: "BOM" } })
  );
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  assert.equal(rdo.getCell("B10").value, "X", "manhã marcada em CHUVAS");
  assert.equal(rdo.getCell("C9").value, "X", "tarde marcada em BOM");
  assert.equal(rdo.getCell("D9").value, "X", "noite marcada em BOM");
  assert.ok(!rdo.getCell("B9").value, "manhã não pode estar em BOM também");
  assert.ok(!rdo.getCell("C10").value);
  assert.ok(!rdo.getCell("D10").value);
});

test("bloco de clima: período NAO_INFORMADO nunca marca nenhuma das duas linhas (nunca inventa a situação da noite)", async () => {
  const { reloaded } = await buildAndReload(
    makeModel({ activities: makeActivities(1), clima: { manha: "BOM", tarde: "BOM", noite: "NAO_INFORMADO" } })
  );
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  assert.equal(rdo.getCell("B9").value, "X");
  assert.equal(rdo.getCell("C9").value, "X");
  assert.ok(!rdo.getCell("D9").value, "noite não informada nunca marca BOM");
  assert.ok(!rdo.getCell("D10").value, "noite não informada nunca marca CHUVAS");
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
  const shortHeight = rdo.getRow(15).height;
  const longHeight = rdo.getRow(16).height;
  assert.ok(longHeight > shortHeight, `esperava linha longa mais alta: curta=${shortHeight} longa=${longHeight}`);
});

test("nenhum item de atividade nunca é cortado: wrapText sempre ligado na célula mesclada A:H", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(2) }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  const cell = rdo.getCell("A15");
  assert.equal(cell.alignment.wrapText, true);
});

// --------------------------------------------------------------- grade fixa (CASO G) — nunca comprime o formulário

test("CASO G: 1 única atividade — a grade continua com 31 linhas fixas e o rodapé NUNCA sobe (formulário não encolhe)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1) }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  // Linha 15 é a única atividade real; linhas 16-45 continuam desenhadas em
  // branco (mesma borda), e o rodapé institucional está SEMPRE na posição
  // fixa auditada (espaçador na 46, conteúdo a partir da 48).
  assert.ok(rdo.getCell("A15").value.includes("Atividade 1."));
  assert.equal(rdo.getCell("A30").border?.top?.style, "thin", "linha em branco no meio da grade mantém a moldura");
  assert.ok(!rdo.getCell("A30").value, "linha em branco não tem texto");
  const allText = rdo.getSheetValues().flat().filter(Boolean).join(" | ");
  assert.ok(allText.includes("CONTRATANTE"), "rodapé sempre presente na posição fixa, mesmo com 1 atividade só");
});

test("CASO G: formulário sem NENHUMA atividade também mantém a grade e o rodapé na posição fixa", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: [] }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  const allText = rdo.getSheetValues().flat().filter(Boolean).join(" | ");
  assert.ok(allText.includes("CONTRATANTE"));
  assert.equal(reloaded.worksheets.filter((w) => w.name.startsWith("RDO")).length, 1);
});

test("workbook real: 31 atividades (teto re-auditado da grade) cabem numa única página RDO (sem continuação)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(ACTIVITIES_PER_PAGE, () => "Curta.") }));
  const rdoSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDO"));
  assert.equal(rdoSheets.length, 1);
});

test("workbook real: 32ª atividade (além do teto de 31) abre RDO_CONT_2, cada página com a MESMA grade fixa", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(ACTIVITIES_PER_PAGE + 1, () => "Curta.") }));
  const rdoSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDO"));
  assert.deepEqual(rdoSheets.map((w) => w.name), ["RDO", "RDO_CONT_2"]);
});

test("texto de atividade MUITO longo (uma única linha lógica) nunca abre continuação por causa da altura — só a linha fica mais alta", async () => {
  const textoLongo = "Texto de atividade bastante longo para consumir várias linhas de altura estimada. ".repeat(10);
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(10, () => textoLongo) }));
  const rdoSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDO"));
  assert.equal(rdoSheets.length, 1, "10 itens (mesmo longos) nunca abrem continuação — a grade é de 31 SLOTS, não de altura");
  const rdo = rdoSheets[0];
  assert.ok(rdo.getRow(15).height > ACTIVITY_MIN_ROW_HEIGHT_POINTS, "a linha do item longo é mais alta, mas continua sendo UMA linha da grade");
});

test("assinatura/rodapé institucional só aparece na ÚLTIMA página RDO (continuação real, por contagem > 31)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(ACTIVITIES_PER_PAGE + 5, () => "Curta.") }));
  const rdoSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDO"));
  assert.ok(rdoSheets.length > 1);
  const [firstPage, lastPage] = rdoSheets;
  const firstText = firstPage.getSheetValues().flat().filter(Boolean).join(" | ");
  const lastText = lastPage.getSheetValues().flat().filter(Boolean).join(" | ");
  assert.ok(!firstText.includes("CONTRATANTE"), "rodapé não deveria estar na primeira página quando há continuação");
  assert.ok(lastText.includes("CONTRATANTE"), "rodapé deveria estar na última página");
});

// --------------------------------------------------------------- CASO E: assinatura digital

test("CASO E: com responsavelTecnico configurado e asset de assinatura fornecido, o XLSX recebe a imagem no RDO", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1) }), { signatureBuffer });
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  assert.ok(rdo.getImages().length >= 1, "esperava ao menos a imagem da assinatura no RDO");
});

test("sem asset de assinatura (signatureBuffer ausente), o rodapé segue só com o nome em texto — nunca lança", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1) }));
  const rdo = reloaded.worksheets.find((w) => w.name === "RDO");
  const allText = rdo.getSheetValues().flat().filter(Boolean).join(" | ");
  assert.ok(allText.includes("Eng. Teste"));
});

// --------------------------------------------------------------- RDF v2: 2 fotos grandes por bloco, UMA ÚNICA aba (CASO B/H)

test("CASO B: exatamente 2 fotos ficam na única aba RDF (novo limite oficial, nunca mais 13)", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1), numPhotos: 2 }));
  const rdfSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDF"));
  assert.deepEqual(rdfSheets.map((w) => w.name), ["RDF"]);
});

test("CASO B/4: 3 fotos NUNCA criam uma aba RDF_2 — o segundo bloco fica na MESMA aba RDF", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1), numPhotos: 3 }));
  const rdfSheets = reloaded.worksheets.filter((w) => w.name.startsWith("RDF"));
  assert.deepEqual(rdfSheets.map((w) => w.name), ["RDF"]);
  const rdf = rdfSheets[0];
  const block2Rows = computeRdfBlockRows(1);
  assert.ok(rdf.getCell(`B${block2Rows.captionTop}`).value.includes("Legenda 3"), "3ª foto (bloco 2) aparece na mesma aba, mais abaixo");
});

test("CASO H: 8 fotos (4 blocos) permanecem todas na ÚNICA aba RDF, em sequência, sem criar novas worksheets", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1), numPhotos: 8 }));
  assert.equal(reloaded.worksheets.length, 2, "sempre exatamente RDO + RDF, nunca mais worksheets que isso");
  assert.deepEqual(reloaded.worksheets.map((w) => w.name), ["RDO", "RDF"]);
  const rdf = reloaded.worksheets.find((w) => w.name === "RDF");
  for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
    const rows = computeRdfBlockRows(pageIndex);
    const legendaEsquerda = rdf.getCell(`B${rows.captionTop}`).value;
    const legendaDireita = rdf.getCell(`D${rows.captionTop}`).value;
    assert.ok(legendaEsquerda.includes(`Legenda ${pageIndex * 2 + 1}`), `bloco ${pageIndex}: legenda esquerda incorreta`);
    assert.ok(legendaDireita.includes(`Legenda ${pageIndex * 2 + 2}`), `bloco ${pageIndex}: legenda direita incorreta`);
  }
});

test("apenas o PRIMEIRO bloco do RDF desenha o cabeçalho (título/subtítulo) — blocos seguintes nunca repetem", async () => {
  const { reloaded } = await buildAndReload(makeModel({ activities: makeActivities(1), numPhotos: 4 }));
  const rdf = reloaded.worksheets.find((w) => w.name === "RDF");
  assert.equal(rdf.getCell("B1").value, "ATIVIDADES — Canteiro");
  assert.equal(rdf.getCell("B2").value, "REGISTRO FOTOGRÁFICO");
  // Bloco 2 (pageIndex 1) começa direto na moldura de fotos — a célula
  // mestra da moldura esquerda nunca carrega texto de título/subtítulo.
  const block2Rows = computeRdfBlockRows(1);
  assert.ok(!rdf.getCell(`B${block2Rows.photoTop}`).value, "moldura do bloco 2 nunca tem texto de título repetido");
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
