"use strict";

const test = require("node:test");
const assert = require("node:assert");

const createRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

test("getIntelligenceOverview retorna erro HTTP real sem stack no payload", async () => {
  const pathController = require.resolve("../src/controllers/intelligenceController");
  const pathAnalysis = require.resolve("../src/services/intelligenceAnalysisService");
  const pathLogger = require.resolve("../src/services/loggerService");

  delete require.cache[pathController];
  const analysisModule = require(pathAnalysis);
  const loggerModule = require(pathLogger);
  const originalAnalyzeOperationalData = analysisModule.analyzeOperationalData;
  const originalLogError = loggerModule.logError;
  let loggedError = null;

  analysisModule.analyzeOperationalData = async () => {
    throw new Error("falha-interna-detalhada");
  };
  loggerModule.logError = (message, meta) => {
    loggedError = { message, meta };
  };

  try {
    delete require.cache[pathController];
    const { getIntelligenceOverview } = require(pathController);
    const req = {
      user: {
        sub: 99,
        empresa_id: 7,
        role: "ADMIN_EMPRESA",
      },
      query: {},
      body: {},
    };
    const res = createRes();

    await getIntelligenceOverview(req, res);

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body?.success, false);
    assert.ok(typeof res.body?.message === "string" && res.body.message.length > 0);
    assert.strictEqual(res.body?.stack, undefined);
    assert.strictEqual(res.body?.erro_debug, undefined);
    assert.strictEqual(res.body?.erro, undefined);
    assert.ok(loggedError, "erro deveria ser logado no servidor");
    assert.ok(!/falha-interna-detalhada/i.test(String(res.body?.message || "")));
  } finally {
    analysisModule.analyzeOperationalData = originalAnalyzeOperationalData;
    loggerModule.logError = originalLogError;
    delete require.cache[pathController];
  }
});

