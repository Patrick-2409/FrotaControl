"use strict";

/**
 * Construção do PDF do Diário de Obra — template v2 (Bloco 12), corrigido na
 * validação visual: o PDF precisa REPRODUZIR o formulário tabular do Excel
 * (logo, quadros com borda, grade "REGISTRO DE TEMPO/EXPEDIENTE" com X nas
 * células corretas, grade de atividades, bloco de assinatura), nunca um
 * relatório textual corrido. Arquivo IRMÃO de `diarioObraPdfBuilder.js` (v1)
 * — v1 permanece intacto. Consome o MESMO `document model` que o builder de
 * Excel v2 — nenhuma regra de negócio nova aqui, só layout/formatação.
 *
 * Estratégia: um "grid renderer" simples desenha células com borda (retângulo
 * + texto) nas MESMAS proporções de coluna do Excel (RDO_COLUMN_WIDTHS,
 * convertidas para frações da largura útil da página — a largura absoluta
 * em pontos é diferente da unidade "caractere" do Excel, mas a PROPORÇÃO
 * entre colunas fica idêntica, que é o que reproduz o formulário
 * visualmente) e alturas em pontos auditadas linha a linha do arquivo
 * oficial (as mesmas usadas pelo Excel builder — nunca uma segunda fonte de
 * verdade para altura).
 */

const PDFDocument = require("pdfkit");
const {
  FIXED_TEXT,
  PDF_PAGE_SIZE,
  PDF_MARGIN_POINTS,
  PHOTOS_PER_PAGE,
  ACTIVITIES_PER_PAGE,
  RDO_COLUMN_WIDTHS,
  RDO_SIGNATURE_BLOCK_ROW_HEIGHTS_POINTS,
  RDO_SIGNATURE_MAX_HEIGHT_POINTS,
  RDO_SIGNATURE_ASPECT_RATIO,
  RDF_PDF_PHOTO_FRAME_ASPECT_RATIO,
} = require("./diarioObraLayoutConstantsV2");
const { computeActivityRowHeight, paginateByCount } = require("./diarioObraExcelBuilderV2");

const BORDER_COLOR = "#000000";
const BORDER_WIDTH = 0.75;
const HEADER_FILL = "#D9E2F3";

/**
 * Correção de paginação do RDO no PDF (ajuste isolado ao PDF — Seção "RDO
 * deve caber em uma única página"): o formulário completo, com as alturas
 * auditadas 1:1 do Excel (linhas de atividade vazias inclusas), soma
 * 859.1pt de altura de conteúdo contra 733.89pt disponíveis numa página A4
 * com as margens atuais (PDF_MARGIN_POINTS) — 125.2pt de estouro, medido
 * diretamente somando as alturas usadas por `drawRdoHeader`/
 * `drawRdoActivities`/`drawRdoFooter` para um dia com poucas atividades
 * (o caso normal). O estouro empurrava só a assinatura/rodapé para uma
 * SEGUNDA página, já que eles são desenhados por último.
 *
 * Nunca toca `RDO_FOOTER_SPACER_HEIGHTS_POINTS`/`computeActivityRowHeight`
 * (compartilhados com o Excel — mudar isso mudaria o .xlsx já aprovado).
 * Em vez disso, o PDF usa constantes PRÓPRIAS, só para os elementos
 * puramente de ESPAÇAMENTO (linhas em branco da grade e linhas
 * espaçadoras sem texto) — nunca a fonte, a assinatura, o cabeçalho ou uma
 * atividade PREENCHIDA, que continuam com a altura dinâmica de sempre
 * (`computeActivityRowHeight`, sem alteração). Com estes valores, até ~14
 * atividades preenchidas (de uma linha cada) ainda cabem numa única
 * página — bem acima do uso real observado (4-8/dia); além disso, a
 * lógica de continuação (`ensureRoomFor`) permanece intacta para o caso
 * excepcional.
 */
