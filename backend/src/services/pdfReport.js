const fsSync = require("fs");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { getCompanyById } = require("../models/companyModel");

let PdfPrinter;
try {
  // Preferência solicitada para ambiente Node.
  PdfPrinter = require("pdfmake/src/printer");
} catch {
  // Compatibilidade para builds onde src/printer não resolve via CJS.
  const pdfMakeModule = require("pdfmake");
  PdfPrinter = pdfMakeModule?.default || pdfMakeModule;
}

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
      // fallback por HTTP
    }
  }
  let url = String(logoUrl).trim();
  if (!/^https?:\/\//i.test(url)) {
    url = new URL(url.startsWith("/") ? url : `/${url}`, getBaseUrl()).toString();
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const arr = await response.arrayBuffer();
    const buffer = Buffer.from(arr);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const ext = contentType.includes("jpeg")
      ? "jpeg"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("svg")
          ? "svg"
          : "png";
    return `data:${extToMime(ext)};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
};

const statusFromInsights = (analysis = {}) => {
  const insights = analysis?.insights || {};
  const ociosos = toNumber(analysis?.indicadores?.veiculosOciosos);
  if (insights.operacaoParada || insights.consumoSemProducao) return { label: "CRÍTICO", color: "#B91C1C" };
  if (ociosos > 0) return { label: "ATENÇÃO", color: "#B45309" };
  return { label: "SAUDÁVEL", color: "#15803D" };
};

const chartRows = (series, labelKey, valueKey, digits = 1, unit = "") => {
  if (!Array.isArray(series) || !series.length) return [["Sem dados", "—"]];
  return series.slice(0, 8).map((item) => [safeText(item?.[labelKey], "Sem identificação"), `${fmtNum(item?.[valueKey], digits)}${unit}`]);
};

const ensurePdfMakeFonts = async () => {
  if (!fontsReadyPromise) {
    fontsReadyPromise = (async () => {
      const vfsModule = require("pdfmake/build/vfs_fonts.js");
      const vfs = vfsModule?.pdfMake?.vfs || vfsModule;
      const fontDir = path.join(os.tmpdir(), "pdfmake-fonts");
      const files = [
        "Roboto-Regular.ttf",
        "Roboto-Medium.ttf",
        "Roboto-Italic.ttf",
        "Roboto-MediumItalic.ttf",
      ];
      await fs.mkdir(fontDir, { recursive: true });
      await Promise.all(
        files.map(async (filename) => {
          const target = path.join(fontDir, filename);
          if (fsSync.existsSync(target)) return;
          const b64 = vfs?.[filename];
          if (!b64) throw new Error(`Fonte ${filename} não encontrada em pdfmake/build/vfs_fonts.js`);
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
  const company = await getCompanyById(empresaId);
  const logoDataUrl = await resolveLogoDataUrl(company?.logo_url);
  const indicadores = analysis?.indicadores || {};
  const graficos = analysis?.graficos || {};
  const status = statusFromInsights(analysis);
  const generatedAt = new Date().toLocaleString("pt-BR");

  const resumo = safeText(report?.resumoExecutivo || report?.resumo_executivo || report?.resumo);
  const diagnostico = safeText(report?.diagnosticoDetalhado || report?.diagnostico_detalhado || report?.diagnostico);
  const impacto = safeText(report?.impactoFinanceiro || report?.impacto_financeiro || report?.impacto);
  const riscos = safeList(report?.riscos || report?.riscos_operacionais, ["Sem riscos específicos identificados."]);
  const acoes = safeList(report?.acoes || report?.acoes_recomendadas, ["Sem ações recomendadas para o recorte."]);
  const modulos = report?.analiseModulos || report?.analise_modulos || {};

  const content = [
    {
      columns: [
        logoDataUrl ? { image: logoDataUrl, width: 64, margin: [0, 0, 12, 0] } : { text: "" },
        [
          { text: "RELATÓRIO EXECUTIVO DE INTELIGÊNCIA", style: "title" },
          { text: safeText(company?.nome, "Empresa"), style: "subtitle" },
          {
            text: `Período: ${safeText(analysis?.periodo?.inicio, "-")} até ${safeText(analysis?.periodo?.fim, "-")} • Gerado em ${generatedAt}`,
            style: "muted",
          },
        ],
      ],
      margin: [0, 0, 0, 8],
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#E5E7EB" }], margin: [0, 0, 0, 12] },

    { text: "Status da operação", style: "sectionTitle" },
    { text: status.label, color: status.color, bold: true, fontSize: 14, margin: [0, 0, 0, 10] },

    { text: "KPIs principais", style: "sectionTitle" },
    {
      table: {
        headerRows: 1,
        widths: ["*", "*"],
        body: [
          ["Indicador", "Valor"],
          ["Total litros", `${fmtNum(indicadores.totalLitros, 1)} L`],
          ["Total valor", fmtMoney(indicadores.totalValor)],
          ["Preço médio", indicadores.precoMedio == null ? "—" : `R$ ${fmtNum(indicadores.precoMedio, 2)}/L`],
          ["Viagens transporte", fmtNum(indicadores.totalViagensTransporte ?? indicadores.totalViagens)],
          ["Veículos ativos", fmtNum(indicadores.veiculosAtivos)],
          ["Veículos ociosos", fmtNum(indicadores.veiculosOciosos)],
        ],
      },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 10],
    },

    { text: "Resumo executivo (IA)", style: "sectionTitle" },
    { text: resumo, style: "body", margin: [0, 0, 0, 10] },

    { text: "Análise por módulo", style: "sectionTitle" },
    { text: `Combustível: ${safeText(modulos?.combustivel, "Dados insuficientes.")}`, style: "body" },
    { text: `Transporte: ${safeText(modulos?.transporte, "Dados insuficientes.")}`, style: "body" },
    { text: `Apoio: ${safeText(modulos?.apoio || modulos?.frota, "Dados insuficientes.")}`, style: "body", margin: [0, 0, 0, 10] },

    { text: "Diagnóstico", style: "sectionTitle" },
    { text: diagnostico, style: "body", margin: [0, 0, 0, 10] },

    { text: "Impacto financeiro", style: "sectionTitle" },
    { text: impacto, style: "body", margin: [0, 0, 0, 10] },

    { text: "Riscos operacionais", style: "sectionTitle" },
    { ul: riscos, margin: [0, 0, 0, 10] },

    { text: "Ações recomendadas", style: "sectionTitle" },
    { ul: acoes, margin: [0, 0, 0, 10] },

    { text: "Gráficos (dados reais)", style: "sectionTitle" },
    { text: "Consumo por veículo", style: "subSectionTitle" },
    {
      table: { headerRows: 1, widths: ["*", "auto"], body: [["Veículo", "Consumo"], ...chartRows(graficos.consumoPorVeiculo, "veiculo", "litros", 1, " L")] },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 8],
    },
    { text: "Custo ao longo do tempo", style: "subSectionTitle" },
    {
      table: { headerRows: 1, widths: ["*", "auto"], body: [["Período", "Custo"], ...chartRows(graficos.custoPorPeriodo, "periodo", "custo", 2, "")] },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 8],
    },
    { text: "Consumo vs produção", style: "subSectionTitle" },
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto"],
        body: [
          ["Período", "Consumo", "Produção"],
          ...(Array.isArray(graficos.consumoVsProducao) && graficos.consumoVsProducao.length
            ? graficos.consumoVsProducao.slice(0, 8).map((row) => [
                safeText(row?.periodo, "Sem período"),
                fmtNum(row?.consumo, 1),
                fmtNum(row?.producao, 1),
              ])
            : [["Sem dados", "—", "—"]]),
        ],
      },
      layout: "lightHorizontalLines",
    },
  ];

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 36, 40, 36],
    content,
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#111827" },
    styles: {
      title: { fontSize: 16, bold: true, color: "#0F172A" },
      subtitle: { fontSize: 12, bold: true, color: "#1F2937", margin: [0, 2, 0, 2] },
      muted: { fontSize: 9, color: "#6B7280" },
      sectionTitle: { fontSize: 12, bold: true, color: "#111827", margin: [0, 6, 0, 4] },
      subSectionTitle: { fontSize: 10, bold: true, color: "#1F2937", margin: [0, 4, 0, 2] },
      body: { fontSize: 10, color: "#1F2937", lineHeight: 1.25 },
    },
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
