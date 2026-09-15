"use strict";

/**
 * Teste de INTEGRAÇÃO DE LINHAGEM (correção de qualidade de dados, Bloco 12) —
 * prova ponta a ponta que o Diário de Obra usa dado REAL do Telegram, nunca
 * fixture/reescrita/substituição:
 *
 *   snapshot (fotos reais, cada uma com driveFileId e caption PRÓPRIOS)
 *   -> buildDiarioObraDocumentModel (RDO = legendas originais deduplicadas;
 *      RDF = uma foto = um registro, sem dedupe)
 *   -> buildDiarioObraExcelWorkbookV2 (bytes de CADA foto no RDF são
 *      exatamente os bytes de origem daquela foto específica — nunca
 *      trocados, nunca substituídos pelo logo).
 *
 * As "fotos" aqui são PNGs 1x1 mínimos e válidos, cada um de uma cor
 * diferente (fixtures de teste isoladas — nunca o logo institucional nem
 * qualquer asset de produção) — só para provar rastreabilidade byte-a-byte,
 * nunca para validar renderização visual real.
 */

const zlib = require("zlib");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDiarioObraDocumentModel } = require("../src/modules/automations/documents/diarioObraDocumentModel");
const { buildDiarioObraExcelWorkbookV2 } = require("../src/modules/automations/documents/diarioObraExcelBuilderV2");
const ExcelJS = require("exceljs");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(zlib.crc32(crcInput) >>> 0, 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

/** PNG 1x1 RGB mínimo e válido, de uma cor sólida — fixture de teste isolada, nunca um asset de produção. */
function makeTinyPng(r, g, b) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.from([0, r, g, b]); // filter byte 0 + 1 pixel RGB
  const idatData = zlib.deflateSync(raw);
  return Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", ihdr), pngChunk("IDAT", idatData), pngChunk("IEND", Buffer.alloc(0))]);
}

function msg({ id, timestamp, caption, driveFileId }) {
  return {
    telegramMessageId: id,
    timestamp,
    type: "PHOTO",
    author: { id: null, name: null, username: null },
    text: null,
    caption,
    effectiveText: caption,
    mediaGroupId: null,
    photo: { stored: true, driveFileId, fileUniqueId: `fu-${id}`, failed: false, failureReason: null },
  };
}

