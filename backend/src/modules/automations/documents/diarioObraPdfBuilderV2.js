"use strict";

/**
 * Construção do PDF do Diário de Obra — template v2 (Bloco 12). Arquivo
 * IRMÃO de `diarioObraPdfBuilder.js` (v1) — v1 permanece intacto. Reproduz
 * o MESMO formulário do Excel v2 (Seção "O PDF deve reproduzir o mesmo
 * formulário do Excel"): cabeçalho, identificação, bloco de clima, divisor
 * "Diário", grade de atividades e rodapé institucional no RDO; título
 * configurável + 2 fotos grandes lado a lado no RDF. Consome o MESMO
 * `document model` que o builder de Excel v2 — nenhuma regra de negócio
 * nova aqui, só layout/formatação.
 */

const PDFDocument = require("pdfkit");
const {
  FIXED_TEXT,
  PDF_PAGE_SIZE,
  PDF_MARGIN_POINTS,
  PHOTOS_PER_PAGE,
} = require("./diarioObraLayoutConstantsV2");
const { paginateActivitiesByHeight, computeActivityRowHeight, paginateByCount } = require("./diarioObraExcelBuilderV2");
const { ACTIVITIES_AREA_BUDGET_POINTS } = require("./diarioObraLayoutConstantsV2");

function formatDataReferencia(dataReferencia) {
  const [ano, mes, dia] = dataReferencia.split("-");
  return `${dia}/${mes}/${ano}`;
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function drawLabelValueRow(doc, { label, value, x, width }) {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).text(`${label}: `, x, y, { continued: true, width });
  doc.font("Helvetica-Oblique").text(value || "");
}

function drawRdoHeader(doc, model, { logoBuffer, isContinuation, pageIndex, totalPages }) {
  const startX = doc.page.margins.left;
  const width = contentWidth(doc);
  doc.y = doc.page.margins.top;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, startX, doc.y, { fit: [90, 40] });
    } catch {
      // Logo corrompido/ilegível nunca derruba a geração do documento inteiro.
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(isContinuation ? `${FIXED_TEXT.titulo} ${FIXED_TEXT.continuacaoSufixo}` : FIXED_TEXT.titulo, startX + 100, doc.y, {
      width: width - 100,
      align: "center",
    });
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(totalPages > 1 ? `${FIXED_TEXT.subtitulo} — página ${pageIndex + 1} de ${totalPages}` : FIXED_TEXT.subtitulo, startX + 100, doc.y, {
      width: width - 100,
      align: "center",
    });

  doc.y = Math.max(doc.y, doc.page.margins.top + 45);
  doc.moveDown(0.5);

  if (isContinuation) return;

  const half = width / 2;
  drawLabelValueRow(doc, { label: FIXED_TEXT.rotuloObra, value: model.identification.projetoNome, x: startX, width: half });
  doc.font("Helvetica-Bold").fontSize(9).text(`${FIXED_TEXT.rotuloRefContratual}: `, startX + half, doc.y - doc.currentLineHeight(), { continued: true, width: half });
  doc.font("Helvetica").text(model.identification.referenciaContratual || "");

  drawLabelValueRow(doc, { label: FIXED_TEXT.rotuloLocal, value: model.identification.local, x: startX, width: half });
  doc.font("Helvetica-Bold").fontSize(9).text(`${FIXED_TEXT.rotuloData}: `, startX + half, doc.y - doc.currentLineHeight(), { continued: true, width: half });
  doc.font("Helvetica").text(formatDataReferencia(model.identification.dataReferencia));

  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(9).text(`${FIXED_TEXT.rotuloRegistroTempo} / ${FIXED_TEXT.rotuloExpediente}: `, startX, doc.y, { continued: true, width });
  doc
    .font("Helvetica")
    .text(`Início às ${model.identification.expedienteInicio}; final às ${model.identification.expedienteFim}`);

  // Bloco de clima (Seção "manter geometria... bloco de clima") — só os
  // rótulos, marcações SEMPRE vazias (nunca inferidas).
  doc.moveDown(0.3);
  doc
    .font("Helvetica")
    .fontSize(9)
    .text(
      `${FIXED_TEXT.rotuloPeriodo}: ${FIXED_TEXT.periodoManha} / ${FIXED_TEXT.periodoTarde} / ${FIXED_TEXT.periodoNoite}    ${FIXED_TEXT.climaLabelBom}: ___    ${FIXED_TEXT.climaLabelChuvas}: ___`,
      startX,
      doc.y,
      { width }
    );

  doc.moveDown(0.5);
  doc.font("Helvetica-BoldOblique").fontSize(10).text(FIXED_TEXT.diarioDivisor, startX, doc.y, { width, align: "center" });

  doc.moveDown(0.4);
  doc
    .moveTo(startX, doc.y)
    .lineTo(startX + width, doc.y)
    .strokeColor("#999999")
    .stroke();
  doc.moveDown(0.4);
}

