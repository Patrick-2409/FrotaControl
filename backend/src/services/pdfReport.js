const fsSync = require("fs");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { getCompanyById } = require("../models/companyModel");
const { MENSAGEM_CONTEXTO_TESTE } = require("./inteligencia/operacionalRules");
const {
  buildPieChartCanvas,
  buildLineChartCanvas,
  buildGroupedBarChartCanvas,
  pieLegendText,
  pieLegendTable,
  lineDataTable,
  barDataTable,
  CHART_EXPLANATIONS,
  chartLegendNote,
} = require("./pdfCharts");

const PdfPrinter = require("pdfmake/src/printer");

let fontsReadyPromise = null;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const fmtNum = (value, digits = 0) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "—";

const fmtMoney = (value) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

const safeText = (value, fallback = "Dados insuficientes para análise.") => {
  const raw = String(value || "").trim();
  return raw || fallback;
};

const safeList = (value, fallback = []) => {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((item) => String(item || "").trim()).filter(Boolean);
  return list.length ? list : fallback;
};

const resolveUploadsPath = (logoUrl) => {
  if (!logoUrl) return null;
  let pathname = String(logoUrl).trim();
  try {
    if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname;
  } catch {
    return null;
  }
  const normalized = pathname.replace(/\\/g, "/");
  if (!normalized.includes("/uploads/") && !normalized.startsWith("uploads/")) return null;
  const uploadsPath = normalized.includes("/uploads/")
    ? normalized.slice(normalized.toLowerCase().indexOf("/uploads/") + 1)
    : normalized;
  const root = path.resolve(__dirname, "../../");
  const localPath = path.resolve(root, uploadsPath);
  const uploadsRoot = path.resolve(root, "uploads");
  if (!localPath.startsWith(uploadsRoot)) return null;
  return localPath;
};

const extToMime = (ext) => {
  const normalized = String(ext || "").toLowerCase().replace(".", "");
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "webp") return "image/webp";
  if (normalized === "svg") return "image/svg+xml";
  return "image/png";
};

const getBaseUrl = () => {
  const configured = String(process.env.PUBLIC_BASE_URL || process.env.BACKEND_PUBLIC_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (configured) return configured;
  return `http://127.0.0.1:${process.env.PORT || 4000}`;
};

const resolveLogoDataUrl = async (logoUrl) => {
  if (!logoUrl) return "";
  const localPath = resolveUploadsPath(logoUrl);
  if (localPath) {
    try {
      const buffer = await fs.readFile(localPath);
      const ext = path.extname(localPath).replace(".", "").toLowerCase();
      return `data:${extToMime(ext)};base64,${buffer.toString("base64")}`;
    } catch {
      // fallback HTTP
    }
  }
  let url = String(logoUrl).trim();
  if (!/^https?:\/\//i.test(url)) {
    url = new URL(url.startsWith("/") ? url : `/${url}`, getBaseUrl()).toString();
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const ext = contentType.includes("jpeg") ? "jpeg" : contentType.includes("webp") ? "webp" : "png";
    return `data:${extToMime(ext)};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
};

const resolveStatus = (analysis = {}, report = {}) => {
  const fromAnalysis = analysis?.statusOperacao;
  if (fromAnalysis?.label) return fromAnalysis;

  const insights = analysis?.insights || {};
  const ociosos = toNumber(analysis?.indicadores?.veiculosOciosos);
  const inconsistencias = analysis?.inconsistencias?.length || 0;

  if (
    inconsistencias > 0 ||
    insights.producaoSemConsumo ||
    insights.consumoSemProducao ||
    insights.operacaoParada
  ) {
    return { label: "CRÍTICO", color: "#B91C1C", nivel: "CRITICO" };
  }
  if (ociosos > 0 || insights.contextoTeste) {
    return { label: "ATENÇÃO", color: "#B45309", nivel: "ATENCAO" };
  }
  return { label: "SAUDÁVEL", color: "#15803D", nivel: "SAUDAVEL" };
};

const sectionDivider = () => ({
  canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#D1D5DB" }],
  margin: [0, 8, 0, 12],
});

const alertBox = (text, color = "#B45309", bg = "#FFFBEB") => ({
  table: {
    widths: ["*"],
    body: [[{ text, color: "#1F2937", fillColor: bg, border: [false, false, false, false], margin: [10, 8, 10, 8] }]],
  },
  layout: {
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    hLineColor: () => color,
    vLineColor: () => color,
  },
  margin: [0, 0, 0, 12],
});

const statusBox = (status) => ({
  table: {
    widths: ["*"],
    body: [
      [
        {
          text: `STATUS DA OPERAÇÃO: ${status.label}`,
          bold: true,
          fontSize: 13,
          color: "#FFFFFF",
          fillColor: status.color,
          border: [false, false, false, false],
          margin: [12, 10, 12, 10],
        },
      ],
    ],
  },
  layout: "noBorders",
  margin: [0, 0, 0, 14],
});

const chartBlock = (title, chartNode, explanation, extras = []) => {
  return [
    { text: title, style: "chartTitle" },
    chartNode,
    ...extras,
    { text: explanation, style: "chartExplanation", margin: [0, 0, 0, 16] },
  ];
};

const insightBox = (text) => ({
  table: {
    widths: ["*"],
    body: [[{ text, style: "insightText", border: [false, false, false, false], margin: [12, 10, 12, 10] }]],
  },
  layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
  fillColor: "#F0F9FF",
  margin: [0, 0, 0, 10],
});

const kpiMini = (label, value) => ({
  table: {
    widths: ["*"],
    body: [
      [{ text: label, style: "kpiLabel", border: [false, false, false, false] }],
      [{ text: value, style: "kpiValue", border: [false, false, false, false], margin: [0, 2, 0, 0] }],
    ],
  },
  layout: "noBorders",
  fillColor: "#F8FAFC",
  margin: [0, 0, 6, 6],
});

const buildKpisForPdf = (indicadores, tipoAnalise, metricas) => {
  const tipo = String(tipoAnalise || "geral").toLowerCase();
  const totalFrota = toNumber(indicadores.totalVeiculosEscopo);
  const cards = [];

  if (tipo === "geral" || tipo === "combustivel" || tipo === "frota") {
    cards.push(kpiMini("Custo total", fmtMoney(indicadores.totalValor)));
    cards.push(kpiMini("Consumo", `${fmtNum(indicadores.totalLitros, 1)} L`));
    if (indicadores.precoMedio != null) {
      cards.push(kpiMini("Preço médio", `R$ ${fmtNum(indicadores.precoMedio, 2)}/L`));
    }
  }
  if (tipo === "geral" || tipo === "transporte") {
    cards.push(kpiMini("Viagens transp.", fmtNum(indicadores.totalViagensTransporte)));
  }
  if (totalFrota > 0) {
    cards.push(
      kpiMini(
        "Frota ativa",
        `${fmtNum(indicadores.veiculosAtivos)}/${fmtNum(totalFrota)} (${metricas.utilizacaoFrotaPct ?? 0}%)`
      )
    );
    cards.push(kpiMini("Ociosidade", `${fmtNum(indicadores.veiculosOciosos)} (${metricas.ociosidadePct ?? 0}%)`));
  }
  return cards;
};

const kpiGrid = (cards) => {
  const rows = [];
  for (let i = 0; i < cards.length; i += 2) {
    rows.push([cards[i] || { text: "" }, cards[i + 1] || { text: "" }]);
  }
  return {
    table: { widths: ["*", "*"], body: rows },
    layout: "noBorders",
    margin: [0, 0, 0, 0],
  };
};

const buildModuloBlocks = (modulos, tipoAnalise) => {
  const tipo = String(tipoAnalise || "geral").toLowerCase();
  const blocks = [];
  const push = (titulo, texto) => {
    if (!texto || texto === "Dados insuficientes para análise.") return;
    blocks.push({ text: titulo, style: "subSectionTitle" });
    blocks.push({ text: texto, style: "bodyCompact", margin: [0, 0, 0, 8] });
  };
  if (tipo === "geral" || tipo === "combustivel") push("Combustível", modulos?.combustivel);
  if (tipo === "geral" || tipo === "transporte") push("Transporte", modulos?.transporte);
  if (tipo === "geral" || tipo === "frota") push("Apoio", modulos?.apoio || modulos?.frota);
  return blocks;
};

const ensurePdfMakeFonts = async () => {
  if (!fontsReadyPromise) {
    fontsReadyPromise = (async () => {
      const vfsModule = require("pdfmake/build/vfs_fonts.js");
      const vfs = vfsModule?.pdfMake?.vfs;
      if (!vfs) throw new Error("pdfmake/build/vfs_fonts.js não exportou pdfMake.vfs.");
      const fontDir = path.join(os.tmpdir(), "pdfmake-fonts");
      const files = ["Roboto-Regular.ttf", "Roboto-Medium.ttf", "Roboto-Italic.ttf", "Roboto-MediumItalic.ttf"];
      await fs.mkdir(fontDir, { recursive: true });
      await Promise.all(
        files.map(async (filename) => {
          const target = path.join(fontDir, filename);
          if (fsSync.existsSync(target)) return;
          const b64 = vfs?.[filename];
          if (!b64) throw new Error(`Fonte ${filename} não encontrada.`);
          await fs.writeFile(target, Buffer.from(b64, "base64"));
        })
      );
      return {
        normal: path.join(fontDir, "Roboto-Regular.ttf"),
        bold: path.join(fontDir, "Roboto-Medium.ttf"),
        italics: path.join(fontDir, "Roboto-Italic.ttf"),
        bolditalics: path.join(fontDir, "Roboto-MediumItalic.ttf"),
      };
    })();
  }
  return fontsReadyPromise;
};

const buildPrinter = async () => {
  const roboto = await ensurePdfMakeFonts();
  return new PdfPrinter({ Roboto: roboto });
};

const generateExecutivePdf = async ({ empresaId, analysis, report }) => {
  let company = null;
  try {
    company = await getCompanyById(empresaId);
  } catch (companyErr) {
    console.warn("[PDF] Não foi possível carregar empresa:", companyErr?.message);
  }

  const logoDataUrl = await resolveLogoDataUrl(company?.logo_url).catch(() => "");
  const indicadores = analysis?.indicadores || {};
  const graficos = analysis?.graficos || {};
  const insights = analysis?.insights || {};
  const status = resolveStatus(analysis, report);
  const generatedAt = new Date().toLocaleString("pt-BR");
  const contextoTeste = Boolean(insights.contextoTeste);
  const inconsistencias = [
    ...(analysis?.inconsistencias || []),
    ...(report?.inconsistencias || []),
  ].filter(Boolean);
  const uniqueInconsistencias = [...new Set(inconsistencias)];

  const resumo = safeText(report?.resumoExecutivo || report?.resumo_executivo || report?.resumo);
  const diagnostico = safeText(report?.diagnosticoDetalhado || report?.diagnostico_detalhado || report?.diagnostico);
  const impacto = safeText(report?.impactoFinanceiro || report?.impacto_financeiro || report?.impacto);
  const riscos = safeList(report?.riscos || report?.riscos_operacionais, ["Sem riscos específicos identificados."]);
  const acoes = safeList(report?.acoes || report?.acoes_recomendadas, ["Sem ações recomendadas para o recorte."]);
  const modulos = report?.analiseModulos || report?.analise_modulos || {};
  const metricas = insights.metricasExecutivas || report?.metricasExecutivas || {};
  const prioridadeInconsistencia = Boolean(report?.prioridadeInconsistencia) || uniqueInconsistencias.length > 0;
  const tipoAnalise = String(analysis?.tipoAnalise || "geral").toLowerCase();
  const kpiCards = buildKpisForPdf(indicadores, tipoAnalise, metricas);
  const incluiCombustivel = tipoAnalise === "geral" || tipoAnalise === "combustivel" || tipoAnalise === "frota";
  const incluiTransporte = tipoAnalise === "geral" || tipoAnalise === "transporte";

  const pieData = (graficos.consumoPorVeiculo || []).map((row) => ({
    label: row.veiculo,
    value: row.litros,
  }));
  const pieChart = incluiCombustivel ? buildPieChartCanvas(pieData) : null;
  const lineChart = incluiCombustivel ? buildLineChartCanvas(graficos.custoPorPeriodo || []) : null;
  const barChart = incluiTransporte ? buildGroupedBarChartCanvas(graficos.consumoVsProducao || []) : null;

  const inconsistenciasVisiveis = uniqueInconsistencias.slice(0, 3);
  const blocoInconsistencia = uniqueInconsistencias.length
    ? [
        alertBox(
          "PRIORIDADE: corrigir inconsistências de dados antes de decisões operacionais.",
          "#B91C1C",
          "#FEF2F2"
        ),
        {
          ul: inconsistenciasVisiveis.map((item) => `ERRO DE DADO: ${item}`),
          style: "bodyCompact",
          margin: [0, 0, 0, 8],
        },
        ...(uniqueInconsistencias.length > 3
          ? [{ text: `+${uniqueInconsistencias.length - 3} inconsistência(s) adicional(is) no sistema.`, style: "muted" }]
          : []),
      ]
    : [];

  const chartSections = [];
  if (incluiCombustivel && pieChart) {
    chartSections.push(
      ...chartBlock(
        "Consumo por veículo",
        { ...pieChart, margin: [0, 6, 0, 0] },
        CHART_EXPLANATIONS.consumoPorVeiculo,
        [
          { text: chartLegendNote("pie"), style: "chartLegend", margin: [0, 4, 0, 2] },
          { text: pieChart.empty ? "Sem dados no período." : pieLegendText(pieChart), style: "chartLegend", margin: [0, 0, 0, 2] },
          pieLegendTable(pieChart),
        ]
      )
    );
  }
  if (incluiCombustivel && lineChart) {
    chartSections.push(
      ...chartBlock(
        "Custo ao longo do tempo",
        { ...lineChart, margin: [0, 6, 0, 0] },
        CHART_EXPLANATIONS.custoPorPeriodo,
        [
          { text: chartLegendNote("line"), style: "chartLegend", margin: [0, 4, 0, 2] },
          lineDataTable(lineChart),
        ]
      )
    );
  }
  if (incluiTransporte && barChart) {
    chartSections.push(
      ...chartBlock(
        "Consumo vs produção (transporte)",
        { ...barChart, margin: [0, 6, 0, 0] },
        CHART_EXPLANATIONS.consumoVsProducao,
        [
          { text: chartLegendNote("bar"), style: "chartLegend", margin: [0, 4, 0, 2] },
          barDataTable(barChart),
        ]
      )
    );
  }

  const moduloBlocks = buildModuloBlocks(modulos, tipoAnalise);

  const content = [
    {
      columns: [
        logoDataUrl
          ? { image: logoDataUrl, width: 56, maxHeight: 56, margin: [0, 0, 12, 0] }
          : { width: 56, text: "" },
        [
          { text: "Relatório Executivo — Inteligência", style: "coverTitle" },
          { text: safeText(company?.nome, "Empresa"), style: "coverCompany" },
          {
            text: `${safeText(analysis?.periodo?.inicio, "-")} → ${safeText(analysis?.periodo?.fim, "-")} · ${tipoAnalise.toUpperCase()} · ${generatedAt}`,
            style: "muted",
            margin: [0, 4, 0, 0],
          },
        ],
      ],
      margin: [0, 0, 0, 10],
    },
    ...(contextoTeste ? [alertBox(insights.mensagemContextoTeste || MENSAGEM_CONTEXTO_TESTE, "#92400E", "#FFFBEB")] : []),
    statusBox(status),
    ...blocoInconsistencia,
    {
      columns: [
        {
          width: "58%",
          stack: [
            {
              text: prioridadeInconsistencia ? "Decisão prioritária" : "Resumo executivo",
              style: "sectionTitle",
              margin: [0, 6, 0, 4],
            },
            insightBox(resumo),
          ],
        },
        {
          width: "42%",
          stack: [{ text: "Indicadores do escopo", style: "sectionTitle", margin: [0, 6, 0, 4] }, kpiGrid(kpiCards)],
        },
      ],
      columnGap: 12,
      margin: [0, 0, 0, 6],
    },
    ...(chartSections.length ? [{ text: "", pageBreak: "before" }, { text: "Gráficos analíticos", style: "sectionTitle" }, ...chartSections] : []),
    ...(moduloBlocks.length
      ? [sectionDivider(), { text: "Insights por módulo (escopo)", style: "sectionTitle" }, ...moduloBlocks]
      : []),
    sectionDivider(),
    { text: "Diagnóstico", style: "sectionTitle" },
    insightBox(diagnostico),
    { text: "Impacto financeiro", style: "subSectionTitle" },
    { text: impacto, style: "bodyCompact", margin: [0, 0, 0, 10] },
    {
      columns: [
        { width: "50%", stack: [{ text: "Riscos", style: "subSectionTitle" }, { ul: riscos.slice(0, 5), style: "bodyCompact" }] },
        { width: "50%", stack: [{ text: "Ações recomendadas", style: "subSectionTitle" }, { ul: acoes.slice(0, 5), style: "bodyCompact" }] },
      ],
      columnGap: 14,
    },
    {
      text: "Transporte = produção (viagens). Apoio = sem produção. Ações devem respeitar o escopo filtrado.",
      style: "muted",
      margin: [0, 10, 0, 0],
    },
  ];

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [42, 48, 42, 48],
    content,
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#111827", lineHeight: 1.3 },
    styles: {
      coverTitle: { fontSize: 16, bold: true, color: "#0F172A" },
      coverCompany: { fontSize: 12, bold: true, color: "#1E293B", margin: [0, 2, 0, 0] },
      muted: { fontSize: 8, color: "#64748B" },
      sectionTitle: { fontSize: 12, bold: true, color: "#0F172A" },
      subSectionTitle: { fontSize: 10, bold: true, color: "#334155", margin: [0, 6, 0, 4] },
      chartTitle: { fontSize: 11, bold: true, color: "#0F172A", margin: [0, 10, 0, 6] },
      chartLegend: { fontSize: 8, color: "#475569" },
      chartExplanation: { fontSize: 9, color: "#1E293B" },
      insightText: { fontSize: 10, color: "#0F172A", lineHeight: 1.35 },
      kpiLabel: { fontSize: 8, color: "#64748B", margin: [8, 6, 8, 0] },
      kpiValue: { fontSize: 11, bold: true, color: "#0F172A", margin: [8, 0, 8, 8] },
      bodyCompact: { fontSize: 9, color: "#334155", lineHeight: 1.3 },
      body: { fontSize: 10, color: "#1F2937" },
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: safeText(company?.nome, "FrotaControl"), style: "muted", margin: [42, 0, 0, 0] },
        { text: `Página ${currentPage} de ${pageCount}`, alignment: "right", style: "muted", margin: [0, 0, 42, 0] },
      ],
    }),
  };

  const printer = await buildPrinter();
  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const companySlug = String(company?.nome || "empresa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const filename = `inteligencia-executiva-${companySlug || "empresa"}-${analysis?.periodo?.tipo || "mes"}.pdf`;
  return { pdfDoc, filename };
};

module.exports = {
  generateExecutivePdf,
};
