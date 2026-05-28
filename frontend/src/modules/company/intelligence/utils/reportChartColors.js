/** Paleta BI — 6 cores contrastantes, sem tons parecidos */
export const POWER_BI_PALETTE = [
  "#3B82F6",
  "#F59E0B",
  "#10B981",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
];

export const REPORT_COLORS = {
  primary: "#3B82F6",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  accent: "#8B5CF6",
  cyan: "#06B6D4",
  muted: "#64748B",
  grid: "#E2E8F0",
  axis: "#475569",
  consumo: "#EF4444",
  producao: "#10B981",
  line: "#3B82F6",
  media: "#F59E0B",
};

export const REPORT_PALETTE = POWER_BI_PALETTE;

export const CHART_TOOLTIP_EXPLANATIONS = {
  pieConsumo:
    "Participação de cada veículo no consumo total de combustível. Quanto maior a fatia, maior a dependência operacional desse ativo.",
  lineCusto:
    "Custo diário de abastecimento em reais. Compare com a linha tracejada (média) para identificar picos ou quedas atípicas.",
  barConsumoProducao:
    "Vermelho = litros consumidos · Verde = viagens de transporte no mesmo dia. Dias com consumo alto e produção baixa exigem revisão de lançamentos.",
  parteDiaria:
    "Azul = quantidade de registros · Verde = horas operacionais lançadas na parte diária de apoio.",
};

export const REPORT_TOOLTIP = {
  contentStyle: {
    backgroundColor: "#FFFFFF",
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.12)",
    color: "#0F172A",
    padding: 0,
  },
  labelStyle: { color: "#334155", fontWeight: 600 },
  itemStyle: { color: "#0F172A" },
};

export function assignUniqueChartColors(count = 0) {
  const total = Math.max(0, Number(count) || 0);
  if (total === 0) return [];
  if (total <= POWER_BI_PALETTE.length) {
    return POWER_BI_PALETTE.slice(0, total);
  }
  return Array.from({ length: total }, (_, index) => POWER_BI_PALETTE[index % POWER_BI_PALETTE.length]);
}

export function reportColorByIndex(index) {
  const safe = Math.abs(Number(index) || 0);
  return POWER_BI_PALETTE[safe % POWER_BI_PALETTE.length];
}

export function reportColorById(id, index = null) {
  if (Number.isInteger(index) && index >= 0) {
    return reportColorByIndex(index);
  }
  const normalized = String(id ?? "sem-id");
  const hash = normalized.split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  return POWER_BI_PALETTE[Math.abs(hash) % POWER_BI_PALETTE.length];
}

export const LEGEND_REQUIRED_NOTE = "Legenda obrigatória — cada cor representa uma série ou veículo distinto.";
