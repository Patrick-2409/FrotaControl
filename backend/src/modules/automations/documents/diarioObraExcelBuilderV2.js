"use strict";

/**
 * Construção do workbook Excel do Diário de Obra — template v2 (Bloco 12).
 * Arquivo IRMÃO de `diarioObraExcelBuilder.js` (v1) — v1 permanece 100%
 * intacto, nunca chamado por este arquivo, continua com seus próprios testes
 * passando (histórico auditável, Seção "preservando v1").
 *
 * Geometria/estilo auditados do arquivo de referência oficial fornecido pelo
 * usuário (hash em `diarioObraLayoutConstantsV2.js`) — NUNCA os dados
 * preenchidos daquele dia específico, só estrutura (mesclagens, larguras,
 * fontes, bordas, altura dinâmica por conteúdo). Consome exatamente o mesmo
 * `document model` de `diarioObraDocumentModel.js` que o v1 — nenhuma regra
 * de negócio nova aqui, só layout/formatação.
 *
 * Nunca hardcoda nome de cliente/projeto: `tituloRdf` e `rodapeInstitucional`
 * vêm sempre do model (já resolvidos com fallback genérico lá).
 */

const ExcelJS = require("exceljs");
const {
  FIXED_TEXT,
  RDO_COLUMN_WIDTHS,
  RDF_COLUMN_WIDTHS,
  PAGE_SETUP,
  PHOTOS_PER_PAGE,
  ACTIVITY_CHARS_PER_LINE,
  ACTIVITY_LINE_HEIGHT_POINTS,
  ACTIVITY_ROW_VERTICAL_PADDING_POINTS,
  ACTIVITY_MIN_ROW_HEIGHT_POINTS,
  ACTIVITIES_AREA_BUDGET_POINTS,
} = require("./diarioObraLayoutConstantsV2");

const TITLE_FONT = { name: "Arial", size: 10, bold: true };
const SUBTITLE_FONT = { name: "Arial", size: 10 };
const LABEL_FONT = { name: "Arial", size: 10 };
const VALUE_ITALIC_FONT = { name: "Arial", size: 10, italic: true };
const VALUE_FONT = { name: "Arial", size: 10 };
const DIVISOR_FONT = { name: "Arial", size: 10, bold: true, italic: true };
const ACTIVITY_FONT = { name: "Arial", size: 10, bold: true };
const RDF_TITLE_FONT = { name: "Arial", size: 13, bold: true };
const RDF_SUBTITLE_FONT = { name: "Arial", size: 12, bold: true };
const CAPTION_FONT = { name: "Arial", size: 10, bold: true };
const FOOTER_FONT = { name: "Arial", size: 10 };
const FOOTER_BOLD_FONT = { name: "Arial", size: 10, bold: true };

const THIN_BORDER = { style: "thin", color: { indexed: 64 } };
const ALL_BORDERS = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
const TOP_LEFT_RIGHT_BORDERS = { top: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { theme: 2, tint: -0.0499893185216834 } };