const PDF_RDO_SPACER_ROW_HEIGHT_POINTS = 8; // linhas 6 e 14 do cabeçalho (espaçadoras, sem texto)
const PDF_RDO_FOOTER_SPACER_HEIGHTS_POINTS = [8, 10]; // override só do PDF — nunca RDO_FOOTER_SPACER_HEIGHTS_POINTS (Excel)
const PDF_RDO_BLANK_ACTIVITY_ROW_HEIGHT_POINTS = 12; // só linhas SEM atividade — uma preenchida nunca usa este valor

/** Rótulo textual da condição de clima de um período (Seção "clima") — mesma semântica do "X" desenhado no Excel, nunca inferida aqui. */
function climaConditionLabel(condicao, fixedText) {
  if (condicao === "BOM") return fixedText.climaLabelBom;
  if (condicao === "CHUVAS") return fixedText.climaLabelChuvas;
  return "—";
}

/** Marca ("X") da condição de clima de um período, ou vazio — idêntico ao climaMark do Excel builder (nunca inferida, só reflete `model.clima`). */
function climaMark(condicaoDoPeriodo, condicaoDaLinha) {
  return condicaoDoPeriodo === condicaoDaLinha ? "X" : "";
}

function formatDataReferencia(dataReferencia) {
  const [ano, mes, dia] = dataReferencia.split("-");
  return `${dia}/${mes}/${ano}`;
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

/**
 * Garante espaço vertical para a PRÓXIMA linha do formulário (Seção "nunca
 * cortar conteúdo") — o Excel oficial imprime o RDO em escala 100% sem
 * "fit to page" (cabe numa única folha A4 quando as atividades são curtas,
 * como o dia auditado), mas o pdfkit não quebra página sozinho para
 * desenhos manuais: quando um texto real e longo faz a grade ultrapassar a
 * altura física da página, abre uma NOVA página (sem repetir cabeçalho —
 * mesmo comportamento de uma quebra de impressão dentro da mesma planilha,
 * nunca uma "RDO_CONT" nova, que só existe para o teto de 31 atividades).
 */
function ensureRoomFor(doc, height) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

/**
 * Limites X de cada uma das 8 colunas do RDO, proporcionais a
 * RDO_COLUMN_WIDTHS (Seção "reproduzir a geometria oficial" — a PROPORÇÃO
 * entre colunas é o que importa para o formulário parecer igual, não o
 * valor absoluto em "caracteres Excel", que nem se aplica a um PDF).
 */
function computeRdoColumnBounds(startX, totalWidth) {
  const totalUnits = RDO_COLUMN_WIDTHS.reduce((sum, w) => sum + w, 0);
  const bounds = [];
  let x = startX;
  for (const unit of RDO_COLUMN_WIDTHS) {
    const width = (unit / totalUnits) * totalWidth;
    bounds.push({ x, width });
    x += width;
  }
  return bounds;
}

/** Soma das larguras das colunas de `colStart` a `colEnd` (0-indexed, inclusive) — para células mescladas horizontalmente. */
function mergedBounds(bounds, colStart, colEnd) {
  const x = bounds[colStart].x;
  const width = bounds.slice(colStart, colEnd + 1).reduce((sum, c) => sum + c.width, 0);
  return { x, width };
}

/**
 * Desenha UMA célula do formulário: retângulo com borda (Seção "grade
 * tabular") + texto opcional alinhado dentro. `fill` pinta o fundo antes da
 * borda (cabeçalho do RDO usa preenchimento, igual ao Excel `HEADER_FILL`).
 */
function drawFormCell(doc, { x, y, width, height, text, bold = false, italic = false, size = 9, align = "center", valign = "middle", fill = null, border = true }) {
  if (fill) {
    doc.rect(x, y, width, height).fill(fill);
  }
  if (border) {
    doc.rect(x, y, width, height).lineWidth(BORDER_WIDTH).strokeColor(BORDER_COLOR).stroke();
  }
  if (text) {
    const font = bold && italic ? "Helvetica-BoldOblique" : bold ? "Helvetica-Bold" : italic ? "Helvetica-Oblique" : "Helvetica";
    doc.font(font).fontSize(size).fillColor("#000000");
    const padding = 3;
    const textWidth = width - padding * 2;
    const textHeight = doc.heightOfString(text, { width: textWidth, align });
    let textY = y + padding;
    if (valign === "middle") textY = y + Math.max(padding, (height - textHeight) / 2);
    else if (valign === "bottom") textY = y + Math.max(padding, height - textHeight - padding);
    doc.text(text, x + padding, textY, { width: textWidth, align });
  }
}

/**
 * Cabeçalho + identificação + bloco de clima TABULAR + divisor "Diário"
 * (linhas 1-14 do oficial, Seção "PDF deve reproduzir o formulário") — só
 * desenhado na PRIMEIRA página; páginas de continuação repetem só
 * título+"(continuação)", igual ao Excel. Retorna o Y logo após o cabeçalho
 * (onde a grade de atividades começa).
 */
function drawRdoHeader(doc, model, { logoBuffer, isContinuation, pageIndex, totalPages }) {
  const startX = doc.page.margins.left;
  const width = contentWidth(doc);
  const bounds = computeRdoColumnBounds(startX, width);
  let y = doc.page.margins.top;

  // Linhas 1-3: logo (A1:B3) + título (C1:H1) + subtítulo (C2:H3).
  const headerRowHeight = 18;
  const logoBounds = mergedBounds(bounds, 0, 1);
  const titleBounds = mergedBounds(bounds, 2, 7);
  drawFormCell(doc, { x: logoBounds.x, y, width: logoBounds.width, height: headerRowHeight * 3, fill: HEADER_FILL });
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, logoBounds.x + 4, y + 4, { fit: [logoBounds.width - 8, headerRowHeight * 3 - 8] });
    } catch {
      // Logo corrompido/ilegível nunca derruba a geração do documento inteiro.
    }
  }
  drawFormCell(doc, {
    x: titleBounds.x,
    y,
    width: titleBounds.width,
    height: headerRowHeight,
    text: isContinuation ? `${FIXED_TEXT.titulo} ${FIXED_TEXT.continuacaoSufixo}` : FIXED_TEXT.titulo,
    bold: true,
    size: 11,
    fill: HEADER_FILL,
  });
  drawFormCell(doc, {
    x: titleBounds.x,
    y: y + headerRowHeight,
    width: titleBounds.width,
    height: headerRowHeight * 2,
    text: totalPages > 1 ? `${FIXED_TEXT.subtitulo} — página ${pageIndex + 1} de ${totalPages}` : FIXED_TEXT.subtitulo,
    size: 10,
    fill: HEADER_FILL,
  });
  y += headerRowHeight * 3;

  if (isContinuation) {
    // Linha 14 do oficial (espaçadora) — página de continuação nunca repete identificação/clima/Diário.
    drawFormCell(doc, { x: startX, y, width, height: 13.2, text: "" });
    doc.y = y + 13.2;
    return;
  }

  // Linhas 4-5: OBRA/REF.T e LOCAL/DATA.
  const rowH45 = 13.2;
  const colA = bounds[0];
  const bdBounds = mergedBounds(bounds, 1, 3);
  const colE = bounds[4];
  const fhBounds = mergedBounds(bounds, 5, 7);

  drawFormCell(doc, { x: colA.x, y, width: colA.width, height: rowH45, text: FIXED_TEXT.rotuloObra });
  drawFormCell(doc, { x: bdBounds.x, y, width: bdBounds.width, height: rowH45, text: model.identification.projetoNome || "", italic: true });
  drawFormCell(doc, { x: colE.x, y, width: colE.width, height: rowH45, text: FIXED_TEXT.rotuloRefContratual });
  drawFormCell(doc, { x: fhBounds.x, y, width: fhBounds.width, height: rowH45, text: model.identification.referenciaContratual || "" });
  y += rowH45;

  drawFormCell(doc, { x: colA.x, y, width: colA.width, height: rowH45, text: FIXED_TEXT.rotuloLocal });
  drawFormCell(doc, { x: bdBounds.x, y, width: bdBounds.width, height: rowH45, text: model.identification.local || "", italic: true });
  drawFormCell(doc, { x: colE.x, y, width: colE.width, height: rowH45, text: FIXED_TEXT.rotuloData });
  drawFormCell(doc, { x: fhBounds.x, y, width: fhBounds.width, height: rowH45, text: formatDataReferencia(model.identification.dataReferencia) });
  y += rowH45;

  // Linha 6: espaçadora (Seção "RDO deve caber em uma única página" —
  // linha sem texto, altura reduzida só no PDF, nunca no Excel).
  drawFormCell(doc, { x: startX, y, width, height: PDF_RDO_SPACER_ROW_HEIGHT_POINTS, text: "" });
  y += PDF_RDO_SPACER_ROW_HEIGHT_POINTS;

  // Linha 7: REGISTRO DE TEMPO (A:D) / EXPEDIENTE (E:H).
  const adBounds = mergedBounds(bounds, 0, 3);
  const ehBounds = mergedBounds(bounds, 4, 7);
  drawFormCell(doc, { x: adBounds.x, y, width: adBounds.width, height: rowH45, text: FIXED_TEXT.rotuloRegistroTempo });
  drawFormCell(doc, { x: ehBounds.x, y, width: ehBounds.width, height: rowH45, text: FIXED_TEXT.rotuloExpediente });
  y += rowH45;

  // Linhas 8-10: grade PERÍODO x MANHÃ/TARDE/NOITE com X nas células (Seção "quadro de clima tabular") + texto do expediente (E8:H10).
  const climaRowHeight = 13.2;
  const clima = model.clima || {};
  const expedienteBounds = mergedBounds(bounds, 4, 7);
  drawFormCell(doc, { x: expedienteBounds.x, y, width: expedienteBounds.width, height: climaRowHeight * 3, text: `Início às ${model.identification.expedienteInicio}; final às ${model.identification.expedienteFim}`, align: "left", valign: "top" });

  drawFormCell(doc, { x: bounds[0].x, y, width: bounds[0].width, height: climaRowHeight, text: FIXED_TEXT.rotuloPeriodo });
  drawFormCell(doc, { x: bounds[1].x, y, width: bounds[1].width, height: climaRowHeight, text: FIXED_TEXT.periodoManha });
  drawFormCell(doc, { x: bounds[2].x, y, width: bounds[2].width, height: climaRowHeight, text: FIXED_TEXT.periodoTarde });
  drawFormCell(doc, { x: bounds[3].x, y, width: bounds[3].width, height: climaRowHeight, text: FIXED_TEXT.periodoNoite });
  y += climaRowHeight;

  drawFormCell(doc, { x: bounds[0].x, y, width: bounds[0].width, height: climaRowHeight, text: FIXED_TEXT.climaLabelBom });
  drawFormCell(doc, { x: bounds[1].x, y, width: bounds[1].width, height: climaRowHeight, text: climaMark(clima.manha, "BOM") });
  drawFormCell(doc, { x: bounds[2].x, y, width: bounds[2].width, height: climaRowHeight, text: climaMark(clima.tarde, "BOM") });
  drawFormCell(doc, { x: bounds[3].x, y, width: bounds[3].width, height: climaRowHeight, text: climaMark(clima.noite, "BOM") });
  y += climaRowHeight;

  drawFormCell(doc, { x: bounds[0].x, y, width: bounds[0].width, height: climaRowHeight, text: FIXED_TEXT.climaLabelChuvas });
  drawFormCell(doc, { x: bounds[1].x, y, width: bounds[1].width, height: climaRowHeight, text: climaMark(clima.manha, "CHUVAS") });
  drawFormCell(doc, { x: bounds[2].x, y, width: bounds[2].width, height: climaRowHeight, text: climaMark(clima.tarde, "CHUVAS") });
  drawFormCell(doc, { x: bounds[3].x, y, width: bounds[3].width, height: climaRowHeight, text: climaMark(clima.noite, "CHUVAS") });
  y += climaRowHeight;

  // Linhas 11-12: divisor "Diário" (mesclado A:H, 2 linhas).
  drawFormCell(doc, { x: startX, y, width, height: rowH45 * 2, text: FIXED_TEXT.diarioDivisor, bold: true, italic: true, size: 10 });
  y += rowH45 * 2;

  // Linha 13: título de atividades.
  drawFormCell(doc, { x: startX, y, width, height: rowH45, text: FIXED_TEXT.atividadesTitulo, bold: true, italic: true, size: 10 });
  y += rowH45;

  // Linha 14: espaçadora (mesma redução da linha 6, só no PDF).
  drawFormCell(doc, { x: startX, y, width, height: PDF_RDO_SPACER_ROW_HEIGHT_POINTS, text: "" });
  y += PDF_RDO_SPACER_ROW_HEIGHT_POINTS;

  doc.y = y;
}

