"use strict";

/**
 * Construção do workbook Excel do Diário de Obra (Bloco 7B) — SEMPRE um
 * workbook NOVO via ExcelJS (Seção 2): nunca `workbook.xlsx.readFile` sobre
 * o arquivo de referência auditado no Bloco 7A (que usa o recurso
 * richValue/_localImage incompatível com ExcelJS — ver relatório do Bloco
 * 7A). Fotos usam `worksheet.addImage` (drawing clássico), nunca "imagem na
 * célula" (Seção 24).
 *
 * Consome exatamente o `document model` de `diarioObraDocumentModel.js` —
 * nenhuma regra de negócio (ordenação, legenda, política de ausência) é
 * decidida aqui, só layout/formatação (Seção 33).
 */

const ExcelJS = require("exceljs");
const {
  FIXED_TEXT,
  RDO_COLUMN_WIDTHS,
  RDF_COLUMN_WIDTHS,
  PAGE_SETUP,
  ACTIVITIES_PER_PAGE,
  PHOTOS_PER_PAGE,
} = require("./diarioObraLayoutConstants");

const HEADER_FONT = { bold: true, size: 14 };
const LABEL_FONT = { bold: true, size: 9 };
const VALUE_FONT = { size: 10 };
const THIN_BORDER = { style: "thin", color: { argb: "FF999999" } };
const ALL_BORDERS = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };

