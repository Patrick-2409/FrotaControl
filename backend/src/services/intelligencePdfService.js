const fs = require("fs/promises");
const path = require("path");
const PDFDocument = require("pdfkit");
const { getCompanyById } = require("../models/companyModel");

let puppeteerModule = null;

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

const getPuppeteer = () => {
  if (!puppeteerModule) puppeteerModule = require("puppeteer");
  return puppeteerModule;
};

const launchBrowser = async () => {
  const puppeteer = getPuppeteer();
  const timeoutMs = Math.max(20000, Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS || 90000));
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--single-process"],
    timeout: timeoutMs,
    protocolTimeout: timeoutMs,
  });
};

const buildHtmlReport = async ({ company, analysis, report }) => {
  const logoSrc = await resolveLogoDataUrl(company?.logo_url);
  const health = healthFromInsights(analysis?.insights || {});
  const generatedAt = new Date().toLocaleString("pt-BR");
  const indicators = analysis?.indicadores || {};
  const charts = analysis?.graficos || {};

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Inter, Arial, sans-serif; color: #111827; margin: 0; background: #ffffff; }
    .page { padding: 8px 4px; }
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
      <h2>Indicadores</h2>
      <div class="kpis">
        <div class="kpi"><span>Total litros</span><strong>${esc(fmtNum(indicators.totalLitros, 1))} L</strong></div>
        <div class="kpi"><span>Total valor</span><strong>${esc(fmtMoney(indicators.totalValor))}</strong></div>
        <div class="kpi"><span>Preço médio</span><strong>${esc(indicators.precoMedio == null ? "—" : `R$ ${fmtNum(indicators.precoMedio, 2)}/L`)}</strong></div>
        <div class="kpi"><span>Total viagens</span><strong>${esc(fmtNum(indicators.totalViagens))}</strong></div>
        <div class="kpi"><span>Veículos ativos</span><strong>${esc(fmtNum(indicators.veiculosAtivos))}</strong></div>
        <div class="kpi"><span>Veículos ociosos</span><strong>${esc(fmtNum(indicators.veiculosOciosos))}</strong></div>
      </div>
    </section>

    <section class="section">
      <h2>Análise IA</h2>
      <p><strong>Problema principal:</strong> ${esc(report?.problemaPrincipal || "Dados insuficientes para análise")}</p>
      <p style="margin-top:8px;"><strong>Análise:</strong> ${esc(report?.analise || "Dados insuficientes para análise")}</p>
      <p style="margin-top:10px;"><strong>Riscos:</strong></p>
      <ul>${(report?.riscos || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      <p style="margin-top:10px;"><strong>Ações:</strong></p>
      <ul>${(report?.acoes || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
    </section>

    <section class="section">
      <h2>Gráficos</h2>
      <div class="chart">${pieChartSvg(charts.consumoPorVeiculo, "Consumo por veículo")}</div>
      <div class="chart">${lineChartSvg(charts.custoPorPeriodo, "Custo por período")}</div>
      <div class="chart">${dualBarSvg(charts.consumoVsProducao, "Consumo vs produção")}</div>
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

const shouldFallbackToPdfKit = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("could not find chrome") ||
    message.includes("failed to launch") ||
    message.includes("browser was not found") ||
    message.includes("spawn") ||
    message.includes("enoent")
  );
};

const generatePdfWithPdfKit = async ({ company, analysis, report }) =>
  new Promise((resolve, reject) => {
    try {
      const indicators = analysis?.indicadores || {};
      const insights = analysis?.insights || {};
      const health = healthFromInsights(insights);
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
        info: {
          Title: "Central de Inteligência Operacional",
          Author: "FrotaMax",
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const generatedAt = new Date().toLocaleString("pt-BR");
      doc.fontSize(20).fillColor("#0f172a").text("Central de Inteligência Operacional");
      doc.moveDown(0.2);
      doc
        .fontSize(11)
        .fillColor("#475569")
        .text(`${company?.nome || "Empresa"} • ${analysis?.periodo?.inicio || "-"} até ${analysis?.periodo?.fim || "-"}`);
      doc.text(`Tipo: ${analysis?.tipoAnalise || "geral"} • Gerado em: ${generatedAt}`);

      doc.moveDown(0.8);
      doc.fontSize(14).fillColor("#111827").text("Status da operação");
      doc.moveDown(0.2);
      doc.fontSize(18).fillColor(health.color).text(health.label);

      doc.moveDown(0.8);
      doc.fontSize(14).fillColor("#111827").text("Indicadores");
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor("#1f2937");
      doc.text(`• Total litros: ${fmtNum(indicators.totalLitros, 1)} L`);
      doc.text(`• Total valor: ${fmtMoney(indicators.totalValor)}`);
      doc.text(`• Preço médio: ${indicators.precoMedio == null ? "—" : `R$ ${fmtNum(indicators.precoMedio, 2)}/L`}`);
      doc.text(`• Total viagens: ${fmtNum(indicators.totalViagens)}`);
      doc.text(`• Veículos ativos: ${fmtNum(indicators.veiculosAtivos)}`);
      doc.text(`• Veículos ociosos: ${fmtNum(indicators.veiculosOciosos)}`);

      doc.moveDown(0.8);
      doc.fontSize(14).fillColor("#111827").text("Análise IA");
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor("#1f2937");
      doc.text(`Problema principal: ${report?.problemaPrincipal || "Dados insuficientes para análise"}`);
      doc.moveDown(0.3);
      doc.text(`Análise: ${report?.analise || "Dados insuficientes para análise"}`);

      doc.moveDown(0.6);
      doc.fontSize(12).fillColor("#111827").text("Riscos");
      doc.moveDown(0.2);
      const riscos = Array.isArray(report?.riscos) && report.riscos.length ? report.riscos : ["Sem riscos específicos identificados."];
      riscos.forEach((item) => doc.fontSize(11).fillColor("#1f2937").text(`• ${item}`));

      doc.moveDown(0.6);
      doc.fontSize(12).fillColor("#111827").text("Ações recomendadas");
      doc.moveDown(0.2);
      const acoes = Array.isArray(report?.acoes) && report.acoes.length ? report.acoes : ["Reavaliar filtros e gerar novo diagnóstico."];
      acoes.forEach((item) => doc.fontSize(11).fillColor("#1f2937").text(`• ${item}`));

      doc.moveDown(0.8);
      doc
        .fontSize(10)
        .fillColor("#6b7280")
        .text("Observação técnica: PDF gerado em modo de compatibilidade (sem Chromium).", { align: "left" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });

const generateIntelligencePdf = async ({ empresaId, analysis, report }) => {
  const company = await getCompanyById(empresaId);
  const html = await buildHtmlReport({ company, analysis, report });
  let buffer;
  try {
    buffer = await renderPdfFromHtml(html);
  } catch (error) {
    if (!shouldFallbackToPdfKit(error)) {
      throw error;
    }
    console.warn("[INTELIGENCIA][PDF] Puppeteer indisponível, usando fallback PDFKit:", error?.message || error);
    buffer = await generatePdfWithPdfKit({ company, analysis, report });
  }
  const companySlug = String(company?.nome || "empresa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const filename = `inteligencia-operacional-${companySlug || "empresa"}-${analysis?.periodo?.tipo || "mes"}.pdf`;
  return { buffer, filename };
};

module.exports = {
  generateIntelligencePdf,
};
