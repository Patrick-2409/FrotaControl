const CHART_COLORS = ["#1D4ED8", "#15803D", "#D97706", "#B91C1C", "#6D28D9", "#0E7490", "#C2410C", "#374151"];
const CHART_BG = "#F8FAFC";
const CHART_BORDER = "#CBD5E1";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtNum = (value, digits = 1) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "0";

const truncateLabel = (label, max = 22) => {
  const raw = String(label || "").trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1)}…`;
};

const buildPieChartCanvas = (items = [], { width = 515, height = 200 } = {}) => {
  const series = items
    .map((item) => ({ label: item.label || item.veiculo, value: toNumber(item.value ?? item.litros) }))
    .filter((item) => item.value > 0)
    .slice(0, 8);

  if (!series.length) {
    return { canvas: [{ type: "rect", x: 0, y: 0, w: width, h: height, color: CHART_BG, r: 6 }], width, height, empty: true, series: [] };
  }

  const total = series.reduce((sum, item) => sum + item.value, 0);
  const cx = width * 0.32;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.34;
  let angle = -Math.PI / 2;
  const shapes = [{ type: "rect", x: 0, y: 0, w: width, h: height, color: CHART_BG, r: 6, lineWidth: 1, lineColor: CHART_BORDER }];

  series.forEach((item, index) => {
    const slice = (item.value / total) * Math.PI * 2;
    const end = angle + slice;
    const steps = Math.max(8, Math.ceil(slice / (Math.PI / 20)));
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

  return { canvas: shapes, width, height, series, total };
};

const buildLineChartCanvas = (items = [], { width = 515, height = 200 } = {}) => {
  const series = items
    .map((item) => ({ label: item.periodo || item.label, value: toNumber(item.custo ?? item.value) }))
    .filter((item) => item.value >= 0)
    .slice(0, 14);

  if (!series.length) {
    return { canvas: [{ type: "rect", x: 0, y: 0, w: width, h: height, color: CHART_BG, r: 6 }], width, height, empty: true, series: [] };
  }

  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxVal = Math.max(...series.map((item) => item.value), 1);
  const shapes = [{ type: "rect", x: 0, y: 0, w: width, h: height, color: CHART_BG, r: 6, lineWidth: 1, lineColor: CHART_BORDER }];

  for (let grid = 0; grid <= 4; grid += 1) {
    const y = padT + (chartH * grid) / 4;
    shapes.push({ type: "line", x1: padL, y1: y, x2: width - padR, y2: y, lineWidth: 0.5, lineColor: "#E5E7EB" });
    const gridVal = maxVal - (maxVal * grid) / 4;
    shapes.push({
      type: "line",
      x1: padL - 2,
      y1: y,
      x2: padL,
      y2: y,
      lineWidth: 0.5,
      lineColor: "#9CA3AF",
    });
  }

  const points = series.map((item, index) => {
    const x = padL + (chartW * index) / Math.max(series.length - 1, 1);
    const y = padT + chartH - (item.value / maxVal) * chartH;
    return { x, y, label: item.label, value: item.value };
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

  return { canvas: shapes, width, height, series, maxVal, points };
};

const buildGroupedBarChartCanvas = (items = [], { width = 515, height = 210 } = {}) => {
  const series = items
    .map((item) => ({
      label: item.periodo || item.label,
      consumo: toNumber(item.consumo),
      producao: toNumber(item.producao),
    }))
    .filter((item) => item.consumo > 0 || item.producao > 0)
    .slice(0, 12);

  if (!series.length) {
    return { canvas: [{ type: "rect", x: 0, y: 0, w: width, h: height, color: CHART_BG, r: 6 }], width, height, empty: true, series: [] };
  }

  const padL = 44;
  const padR = 16;
  const padT = 22;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxVal = Math.max(...series.flatMap((item) => [item.consumo, item.producao]), 1);
  const groupW = chartW / series.length;
  const barW = Math.min(12, groupW * 0.22);
  const shapes = [{ type: "rect", x: 0, y: 0, w: width, h: height, color: CHART_BG, r: 6, lineWidth: 1, lineColor: CHART_BORDER }];

  shapes.push({ type: "rect", x: padL, y: 6, w: 10, h: 10, color: "#2563EB" });
  shapes.push({ type: "rect", x: padL + 130, y: 6, w: 10, h: 10, color: "#16A34A" });

  series.forEach((item, index) => {
    const groupX = padL + groupW * index + groupW / 2;
    const consumoH = (item.consumo / maxVal) * chartH;
    const producaoH = (item.producao / maxVal) * chartH;
    shapes.push({
      type: "rect",
      x: groupX - barW - 2,
      y: padT + chartH - consumoH,
      w: barW,
      h: Math.max(consumoH, 1),
      color: "#2563EB",
    });
    shapes.push({
      type: "rect",
      x: groupX + 2,
      y: padT + chartH - producaoH,
      w: barW,
      h: Math.max(producaoH, 1),
      color: "#16A34A",
    });
  });

  return { canvas: shapes, width, height, series, maxVal };
};

const pieLegendTable = (chart) => {
  if (!chart?.series?.length) {
    return { table: { widths: ["*"], body: [["Sem dados de consumo no período"]] }, layout: "noBorders" };
  }
  return {
    table: {
      widths: ["*", "auto", "auto"],
      body: [
        ["Veículo", "Litros", "%"],
        ...chart.series.map((item) => {
          const pct = chart.total > 0 ? ((item.value / chart.total) * 100).toFixed(1) : "0.0";
          return [truncateLabel(item.label), `${fmtNum(item.value)} L`, `${pct}%`];
        }),
      ],
    },
    layout: "lightHorizontalLines",
    margin: [0, 6, 0, 0],
  };
};

const lineDataTable = (chart) => {
  if (!chart?.series?.length) {
    return { table: { widths: ["*"], body: [["Sem dados de custo no período"]] }, layout: "noBorders" };
  }
  return {
    table: {
      widths: ["*", "auto"],
      body: [
        ["Período", "Custo (R$)"],
        ...chart.series.map((item) => [truncateLabel(item.label, 14), fmtNum(item.value, 2)]),
      ],
    },
    layout: "lightHorizontalLines",
    margin: [0, 6, 0, 0],
  };
};

const barDataTable = (chart) => {
  if (!chart?.series?.length) {
    return { table: { widths: ["*"], body: [["Sem dados de transporte no período"]] }, layout: "noBorders" };
  }
  return {
    table: {
      widths: ["*", "auto", "auto"],
      body: [
        ["Período", "Consumo (L)", "Produção (viagens)"],
        ...chart.series.map((item) => [
          truncateLabel(item.label, 14),
          fmtNum(item.consumo),
          fmtNum(item.producao, 0),
        ]),
      ],
    },
    layout: "lightHorizontalLines",
    margin: [0, 6, 0, 0],
  };
};

const pieLegendText = (chart) => {
  if (!chart?.series?.length) return "Legenda: sem dados no período.";
  return `Legenda: ${chart.series
    .map((item) => {
      const pct = chart.total > 0 ? ((item.value / chart.total) * 100).toFixed(1) : "0.0";
      return `${truncateLabel(item.label)} ${pct}%`;
    })
    .join(" | ")}`;
};

const CHART_EXPLANATIONS = {
  consumoPorVeiculo: "Participação real do consumo por veículo. Fatia dominante = risco de dependência operacional.",
  custoPorPeriodo: "Evolução diária do custo. Picos isolados exigem validação de lançamento ou demanda extraordinária.",
  consumoVsProducao: "Comparativo diário transporte: litros vs viagens. Desalinhamento = possível erro de dado.",
};

const chartLegendNote = (tipo) => {
  if (tipo === "bar") return "■ Azul = Consumo (L)   ■ Verde = Produção (viagens) — somente transporte";
  if (tipo === "line") return "■ Linha azul = Custo diário total de combustível (R$)";
  return "■ Cores distintas = participação de cada veículo no consumo total";
};

module.exports = {
  CHART_COLORS,
  truncateLabel,
  buildPieChartCanvas,
  buildLineChartCanvas,
  buildGroupedBarChartCanvas,
  pieLegendText,
  pieLegendTable,
  lineDataTable,
  barDataTable,
  CHART_EXPLANATIONS,
  chartLegendNote,
};