function paginate(items, perPage) {
  if (!items.length) return [[]];
  const pages = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

function dataReferenciaToExcelDate(dataReferencia) {
  const [ano, mes, dia] = dataReferencia.split("-").map(Number);
  // Date.UTC evita qualquer ambiguidade de timezone do processo — mesma
  // disciplina já usada desde o Bloco 3/4 (ver folderNaming.js).
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
  worksheet.addImage(imageId, {
    tl: { col, row },
    ext: { width: widthPx, height: heightPx },
  });
}

function buildRdoHeader(workbook, worksheet, model, { logoBuffer, pageIndex, totalPages }) {
  const isContinuation = pageIndex > 0;
  worksheet.mergeCells("A1:B3");
  addLogo(workbook, worksheet, logoBuffer, { col: 0.1, row: 0.1 });

  worksheet.mergeCells("C1:H2");
  const tituloCell = worksheet.getCell("C1");
  tituloCell.value = isContinuation ? `${FIXED_TEXT.titulo} ${FIXED_TEXT.continuacaoSufixo}` : FIXED_TEXT.titulo;
  tituloCell.font = HEADER_FONT;
  tituloCell.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.mergeCells("C3:H3");
  const subtituloCell = worksheet.getCell("C3");
  subtituloCell.value = totalPages > 1 ? `${FIXED_TEXT.subtitulo} — página ${pageIndex + 1} de ${totalPages}` : FIXED_TEXT.subtitulo;
  subtituloCell.font = { italic: true, size: 10 };
  subtituloCell.alignment = { horizontal: "center" };

  let row = 4;
  const setLabelValue = (labelCol, label, valueColStart, valueColEnd, value, valueRow = row) => {
    const labelCell = worksheet.getCell(`${labelCol}${valueRow}`);
    labelCell.value = label;
    labelCell.font = LABEL_FONT;
    labelCell.border = ALL_BORDERS;
    worksheet.mergeCells(`${valueColStart}${valueRow}:${valueColEnd}${valueRow}`);
    const valueCell = worksheet.getCell(`${valueColStart}${valueRow}`);
    valueCell.value = value ?? "";
    valueCell.font = VALUE_FONT;
    valueCell.border = ALL_BORDERS;
    return valueCell;
  };

  setLabelValue("A", FIXED_TEXT.rotuloObra, "B", "D", model.identification.projetoNome, row);
  const refCell = worksheet.getCell(`E${row}`);
  refCell.value = FIXED_TEXT.rotuloRefContratual;
  refCell.font = LABEL_FONT;
  refCell.border = ALL_BORDERS;
  worksheet.mergeCells(`F${row}:H${row}`);
  const refValueCell = worksheet.getCell(`F${row}`);
  refValueCell.value = model.identification.referenciaContratual ?? "";
  refValueCell.font = VALUE_FONT;
  refValueCell.border = ALL_BORDERS;

  row += 1;
  setLabelValue("A", FIXED_TEXT.rotuloLocal, "B", "D", model.identification.local, row);
  const dataLabelCell = worksheet.getCell(`E${row}`);
  dataLabelCell.value = FIXED_TEXT.rotuloData;
  dataLabelCell.font = LABEL_FONT;
  dataLabelCell.border = ALL_BORDERS;
  worksheet.mergeCells(`F${row}:H${row}`);
  const dataValueCell = worksheet.getCell(`F${row}`);
  dataValueCell.value = dataReferenciaToExcelDate(model.identification.dataReferencia);
  dataValueCell.numFmt = "dd/mm/yyyy";
  dataValueCell.font = VALUE_FONT;
  dataValueCell.border = ALL_BORDERS;
  dataValueCell.alignment = { horizontal: "center" };

  row += 2;
  if (!isContinuation) {
    worksheet.mergeCells(`A${row}:D${row}`);
    const registroCell = worksheet.getCell(`A${row}`);
    registroCell.value = FIXED_TEXT.rotuloRegistroTempo;
    registroCell.font = LABEL_FONT;
    worksheet.mergeCells(`E${row}:H${row}`);
    const expedienteLabelCell = worksheet.getCell(`E${row}`);
    expedienteLabelCell.value = FIXED_TEXT.rotuloExpediente;
    expedienteLabelCell.font = LABEL_FONT;

    row += 1;
    ["A", "B", "C", "D"].forEach((col, i) => {
      const cell = worksheet.getCell(`${col}${row}`);
      cell.value = i === 0 ? FIXED_TEXT.rotuloPeriodo : [FIXED_TEXT.periodoManha, FIXED_TEXT.periodoTarde, FIXED_TEXT.periodoNoite][i - 1];
      cell.font = LABEL_FONT;
      cell.border = ALL_BORDERS;
    });
    worksheet.mergeCells(`E${row}:H${row + 1}`);
    const expedienteValueCell = worksheet.getCell(`E${row}`);
    expedienteValueCell.value = `Início às ${model.identification.expedienteInicio}; final às ${model.identification.expedienteFim}`;
    expedienteValueCell.font = VALUE_FONT;
    expedienteValueCell.alignment = { wrapText: true, vertical: "middle" };

    row += 1;
    // Marcações de período (Seção 12) — SEMPRE vazias, nunca inferidas.
    ["A", "B", "C", "D"].forEach((col) => {
      const cell = worksheet.getCell(`${col}${row}`);
      cell.border = ALL_BORDERS;
    });
    row += 2;
  } else {
    row += 1;
  }

  return row;
}

function buildRdoActivities(worksheet, activitiesPage, startRow) {
  worksheet.mergeCells(`A${startRow}:H${startRow}`);
  const tituloCell = worksheet.getCell(`A${startRow}`);
  tituloCell.value = FIXED_TEXT.atividadesTitulo;
  tituloCell.font = LABEL_FONT;
  let row = startRow + 1;

  for (const item of activitiesPage) {
    worksheet.mergeCells(`A${row}:H${row}`);
    const cell = worksheet.getCell(`A${row}`);
    cell.value = `${item.numero}. ${item.texto}`;
    cell.font = VALUE_FONT;
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.border = ALL_BORDERS;
    worksheet.getRow(row).height = 24;
    row += 1;
  }
  return row;
}

function buildRdoSignature(worksheet, model, startRow) {
  let row = startRow + 1;
  worksheet.mergeCells(`A${row}:D${row}`);
  worksheet.getCell(`A${row}`).value = model.signature.responsavelTecnico
    ? `Responsável técnico: ${model.signature.responsavelTecnico}`
    : "";
  worksheet.getCell(`A${row}`).font = VALUE_FONT;

  row += 1;
  worksheet.getCell(`A${row}`).value = model.identification.clienteRazaoSocial ?? "";
  worksheet.getCell(`A${row}`).font = { ...VALUE_FONT, bold: true };
  row += 1;
  worksheet.getCell(`A${row}`).value = model.identification.clienteEndereco ?? "";
  worksheet.getCell(`A${row}`).font = VALUE_FONT;
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
    buildRdoSignature(worksheet, model, afterActivitiesRow);
  }
  return worksheet;
}

