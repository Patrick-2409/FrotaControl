const BASE_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
];

export const COLORS = BASE_COLORS;

export function getColorById(id) {
  const normalizedId = String(id ?? "sem-id");
  const hash = normalizedId.split("").reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  const index = Math.abs(hash) % BASE_COLORS.length;
  return BASE_COLORS[index];
}

export const CHART_COLORS = {
  line: "#3B82F6",
  consumo: "#EF4444",
  producao: "#10B981",
};

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#111827",
    border: "1px solid #374151",
    color: "#fff",
    borderRadius: 10,
  },
  labelStyle: { color: "#fff" },
  itemStyle: { color: "#fff" },
};
