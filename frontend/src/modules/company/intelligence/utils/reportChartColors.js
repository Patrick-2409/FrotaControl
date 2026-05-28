export const REPORT_COLORS = {
  primary: "#1D4ED8",
  success: "#15803D",
  warning: "#D97706",
  danger: "#B91C1C",
  muted: "#64748B",
  grid: "#E2E8F0",
  axis: "#475569",
  consumo: "#DC2626",
  producao: "#059669",
  line: "#2563EB",
};

export const REPORT_PALETTE = [
  "#1D4ED8",
  "#15803D",
  "#D97706",
  "#B91C1C",
  "#6D28D9",
  "#0E7490",
  "#C2410C",
  "#334155",
];

export const REPORT_TOOLTIP = {
  contentStyle: {
    backgroundColor: "#FFFFFF",
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
    color: "#0F172A",
  },
  labelStyle: { color: "#334155", fontWeight: 600 },
  itemStyle: { color: "#0F172A" },
};

export function reportColorById(id) {
  const normalized = String(id ?? "sem-id");
  const hash = normalized.split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  return REPORT_PALETTE[Math.abs(hash) % REPORT_PALETTE.length];
}
