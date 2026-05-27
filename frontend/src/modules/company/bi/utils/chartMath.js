/**
 * Funções puras para escalas e janelas de gráficos (testáveis, sem DOM).
 */

export function maxWithFloor(values, floor = 0) {
  const nums = (values || []).map((v) => Number(v)).filter((n) => Number.isFinite(n));
  const m = nums.length ? Math.max(...nums) : 0;
  return Math.max(floor, m);
}

/** Escala Y linear com margem superior (~10%). */
export function yScaleRange(maxY) {
  const m = Math.max(0, Number(maxY) || 0);
  const top = m <= 0 ? 1 : m * 1.12;
  return { min: 0, max: top };
}

export function projectLinePoints(values, width, height, pad = { l: 36, r: 12, t: 12, b: 28 }) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const n = values.length;
  if (n === 0) return { points: [], yRange: yScaleRange(0), innerW, innerH, pad };
  const maxY = maxWithFloor(values, 0);
  const yRange = yScaleRange(maxY);
  const span = yRange.max - yRange.min || 1;
  const points = values.map((yRaw, i) => {
    const y = Number(yRaw);
    const yn = Number.isFinite(y) ? y : 0;
    const x = pad.l + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const py = pad.t + innerH - ((yn - yRange.min) / span) * innerH;
    return { x, y: py, raw: yn, index: i };
  });
  return { points, yRange, innerW, innerH, pad };
}

export function buildSvgPathLine(points) {
  if (!points.length) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}

export function buildSvgPathArea(points, baselineY) {
  if (!points.length) return "";
  const line = buildSvgPathLine(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

export function sliceSeries(series, startIdx, endIdx) {
  const s = Array.isArray(series) ? series : [];
  const n = s.length;
  if (!n) return [];
  let a = Math.max(0, Math.min(n - 1, Math.floor(startIdx)));
  let b = Math.max(0, Math.min(n - 1, Math.floor(endIdx)));
  if (a > b) [a, b] = [b, a];
  return s.slice(a, b + 1);
}

export function growthPercent(current, previous) {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return ((c - p) / p) * 100;
}
