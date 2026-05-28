const CHART_COLORS = ["#2563EB", "#16A34A", "#F59E0B", "#DC2626", "#7C3AED", "#0891B2", "#EA580C", "#4B5563"];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const truncateLabel = (label, max = 18) => {
  const raw = String(label || "").trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1)}…`;
};

const buildPieChartCanvas = (items = [], { width = 220, height = 140 } = {}) => {
  const series = items
    .map((item) => ({ label: item.label || item.veiculo, value: toNumber(item.value ?? item.litros) }))
    .filter((item) => item.value > 0)
    .slice(0, 8);

  if (!series.length) {
    return {
      canvas: [{ type: "rect", x: 0, y: 0, w: width, h: height, color: "#F3F4F6", r: 4 }],
      width,
      height,
      empty: true,
    };
  }

  const total = series.reduce((sum, item) => sum + item.value, 0);
  const cx = width * 0.38;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.36;
  let angle = -Math.PI / 2;
  const shapes = [{ type: "rect", x: 0, y: 0, w: width, h: height, color: "#FAFAFA", r: 4 }];

  series.forEach((item, index) => {
    const slice = (item.value / total) * Math.PI * 2;
    const end = angle + slice;
    const steps = Math.max(6, Math.ceil(slice / (Math.PI / 18)));
    const points = [{ x: cx, y: cy }];
    for (let step = 0; step <= steps; step += 1) {
      const current = angle + (slice * step) / steps;
      points.push({ x: cx + radius * Math.cos(current), y: cy + radius * Math.sin(current) });
    }
    shapes.push({
      type: "polyline",
      lineWidth: 0.5,
      closePath: true,
      color: CHART_COLORS[index % CHART_COLORS.length],
      points,
    });
    angle = end;
  });

  const legendX = width * 0.62;
  series.forEach((item, index) => {
    const y = 14 + index * 14;
    const pct = ((item.value / total) * 100).toFixed(1);
    shapes.push({ type: "rect", x: legendX, y: y - 6, w: 8, h: 8, color: CHART_COLORS[index % CHART_COLORS.length] });
    shapes.push({
      type: "line",
      x1: legendX + 12,
      y1: y - 2,
      x2: width - 4,
      y2: y - 2,
      lineWidth: 0,
    });
  });

  return { canvas: shapes, width, height, series, total };
};

const buildLineChartCanvas = (items = [], { width = 480, height = 150 } = {}) => {
  const series = items
    .map((item) => ({ label: item.periodo || item.label, value: toNumber(item.custo ?? item.value) }))
    .filter((item) => item.value >= 0)
    .slice(0, 12);

  if (!series.length) {
    return { canvas: [{ type: "rect", x: 0, y: 0, w: width, h: height, color: "#F3F4F6", r: 4 }], width, height, empty: true };
  }

  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxVal = Math.max(...series.map((item) => item.value), 1);
  const shapes = [{ type: "rect", x: 0, y: 0, w: width, h: height, color: "#FAFAFA", r: 4 }];

  for (let grid = 0; grid <= 4; grid += 1) {
    const y = padT + (chartH * grid) / 4;
    shapes.push({ type: "line", x1: padL, y1: y, x2: width - padR, y2: y, lineWidth: 0.5, lineColor: "#E5E7EB" });
  }

  const points = series.map((item, index) => {
    const x = padL + (chartW * index) / Math.max(series.length - 1, 1);
    const y = padT + chartH - (item.value / maxVal) * chartH;
    return { x, y };
  });

  for (let i = 1; i < points.length; i += 1) {
    shapes.push({
      type: "line",
      x1: points[i - 1].x,
      y1: points[i - 1].y,
      x2: points[i].x,
      y2: points[i].y,
      lineWidth: 2,
      lineColor: "#2563EB",
    });
  }

  points.forEach((point) => {
    shapes.push({ type: "ellipse", x: point.x - 3, y: point.y - 3, r1: 3, r2: 3, color: "#2563EB" });
  });

  return { canvas: shapes, width, height, series, maxVal };
};

const buildGroupedBarChartCanvas = (items = [], { width = 480, height = 160 } = {}) => {
  const series = items
    .map((item) => ({
      label: item.periodo || item.label,
      consumo: toNumber(item.consumo),
      producao: toNumber(item.producao),
    }))
    .slice(0, 10);

  if (!series.length) {
    return { canvas: [{ type: "rect", x: 0, y: 0, w: width, h: height, color: "#F3F4F6", r: 4 }], width, height, empty: true };
  }

  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxVal = Math.max(...series.flatMap((item) => [item.consumo, item.producao]), 1);
  const groupW = chartW / series.length;
  const barW = Math.min(14, groupW * 0.28);
  const shapes = [{ type: "rect", x: 0, y: 0, w: width, h: height, color: "#FAFAFA", r: 4 }];

  shapes.push({ type: "rect", x: padL + chartW - 120, y: 6, w: 8, h: 8, color: "#2563EB" });
  shapes.push({ type: "rect", x: padL + chartW - 60, y: 6, w: 8, h: 8, color: "#16A34A" });

  series.forEach((item, index) => {
    const groupX = padL + groupW * index + groupW / 2;
    const consumoH = (item.consumo / maxVal) * chartH;
    const producaoH = (item.producao / maxVal) * chartH;
    shapes.push({
      type: "rect",
      x: groupX - barW - 2,
      y: padT + chartH - consumoH,
      w: barW,
      h: consumoH,
      color: "#2563EB",
    });
    shapes.push({
      type: "rect",
      x: groupX + 2,
      y: padT + chartH - producaoH,
      w: barW,
      h: producaoH,
      color: "#16A34A",
    });
  });

  return { canvas: shapes, width, height, series, maxVal };
};

const pieLegendText = (chart) => {
  if (!chart?.series?.length) return "Sem dados para exibir participação.";
  return chart.series
    .map((item, index) => {
      const pct = ((item.value / chart.total) * 100).toFixed(1);
      return `${truncateLabel(item.label)}: ${pct}%`;
    })
    .join(" • ");
};

const CHART_EXPLANATIONS = {
  consumoPorVeiculo:
    "O gráfico apresenta a participação percentual do consumo de combustível por veículo no período. Quanto maior a fatia, maior a concentração de uso naquele ativo — útil para identificar dependência operacional e desvios de padrão.",
  custoPorPeriodo:
    "O gráfico apresenta a evolução do custo diário de combustível. Picos indicam aumento de gasto no dia; quedas sugerem redução de abastecimentos ou menor atividade. Compare tendência com produção para validar coerência.",
  consumoVsProducao:
    "O gráfico compara consumo (litros) e produção (viagens) por dia, somente para veículos de transporte. Barras desalinhadas sinalizam consumo sem produção ou produção sem consumo — possível inconsistência de lançamento.",
};

module.exports = {
  CHART_COLORS,
  truncateLabel,
  buildPieChartCanvas,
  buildLineChartCanvas,
  buildGroupedBarChartCanvas,
  pieLegendText,
  CHART_EXPLANATIONS,
};
