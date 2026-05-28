import {
  POWER_BI_PALETTE,
  REPORT_COLORS,
  CHART_TOOLTIP_EXPLANATIONS,
  reportColorByIndex,
  reportColorById,
  assignUniqueChartColors,
} from "./reportChartColors";

export {
  POWER_BI_PALETTE,
  REPORT_COLORS,
  CHART_TOOLTIP_EXPLANATIONS,
  reportColorByIndex,
  reportColorById,
  assignUniqueChartColors,
};

export const COLORS = POWER_BI_PALETTE;

export const CHART_COLORS = {
  line: REPORT_COLORS.line,
  consumo: REPORT_COLORS.consumo,
  producao: REPORT_COLORS.producao,
  media: REPORT_COLORS.media,
};

export function getColorByIndex(index) {
  return reportColorByIndex(index);
}

export function getColorById(id, index = null) {
  return reportColorById(id, index);
}

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#111827",
    border: "1px solid #374151",
    color: "#fff",
    borderRadius: 12,
    boxShadow: "0 10px 28px rgba(0, 0, 0, 0.35)",
    padding: 0,
  },
  labelStyle: { color: "#F8FAFC", fontWeight: 600 },
  itemStyle: { color: "#F8FAFC" },
};
