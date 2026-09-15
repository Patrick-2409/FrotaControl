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
  RDO_PAGE_SETUP,
  RDF_PAGE_SETUP,
  PHOTOS_PER_PAGE,
  ACTIVITIES_PER_PAGE,
  RDF_FIRST_BLOCK_HEADER_ROWS,
  RDF_BLOCK_PHOTO_ROWS,
  RDF_BLOCK_CAPTION_ROWS,
  ACTIVITY_CHARS_PER_LINE,
  ACTIVITY_LINE_HEIGHT_POINTS,
  ACTIVITY_ROW_VERTICAL_PADDING_POINTS,
  ACTIVITY_MIN_ROW_HEIGHT_POINTS,
  RDO_FOOTER_SPACER_HEIGHTS_POINTS,
  RDO_SIGNATURE_BLOCK_ROW_HEIGHTS_POINTS,
  RDO_LOGO_ANCHOR,
  RDF_LOGO_ANCHOR,
  RDO_SIGNATURE_MAX_HEIGHT_POINTS,
  RDO_SIGNATURE_ASPECT_RATIO,
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

/** Marca ("X") da condição de clima de um período, ou vazio quando não é essa condição — nunca inferida, só reflete `model.clima` (Seção "clima"). */
function climaMark(condicaoDoPeriodo, condicaoDaLinha) {
  return condicaoDoPeriodo === condicaoDaLinha ? "X" : "";
}

