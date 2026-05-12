/**
 * Interpreta decimal em formato brasileiro (1.234,56) ou simples (1234.56 / 1234,56).
 * @param {unknown} raw
 * @returns {number} NaN se inválido ou vazio
 */
export function parseDecimalInput(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const normalized =
    lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}