test("linhagem ponta a ponta: RDO usa a legenda ORIGINAL da 1a ocorrência (deduplicada), RDF usa a FOTO REAL de cada mensagem (nunca trocada, nunca o logo)", async () => {
  const fotoA = makeTinyPng(255, 0, 0); // vermelha
  const fotoB = makeTinyPng(0, 255, 0); // verde
  const fotoC = makeTinyPng(0, 0, 255); // azul
  const logoFixture = Buffer.from("LOGO_INSTITUCIONAL_NUNCA_DEVE_APARECER_COMO_FOTO");

  const legendaRepetida = "Coleta de material para análise de solo";
  const snapshot = {
    messages: [
      msg({ id: "1", timestamp: "2026-09-14T08:00:00.000Z", caption: legendaRepetida, driveFileId: "drive-A" }),
      msg({ id: "2", timestamp: "2026-09-14T08:05:00.000Z", caption: legendaRepetida, driveFileId: "drive-B" }),
      msg({ id: "3", timestamp: "2026-09-14T08:10:00.000Z", caption: "Irrigação do canteiro", driveFileId: "drive-C" }),
    ],
  };

  const config = { projeto_nome: "Obra Teste Linhagem", configuracao: { documento: {} } };
  const execucao = { id: 1 };
  const snapshotRow = { id: 1, snapshot_hash: "h", snapshot: { referenceDate: "2026-09-14", messages: snapshot.messages } };
  const intelligence = { id: 1, output_hash: "h", structured_output: { facts: [], conflicts: [], warnings: [], missingInformation: [] } };
  const template = { id: 1, codigo: "diario_obra_ppflora_v2", versao: 2 };

  const model = buildDiarioObraDocumentModel({
    config,
    execucao,
    snapshot: snapshotRow,
    intelligence,
    arquivosByDriveFileId: new Map([
      ["drive-A", { id: 100 }],
      ["drive-B", { id: 101 }],
      ["drive-C", { id: 102 }],
    ]),
    template,
    documentVersion: 1,
    generatorId: "diario_obra_ppflora_v2",
  });

  // --- RDO: legendas originais, deduplicadas, texto da 1a ocorrência ---
  assert.deepEqual(
    model.activities.map((a) => a.texto),
    ["Coleta de material para análise de solo", "Irrigação do canteiro"],
    "RDO deduplicado pela legenda original, sem paráfrase"
  );

  // --- RDF: uma foto = um registro, NUNCA deduplicado ---
  assert.equal(model.photos.length, 3, "RDF preserva as 3 fotos, mesmo com legenda repetida");
  assert.deepEqual(model.photos.map((p) => p.legenda), [legendaRepetida, legendaRepetida, "Irrigação do canteiro"]);
  assert.deepEqual(model.photos.map((p) => p.driveFileId), ["drive-A", "drive-B", "drive-C"]);

  // --- Bytes reais no XLSX: cada foto do RDF é a imagem de ORIGEM correta ---
  const photoBuffers = new Map([
    ["drive-A", fotoA],
    ["drive-B", fotoB],
    ["drive-C", fotoC],
  ]);
  const logoBuffer = logoFixture; // usado só no cabeçalho — nunca deve aparecer como foto
  const workbook = buildDiarioObraExcelWorkbookV2(model, { logoBuffer, photoBuffers });
  const buffer = await workbook.xlsx.writeBuffer();

  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  const rdf = reloaded.getWorksheet("RDF");
  const images = rdf.getImages();

  // 3 fotos + eventual logo do cabeçalho do RDF (bloco 0) = no máximo 4 imagens.
  const photoImageBuffers = images
    .map((img) => reloaded.getImage(img.imageId).buffer)
    .filter((buf) => !buf.equals(logoFixture));

  assert.equal(photoImageBuffers.length, 3, "exatamente 3 imagens de foto no RDF (fora o logo do cabeçalho)");
  assert.ok(photoImageBuffers.some((buf) => buf.equals(fotoA)), "bytes da foto A (drive-A) presentes e intactos");
  assert.ok(photoImageBuffers.some((buf) => buf.equals(fotoB)), "bytes da foto B (drive-B) presentes e intactos");
  assert.ok(photoImageBuffers.some((buf) => buf.equals(fotoC)), "bytes da foto C (drive-C) presentes e intactos");

  // Nenhuma imagem de foto é, por acidente, o buffer do logo institucional.
  for (const buf of photoImageBuffers) {
    assert.ok(!buf.equals(logoFixture), "logo institucional NUNCA aparece como foto de atividade");
  }
});

test("linhagem: foto sem legenda nunca vira atividade no RDO, mas continua aparecendo no RDF com fallback (nunca some silenciosamente)", () => {
  const { buildActivities, buildPhotos } = require("../src/modules/automations/documents/diarioObraDocumentModel");
  const snapshotSemLegenda = {
    messages: [
      msg({ id: "1", timestamp: "2026-09-14T08:00:00.000Z", caption: null, driveFileId: "drive-X" }),
      msg({ id: "2", timestamp: "2026-09-14T08:05:00.000Z", caption: "Atividade com legenda", driveFileId: "drive-Y" }),
    ],
  };
  const activities = buildActivities({}, snapshotSemLegenda);
  assert.deepEqual(activities.map((a) => a.texto), ["Atividade com legenda"], "foto sem legenda não vira atividade");

  const photos = buildPhotos(snapshotSemLegenda, { arquivosByDriveFileId: new Map(), photoObservationsByRef: new Map() });
  assert.equal(photos.length, 2, "mas as 2 fotos continuam no RDF");
  assert.equal(photos[0].legendaTipo, "AUSENTE");
});