/** Rodapé institucional TABULAR (linhas 46-51, re-auditadas) — mesma geometria do Excel builder v2, nunca uma segunda fonte de verdade para as alturas. */
function drawRdoFooter(doc, model, { signatureBuffer } = {}) {
  const startX = doc.page.margins.left;
  const width = contentWidth(doc);
  const bounds = computeRdoColumnBounds(startX, width);
  const [signatureRowHeightCheck, nameRowHeightCheck] = RDO_SIGNATURE_BLOCK_ROW_HEIGHTS_POINTS;
  const totalFooterHeight =
    PDF_RDO_FOOTER_SPACER_HEIGHTS_POINTS.reduce((sum, h) => sum + h, 0) + signatureRowHeightCheck + nameRowHeightCheck + 13.2 + 13.2;
  ensureRoomFor(doc, totalFooterHeight);
  let y = doc.y;

  // Espaçadoras SEM texto — override só do PDF (Seção "RDO deve caber em
  // uma única página"). Nunca `RDO_FOOTER_SPACER_HEIGHTS_POINTS` (Excel).
  for (const spacerHeight of PDF_RDO_FOOTER_SPACER_HEIGHTS_POINTS) {
    drawFormCell(doc, { x: startX, y, width, height: spacerHeight, text: "" });
    y += spacerHeight;
  }

  const [signatureRowHeight, nameRowHeight] = RDO_SIGNATURE_BLOCK_ROW_HEIGHTS_POINTS;
  const blockHeight = signatureRowHeight + nameRowHeight;
  const leftBounds = mergedBounds(bounds, 0, 3);
  const rightBounds = mergedBounds(bounds, 4, 7);

  drawFormCell(doc, {
    x: leftBounds.x,
    y,
    width: leftBounds.width,
    height: blockHeight,
    text: model.identification.rodapeInstitucional.assinanteEsquerda,
  });
  drawFormCell(doc, { x: rightBounds.x, y, width: rightBounds.width, height: blockHeight, text: "" });

  // Assinatura CONFINADA à primeira linha do bloco (Seção "assinatura sobre
  // o nome") — nunca invade a linha do nome, que fica alinhado embaixo.
  if (signatureBuffer && model.signature.responsavelTecnico) {
    const signatureHeight = Math.min(RDO_SIGNATURE_MAX_HEIGHT_POINTS, signatureRowHeight - 4);
    const signatureWidth = signatureHeight * RDO_SIGNATURE_ASPECT_RATIO;
    try {
      doc.image(signatureBuffer, rightBounds.x + (rightBounds.width - signatureWidth) / 2, y + 2, {
        width: signatureWidth,
        height: signatureHeight,
      });
    } catch {
      // Asset de assinatura corrompido/ilegível nunca derruba a geração do documento inteiro.
    }
  }
  drawFormCell(doc, {
    x: rightBounds.x,
    y: y + signatureRowHeight,
    width: rightBounds.width,
    height: nameRowHeight,
    text: model.signature.responsavelTecnico || "",
    valign: "bottom",
    border: false,
  });
  y += blockHeight;

  drawFormCell(doc, { x: startX, y, width, height: 13.2, text: model.identification.rodapeInstitucional.razaoSocialCompleta, bold: true, border: false });
  y += 13.2;
  drawFormCell(doc, { x: startX, y, width, height: 13.2, text: model.identification.rodapeInstitucional.endereco, border: false });
  doc.y = y + 13.2;
}

