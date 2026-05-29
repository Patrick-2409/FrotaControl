const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildReportPageUrl,
  buildPdfFilename,
  getFrontendBaseUrl,
  resolveFrontendUrlFromRequest,
  resolveFrontendUrlFromBody,
} = require("../src/services/intelligenceReportPdfPuppeteerService");

test("buildReportPageUrl monta rota do relatório React com pdfExport", () => {
  const previous = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = "https://app.exemplo.com";
  try {
    const url = buildReportPageUrl({
      periodo: "mes",
      tipoAnalise: "geral",
      veiculoId: 12,
      motoristaId: null,
    });
    assert.match(url, /^https:\/\/app\.exemplo\.com\/relatorio-inteligencia\?/);
    assert.match(url, /periodo=mes/);
    assert.match(url, /tipoAnalise=geral/);
    assert.match(url, /veiculoId=12/);
    assert.match(url, /pdfExport=1/);
    assert.doesNotMatch(url, /motoristaId=/);
  } finally {
    if (previous == null) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previous;
  }
});

test("buildReportPageUrl falha sem FRONTEND_URL em produção", () => {
  const previousEnv = process.env.NODE_ENV;
  const previousFrontend = process.env.FRONTEND_URL;
  process.env.NODE_ENV = "production";
  delete process.env.FRONTEND_URL;
  delete process.env.PUBLIC_FRONTEND_URL;
  try {
    assert.equal(getFrontendBaseUrl(), "");
    assert.throws(() => buildReportPageUrl({ periodo: "mes" }), /FRONTEND_URL/);
  } finally {
    process.env.NODE_ENV = previousEnv;
    if (previousFrontend == null) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontend;
  }
});

test("buildPdfFilename usa período do filtro", () => {
  assert.equal(buildPdfFilename({ periodo: "semana" }), "relatorio-inteligencia-semana.pdf");
});

test("getFrontendBaseUrl usa Origin do request quando FRONTEND_URL não está definida", () => {
  const previous = process.env.FRONTEND_URL;
  delete process.env.FRONTEND_URL;
  try {
    const req = { headers: { origin: "https://frotacontrol-frontend.onrender.com" } };
    assert.equal(getFrontendBaseUrl(req), "https://frotacontrol-frontend.onrender.com");
    const url = buildReportPageUrl({ periodo: "mes" }, req);
    assert.match(url, /^https:\/\/frotacontrol-frontend\.onrender\.com\/relatorio-inteligencia\?/);
  } finally {
    if (previous == null) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previous;
  }
});

test("resolveFrontendUrlFromRequest extrai host do Referer", () => {
  assert.equal(
    resolveFrontendUrlFromRequest({
      headers: { referer: "https://app.exemplo.com/relatorio-inteligencia?periodo=mes" },
    }),
    "https://app.exemplo.com"
  );
});

test("resolveFrontendUrlFromBody aceita frontend_url enviada pelo cliente", () => {
  assert.equal(
    resolveFrontendUrlFromBody({
      body: { frontend_url: "https://frotacontrol.onrender.com/" },
    }),
    "https://frotacontrol.onrender.com"
  );
});

test("getFrontendBaseUrl prioriza frontend_url do body sem FRONTEND_URL", () => {
  const previous = process.env.FRONTEND_URL;
  delete process.env.FRONTEND_URL;
  try {
    const req = { body: { frontend_url: "https://app.exemplo.com" }, headers: {} };
    assert.equal(getFrontendBaseUrl(req), "https://app.exemplo.com");
  } finally {
    if (previous == null) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previous;
  }
});
