const PDF_LOG_PREFIX = "[PDF]";

const logPdf = (message, extra) => {
  if (extra !== undefined) {
    console.log(`${PDF_LOG_PREFIX} ${message}`, extra);
    return;
  }
  console.log(`${PDF_LOG_PREFIX} ${message}`);
};

const normalizeBaseUrl = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const isPublicHttpOrigin = (value) => {
  const normalized = normalizeBaseUrl(value);
  if (!/^https?:\/\//i.test(normalized)) return "";

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    const host = parsed.hostname.toLowerCase();
    if (process.env.NODE_ENV === "production") {
      if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return "";
    }
    return normalizeBaseUrl(`${parsed.protocol}//${parsed.host}`);
  } catch {
    return "";
  }
};

const resolveFrontendUrlFromBody = (req) => {
  const raw = String(
    req?.body?.frontend_url ||
      req?.body?.frontendUrl ||
      req?.query?.frontend_url ||
      req?.query?.frontendUrl ||
      ""
  ).trim();
  return isPublicHttpOrigin(raw);
};

const resolveFrontendUrlFromRequest = (req) => {
  if (!req?.headers) return "";

  const fromBody = resolveFrontendUrlFromBody(req);
  if (fromBody) return fromBody;

  const origin = isPublicHttpOrigin(req.headers.origin);
  if (origin) return origin;

  const referer = String(req.headers.referer || req.headers.referrer || "").trim();
  if (!referer) return "";

  try {
    const parsed = new URL(referer);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return isPublicHttpOrigin(`${parsed.protocol}//${parsed.host}`);
    }
  } catch {
    /* ignore */
  }

  return "";
};

const getFrontendBaseUrl = (req) => {
  const configured = normalizeBaseUrl(
    process.env.FRONTEND_URL || process.env.PUBLIC_FRONTEND_URL || process.env.VITE_FRONTEND_URL || ""
  );
  if (configured) return configured;

  const fromRequest = resolveFrontendUrlFromRequest(req);
  if (fromRequest) {
    logPdf("FRONTEND_URL derivada do request", { base: fromRequest });
    return fromRequest;
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://127.0.0.1:5173";
  }

  return "";
};

const buildReportPageUrl = (filters = {}, req) => {
  const base = getFrontendBaseUrl(req);
  if (!base) {
    const error = new Error(
      "FRONTEND_URL não configurada no servidor para exportação PDF. Defina a variável no Render ou acesse pelo domínio do frontend."
    );
    error.statusCode = 503;
    throw error;
  }

  const params = new URLSearchParams();
  params.set("periodo", filters.periodo || "mes");
  params.set("tipoAnalise", filters.tipoAnalise || "geral");
  const veiculoId = Number(filters.veiculoId);
  const motoristaId = Number(filters.motoristaId);
  if (Number.isFinite(veiculoId) && veiculoId > 0) params.set("veiculoId", String(veiculoId));
  if (Number.isFinite(motoristaId) && motoristaId > 0) params.set("motoristaId", String(motoristaId));
  params.set("pdfExport", "1");

  return `${base}/relatorio-inteligencia?${params.toString()}`;
};

const buildPdfFilename = (filters = {}) => {
  const periodo = filters.periodo || "mes";
  return `relatorio-inteligencia-${periodo}.pdf`;
};

const resolveLaunchOptions = async () => {
  const configuredPath = String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
  const isHostedRuntime = Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";

  const baseArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--font-render-hinting=none",
  ];

  if (isHostedRuntime && !configuredPath) {
    const chromium = require("@sparticuz/chromium");
    const puppeteer = require("puppeteer-core");

    chromium.setGraphicsMode = false;

    const mergedArgs = [...chromium.args, ...baseArgs];
    const args =
      typeof puppeteer.defaultArgs === "function"
        ? await puppeteer.defaultArgs({ args: mergedArgs, headless: "shell" })
        : mergedArgs;

    let executablePath;
    try {
      executablePath = await chromium.executablePath();
    } catch (launchErr) {
      const error = new Error(
        `Falha ao preparar Chromium (@sparticuz/chromium): ${launchErr?.message || launchErr}`
      );
      error.statusCode = 503;
      throw error;
    }

    return {
      args,
      defaultViewport: chromium.defaultViewport || { width: 1280, height: 900, deviceScaleFactor: 2 },
      executablePath,
      headless: "shell",
    };
  }

  const options = {
    headless: true,
    args: baseArgs,
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
  };

  if (configuredPath) {
    options.executablePath = configuredPath;
  }

  return options;
};

const launchBrowser = async () => {
  let puppeteer;
  try {
    puppeteer = require("puppeteer-core");
  } catch {
    const error = new Error("puppeteer-core não instalado no servidor.");
    error.statusCode = 503;
    throw error;
  }

  const launchOptions = await resolveLaunchOptions();
  if (!launchOptions.executablePath) {
    const error = new Error(
      "Chromium indisponível. Em produção use @sparticuz/chromium; localmente defina PUPPETEER_EXECUTABLE_PATH."
    );
    error.statusCode = 503;
    throw error;
  }

  try {
    return await puppeteer.launch(launchOptions);
  } catch (launchErr) {
    const error = new Error(`Falha ao iniciar Chromium: ${launchErr?.message || launchErr}`);
    error.statusCode = 503;
    throw error;
  }
};

