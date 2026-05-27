import { veiculoCombustivelLabel } from "../services/fuelFormatters";

const COMBUSTIVEL_PIE_COLORS = [
  "#3B82F6", // azul
  "#EF4444", // vermelho
  "#F59E0B", // laranja
  "#8B5CF6", // roxo
  "#10B981", // verde
  "#EC4899", // pink
  "#06B6D4", // ciano
  "#F97316", // laranja forte
  "#84CC16", // lima
  "#14B8A6", // teal
  "#EAB308", // amarelo
  "#6366F1", // indigo
];

const hashString = (value) =>
  String(value ?? "")
    .split("")
    .reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);

const resolveSliceColor = (vehicleId, fallbackIndex, usedColors) => {
  if (vehicleId === "__outros__") {
    usedColors.add("#64748B");
    return "#64748B";
  }
  const baseIndex = Math.abs(hashString(vehicleId || fallbackIndex)) % COMBUSTIVEL_PIE_COLORS.length;
  let selected = COMBUSTIVEL_PIE_COLORS[baseIndex];
  if (!usedColors.has(selected)) {
    usedColors.add(selected);
    return selected;
  }
  for (let step = 1; step < COMBUSTIVEL_PIE_COLORS.length; step += 1) {
    const candidate = COMBUSTIVEL_PIE_COLORS[(baseIndex + step) % COMBUSTIVEL_PIE_COLORS.length];
    if (!usedColors.has(candidate)) {
      usedColors.add(candidate);
      return candidate;
    }
  }
  return selected;
};

/** Litros por fatia para gráfico pizza (conic-gradient) e legenda. */
export function buildConsumoPorVeiculoPie(rows) {
  const list = Array.isArray(rows) ? rows.filter((r) => Number(r?.total_litros) > 0) : [];
  const total = list.reduce((s, r) => s + Number(r.total_litros), 0);
  if (total <= 0) {
    return { style: { background: "conic-gradient(#334155 0% 100%)" }, slices: [] };
  }
  const sorted = [...list].sort((a, b) => Number(b.total_litros) - Number(a.total_litros));
  const MAX = 8;
  const head = sorted.slice(0, MAX);
  const tail = sorted.slice(MAX);
  const tailLitros = tail.reduce((s, r) => s + Number(r.total_litros), 0);
  const slicesIn =
    tailLitros > 0
      ? [
          ...head,
          {
            veiculo_id: "__outros__",
            total_litros: tailLitros,
            veiculo_nome: "Outros",
            veiculo_placa: null,
          },
        ]
      : head;
  let acc = 0;
  const usedColors = new Set();
  const slices = slicesIn.map((r, i) => {
    const lit = Number(r.total_litros);
    const pct = (lit / total) * 100;
    const startPct = acc;
    acc += pct;
    return {
      color: resolveSliceColor(r?.veiculo_id, i, usedColors),
      startPct,
      endPct: acc,
      label: veiculoCombustivelLabel(r),
      litros: lit,
      pct,
    };
  });
  const grad = slices.map((p) => `${p.color} ${p.startPct}% ${p.endPct}%`).join(", ");
  return { style: { background: `conic-gradient(${grad})` }, slices };
}
