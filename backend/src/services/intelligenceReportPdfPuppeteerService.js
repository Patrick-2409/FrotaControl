const PDF_LOG_PREFIX = "[PDF]";

const logPdf = (message, extra) => {
  if (extra !== undefined) {
    console.log(`${PDF_LOG_PREFIX} ${message}`, extra);
    return;
  }
  console.log(`${PDF_LOG_PREFIX} ${message}`);
};

const getFrontendBaseUrl = () => {
  const configured = String(
    process.env.FRONTEND_URL || process.env.PUBLIC_FRONTEND_URL || process.env.VITE_FRONTEND_URL || ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") {
    return "http://127.0.0.1:5173";
  }
  return "";
};

const buildReportPageUrl = (filters = {}) => {
  const base = getFrontendBaseUrl();
  if (!base) {
    const error = new Error("FRONTEND_URL não configurada no servidor para exportação PDF.");
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
    return {
      args: [...chromium.args, ...baseArgs],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
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

  return puppeteer.launch(launchOptions);
};

const waitForReportReady = async (page, timeoutMs = 120_000) => {
  await page.waitForSelector(".fc-report-document", { timeout: timeoutMs });
  await page.waitForFunction(
    () =>
      document.documentElement.getAttribute("data-fc-report-pdf-ready") === "true" ||
      window.__FC_REPORT_PDF_READY__ === true,
    { timeout: timeoutMs }
  );
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

const generateIntelligencePdfFromReportPage = async ({ token, user, filters = {} }) => {
  const url = buildReportPageUrl(filters);
  let browser = null;

  logPdf("carregando página", { url: url.replace(/pdfExport=1/, "pdfExport=1") });

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(120_000);
    page.setDefaultTimeout(120_000);

    const userJson = user ? JSON.stringify(user) : null;
    await injectAuthSession(page, { token, userJson });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 60_000 }).catch(() => {});

    await waitForReportReady(page);
    await waitForChartsRendered(page);
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
  generateIntelligencePdfFromReportPage,
};