/** Paginação simples por contagem — usada para fotos (2 por página, SEMPRE, independente de conteúdo). */
function paginateByCount(items, perPage) {
  if (!items.length) return [[]];
  const pages = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

/**
 * Quantas linhas um texto ocuparia com wrapText na largura mesclada A:H do
 * RDO — aproximação deliberada (Seção "nunca cortar texto"): sempre
 * arredonda para CIMA e usa uma largura conservadora, preferindo altura
 * maior a corte de texto. Quebras de linha explícitas (\n) contam à parte.
 */
function estimateWrappedLineCount(text) {
  const paragraphs = String(text || "").split("\n");
  let lines = 0;
  for (const paragraph of paragraphs) {
    lines += Math.max(1, Math.ceil(paragraph.length / ACTIVITY_CHARS_PER_LINE));
  }
  return lines;
}

/** Altura dinâmica (pontos) de UMA linha de atividade — nunca uma constante única para todas (Seção "altura dinâmica"). */
function computeActivityRowHeight(text) {
  const lines = estimateWrappedLineCount(text);
  return Math.max(ACTIVITY_MIN_ROW_HEIGHT_POINTS, lines * ACTIVITY_LINE_HEIGHT_POINTS + ACTIVITY_ROW_VERTICAL_PADDING_POINTS);
}

/**
 * Paginação da grade de atividades por ORÇAMENTO DE ALTURA, não por
 * contagem fixa de itens (Seção "quando faltar espaço até a linha 47, use
 * continuação") — o oficial prova que a altura por item varia, então 32
 * itens curtos cabem numa página, mas 10 itens muito longos podem não
 * caber; a decisão de abrir página nova é sempre pela altura acumulada,
 * nunca por um contador de itens.
 */
function paginateActivitiesByHeight(activities, budgetPoints) {
  if (!activities.length) return [[]];
  const pages = [];
  let currentPage = [];
  let currentHeight = 0;
  for (const item of activities) {
    const height = computeActivityRowHeight(item.texto);
    if (currentPage.length && currentHeight + height > budgetPoints) {
      pages.push(currentPage);
      currentPage = [];
      currentHeight = 0;
    }
    currentPage.push(item);
    currentHeight += height;
  }
  if (currentPage.length) pages.push(currentPage);
  return pages;
}

function dataReferenciaToExcelDate(dataReferencia) {
  const [ano, mes, dia] = dataReferencia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function applyPageSetup(worksheet) {
  worksheet.pageSetup = {
    paperSize: PAGE_SETUP.paperSize,
    orientation: PAGE_SETUP.orientation,
    fitToPage: PAGE_SETUP.fitToPage,
    fitToWidth: PAGE_SETUP.fitToWidth,
    fitToHeight: PAGE_SETUP.fitToHeight,
    margins: PAGE_SETUP.margins,
  };
}

function addLogo(workbook, worksheet, logoBuffer, { col, row, widthPx = 90, heightPx = 40 }) {
  if (!logoBuffer) return;
  const imageId = workbook.addImage({ buffer: logoBuffer, extension: "png" });
  worksheet.addImage(imageId, { tl: { col, row }, ext: { width: widthPx, height: heightPx } });
}

function boxedCell(worksheet, addr, { value, font, alignment, fill, border = ALL_BORDERS } = {}) {
  const cell = worksheet.getCell(addr);
  if (value !== undefined) cell.value = value;
  if (font) cell.font = font;
  if (alignment) cell.alignment = alignment;
  if (fill) cell.fill = fill;
  if (border) cell.border = border;
  return cell;
}

/**
 * Cabeçalho + identificação + bloco de clima + divisor "Diário" (linhas
 * 1-12 do oficial) — só desenhado na PRIMEIRA página de atividades; páginas
 * de continuação repetem só título+"(continuação)" (Seção "mantendo o
 * mesmo padrão visual").
 */
function buildRdoHeader(workbook, worksheet, model, { logoBuffer, pageIndex, totalPages }) {
  const isContinuation = pageIndex > 0;

  worksheet.mergeCells("A1:B3");
  boxedCell(worksheet, "A1", { font: TITLE_FONT, alignment: { horizontal: "center" }, fill: HEADER_FILL });
  addLogo(workbook, worksheet, logoBuffer, { col: 0.1, row: 0.1 });

  worksheet.mergeCells("C1:H1");
  boxedCell(worksheet, "C1", {
    value: isContinuation ? `${FIXED_TEXT.titulo} ${FIXED_TEXT.continuacaoSufixo}` : FIXED_TEXT.titulo,
    font: TITLE_FONT,
    alignment: { horizontal: "center" },
    fill: HEADER_FILL,
  });

  worksheet.mergeCells("C2:H3");
  boxedCell(worksheet, "C2", {
    value: totalPages > 1 ? `${FIXED_TEXT.subtitulo} — página ${pageIndex + 1} de ${totalPages}` : FIXED_TEXT.subtitulo,
    font: SUBTITLE_FONT,
    alignment: { horizontal: "center" },
    fill: HEADER_FILL,
  });

  if (isContinuation) return 14;

  boxedCell(worksheet, "A4", { value: FIXED_TEXT.rotuloObra, font: LABEL_FONT, alignment: { horizontal: "center", vertical: "middle" } });
  worksheet.mergeCells("B4:D4");
  boxedCell(worksheet, "B4", { value: model.identification.projetoNome ?? "", font: VALUE_ITALIC_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "E4", { value: FIXED_TEXT.rotuloRefContratual, font: LABEL_FONT, alignment: { horizontal: "center", vertical: "middle" } });
  worksheet.mergeCells("F4:H4");
  boxedCell(worksheet, "F4", { value: model.identification.referenciaContratual ?? "", font: VALUE_FONT, alignment: { horizontal: "center" } });

  boxedCell(worksheet, "A5", { value: FIXED_TEXT.rotuloLocal, font: LABEL_FONT, alignment: { horizontal: "center", vertical: "middle" } });
  worksheet.mergeCells("B5:D5");
  boxedCell(worksheet, "B5", { value: model.identification.local ?? "", font: VALUE_ITALIC_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "E5", { value: FIXED_TEXT.rotuloData, font: LABEL_FONT, alignment: { horizontal: "center", vertical: "middle" } });
  worksheet.mergeCells("F5:H5");
  const dateCell = boxedCell(worksheet, "F5", { font: VALUE_FONT, alignment: { horizontal: "center" } });
  dateCell.value = dataReferenciaToExcelDate(model.identification.dataReferencia);
  dateCell.numFmt = "dd/mm/yyyy";

  worksheet.mergeCells("A6:H6");
  boxedCell(worksheet, "A6", { font: VALUE_FONT, alignment: { horizontal: "center" } });

  worksheet.mergeCells("A7:D7");
  boxedCell(worksheet, "A7", { value: FIXED_TEXT.rotuloRegistroTempo, font: LABEL_FONT, alignment: { horizontal: "center" } });
  worksheet.mergeCells("E7:H7");
  boxedCell(worksheet, "E7", { value: FIXED_TEXT.rotuloExpediente, font: LABEL_FONT, alignment: { horizontal: "center" } });

  boxedCell(worksheet, "A8", { value: FIXED_TEXT.rotuloPeriodo, font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "B8", { value: FIXED_TEXT.periodoManha, font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "C8", { value: FIXED_TEXT.periodoTarde, font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "D8", { value: FIXED_TEXT.periodoNoite, font: LABEL_FONT, alignment: { horizontal: "center" } });
  worksheet.mergeCells("E8:H10");
  boxedCell(worksheet, "E8", {
    value: `Início às ${model.identification.expedienteInicio}; final às ${model.identification.expedienteFim}`,
    font: VALUE_FONT,
    alignment: { horizontal: "left", vertical: "top", wrapText: true },
  });

  // Marcações de clima (Seção "nunca inferidas") — SEMPRE vazias; só a
  // geometria/rótulos são desenhados, nunca um valor de BOM/CHUVAS.
  boxedCell(worksheet, "A9", { value: FIXED_TEXT.climaLabelBom, font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "B9", { font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "C9", { font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "D9", { font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "A10", { value: FIXED_TEXT.climaLabelChuvas, font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "B10", { font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "C10", { font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "D10", { font: LABEL_FONT, alignment: { horizontal: "center" } });

  worksheet.mergeCells("A11:H12");
  boxedCell(worksheet, "A11", { value: FIXED_TEXT.diarioDivisor, font: DIVISOR_FONT, alignment: { horizontal: "center", vertical: "middle" } });

  worksheet.mergeCells("A13:H13");
  boxedCell(worksheet, "A13", { value: FIXED_TEXT.atividadesTitulo, font: DIVISOR_FONT, alignment: { horizontal: "center" }, border: TOP_LEFT_RIGHT_BORDERS });

  return 14;
}

function buildRdoActivities(worksheet, activitiesPage, startRow) {
  let row = startRow;
  for (const item of activitiesPage) {
    worksheet.mergeCells(`A${row}:H${row}`);
    boxedCell(worksheet, `A${row}`, {
      value: `${item.numero}. ${item.texto}`,
      font: ACTIVITY_FONT,
      alignment: { horizontal: "left", vertical: "top", wrapText: true },
    });
    worksheet.getRow(row).height = computeActivityRowHeight(item.texto);
    row += 1;
  }
  return row;
}

/** Rodapé institucional (linhas 47-51 do oficial) — SEMPRE dados já resolvidos pelo model (nunca constante de cliente aqui). */
function buildRdoFooter(worksheet, model, startRow) {
  let row = startRow;
  worksheet.mergeCells(`A${row}:H${row}`);
  boxedCell(worksheet, `A${row}`, { font: VALUE_FONT });
  row += 1;

  const footerStart = row;
  worksheet.mergeCells(`A${footerStart}:D${footerStart + 1}`);
  boxedCell(worksheet, `A${footerStart}`, {
    value: model.identification.rodapeInstitucional.assinanteEsquerda,
    font: FOOTER_FONT,
    alignment: { horizontal: "center" },
  });
  worksheet.mergeCells(`E${footerStart}:H${footerStart + 1}`);
  const assinaturaDireita = [model.signature.responsavelTecnico].filter(Boolean).join("\n");
  boxedCell(worksheet, `E${footerStart}`, {
    value: assinaturaDireita,
    font: FOOTER_FONT,
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
  });
  row = footerStart + 2;

  worksheet.mergeCells(`A${row}:H${row}`);
  boxedCell(worksheet, `A${row}`, { value: model.identification.rodapeInstitucional.razaoSocialCompleta, font: FOOTER_BOLD_FONT, alignment: { horizontal: "center" } });
  row += 1;

  worksheet.mergeCells(`A${row}:H${row}`);
  boxedCell(worksheet, `A${row}`, { value: model.identification.rodapeInstitucional.endereco, font: FOOTER_FONT, alignment: { horizontal: "center" } });
}

function buildRdoSheet(workbook, model, activitiesPage, { pageIndex, totalPages, logoBuffer }) {
  const sheetName = pageIndex === 0 ? "RDO" : `RDO_CONT_${pageIndex + 1}`;
  const worksheet = workbook.addWorksheet(sheetName);
  RDO_COLUMN_WIDTHS.forEach((width, i) => {
    worksheet.getColumn(i + 1).width = width;
  });
  applyPageSetup(worksheet);

  const afterHeaderRow = buildRdoHeader(workbook, worksheet, model, { logoBuffer, pageIndex, totalPages });
  const afterActivitiesRow = buildRdoActivities(worksheet, activitiesPage, afterHeaderRow);
  if (pageIndex === totalPages - 1) {
    buildRdoFooter(worksheet, model, afterActivitiesRow);
  }
  return worksheet;
}

/** RDF v2 — 2 fotos GRANDES lado a lado por página (Seção "novo oficial"), nunca a grade pequena do v1. */
function buildRdfSheet(workbook, model, photosPage, { pageIndex, totalPages, logoBuffer, photoBuffers }) {
  const sheetName = pageIndex === 0 ? "RDF" : `RDF_${pageIndex + 1}`;
  const worksheet = workbook.addWorksheet(sheetName);
  RDF_COLUMN_WIDTHS.forEach((width, i) => {
    worksheet.getColumn(i + 1).width = width;
  });
  applyPageSetup(worksheet);

  worksheet.mergeCells("A1:A20");
  boxedCell(worksheet, "A1", { border: ALL_BORDERS });
  worksheet.mergeCells("E1:E20");
  boxedCell(worksheet, "E1", { border: ALL_BORDERS });

  worksheet.mergeCells("B1:D1");
  boxedCell(worksheet, "B1", {
    value: totalPages > 1 ? `${model.identification.tituloRdf} — página ${pageIndex + 1} de ${totalPages}` : model.identification.tituloRdf,
    font: RDF_TITLE_FONT,
    alignment: { horizontal: "center", vertical: "middle" },
  });
  addLogo(workbook, worksheet, logoBuffer, { col: 1.2, row: 0.1, widthPx: 70, heightPx: 30 });

  worksheet.mergeCells("B2:D2");
  boxedCell(worksheet, "B2", { value: FIXED_TEXT.registroFotograficoTitulo, font: RDF_SUBTITLE_FONT, alignment: { horizontal: "center" }, fill: HEADER_FILL });

  worksheet.mergeCells("B3:D3");
  boxedCell(worksheet, "B3", { font: VALUE_FONT });

  worksheet.mergeCells("C4:C20");
  boxedCell(worksheet, "C4", { border: ALL_BORDERS });

  const [fotoEsquerda, fotoDireita] = photosPage;
  [
    { col: "B", photo: fotoEsquerda },
    { col: "D", photo: fotoDireita },
  ].forEach(({ col, photo }) => {
    worksheet.mergeCells(`${col}4:${col}17`);
    const frameCell = boxedCell(worksheet, `${col}4`, { border: ALL_BORDERS });

    if (photo && photo.disponivel) {
      const buffer = photoBuffers.get(photo.driveFileId);
      if (buffer) {
        const imageId = workbook.addImage({ buffer, extension: "jpeg" });
        worksheet.addImage(imageId, {
          tl: { col: col === "B" ? 1.1 : 3.1, row: 3.1 },
          ext: { width: 300, height: 260 },
        });
      }
    } else if (photo) {
      frameCell.value = "Imagem indisponível";
      frameCell.alignment = { horizontal: "center", vertical: "middle" };
      frameCell.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF888888" } };
    }

    worksheet.mergeCells(`${col}18:${col}20`);
    boxedCell(worksheet, `${col}18`, {
      value: photo ? `${photo.numero}. ${photo.legenda}` : "",
      font: CAPTION_FONT,
      alignment: { horizontal: "center", vertical: "top", wrapText: true },
    });
  });

  return worksheet;
}

/**
 * `photoBuffers`: Map<driveFileId, Buffer> — só precisa conter entradas para
 * fotos `disponivel: true`. Retorna o workbook (ExcelJS) — quem chama decide
 * `.xlsx.writeBuffer()` (nunca grava em disco aqui).
 */
function buildDiarioObraExcelWorkbookV2(model, { logoBuffer, photoBuffers = new Map() } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FrotaMax — Automações";
  workbook.created = new Date();

  const activityPages = paginateActivitiesByHeight(model.activities, ACTIVITIES_AREA_BUDGET_POINTS);
  activityPages.forEach((page, pageIndex) => {
    buildRdoSheet(workbook, model, page, { pageIndex, totalPages: activityPages.length, logoBuffer });
  });

  const photoPages = paginateByCount(model.photos, PHOTOS_PER_PAGE);
  photoPages.forEach((page, pageIndex) => {
    buildRdfSheet(workbook, model, page, { pageIndex, totalPages: photoPages.length, logoBuffer, photoBuffers });
  });

  return workbook;
}

module.exports = {
  buildDiarioObraExcelWorkbookV2,
  paginateByCount,
  paginateActivitiesByHeight,
  estimateWrappedLineCount,
  computeActivityRowHeight,
  dataReferenciaToExcelDate,
};
