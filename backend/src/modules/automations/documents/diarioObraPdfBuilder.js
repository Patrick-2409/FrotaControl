"use strict";

/**
 * Construção do PDF do Diário de Obra (Bloco 7B, Seção 4) — geração DIRETA via
 * `pdfkit`, nunca conversão Excel→PDF (o PDF de referência auditado no Bloco
 * 7A foi gerado por ReportLab/Python, confirmado via metadado `/Producer`, não
 * exportado do Excel). Consome o MESMO `document model` de
 * `diarioObraDocumentModel.js` que o builder de Excel — nenhuma regra de
 * negócio (ordenação, legenda, política de ausência) é decidida aqui, só
 * layout/formatação (Seção 33), mesma paginação lógica (32 atividades / 13
 * fotos por página, Seções 20/23) — RDO primeiro, RDF depois, mesmo
 * agrupamento que o Excel, ainda que o "continuação automática" físico do
 * pdfkit sirva de rede de segurança para o caso patológico de texto muito
 * longo dentro de um mesmo grupo lógico de 32 itens.
 */

const PDFDocument = require("pdfkit");
const {
  FIXED_TEXT,
  PDF_PAGE_SIZE,
  PDF_MARGIN_POINTS,
  ACTIVITIES_PER_PAGE,
  PHOTOS_PER_PAGE,
} = require("./diarioObraLayoutConstants");

function paginate(items, perPage) {
  if (!items.length) return [[]];
  const pages = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

function formatDataReferencia(dataReferencia) {
  const [ano, mes, dia] = dataReferencia.split("-");
  return `${dia}/${mes}/${ano}`;
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function drawRdoHeader(doc, model, { logoBuffer, isContinuation, pageIndex, totalPages }) {
  const startX = doc.page.margins.left;
  const width = contentWidth(doc);
  doc.y = doc.page.margins.top;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, startX, doc.y, { fit: [90, 40] });
    } catch {
      // Logo corrompido/ilegível não pode derrubar a geração do documento
      // inteiro (Seção 78, robustez) — segue sem logo nesta página.
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(isContinuation ? `${FIXED_TEXT.titulo} ${FIXED_TEXT.continuacaoSufixo}` : FIXED_TEXT.titulo, startX + 100, doc.y, {
      width: width - 100,
      align: "center",
    });
  doc
    .font("Helvetica-Oblique")
    .fontSize(10)
    .text(totalPages > 1 ? `${FIXED_TEXT.subtitulo} — página ${pageIndex + 1} de ${totalPages}` : FIXED_TEXT.subtitulo, startX + 100, doc.y, {
      width: width - 100,
      align: "center",
    });

  doc.y = Math.max(doc.y, doc.page.margins.top + 45);
  doc.moveDown(0.5);

  doc.font("Helvetica").fontSize(9);
  const half = width / 2;
  const rowY = doc.y;
  doc.font("Helvetica-Bold").text(`${FIXED_TEXT.rotuloObra}: `, startX, rowY, { continued: true, width: half });
  doc.font("Helvetica").text(model.identification.projetoNome || "");
  doc.font("Helvetica-Bold").text(`${FIXED_TEXT.rotuloRefContratual}: `, startX + half, rowY, { continued: true, width: half });
  doc.font("Helvetica").text(model.identification.referenciaContratual || "");

  const row2Y = doc.y;
  doc.font("Helvetica-Bold").text(`${FIXED_TEXT.rotuloLocal}: `, startX, row2Y, { continued: true, width: half });
  doc.font("Helvetica").text(model.identification.local || "");
  doc.font("Helvetica-Bold").text(`${FIXED_TEXT.rotuloData}: `, startX + half, row2Y, { continued: true, width: half });
  doc.font("Helvetica").text(formatDataReferencia(model.identification.dataReferencia));

  if (!isContinuation) {
    const row3Y = doc.y;
    doc.font("Helvetica-Bold").text(`${FIXED_TEXT.rotuloExpediente}: `, startX, row3Y, { continued: true, width });
    doc
      .font("Helvetica")
      .text(`Início às ${model.identification.expedienteInicio}; final às ${model.identification.expedienteFim}`);
  }

  doc.moveDown(0.75);
  doc
    .moveTo(startX, doc.y)
    .lineTo(startX + width, doc.y)
    .strokeColor("#999999")
    .stroke();
  doc.moveDown(0.5);
}

function drawRdoSignature(doc, model) {
  doc.moveDown(1);
  doc.font("Helvetica").fontSize(9);
  if (model.signature.responsavelTecnico) {
    doc.text(`Responsável técnico: ${model.signature.responsavelTecnico}`);
  }
  doc.font("Helvetica-Bold").text(model.identification.clienteRazaoSocial || "");
  doc.font("Helvetica").text(model.identification.clienteEndereco || "");
}

function drawRdoSection(doc, model, { logoBuffer }) {
  const activityPages = paginate(model.activities, ACTIVITIES_PER_PAGE);
  const totalPages = activityPages.length;

  const headerDrawState = { current: null };
  const onPageAdded = () => {
    if (headerDrawState.current) drawRdoHeader(doc, model, headerDrawState.current);
  };
  doc.on("pageAdded", onPageAdded);

  activityPages.forEach((page, pageIndex) => {
    const isContinuation = pageIndex > 0;
    // Atualiza o estado ANTES de `addPage()`: o listener "pageAdded" dispara
    // de forma síncrona dentro de `addPage()`, então já precisa enxergar os
    // dados da página nova (nunca da anterior) para não desenhar cabeçalho
    // duplicado/desatualizado.
    headerDrawState.current = { logoBuffer, isContinuation, pageIndex, totalPages };
    if (isContinuation) {
      doc.addPage(); // dispara o listener, que já desenha o cabeçalho desta página.
    } else {
      drawRdoHeader(doc, model, headerDrawState.current); // primeira página: sem addPage(), desenha direto.
    }

    doc.font("Helvetica-Bold").fontSize(10).text(FIXED_TEXT.atividadesTitulo);
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9);
    for (const item of page) {
      doc.text(`${item.numero}. ${item.texto}`, { width: contentWidth(doc), align: "left" });
      doc.moveDown(0.3);
    }

    if (pageIndex === totalPages - 1) {
      drawRdoSignature(doc, model);
    }
  });

  doc.removeListener("pageAdded", onPageAdded);
}

