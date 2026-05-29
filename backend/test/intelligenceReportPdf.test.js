const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildReportPageUrl,
  buildPdfFilename,
  getFrontendBaseUrl,
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