/**
 * Grade de atividades TABULAR de TAMANHO FIXO (linhas 15-45, Seção
 * "preservar o formulário oficial") — desenha sempre `totalSlots` células
 * (ACTIVITIES_PER_PAGE), preenchidas ou em branco: poucas atividades NUNCA
 * encolhem o formulário nem sobem o rodapé (mesmo princípio do Excel
 * builder — `buildRdoActivities`). Atividade PREENCHIDA usa a MESMA altura
 * dinâmica do Excel (`computeActivityRowHeight`, nunca reduzida — Seção
 * "atividades preenchidas devem continuar legíveis"); só a linha EM BRANCO
 * usa `PDF_RDO_BLANK_ACTIVITY_ROW_HEIGHT_POINTS` (menor, só no PDF — Seção
 * "RDO deve caber em uma única página") em vez de `computeActivityRowHeight("")`.
 */
function drawRdoActivities(doc, activitiesPage, totalSlots) {
  const startX = doc.page.margins.left;
  const width = contentWidth(doc);
  let y = doc.y;

  for (const item of activitiesPage) {
    const text = `${item.numero}. ${item.texto}`;
    const height = computeActivityRowHeight(item.texto);
    doc.y = y;
    ensureRoomFor(doc, height);
    y = doc.y;
    drawFormCell(doc, { x: startX, y, width, height, text, bold: true, align: "left", valign: "top" });
    y += height;
  }
  const blankHeight = PDF_RDO_BLANK_ACTIVITY_ROW_HEIGHT_POINTS;
  for (let i = activitiesPage.length; i < totalSlots; i += 1) {
    doc.y = y;
    ensureRoomFor(doc, blankHeight);
    y = doc.y;
    drawFormCell(doc, { x: startX, y, width, height: blankHeight, text: "" });
    y += blankHeight;
  }
  doc.y = y;
}