function drawPhotoSlot(doc, photo, { x, y, width, height, photoBuffers }) {
  doc.rect(x, y, width, height).strokeColor("#999999").stroke();
  if (!photo) return;

  const imageHeight = height - 22;
  if (photo.disponivel) {
    const buffer = photoBuffers.get(photo.driveFileId);
    if (buffer) {
      try {
        doc.image(buffer, x + 4, y + 4, { fit: [width - 8, imageHeight - 8], align: "center", valign: "center" });
      } catch {
        // Buffer de imagem corrompido/ilegível (Seção 78) — não derruba o
        // documento inteiro; a legenda abaixo ainda é impressa normalmente.
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
    .font("Helvetica-Oblique")
    .fontSize(7)
    .text(`${photo.numero}. ${photo.legenda}`, x + 2, y + imageHeight + 2, { width: width - 4, height: 18, ellipsis: true });
}

function drawRdfSection(doc, model, { logoBuffer, photoBuffers }) {
  const photoPages = paginate(model.photos, PHOTOS_PER_PAGE);
  const totalPages = photoPages.length;
  const slotsPerRow = 2;

  photoPages.forEach((page, pageIndex) => {
    doc.addPage();
    const startX = doc.page.margins.left;
    const width = contentWidth(doc);
    doc.y = doc.page.margins.top;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, startX, doc.y, { fit: [70, 30] });
      } catch {
        // Logo ilegível — segue sem logo nesta página (mesma robustez do RDO).
      }
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(
        totalPages > 1
          ? `${FIXED_TEXT.registroFotograficoTitulo} — página ${pageIndex + 1} de ${totalPages}`
          : FIXED_TEXT.registroFotograficoTitulo,
        startX + 80,
        doc.y,
        { width: width - 80, align: "center" }
      );

    doc.y = Math.max(doc.y, doc.page.margins.top + 40);
    doc.moveDown(0.5);

    const gap = 12;
    const slotWidth = (width - gap) / slotsPerRow;
    const slotHeight = 170;
    let row = 0;
    for (let i = 0; i < page.length; i += slotsPerRow) {
      const y = doc.y + row * (slotHeight + gap);
      const pair = [page[i], page[i + 1]];
      pair.forEach((photo, slotIndex) => {
        const x = startX + slotIndex * (slotWidth + gap);
        drawPhotoSlot(doc, photo, { x, y, width: slotWidth, height: slotHeight, photoBuffers });
      });
      row += 1;
    }
  });
}

/**
 * `photoBuffers`: Map<driveFileId, Buffer> — só precisa conter entradas para
 * fotos `disponivel: true`, mesmo contrato do builder de Excel. Retorna um
 * `Buffer` já finalizado (nunca grava em disco — Seção 40, filesystem
 * efêmero do Render).
 */
function buildDiarioObraPdfBuffer(model, { logoBuffer, photoBuffers = new Map() } = {}) {
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

module.exports = { buildDiarioObraPdfBuffer, paginate };
