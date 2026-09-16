"use strict";

/**
 * Extrator MÍNIMO de texto por página de um PDF gerado pelo pdfkit — usado
 * SOMENTE em testes (Seção "teste de regressão de paginação do RDO"). O
 * projeto não tem nenhuma biblioteca de leitura/parse de PDF (só `pdfkit`/
 * `pdfmake`, que são geração, não leitura) — em vez de adicionar uma nova
 * dependência só para testes, este helper usa exclusivamente módulos
 * nativos do Node (`zlib`) para decodificar o próprio formato PDF que o
 * builder gera.
 *
 * Descoberto por inspeção direta do stream real gerado (nunca assumido):
 * o pdfkit mostra texto via os operadores `Tj`/`TJ` usando STRINGS
 * HEXADECIMAIS (`<4449c152...>`), não literais entre parênteses — cada par
 * de hex é 1 byte Latin-1/WinAnsi (a mesma codificação da fonte padrão do
 * pdfkit), então acentos (Á, ã, ç...) decodificam corretamente via Latin-1
 * puro, sem precisar de tabela de código customizada.
 *
 * Suporta só o que os builders deste módulo realmente produzem (texto via
 * Tj/TJ, streams FlateDecode, árvore de páginas via /Kids) — não é um
 * parser de PDF genérico.
 */

const zlib = require("zlib");

function parseObjects(buffer) {
  const latin1 = buffer.toString("latin1");
  const objects = new Map();
  const re = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
  let m;
  while ((m = re.exec(latin1))) {
    objects.set(Number(m[1]), { body: m[2], start: m.index, end: m.index + m[0].length });
  }
  return { latin1, objects };
}

function getDict(body) {
  const m = body.match(/<<([\s\S]*)>>/);
  return m ? m[1] : "";
}

function refNums(str) {
  const nums = [];
  const re = /(\d+)\s+0\s+R/g;
  let m;
  while ((m = re.exec(str))) nums.push(Number(m[1]));
  return nums;
}

function extractStreamBytes(buffer, latin1, objEntry) {
  const streamIdx = latin1.indexOf("stream", objEntry.start);
  if (streamIdx === -1 || streamIdx > objEntry.end) return null;
  let dataStart = streamIdx + "stream".length;
  if (latin1[dataStart] === "\r") dataStart += 1;
  if (latin1[dataStart] === "\n") dataStart += 1;
  const endIdx = latin1.indexOf("endstream", dataStart);
  const raw = buffer.slice(dataStart, endIdx);
  const dict = getDict(objEntry.body);
  if (/\/FlateDecode/.test(dict)) {
    try {
      return zlib.inflateSync(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function unescapePdfLiteralString(s) {
  return s.replace(/\\(\d{3}|.)/g, (full, esc) => {
    if (/^\d{3}$/.test(esc)) return String.fromCharCode(parseInt(esc, 8));
    if (esc === "n") return "\n";
    if (esc === "r") return "\r";
    if (esc === "t") return "\t";
    return esc;
  });
}

function hexToLatin1(hex) {
  const clean = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

function extractTextFromContentStream(bytes) {
  const s = bytes.toString("latin1");
  let out = "";
  const re = /<([0-9A-Fa-f\s]+)>\s*(Tj)?|\(((?:\\.|[^()\\])*)\)\s*(Tj)?|\[((?:<[0-9A-Fa-f\s]+>|\((?:\\.|[^()\\])*\)|[^\]])*)\]\s*TJ/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) {
      out += hexToLatin1(m[1]) + " ";
    } else if (m[3] !== undefined) {
      out += unescapePdfLiteralString(m[3]) + " ";
    } else if (m[5] !== undefined) {
      const inner = m[5];
      const re2 = /<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^()\\])*)\)/g;
      let m2;
      while ((m2 = re2.exec(inner))) {
        out += m2[1] !== undefined ? hexToLatin1(m2[1]) : unescapePdfLiteralString(m2[2]);
      }
      out += " ";
    }
  }
  return out;
}

/**
 * Retorna um array de strings, uma por página do PDF, na ORDEM de leitura
 * (segue `/Kids` da árvore `/Pages`, nunca a ordem dos números de objeto,
 * que pdfkit não garante ser sequencial por página).
 */
function extractPdfPageTexts(buffer) {
  const { latin1, objects } = parseObjects(buffer);

  let rootPagesNum = null;
  for (const entry of objects.values()) {
    if (/\/Type\s*\/Catalog/.test(entry.body)) {
      const m = entry.body.match(/\/Pages\s+(\d+)\s+0\s+R/);
      if (m) rootPagesNum = Number(m[1]);
    }
  }
  if (rootPagesNum === null) throw new Error("PDF sem /Type /Catalog com /Pages — não é um PDF gerado por pdfkit reconhecível.");

  const pageNums = [];
  function collectPageNums(pagesNum) {
    const entry = objects.get(pagesNum);
    const kidsMatch = entry.body.match(/\/Kids\s*\[([^\]]*)\]/);
    if (!kidsMatch) return;
    for (const kid of refNums(kidsMatch[1])) {
      const kidEntry = objects.get(kid);
      if (/\/Type\s*\/Pages/.test(kidEntry.body)) {
        collectPageNums(kid);
      } else {
        pageNums.push(kid);
      }
    }
  }
  collectPageNums(rootPagesNum);

  return pageNums.map((pageNum) => {
    const entry = objects.get(pageNum);
    const singleMatch = entry.body.match(/\/Contents\s+(\d+)\s+0\s+R/);
    const arrayMatch = entry.body.match(/\/Contents\s*\[([^\]]*)\]/);
    const contentNums = arrayMatch ? refNums(arrayMatch[1]) : singleMatch ? [Number(singleMatch[1])] : [];

    let text = "";
    for (const cNum of contentNums) {
      const cEntry = objects.get(cNum);
      if (!cEntry) continue;
      const streamBytes = extractStreamBytes(buffer, latin1, cEntry);
      if (streamBytes) text += extractTextFromContentStream(streamBytes);
    }
    return text;
  });
}

module.exports = { extractPdfPageTexts };