function drawRdoFooter(doc, model) {
  doc.moveDown(1);
  const startX = doc.page.margins.left;
  const width = contentWidth(doc);
  const half = width / 2;
  const rowY = doc.y;

  doc.font("Helvetica").fontSize(9).text(model.identification.rodapeInstitucional.assinanteEsquerda, startX, rowY, { width: half, align: "center" });
  const signatureLines = [model.signature.responsavelTecnico].filter(Boolean).join("\n");
  doc.font("Helvetica").fontSize(9).text(signatureLines, startX + half, rowY, { width: half, align: "center" });

  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(9).text(model.identification.rodapeInstitucional.razaoSocialCompleta, startX, doc.y, { width, align: "center" });
  doc.font("Helvetica").fontSize(9).text(model.identification.rodapeInstitucional.endereco, startX, doc.y, { width, align: "center" });
}

function drawRdoSection(doc, model, { logoBuffer }) {
  const activityPages = paginateActivitiesByHeight(model.activities, ACTIVITIES_AREA_BUDGET_POINTS);
  const totalPages = activityPages.length;

  const headerDrawState = { current: null };
  const onPageAdded = () => {
    if (headerDrawState.current) drawRdoHeader(doc, model, headerDrawState.current);
  };
  doc.on("pageAdded", onPageAdded);

  activityPages.forEach((page, pageIndex) => {
    const isContinuation = pageIndex > 0;
    headerDrawState.current = { logoBuffer, isContinuation, pageIndex, totalPages };
    if (isContinuation) {
      doc.addPage();
    } else {
      drawRdoHeader(doc, model, headerDrawState.current);
    }

    doc.font("Helvetica-BoldOblique").fontSize(10).text(FIXED_TEXT.atividadesTitulo, { align: "center" });
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(9);
    for (const item of page) {
      // Altura dinâmica no PDF é natural (pdfkit flui o texto conforme o
      // conteúdo) — a mesma estimativa do Excel só garante espaçamento
      // mínimo consistente entre itens, nunca corta/sobrepõe texto.
      doc.text(`${item.numero}. ${item.texto}`, { width: contentWidth(doc), align: "left" });
      doc.moveDown(Math.max(0.2, computeActivityRowHeight(item.texto) / 72));
    }

    if (pageIndex === totalPages - 1) {
      drawRdoFooter(doc, model);
    }
  });

  doc.removeListener("pageAdded", onPageAdded);
}

function drawPhotoSlot(doc, photo, { x, y, width, height, photoBuffers }) {
  doc.rect(x, y, width, height).strokeColor("#999999").stroke();
  if (!photo) return;

  const imageHeight = height - 40;
  if (photo.disponivel) {
    const buffer = photoBuffers.get(photo.driveFileId);
    if (buffer) {
      try {
        doc.image(buffer, x + 6, y + 6, { fit: [width - 12, imageHeight - 12], align: "center", valign: "center" });
      } catch {
        // Buffer de imagem corrompido/ilegível não derruba o documento inteiro.
      }
    }
  } else {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor("#888888")
      .text("Imagem indisponível", x, y + imageHeight / 2 - 6, { width, align: "center" })
      .fillColor("#000000");
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`${photo.numero}. ${photo.legenda}`, x + 4, y + imageHeight + 6, { width: width - 8, height: 32, align: "center", ellipsis: true });
}

/** RDF v2 — 2 fotos GRANDES lado a lado por página, mesma regra do Excel v2. */
function drawRdfSection(doc, model, { logoBuffer, photoBuffers }) {
  const photoPages = paginateByCount(model.photos, PHOTOS_PER_PAGE);
  const totalPages = photoPages.length;

  photoPages.forEach((page, pageIndex) => {
    doc.addPage();
    const startX = doc.page.margins.left;
    const width = contentWidth(doc);
    doc.y = doc.page.margins.top;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, startX, doc.y, { fit: [70, 30] });
      } catch {
        // Logo ilegível — segue sem logo nesta página.
      }
    }
    const titulo = totalPages > 1 ? `${model.identification.tituloRdf} — página ${pageIndex + 1} de ${totalPages}` : model.identification.tituloRdf;
    doc.font("Helvetica-Bold").fontSize(14).text(titulo, startX + 80, doc.y, { width: width - 80, align: "center" });

    doc.y = Math.max(doc.y, doc.page.margins.top + 40);
    doc.font("Helvetica-Bold").fontSize(12).text(FIXED_TEXT.registroFotograficoTitulo, startX, doc.y, { width, align: "center" });
    doc.moveDown(0.6);

    const gap = 16;
    const slotWidth = (width - gap) / 2;
    const slotHeight = doc.page.height - doc.y - doc.page.margins.bottom;
    const y = doc.y;
    const [fotoEsquerda, fotoDireita] = page;
    drawPhotoSlot(doc, fotoEsquerda, { x: startX, y, width: slotWidth, height: slotHeight, photoBuffers });
    drawPhotoSlot(doc, fotoDireita, { x: startX + slotWidth + gap, y, width: slotWidth, height: slotHeight, photoBuffers });
  });
}

/**
 * `photoBuffers`: Map<driveFileId, Buffer> — mesmo contrato do builder de
 * Excel v2. Retorna um `Buffer` já finalizado (nunca grava em disco).
 */
function buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers = new Map() } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: PDF_PAGE_SIZE,
      margins: PDF_MARGIN_POINTS,
      autoFirstPage: false,
      bufferPages: true,
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      doc.addPage();
      drawRdoSection(doc, model, { logoBuffer });
      drawRdfSection(doc, model, { logoBuffer, photoBuffers });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildDiarioObraPdfBufferV2 };
