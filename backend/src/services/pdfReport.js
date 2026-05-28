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
  const block = [{ text: title, style: "chartTitle" }, chartNode, ...extras, { text: explanation, style: "chartExplanation", margin: [0, 0, 0, 14] }];
  return block;
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
  const totalFrota =
    toNumber(indicadores.totalVeiculosTransporte) + toNumber(indicadores.totalVeiculosApoio) ||
    toNumber(indicadores.totalVeiculosEscopo);

  const pieData = (graficos.consumoPorVeiculo || []).map((row) => ({
    label: row.veiculo,
    value: row.litros,
  }));
  const pieChart = buildPieChartCanvas(pieData);
  const lineChart = buildLineChartCanvas(graficos.custoPorPeriodo || []);
  const barChart = buildGroupedBarChartCanvas(graficos.consumoVsProducao || []);

  const kpiRows = [
    ["Indicador", "Valor", "Referência"],
    ["Custo total", fmtMoney(indicadores.totalValor), "Abastecimentos no período"],
    ["Consumo total", `${fmtNum(indicadores.totalLitros, 1)} L`, `Transporte ${fmtNum(indicadores.totalLitrosTransporte, 1)} L | Apoio ${fmtNum(indicadores.totalLitrosApoio, 1)} L`],
    ["Preço médio", indicadores.precoMedio == null ? "—" : `R$ ${fmtNum(indicadores.precoMedio, 2)}/L`, "total valor ÷ total litros"],
    ["Produção (transporte)", fmtNum(indicadores.totalViagensTransporte), "Viagens — somente tipo_operacao=transporte"],
    [
      "Utilização da frota",
      totalFrota > 0 ? `${fmtNum(indicadores.veiculosAtivos)}/${fmtNum(totalFrota)} (${metricas.utilizacaoFrotaPct ?? 0}%)` : fmtNum(indicadores.veiculosAtivos),
      "Ativo = viagem OU abastecimento OU parte diária no período",
    ],
    [
      "Ociosidade",
      `${fmtNum(indicadores.veiculosOciosos)} veículo(s)`,
      `${metricas.ociosidadePct ?? 0}% da frota sem movimento registrado`,
    ],
  ];

  const blocoInconsistencia = uniqueInconsistencias.length
    ? [
        alertBox(
          "PRIORIDADE: INCONSISTÊNCIA DE DADOS — o relatório deve ser lido com foco na correção dos lançamentos antes de decisões operacionais.",
          "#B91C1C",
          "#FEF2F2"
        ),
        { text: "Inconsistências detectadas", style: "alertTitle", color: "#B91C1C" },
        {
          text:
            "Produção sem consumo ou consumo sem produção indicam falha de integração, lançamento omitido ou tipo_operacao incorreto. Enquanto não corrigido, indicadores de eficiência ficam inválidos.",
          style: "body",
          margin: [0, 0, 0, 6],
        },
        { ul: uniqueInconsistencias.map((item) => `ERRO DE DADO: ${item}`), margin: [0, 0, 0, 14] },
      ]
    : [];

  const content = [
    // —— 1. CAPA ——
    {
      columns: [
        logoDataUrl
          ? { image: logoDataUrl, width: 72, maxHeight: 72, margin: [0, 0, 16, 0] }
          : { width: 72, text: "" },
        [
          { text: "RELATÓRIO EXECUTIVO", style: "coverTitle" },
          { text: "Inteligência Operacional", style: "coverSubtitle" },
          { text: safeText(company?.nome, "Empresa"), style: "coverCompany" },
          {
            text: `Período: ${safeText(analysis?.periodo?.inicio, "-")} até ${safeText(analysis?.periodo?.fim, "-")}`,
            style: "muted",
            margin: [0, 6, 0, 0],
          },
          { text: `Gerado em ${generatedAt}`, style: "muted" },
          { text: `Escopo: ${safeText(analysis?.tipoAnalise, "geral").toUpperCase()}`, style: "muted" },
        ],
      ],
      margin: [0, 40, 0, 0],
    },
    { text: "", pageBreak: "after" },

    // —— AVISO TESTE ——
    ...(contextoTeste ? [alertBox(insights.mensagemContextoTeste || MENSAGEM_CONTEXTO_TESTE)] : []),

    statusBox(status),
    ...blocoInconsistencia,

    sectionDivider(),
    { text: prioridadeInconsistencia ? "1. Resumo executivo (foco em correção de dados)" : "1. Resumo executivo", style: "sectionTitle" },
    { text: resumo, style: "body", margin: [0, 0, 0, 12] },

    sectionDivider(),
    { text: "2. KPIs do período", style: "sectionTitle" },
    {
      table: { headerRows: 1, widths: ["*", "auto", "*"], body: kpiRows },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 14],
    },

    // —— 4. GRÁFICOS ——
    sectionDivider(),
    { text: "3. Gráficos analíticos (dados reais)", style: "sectionTitle" },
    ...chartBlock(
      "3.1 Consumo por veículo (pizza)",
      { ...pieChart, margin: [0, 4, 0, 0] },
      CHART_EXPLANATIONS.consumoPorVeiculo,
      [
        { text: chartLegendNote("pie"), style: "chartLegend", margin: [0, 4, 0, 2] },
        { text: pieChart.empty ? "Sem dados no período." : pieLegendText(pieChart), style: "chartLegend", margin: [0, 0, 0, 2] },
        pieLegendTable(pieChart),
      ]
    ),
    ...chartBlock(
      "3.2 Custo ao longo do tempo (linha)",
      { ...lineChart, margin: [0, 4, 0, 0] },
      CHART_EXPLANATIONS.custoPorPeriodo,
      [
        { text: chartLegendNote("line"), style: "chartLegend", margin: [0, 4, 0, 2] },
        lineDataTable(lineChart),
      ]
    ),
    ...chartBlock(
      "3.3 Consumo vs produção — transporte (barras)",
      { ...barChart, margin: [0, 4, 0, 0] },
      CHART_EXPLANATIONS.consumoVsProducao,
      [
        { text: chartLegendNote("bar"), style: "chartLegend", margin: [0, 4, 0, 2] },
        barDataTable(barChart),
      ]
    ),

    // —— 5. ANÁLISE POR MÓDULO ——
    sectionDivider(),
    { text: "4. Análise por módulo", style: "sectionTitle" },
    { text: `Combustível: ${safeText(modulos?.combustivel)}`, style: "body" },
    { text: `Transporte (produção): ${safeText(modulos?.transporte)}`, style: "body" },
    { text: `Apoio (sem produção): ${safeText(modulos?.apoio || modulos?.frota)}`, style: "body", margin: [0, 0, 0, 12] },

    // —— 6. DIAGNÓSTICO ——
    sectionDivider(),
    { text: "5. Diagnóstico inteligente", style: "sectionTitle" },
    { text: diagnostico, style: "body", margin: [0, 0, 0, 12] },

    // —— 7. IMPACTO ——
    sectionDivider(),
    { text: "6. Impacto financeiro", style: "sectionTitle" },
    { text: impacto, style: "body", margin: [0, 0, 0, 12] },

    // —— 8. RISCOS ——
    sectionDivider(),
    { text: "7. Riscos operacionais", style: "sectionTitle" },
    { ul: riscos, margin: [0, 0, 0, 12] },

    // —— 9. AÇÕES ——
    sectionDivider(),
    { text: "8. Ações recomendadas", style: "sectionTitle" },
    { ul: acoes, margin: [0, 0, 0, 8] },
    {
      text: "Regras operacionais: transporte possui produção (viagens); apoio não possui produção — não misturar contextos na execução das ações.",
      style: "muted",
      italics: true,
    },
  ];

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [42, 48, 42, 48],
    content,
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#111827", lineHeight: 1.3 },
    styles: {
      coverTitle: { fontSize: 22, bold: true, color: "#0F172A" },
      coverSubtitle: { fontSize: 13, color: "#334155", margin: [0, 4, 0, 0] },
      coverCompany: { fontSize: 14, bold: true, color: "#1E293B", margin: [0, 12, 0, 0] },
      title: { fontSize: 16, bold: true, color: "#0F172A" },
      subtitle: { fontSize: 12, bold: true, color: "#1F2937" },
      muted: { fontSize: 9, color: "#6B7280" },
      sectionTitle: { fontSize: 13, bold: true, color: "#0F172A", margin: [0, 4, 0, 8] },
      chartTitle: { fontSize: 11, bold: true, color: "#1F2937", margin: [0, 8, 0, 4] },
      chartLegend: { fontSize: 8, color: "#4B5563" },
      chartExplanation: { fontSize: 9, color: "#374151", italics: true },
      alertTitle: { fontSize: 12, bold: true, margin: [0, 0, 0, 4] },
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