function buildRdfSheet(workbook, model, photosPage, { pageIndex, totalPages, logoBuffer, photoBuffers }) {
  const sheetName = pageIndex === 0 ? "RDF" : `RDF_${pageIndex + 1}`;
  const worksheet = workbook.addWorksheet(sheetName);
  RDF_COLUMN_WIDTHS.forEach((width, i) => {
    worksheet.getColumn(i + 1).width = width;
  });
  applyPageSetup(worksheet);

  worksheet.mergeCells("B1:D1");
  addLogo(workbook, worksheet, logoBuffer, { col: 1.2, row: 0.1, widthPx: 70, heightPx: 30 });
  const tituloCell = worksheet.getCell("B1");
  tituloCell.value =
    totalPages > 1
      ? `${FIXED_TEXT.registroFotograficoTitulo} — página ${pageIndex + 1} de ${totalPages}`
      : FIXED_TEXT.registroFotograficoTitulo;
  tituloCell.font = HEADER_FONT;
  tituloCell.alignment = { horizontal: "center" };

  let row = 3;
  const slotsPerRow = 2;
  for (let i = 0; i < photosPage.length; i += slotsPerRow) {
    const pair = [photosPage[i], photosPage[i + 1]];
    const imageStartRow = row;
    const imageRowSpan = 14;
    ["B", "D"].forEach((col, slotIndex) => {
      const photo = pair[slotIndex];
      if (!photo) return;
      worksheet.mergeCells(`${col}${imageStartRow}:${col}${imageStartRow + imageRowSpan - 1}`);
      const frameCell = worksheet.getCell(`${col}${imageStartRow}`);
      frameCell.border = ALL_BORDERS;

      if (photo.disponivel) {
        const buffer = photoBuffers.get(photo.driveFileId);
        if (buffer) {
          const imageId = workbook.addImage({ buffer, extension: "jpeg" });
          worksheet.addImage(imageId, {
            tl: { col: col === "B" ? 1.1 : 3.1, row: imageStartRow - 1 + 0.1 },
            ext: { width: 260, height: 180 },
          });
        }
      } else {
        frameCell.value = "Imagem indisponível";
        frameCell.alignment = { horizontal: "center", vertical: "middle" };
        frameCell.font = { italic: true, color: { argb: "FF888888" } };
      }
    });

    const captionRow = imageStartRow + imageRowSpan;
    ["B", "D"].forEach((col, slotIndex) => {
      const photo = pair[slotIndex];
      const cell = worksheet.getCell(`${col}${captionRow}`);
      cell.value = photo ? `${photo.numero}. ${photo.legenda}` : "";
      cell.font = { size: 8, italic: true };
      cell.alignment = { wrapText: true };
      cell.border = ALL_BORDERS;
    });
    worksheet.getRow(captionRow).height = 30;

    row = captionRow + 3;
  }

  return worksheet;
}

/**
 * `photoBuffers`: Map<driveFileId, Buffer> — só precisa conter entradas para
 * fotos `disponivel: true`; nunca é consultado para fotos indisponíveis.
 * Retorna o workbook (ExcelJS) — quem chama decide `.xlsx.writeBuffer()`.
 */
function buildDiarioObraExcelWorkbook(model, { logoBuffer, photoBuffers = new Map() } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FrotaMax — Automações";
  workbook.created = new Date();

  const activityPages = paginate(model.activities, ACTIVITIES_PER_PAGE);
  activityPages.forEach((page, pageIndex) => {
    buildRdoSheet(workbook, model, page, { pageIndex, totalPages: activityPages.length, logoBuffer });
  });

  const photoPages = paginate(model.photos, PHOTOS_PER_PAGE);
  photoPages.forEach((page, pageIndex) => {
    buildRdfSheet(workbook, model, page, { pageIndex, totalPages: photoPages.length, logoBuffer, photoBuffers });
  });

  return workbook;
}

module.exports = { buildDiarioObraExcelWorkbook, paginate, dataReferenciaToExcelDate };
