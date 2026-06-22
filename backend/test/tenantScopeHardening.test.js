"use strict";

const test = require("node:test");
const assert = require("node:assert");

const createRes = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
  send(payload) {
    this.body = payload;
    return this;
  },
  setHeader(name, value) {
    this.headers[name] = value;
    return this;
  },
  end() {
    return this;
  },
});

test("Gestor da empresa A não exporta dados da empresa B", async () => {
  const pathCtrl = require.resolve("../src/controllers/exportController");
  delete require.cache[pathCtrl];
  const { exportCsv } = require(pathCtrl);
  const req = {
    user: { role: "ADMIN_EMPRESA", empresa_id: 1, sub: 10 },
    query: { empresa_id: "2" },
    body: {},
    headers: {},
  };
  const res = createRes();

  await exportCsv(req, res);

  assert.strictEqual(res.statusCode, 403);
  assert.match(String(res.body?.message || ""), /empresa autenticada/i);
});

test("Gestor não consegue passar empresa_id manual de outra empresa na listagem administrativa", async () => {
  const pathCtrl = require.resolve("../src/controllers/dashboardController");
  delete require.cache[pathCtrl];
  const { list } = require(pathCtrl);
  const req = {
    user: { role: "ADMIN_EMPRESA", empresa_id: 7, sub: 21 },
    query: { empresa_id: "99", page: "1", limit: "20" },
    body: {},
  };
  const res = createRes();

  await list(req, res);

  assert.strictEqual(res.statusCode, 403);
  assert.match(String(res.body?.message || ""), /empresa autenticada/i);
});

test("Superadmin sem empresa_id não faz exportação global acidental", async () => {
  const pathCtrl = require.resolve("../src/controllers/exportController");
  delete require.cache[pathCtrl];
  const { exportCsv } = require(pathCtrl);
  const req = {
    user: { role: "SUPER_ADMIN", empresa_id: null, sub: 1 },
    query: {},
    body: {},
    headers: {},
  };
  const res = createRes();

  await exportCsv(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.match(String(res.body?.message || ""), /informe empresa_id ou use scope=all/i);
});

test("Superadmin com scope=all explícito consegue exportação global", async () => {
  const pathCtrl = require.resolve("../src/controllers/exportController");
  const pathRecord = require.resolve("../src/models/recordModel");
  const pathLogger = require.resolve("../src/services/loggerService");
  delete require.cache[pathCtrl];

  const recordModel = require(pathRecord);
  const loggerService = require(pathLogger);
  const originalListManagerRecords = recordModel.listManagerRecords;
  const originalLogInfo = loggerService.logInfo;
  const listCalls = [];
  const logs = [];

  recordModel.listManagerRecords = async (params) => {
    listCalls.push(params);
    return {
      total: 0,
      items: [],
    };
  };
  loggerService.logInfo = (message, meta) => {
    logs.push({ message, meta });
  };

  try {
    const { exportCsv } = require(pathCtrl);
    const req = {
      user: { role: "SUPER_ADMIN", empresa_id: null, sub: 1 },
      query: { scope: "all" },
      body: {},
      headers: {},
      originalUrl: "/api/dashboard/export/csv?scope=all",
    };
    const res = createRes();

    await exportCsv(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(listCalls.length, 2);
    assert.ok(
      listCalls.every(
        (call) =>
          call.empresa_id == null &&
          call.allow_global === true &&
          call.usuario_id == null
      )
    );
    assert.ok(logs.some((entry) => entry.message === "export:global_scope"));
  } finally {
    recordModel.listManagerRecords = originalListManagerRecords;
    loggerService.logInfo = originalLogInfo;
    delete require.cache[pathCtrl];
  }
});

test("Dashboard de empresa sempre usa empresa_id do usuário autenticado", async () => {
  const pathCtrl = require.resolve("../src/controllers/dashboardController");
  const pathDailyOps = require.resolve("../src/services/dailyOperationsService");
  delete require.cache[pathCtrl];

  const dailyOps = require(pathDailyOps);
  const originalDashboardStats = dailyOps.dashboardStats;
  const calls = [];

  dailyOps.dashboardStats = async (params) => {
    calls.push(params);
    return { total_hoje: 0 };
  };

  try {
    const { dashboard } = require(pathCtrl);
    const req = {
      user: { role: "ADMIN_EMPRESA", empresa_id: 44, sub: 3 },
      query: { periodo: "dia" },
      body: {},
    };
    const res = createRes();

    await dashboard(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].empresa_id, 44);
  } finally {
    dailyOps.dashboardStats = originalDashboardStats;
    delete require.cache[pathCtrl];
  }
});