function dataReferenciaToExcelDate(dataReferencia) {
  const [ano, mes, dia] = dataReferencia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** RDO e RDF têm page setups PRÓPRIOS re-auditados (nunca a mesma constante — Seção "page setup"). */
function applyPageSetup(worksheet, setup) {
  worksheet.pageSetup = {
    paperSize: setup.paperSize,
    orientation: setup.orientation,
    fitToPage: setup.fitToPage,
    ...(setup.fitToPage
      ? { fitToWidth: setup.fitToWidth, fitToHeight: setup.fitToHeight }
      : { scale: setup.scale }),
    ...(setup.horizontalCentered ? { horizontalCentered: setup.horizontalCentered } : {}),
    margins: setup.margins,
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
  addLogo(workbook, worksheet, logoBuffer, {
    col: RDO_LOGO_ANCHOR.col,
    row: RDO_LOGO_ANCHOR.row,
    widthPx: RDO_LOGO_ANCHOR.widthPx,
    heightPx: RDO_LOGO_ANCHOR.heightPx,
  });

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

  if (isContinuation) {
    worksheet.mergeCells("A14:H14");
    boxedCell(worksheet, "A14", { font: VALUE_FONT, alignment: { horizontal: "center" } });
    return 15;
  }

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

  // Marcações de clima (Seção "clima") — refletem exatamente
  // `model.clima.manha/tarde/noite`, nunca inferidas aqui: um "X" na célula
  // cujo período+condição bate com o valor resolvido pelo model, e nada nas
  // demais. NAO_INFORMADO nunca marca nenhuma das duas linhas.
  const clima = model.clima || {};
  boxedCell(worksheet, "A9", { value: FIXED_TEXT.climaLabelBom, font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "B9", { value: climaMark(clima.manha, "BOM"), font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "C9", { value: climaMark(clima.tarde, "BOM"), font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "D9", { value: climaMark(clima.noite, "BOM"), font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "A10", { value: FIXED_TEXT.climaLabelChuvas, font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "B10", { value: climaMark(clima.manha, "CHUVAS"), font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "C10", { value: climaMark(clima.tarde, "CHUVAS"), font: LABEL_FONT, alignment: { horizontal: "center" } });
  boxedCell(worksheet, "D10", { value: climaMark(clima.noite, "CHUVAS"), font: LABEL_FONT, alignment: { horizontal: "center" } });

  worksheet.mergeCells("A11:H12");
  boxedCell(worksheet, "A11", { value: FIXED_TEXT.diarioDivisor, font: DIVISOR_FONT, alignment: { horizontal: "center", vertical: "middle" } });

  worksheet.mergeCells("A13:H13");
  boxedCell(worksheet, "A13", { value: FIXED_TEXT.atividadesTitulo, font: DIVISOR_FONT, alignment: { horizontal: "center" }, border: TOP_LEFT_RIGHT_BORDERS });

  // Linha espaçadora em branco (auditada: linha 14, mesmo padrão da linha 6)
  // entre o título de atividades e a grade — nunca omitida, mesmo sem
  // atividades (Seção "preservar geometria mesmo com poucas atividades").
  worksheet.mergeCells("A14:H14");
  boxedCell(worksheet, "A14", { font: VALUE_FONT, alignment: { horizontal: "center" } });

  return 15;
}

/**
 * Grade de atividades de TAMANHO FIXO (Seção "preservar o formulário
 * oficial") — desenha sempre `totalSlots` linhas (ACTIVITIES_PER_PAGE),
 * preenchidas ou em branco: poucas atividades NUNCA encolhem o formulário
 * nem sobem o rodapé, porque o retorno desta função é sempre
 * `startRow + totalSlots`, independente de `activitiesPage.length`. Linhas
 * em branco recebem a MESMA borda/moldura das preenchidas (mantém a grade
 * visualmente intacta) com a altura "de uma linha" (computeActivityRowHeight
 * de texto vazio), igual ao comportamento auditado do arquivo oficial.
 */
function buildRdoActivities(worksheet, activitiesPage, startRow, totalSlots) {
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
  const lastRow = startRow + totalSlots - 1;
  for (; row <= lastRow; row += 1) {
    worksheet.mergeCells(`A${row}:H${row}`);
    boxedCell(worksheet, `A${row}`, { font: ACTIVITY_FONT, alignment: { horizontal: "left", vertical: "top", wrapText: true } });
    worksheet.getRow(row).height = computeActivityRowHeight("");
  }
  return row;
}

/**
 * Rodapé institucional (linhas 46-51 do oficial, re-auditado byte-a-byte —
 * validação visual) — SEMPRE dados já resolvidos pelo model (nunca constante
 * de cliente aqui). Geometria EXATA da referência: dois espaçadores em
 * branco (46 e 47, com a MESMA moldura das linhas de atividade — nunca só
 * um), bloco de assinatura mesclado por DUAS linhas (48-49, alturas 25.2 e
 * 12 respectivamente), razão social (50) e endereço (51) — termina SEMPRE em
 * 51, nunca 50 (Seção "RDO deve terminar na mesma geometria").
 *
 * A assinatura gráfica (Seção "assinatura digital") fica CONFINADA à
 * primeira linha do bloco (48) — nunca se estende para a segunda (49), onde
 * o nome do responsável técnico fica alinhado embaixo (`vertical: "bottom"`,
 * igual ao arquivo oficial): garante ZERO sobreposição entre imagem e texto,
 * independente de quantas atividades o dia teve (Seção "assinatura sobre o
 * nome" — nunca reproduz a posição literal do arquivo de amostra, que foi
 * arrastada manualmente pelo usuário para aquele dia específico). Só
 * desenhada quando ambos (buffer do asset + nome configurado) existem —
 * nunca uma assinatura "órfã" sem o nome correspondente.
 */
function buildRdoFooter(workbook, worksheet, model, startRow, { signatureBuffer } = {}) {
  let row = startRow;
  for (const spacerHeight of RDO_FOOTER_SPACER_HEIGHTS_POINTS) {
    worksheet.mergeCells(`A${row}:H${row}`);
    boxedCell(worksheet, `A${row}`, { font: VALUE_FONT });
    worksheet.getRow(row).height = spacerHeight;
    row += 1;
  }

  const footerStart = row;
  const [signatureRowHeight, nameRowHeight] = RDO_SIGNATURE_BLOCK_ROW_HEIGHTS_POINTS;
  worksheet.getRow(footerStart).height = signatureRowHeight;
  worksheet.getRow(footerStart + 1).height = nameRowHeight;

  worksheet.mergeCells(`A${footerStart}:D${footerStart + 1}`);
  boxedCell(worksheet, `A${footerStart}`, {
    value: model.identification.rodapeInstitucional.assinanteEsquerda,
    font: FOOTER_FONT,
    alignment: { horizontal: "center", vertical: "middle" },
  });
  worksheet.mergeCells(`E${footerStart}:H${footerStart + 1}`);
  const assinaturaDireita = [model.signature.responsavelTecnico].filter(Boolean).join("\n");
  boxedCell(worksheet, `E${footerStart}`, {
    value: assinaturaDireita,
    font: FOOTER_FONT,
    alignment: { horizontal: "center", vertical: "bottom", wrapText: true },
  });
  if (signatureBuffer && model.signature.responsavelTecnico) {
    const signatureHeightPx = RDO_SIGNATURE_MAX_HEIGHT_POINTS * (96 / 72);
    const signatureWidthPx = signatureHeightPx * RDO_SIGNATURE_ASPECT_RATIO;
    const imageId = workbook.addImage({ buffer: signatureBuffer, extension: "png" });
    worksheet.addImage(imageId, {
      tl: { col: 4.6, row: footerStart - 1 },
      ext: { width: signatureWidthPx, height: signatureHeightPx },
    });
  }
  row = footerStart + 2;

  worksheet.mergeCells(`A${row}:H${row}`);
  boxedCell(worksheet, `A${row}`, { value: model.identification.rodapeInstitucional.razaoSocialCompleta, font: FOOTER_BOLD_FONT, alignment: { horizontal: "center" } });
  row += 1;

  worksheet.mergeCells(`A${row}:H${row}`);
  boxedCell(worksheet, `A${row}`, { value: model.identification.rodapeInstitucional.endereco, font: FOOTER_FONT, alignment: { horizontal: "center" } });
}

function buildRdoSheet(workbook, model, activitiesPage, { pageIndex, totalPages, logoBuffer, signatureBuffer }) {
  const sheetName = pageIndex === 0 ? "RDO" : `RDO_CONT_${pageIndex + 1}`;
  const worksheet = workbook.addWorksheet(sheetName);
  RDO_COLUMN_WIDTHS.forEach((width, i) => {
    worksheet.getColumn(i + 1).width = width;
  });
  applyPageSetup(worksheet, RDO_PAGE_SETUP);

  const afterHeaderRow = buildRdoHeader(workbook, worksheet, model, { logoBuffer, pageIndex, totalPages });
  const afterActivitiesRow = buildRdoActivities(worksheet, activitiesPage, afterHeaderRow, ACTIVITIES_PER_PAGE);
  if (pageIndex === totalPages - 1) {
    buildRdoFooter(workbook, worksheet, model, afterActivitiesRow, { signatureBuffer });
  }
  return worksheet;
}

/**
 * Linhas do bloco N (0-indexado) da aba RDF (Seção "proibido criar RDF_2,
 * RDF_3") — re-auditado diretamente contra dois arquivos de referência
 * independentes: o bloco 0 inclui o cabeçalho (3 linhas) + moldura (14) +
 * legenda (3) = 20 linhas; cada bloco seguinte NUNCA repete o cabeçalho, só
 * moldura+legenda = 17 linhas, empilhado logo abaixo do bloco anterior.
 */
function computeRdfBlockRows(pageIndex) {
  if (pageIndex === 0) {
    const photoTop = 1 + RDF_FIRST_BLOCK_HEADER_ROWS;
    const photoBottom = photoTop + RDF_BLOCK_PHOTO_ROWS - 1;
    const captionBottom = photoBottom + RDF_BLOCK_CAPTION_ROWS;
    return { top: 1, photoTop, photoBottom, captionTop: photoBottom + 1, captionBottom, bottom: captionBottom };
  }
  const blockHeight = RDF_BLOCK_PHOTO_ROWS + RDF_BLOCK_CAPTION_ROWS;
  const firstBlockBottom = RDF_FIRST_BLOCK_HEADER_ROWS + blockHeight;
  const top = firstBlockBottom + 1 + (pageIndex - 1) * blockHeight;
  const photoBottom = top + RDF_BLOCK_PHOTO_ROWS - 1;
  const captionBottom = photoBottom + RDF_BLOCK_CAPTION_ROWS;
  return { top, photoTop: top, photoBottom, captionTop: photoBottom + 1, captionBottom, bottom: captionBottom };
}

/** Desenha UM bloco de 2 fotos grandes lado a lado dentro da aba RDF já existente, na faixa de linhas calculada por `computeRdfBlockRows`. */
function buildRdfBlock(workbook, worksheet, model, photosPage, { pageIndex, logoBuffer, photoBuffers }) {
  const rows = computeRdfBlockRows(pageIndex);

  worksheet.mergeCells(`A${rows.top}:A${rows.bottom}`);
  boxedCell(worksheet, `A${rows.top}`, { border: ALL_BORDERS });
  worksheet.mergeCells(`E${rows.top}:E${rows.bottom}`);
  boxedCell(worksheet, `E${rows.top}`, { border: ALL_BORDERS });
  worksheet.mergeCells(`C${rows.photoTop}:C${rows.bottom}`);
  boxedCell(worksheet, `C${rows.photoTop}`, { border: ALL_BORDERS });

  if (pageIndex === 0) {
    worksheet.mergeCells("B1:D1");
    boxedCell(worksheet, "B1", { value: model.identification.tituloRdf, font: RDF_TITLE_FONT, alignment: { horizontal: "center", vertical: "middle" } });
    addLogo(workbook, worksheet, logoBuffer, {
      col: RDF_LOGO_ANCHOR.col,
      row: RDF_LOGO_ANCHOR.row,
      widthPx: RDF_LOGO_ANCHOR.widthPx,
      heightPx: RDF_LOGO_ANCHOR.heightPx,
    });

    worksheet.mergeCells("B2:D2");
    boxedCell(worksheet, "B2", { value: FIXED_TEXT.registroFotograficoTitulo, font: RDF_SUBTITLE_FONT, alignment: { horizontal: "center" }, fill: HEADER_FILL });

    worksheet.mergeCells("B3:D3");
    boxedCell(worksheet, "B3", { font: VALUE_FONT });
  }

  const [fotoEsquerda, fotoDireita] = photosPage;
  [
    { col: "B", photo: fotoEsquerda },
    { col: "D", photo: fotoDireita },
  ].forEach(({ col, photo }) => {
    worksheet.mergeCells(`${col}${rows.photoTop}:${col}${rows.photoBottom}`);
    const frameCell = boxedCell(worksheet, `${col}${rows.photoTop}`, { border: ALL_BORDERS });

    if (photo && photo.disponivel) {
      const buffer = photoBuffers.get(photo.driveFileId);
      if (buffer) {
        const imageId = workbook.addImage({ buffer, extension: "jpeg" });
        worksheet.addImage(imageId, {
          tl: { col: col === "B" ? 1.1 : 3.1, row: rows.photoTop - 1 + 0.1 },
          ext: { width: 300, height: 260 },
        });
      }
    } else if (photo) {
      frameCell.value = "Imagem indisponível";
      frameCell.alignment = { horizontal: "center", vertical: "middle" };
      frameCell.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF888888" } };
    }

    worksheet.mergeCells(`${col}${rows.captionTop}:${col}${rows.captionBottom}`);
    boxedCell(worksheet, `${col}${rows.captionTop}`, {
      value: photo ? `${photo.numero}. ${photo.legenda}` : "",
      font: CAPTION_FONT,
      alignment: { horizontal: "center", vertical: "top", wrapText: true },
    });
  });
}

/**
 * RDF v2 — UMA ÚNICA aba "RDF" (nunca RDF_2/RDF_3/etc., Seção "proibido
 * criar RDF_2, RDF_3"): todos os blocos de 2 fotos grandes lado a lado ficam
 * empilhados verticalmente na MESMA planilha, exatamente como o arquivo
 * oficial (auditado: 8 fotos = 4 blocos, todos dentro de uma aba "RDF").
 * `fitToHeight: 0` (PAGE_SETUP) já faz o Excel/PDF abrirem quantas páginas
 * de IMPRESSÃO forem necessárias sozinho — nunca precisa de quebra de página
 * manual (o arquivo oficial também não tem nenhuma).
 */
function buildRdfWorksheet(workbook, model, photoPages, { logoBuffer, photoBuffers }) {
  const worksheet = workbook.addWorksheet("RDF");
  RDF_COLUMN_WIDTHS.forEach((width, i) => {
    worksheet.getColumn(i + 1).width = width;
  });
  applyPageSetup(worksheet, RDF_PAGE_SETUP);

  photoPages.forEach((page, pageIndex) => {
    buildRdfBlock(workbook, worksheet, model, page, { pageIndex, logoBuffer, photoBuffers });
  });

  return worksheet;
}

/**
 * `photoBuffers`: Map<driveFileId, Buffer> — só precisa conter entradas para
 * fotos `disponivel: true`. `signatureBuffer` é opcional (Seção "assinatura
 * digital") — quando ausente, o rodapé segue só com o nome em texto, como
 * antes. Retorna o workbook (ExcelJS) — quem chama decide
 * `.xlsx.writeBuffer()` (nunca grava em disco aqui).
 */
function buildDiarioObraExcelWorkbookV2(model, { logoBuffer, photoBuffers = new Map(), signatureBuffer } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FrotaMax — Automações";
  workbook.created = new Date();

  const activityPages = paginateByCount(model.activities, ACTIVITIES_PER_PAGE);
  activityPages.forEach((page, pageIndex) => {
    buildRdoSheet(workbook, model, page, { pageIndex, totalPages: activityPages.length, logoBuffer, signatureBuffer });
  });

  const photoPages = paginateByCount(model.photos, PHOTOS_PER_PAGE);
  buildRdfWorksheet(workbook, model, photoPages, { logoBuffer, photoBuffers });

  return workbook;
}

module.exports = {
  buildDiarioObraExcelWorkbookV2,
  paginateByCount,
  computeRdfBlockRows,
  estimateWrappedLineCount,
  computeActivityRowHeight,
  dataReferenciaToExcelDate,
};