const getPdfTimeouts = () => {
  const isHosted = Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";
  return {
    reportReadyMs: Number(process.env.PDF_REPORT_READY_MS || (isHosted ? 90_000 : 120_000)),
    chartsMs: Number(process.env.PDF_CHARTS_READY_MS || (isHosted ? 25_000 : 60_000)),
    navigationMs: Number(process.env.PDF_NAVIGATION_MS || (isHosted ? 90_000 : 120_000)),
  };
};

const waitForReportReady = async (page, timeoutMs = 120_000) => {
  await page.waitForSelector(".fc-report-document", { timeout: Math.min(timeoutMs, 45_000) });

  try {
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute("data-fc-report-pdf-ready") === "true" ||
        window.__FC_REPORT_PDF_READY__ === true,
      { timeout: timeoutMs }
    );
    return;
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      ready:
        document.documentElement.getAttribute("data-fc-report-pdf-ready") === "true" ||
        window.__FC_REPORT_PDF_READY__ === true,
      hasDocument: Boolean(document.querySelector(".fc-report-document")),
      hasError: Boolean(document.querySelector(".fc-report-page")?.textContent?.includes("Falha ao carregar")),
      loading: Boolean(document.body?.textContent?.match(/Carregando|Atualizando|PROCESSANDO/i)),
    }));

    logPdf("timeout aguardando sinal pdf-ready", snapshot);

    if (snapshot.ready || (snapshot.hasDocument && !snapshot.loading && !snapshot.hasError)) {
      logPdf("prosseguindo com fallback — documento visível");
      return;
    }

    if (snapshot.hasError) {
      const err = new Error("A página do relatório retornou erro ao carregar dados para o PDF.");
      err.statusCode = 503;
      throw err;
    }

    throw error;
  }
};

const waitForChartsRendered = async (page, timeoutMs = 60_000) => {
  await page
    .waitForFunction(
      () => {
        const root = document.querySelector(".fc-report-document");
        if (!root) return false;

        const chartBlocks = root.querySelectorAll("[data-fc-chart-block]");
        if (!chartBlocks.length) return true;

        return Array.from(chartBlocks).every((block) => block.getAttribute("data-fc-chart-ready") === "true");
      },
      { timeout: timeoutMs }
    )
    .catch(() => {
      /* fallback: aguarda SVG Recharts ou gráficos estáticos */
    });

  await page
    .waitForFunction(
      () => {
        const root = document.querySelector(".fc-report-document");
        if (!root) return false;
        const recharts = root.querySelectorAll(".recharts-wrapper svg");
        if (!recharts.length) {
          return Boolean(root.querySelector("[data-fc-chart-ready='true'], svg path, svg rect"));
        }
        return Array.from(recharts).every((svg) => svg.querySelector("path, rect, line, circle"));
      },
      { timeout: timeoutMs }
    )
    .catch(() => {});
};

const waitForImagesLoaded = async (page) => {
  await page.evaluate(async () => {
    const images = Array.from(document.images || []);
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          })
      )
    );
  });
};

const injectAuthSession = async (page, { token, userJson }) => {
  if (!token) {
    const error = new Error("Token de autenticação ausente para exportação PDF.");
    error.statusCode = 401;
    throw error;
  }

  await page.evaluateOnNewDocument(
    (authToken, serializedUser) => {
      try {
        localStorage.setItem("fc_token", authToken);
        if (serializedUser) localStorage.setItem("fc_user", serializedUser);
      } catch {
        /* ignore */
      }
    },
    token,
    userJson || null
  );
};

const generateIntelligencePdfFromReportPage = async ({ token, user, filters = {}, req }) => {
  const url = buildReportPageUrl(filters, req);
  let browser = null;

  logPdf("carregando página", { url });

  const timeouts = getPdfTimeouts();

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(timeouts.navigationMs);
    page.setDefaultTimeout(timeouts.navigationMs);

    const userJson = user ? JSON.stringify(user) : null;
    await injectAuthSession(page, { token, userJson });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeouts.navigationMs });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 20_000 }).catch(() => {});

    await waitForReportReady(page, timeouts.reportReadyMs);
    await waitForChartsRendered(page, timeouts.chartsMs);
    logPdf("gráficos renderizados");

    await page.evaluate(() => document.fonts.ready);
    await waitForImagesLoaded(page);
    logPdf("imagens carregadas");

    await page.emulateMediaType("print");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });

    logPdf("PDF gerado", { bytes: pdfBuffer?.length || 0 });

    return {
      buffer: Buffer.from(pdfBuffer),
      filename: buildPdfFilename(filters),
    };
  } catch (error) {
    if (!error.statusCode && /timeout|Navigation|net::/i.test(String(error?.message || ""))) {
      error.statusCode = 503;
      error.message = `Timeout ou falha ao carregar o relatório para PDF: ${error.message}`;
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

module.exports = {
  buildReportPageUrl,
  buildPdfFilename,
  getFrontendBaseUrl,
  resolveFrontendUrlFromRequest,
  resolveFrontendUrlFromBody,
  generateIntelligencePdfFromReportPage,
};