function drawRdoSection(doc, model, { logoBuffer, signatureBuffer }) {
  const activityPages = paginateByCount(model.activities, ACTIVITIES_PER_PAGE);
  const totalPages = activityPages.length;

  activityPages.forEach((page, pageIndex) => {
    const isContinuation = pageIndex > 0;
    if (isContinuation) doc.addPage();
    drawRdoHeader(doc, model, { logoBuffer, isContinuation, pageIndex, totalPages });
    drawRdoActivities(doc, page, ACTIVITIES_PER_PAGE);
    if (pageIndex === totalPages - 1) {
      drawRdoFooter(doc, model, { signatureBuffer });
    }
  });
}

const RDF_PDF_CAPTION_HEIGHT_POINTS = 32;
const RDF_PDF_CAPTION_GAP_POINTS = 8;
const RDF_PDF_FRAME_PADDING_POINTS = 6;

/**
 * "Contain": a maior caixa de proporção `aspectRatio` (largura/altura) que
 * cabe dentro de `availableWidth`x`availableHeight`, centralizada nele —
 * função pura, testável isoladamente (Seção "ajuste de proporção").
 */
function computeContainedFrame({ availableWidth, availableHeight, aspectRatio }) {
  let frameWidth = availableWidth;
  let frameHeight = frameWidth / aspectRatio;
  if (frameHeight > availableHeight) {
    frameHeight = availableHeight;
    frameWidth = frameHeight * aspectRatio;
  }
  const offsetX = (availableWidth - frameWidth) / 2;
  const offsetY = Math.max(0, (availableHeight - frameHeight) / 2);
  return { width: frameWidth, height: frameHeight, offsetX, offsetY };
}

