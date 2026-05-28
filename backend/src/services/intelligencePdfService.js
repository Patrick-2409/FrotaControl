const fs = require("fs/promises");
const path = require("path");
const { getCompanyById } = require("../models/companyModel");

const PDF_MAINTENANCE_MESSAGE = "Geração de PDF temporariamente desativada para manutenção";

const COLORS = {
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#ca8a04",
  red: "#dc2626",
  gray: "#6b7280",
  white: "#ffffff",
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const fmtNum = (value, digits = 0) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "—";

const fmtMoney = (value) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

const ensureText = (value, fallback = "Dados insuficientes para análise.") => {
  const raw = String(value || "").trim();
  return raw || fallback;
};

const ensureList = (value, fallback = []) => {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((item) => String(item || "").trim()).filter(Boolean);
  return list.length ? list : fallback;
};

const resolveExecutiveReport = (report = {}) => {
  const resumoExecutivo = ensureText(report?.resumoExecutivo || report?.resumo_executivo, ensureText(report?.analise));
  const diagnosticoDetalhado = ensureText(
    report?.diagnosticoDetalhado || report?.diagnostico_detalhado,
    ensureText(report?.problemaPrincipal)
  );
  const analiseModulos = report?.analiseModulos || report?.analise_modulos || {};
  const moduloCombustivel = ensureText(analiseModulos?.combustivel, "Dados insuficientes de combustível para análise.");
  const moduloTransporte = ensureText(analiseModulos?.transporte, "Dados insuficientes de transporte para análise.");
  const moduloApoio = ensureText(analiseModulos?.apoio || analiseModulos?.frota, "Dados insuficientes de apoio para análise.");
  const impactoFinanceiro = ensureText(report?.impactoFinanceiro || report?.impacto_financeiro, "Impacto financeiro indisponível.");
  const riscos = ensureList(report?.riscos || report?.riscos_operacionais, ["Sem riscos específicos identificados."]);
  const acoes = ensureList(report?.acoes || report?.acoes_recomendadas, ["Reavaliar filtros e gerar novo diagnóstico."]);
  const inconsistencias = ensureList(report?.inconsistencias, []);
  const kpis = Array.isArray(report?.kpis)
    ? report.kpis
        .map((item) => ({
          nome: String(item?.nome || "").trim(),
          valor: String(item?.valor || "").trim(),
          formula: String(item?.formula || item?.calculo || "").trim(),
        }))
        .filter((item) => item.nome && item.valor)
    : [];
  const calculos = ensureList(report?.calculosUtilizados || report?.calculos_utilizados, [
    "Preço médio = total valor / total litros",
    "Eficiência = km rodados / litros consumidos (quando km disponível)",
  ]);

  return {
    resumoExecutivo,
    diagnosticoDetalhado,
    moduloCombustivel,
    moduloTransporte,
    moduloApoio,
    impactoFinanceiro,
    riscos,
    acoes,
    inconsistencias,
    kpis,
    calculos,
  };
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

const healthFromInsights = (insights = {}) => {
  if (insights.operacaoParada || insights.consumoSemProducao) return { label: "Crítico", color: COLORS.red, bg: "#fef2f2" };
  if (Array.isArray(insights.veiculosOciosos) && insights.veiculosOciosos.length > 0) {
    return { label: "Atenção", color: COLORS.yellow, bg: "#fefce8" };
  }
  return { label: "Saudável", color: COLORS.green, bg: "#ecfdf5" };
};

const yDomain = (values) => {
  const clean = values.filter((v) => Number.isFinite(v));
  const max = clean.length ? Math.max(...clean) : 0;
  return max <= 0 ? 1 : max;
};

const emptyChartSvg = (label) => `
<svg viewBox="0 0 720 220" width="100%" height="220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}">
  <rect x="0" y="0" width="720" height="220" rx="10" fill="${COLORS.white}" />
  <text x="360" y="115" text-anchor="middle" fill="${COLORS.gray}" font-size="16" font-family="Inter, Arial, sans-serif">Sem atividade no período</text>
</svg>`;

const pieChartSvg = (series, title) => {
  if (!Array.isArray(series) || !series.length) return emptyChartSvg(title);
  const total = series.reduce((acc, item) => acc + toNumber(item.litros), 0);
  if (total <= 0) return emptyChartSvg(title);
  const colors = [COLORS.blue, COLORS.green, COLORS.yellow, COLORS.red, COLORS.gray];
  const centerX = 180;
  const centerY = 110;
  const radius = 72;
  let angleStart = -Math.PI / 2;
  const slices = series.slice(0, 5).map((item, index) => {
    const value = toNumber(item.litros);
    const arc = (value / total) * Math.PI * 2;
    const angleEnd = angleStart + arc;
    const x1 = centerX + radius * Math.cos(angleStart);
    const y1 = centerY + radius * Math.sin(angleStart);
    const x2 = centerX + radius * Math.cos(angleEnd);
    const y2 = centerY + radius * Math.sin(angleEnd);
    const largeArc = arc > Math.PI ? 1 : 0;
    const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    angleStart = angleEnd;
    return `<path d="${path}" fill="${colors[index % colors.length]}" opacity="0.95" />`;
  });
  const legend = series
    .slice(0, 5)
    .map(
      (item, i) =>
        `<rect x="320" y="${30 + i * 28}" width="12" height="12" rx="3" fill="${colors[i % colors.length]}" />
         <text x="338" y="${40 + i * 28}" fill="${COLORS.gray}" font-size="12" font-family="Inter, Arial, sans-serif">${esc(item.veiculo)} (${fmtNum(
           item.litros,
           1
         )} L)</text>`
    )
    .join("");
  return `
<svg viewBox="0 0 720 220" width="100%" height="220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <rect x="0" y="0" width="720" height="220" rx="10" fill="${COLORS.white}" />
  ${slices.join("")}
  ${legend}
</svg>`;
};

const lineChartSvg = (series, title) => {
  if (!Array.isArray(series) || series.length === 0) return emptyChartSvg(title);
  const width = 720;
  const height = 220;
  const padX = 38;
  const padY = 26;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const values = series.map((p) => toNumber(p.custo, NaN)).filter((v) => Number.isFinite(v));
  if (!values.length) return emptyChartSvg(title);
  const maxY = yDomain(values);
  const points = series
    .map((p, i) => {
      const x = padX + (chartW * i) / Math.max(1, series.length - 1);
      const y = padY + chartH - (chartH * toNumber(p.custo)) / maxY;
      return `${x},${y}`;
    })
    .join(" ");
  return `
<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="${COLORS.white}" />
  <polyline fill="none" stroke="${COLORS.blue}" stroke-width="3" points="${points}" />
</svg>`;
};

const dualBarSvg = (series, title) => {
  if (!Array.isArray(series) || series.length === 0) return emptyChartSvg(title);
  const width = 720;
  const height = 220;
  const padX = 36;
  const padY = 24;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const valuesA = series.map((p) => toNumber(p.consumo, NaN)).filter((v) => Number.isFinite(v));
  const valuesB = series.map((p) => toNumber(p.producao, NaN)).filter((v) => Number.isFinite(v));
  if (!valuesA.length && !valuesB.length) return emptyChartSvg(title);
  const maxY = yDomain([...valuesA, ...valuesB]);
  const groupW = chartW / Math.max(1, series.length);
  const barW = Math.max(3, groupW / 2 - 6);
  const bars = series
    .map((p, i) => {
      const baseX = padX + i * groupW + 2;
      const valueA = toNumber(p.consumo, 0);
      const valueB = toNumber(p.producao, 0);
      const hA = (chartH * valueA) / maxY;
      const hB = (chartH * valueB) / maxY;
      const yA = padY + chartH - hA;
      const yB = padY + chartH - hB;
      return `
        <rect x="${baseX}" y="${yA}" width="${barW}" height="${hA}" rx="4" fill="${COLORS.yellow}" opacity="0.9" />
        <rect x="${baseX + barW + 3}" y="${yB}" width="${barW}" height="${hB}" rx="4" fill="${COLORS.green}" opacity="0.9" />
      `;
    })
    .join("");
  return `
<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="${COLORS.white}" />
  ${bars}
  <circle cx="${width - 170}" cy="20" r="5" fill="${COLORS.yellow}" /><text x="${width - 160}" y="24" fill="${COLORS.gray}" font-size="11" font-family="Inter, Arial, sans-serif">Consumo</text>
  <circle cx="${width - 88}" cy="20" r="5" fill="${COLORS.green}" /><text x="${width - 78}" y="24" fill="${COLORS.gray}" font-size="11" font-family="Inter, Arial, sans-serif">Produção</text>
</svg>`;
};

const launchBrowser = async () => {
  throw new Error(PDF_MAINTENANCE_MESSAGE);
};

const buildHtmlReport = async ({ company, analysis, report }) => {
  const logoSrc = await resolveLogoDataUrl(company?.logo_url);
  const health = healthFromInsights(analysis?.insights || {});
  const generatedAt = new Date().toLocaleString("pt-BR");
  const indicators = analysis?.indicadores || {};
  const charts = analysis?.graficos || {};
  const executivo = resolveExecutiveReport(report);
  const kpisExecutivos = executivo.kpis.length
    ? executivo.kpis
    : [
        { nome: "Total litros", valor: `${fmtNum(indicators.totalLitros, 1)} L`, formula: "Somatório dos litros abastecidos no período" },
        { nome: "Total valor", valor: fmtMoney(indicators.totalValor), formula: "Somatório financeiro do período" },
        {
          nome: "Preço médio",
          valor: indicators.precoMedio == null ? "—" : `R$ ${fmtNum(indicators.precoMedio, 2)}/L`,
          formula: "Preço médio = total valor / total litros",
        },
        { nome: "Viagens transporte", valor: fmtNum(indicators.totalViagensTransporte ?? indicators.totalViagens), formula: "Contagem de viagens de transporte" },
      ];

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Inter, Arial, sans-serif; color: #111827; margin: 0; background: #ffffff; }
    .page { padding: 8px 4px; }
    .cover {
      min-height: 96vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      border: 2px solid #dbe2ea;
      border-radius: 18px;
      padding: 40px 28px;
      page-break-after: always;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    }
    .cover h1 { margin: 14px 0 8px; font-size: 30px; color: #0f172a; }
    .cover h2 { margin: 0; font-size: 16px; color: #334155; font-weight: 600; }
    .cover .meta { margin-top: 24px; font-size: 12px; color: #64748b; text-align: center; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .header h1 { margin: 0; font-size: 22px; color: #0f172a; }
    .meta { color: #6b7280; font-size: 12px; line-height: 1.5; text-align: right; }
    .section { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin-bottom: 12px; }
    .section h2 { margin: 0 0 8px; font-size: 15px; color: #111827; }
    .section p { margin: 0; color: #374151; line-height: 1.5; font-size: 13px; }
    .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; padding: 8px 10px; }
    .kpi span { display: block; color: #6b7280; font-size: 11px; margin-bottom: 4px; }
    .kpi strong { font-size: 14px; color: #111827; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 5px 0; font-size: 13px; color: #1f2937; }
    .chart { margin-top: 8px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 8px; background: #fff; }
    .footer { margin-top: 16px; text-align: center; color: #6b7280; font-size: 11px; }
  </style>
</head>
<body>
  <div class="cover">
    ${logoSrc ? `<img src="${esc(logoSrc)}" alt="Logo da empresa" style="width:120px;height:120px;object-fit:contain;border-radius:16px;border:1px solid #e5e7eb;background:#fff;padding:8px;" />` : ""}
    <h1>Relatório Executivo Profissional</h1>
    <h2>Central de Inteligência Operacional</h2>
    <div style="margin-top:18px;font-size:14px;color:#334155;font-weight:600;">${esc(company?.nome || "Empresa")}</div>
    <div class="meta">
      <div>Período: ${esc(analysis?.periodo?.inicio)} até ${esc(analysis?.periodo?.fim)}</div>
      <div>Tipo de análise: ${esc(analysis?.tipoAnalise || "geral")}</div>
      <div>Gerado em: ${esc(generatedAt)}</div>
    </div>
  </div>
  <div class="page">
    <header class="header">
      <div style="display:flex;align-items:center;gap:12px;">
        ${logoSrc ? `<img src="${esc(logoSrc)}" alt="Logo da empresa" style="width:68px;height:68px;object-fit:contain;border-radius:10px;border:1px solid #e5e7eb;background:#fff;padding:4px;" />` : ""}
        <div>
          <h1>Central de Inteligência Operacional</h1>
          <div style="font-size:12px;color:#475569;">${esc(company?.nome || "Empresa")} • ${esc(analysis?.periodo?.inicio)} até ${esc(
            analysis?.periodo?.fim
          )}</div>
        </div>
      </div>
      <div class="meta">
        <div>Tipo: ${esc(analysis?.tipoAnalise || "geral")}</div>
        <div>Gerado em: ${esc(generatedAt)}</div>
      </div>
    </header>

    <section class="section" style="background:${health.bg};">
      <h2>Status da Operação</h2>
      <p style="font-size:28px;font-weight:700;color:${health.color};">${esc(health.label)}</p>
    </section>

    <section class="section">
      <h2>KPIs</h2>
      <div class="kpis">
        ${kpisExecutivos
          .map(
            (kpi) =>
              `<div class="kpi"><span>${esc(kpi.nome)}</span><strong>${esc(kpi.valor)}</strong><div style="margin-top:4px;font-size:10px;color:#6b7280;">${esc(
                kpi.formula || "Sem fórmula informada"
              )}</div></div>`
          )
          .join("")}
      </div>
    </section>

    <section class="section">
      <h2>Gráficos</h2>
      <div class="chart">${pieChartSvg(charts.consumoPorVeiculo, "Consumo por veículo")}</div>
      <div class="chart">${lineChartSvg(charts.custoPorPeriodo, "Custo por período")}</div>
      <div class="chart">${dualBarSvg(charts.consumoVsProducao, "Consumo vs produção")}</div>
    </section>

    <section class="section">
      <h2>Resumo Executivo</h2>
      <p>${esc(executivo.resumoExecutivo)}</p>
      <p style="margin-top:10px;"><strong>Análise por módulo - Combustível:</strong> ${esc(executivo.moduloCombustivel)}</p>
      <p style="margin-top:8px;"><strong>Análise por módulo - Transporte:</strong> ${esc(executivo.moduloTransporte)}</p>
      <p style="margin-top:8px;"><strong>Análise por módulo - Apoio:</strong> ${esc(executivo.moduloApoio)}</p>
    </section>

    <section class="section">
      <h2>Diagnóstico</h2>
      <p>${esc(executivo.diagnosticoDetalhado)}</p>
      <p style="margin-top:10px;"><strong>Impacto financeiro:</strong> ${esc(executivo.impactoFinanceiro)}</p>
      ${
        executivo.inconsistencias.length
          ? `<p style="margin-top:10px;"><strong>Inconsistências detectadas:</strong></p><ul>${executivo.inconsistencias
              .map((item) => `<li>${esc(item)}</li>`)
              .join("")}</ul>`
          : ""
      }
    </section>

    <section class="section">
      <h2>Riscos</h2>
      <ul>${executivo.riscos.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
    </section>

    <section class="section">
      <h2>Ações recomendadas</h2>
      <ul>${executivo.acoes.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      <p style="margin-top:10px;"><strong>Cálculos utilizados:</strong></p>
      <ul>${executivo.calculos.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
    </section>

    <div class="footer">Relatório gerado automaticamente pelo FrotaMax.</div>
  </div>
</body>
</html>`;
};

const renderPdfFromHtml = async (html) => {
  let browser = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 960, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 15000 }).catch(() => {});
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

const generateIntelligenceHtml = buildHtmlReport;

const generateIntelligencePdf = async ({ empresaId, analysis, report }) => {
  const error = new Error(PDF_MAINTENANCE_MESSAGE);
  error.statusCode = 501;
  throw error;
};

const generateDebugPdf = async () => {
  const error = new Error(PDF_MAINTENANCE_MESSAGE);
  error.statusCode = 501;
  throw error;
};

module.exports = {
  generateIntelligenceHtml,
  generateIntelligencePdf,
  generateDebugPdf,
};
