import { veiculoCombustivelLabel } from "../services/fuelFormatters";

const COMBUSTIVEL_PIE_COLORS = [
  "#34d399",
  "#2dd4bf",
  "#38bdf8",
  "#818cf8",
  "#c084fc",
  "#fb7185",
  "#fbbf24",
  "#a3e635",
  "#94a3b8",
];

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
  const slices = slicesIn.map((r, i) => {
    const lit = Number(r.total_litros);
    const pct = (lit / total) * 100;
    const startPct = acc;
    acc += pct;
    return {
      color: COMBUSTIVEL_PIE_COLORS[i % COMBUSTIVEL_PIE_COLORS.length],
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