/**
 * Quadro de UMA foto (Seção "ajuste de proporção") — o espaço DISPONÍVEL no
 * slot (metade da largura útil x quase a altura inteira da página) é bem
 * mais alto que largo; ajustar a foto por "fit" DENTRO desse retângulo
 * inteiro deixava margens enormes e desproporcionais. Em vez disso, o
 * QUADRO em si é dimensionado por "contain" (largura x altura preservando
 * RDF_PDF_PHOTO_FRAME_ASPECT_RATIO — a MESMA proporção do frame do Excel,
 * 300x260px) dentro do espaço disponível, e centralizado nele — a legenda
 * fica logo abaixo do quadro, nunca no rodapé do slot inteiro. O quadro é
 * sempre desenhado (mesmo sem foto, Seção "preserva o frame vazio").
 */
function drawPhotoSlot(doc, photo, { x, y, width, height, photoBuffers }) {
  const availableHeightForFrame = Math.max(0, height - RDF_PDF_CAPTION_HEIGHT_POINTS - RDF_PDF_CAPTION_GAP_POINTS);
  const frame = computeContainedFrame({ availableWidth: width, availableHeight: availableHeightForFrame, aspectRatio: RDF_PDF_PHOTO_FRAME_ASPECT_RATIO });
  const frameWidth = frame.width;
  const frameHeight = frame.height;
  const frameX = x + frame.offsetX;
  const frameY = y + frame.offsetY;

  doc.rect(frameX, frameY, frameWidth, frameHeight).strokeColor("#999999").stroke();
  if (!photo) return;

  if (photo.disponivel) {
    const buffer = photoBuffers.get(photo.driveFileId);
    if (buffer) {
      try {
        doc.image(buffer, frameX + RDF_PDF_FRAME_PADDING_POINTS, frameY + RDF_PDF_FRAME_PADDING_POINTS, {
          fit: [frameWidth - RDF_PDF_FRAME_PADDING_POINTS * 2, frameHeight - RDF_PDF_FRAME_PADDING_POINTS * 2],
          align: "center",
          valign: "center",
        });
      } catch {
        // Buffer de imagem corrompido/ilegível não derruba o documento inteiro.
      }
    }
  } else {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor("#888888")
      .text("Imagem indisponível", frameX, frameY + frameHeight / 2 - 6, { width: frameWidth, align: "center" })
      .fillColor("#000000");
  }

  const captionY = frameY + frameHeight + RDF_PDF_CAPTION_GAP_POINTS;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`${photo.numero}. ${photo.legenda}`, x + 4, captionY, { width: width - 8, height: RDF_PDF_CAPTION_HEIGHT_POINTS, align: "center", ellipsis: true });
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
 * Excel v2. `signatureBuffer` é opcional (Seção "assinatura digital").
 * Retorna um `Buffer` já finalizado (nunca grava em disco).
 */
function buildDiarioObraPdfBufferV2(model, { logoBuffer, photoBuffers = new Map(), signatureBuffer } = {}) {
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
      drawRdoSection(doc, model, { logoBuffer, signatureBuffer });
      drawRdfSection(doc, model, { logoBuffer, photoBuffers });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildDiarioObraPdfBufferV2, computeContainedFrame };
