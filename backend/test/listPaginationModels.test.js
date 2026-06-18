"use strict";

const test = require("node:test");
const assert = require("node:assert");

const pathDb = require.resolve("../src/db");
const pathVm = require.resolve("../src/models/vehicleModel");
const pathUm = require.resolve("../src/models/userModel");
const pathRm = require.resolve("../src/models/recordModel");
const pathQt = require.resolve("../src/utils/queryTimed");

test("listVehicles envia LIMIT e OFFSET numéricos (sem undefined)", async () => {
  delete require.cache[pathVm];
  delete require.cache[pathQt];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, vals) => {
    calls.push({ sql: String(sql), vals: vals ? [...vals] : [] });
    if (String(sql).includes("COUNT(*)")) {
      return { rows: [{ total: 0 }] };
    }
    return { rows: [] };
  };
  try {
    const { listVehicles } = require("../src/models/vehicleModel");
    await listVehicles(7, { page: 3, limit: 12, search: "" });
    const selectCall = calls.find((c) => String(c.sql).includes("ORDER BY v.created_at"));
    assert.ok(selectCall, "esperado SELECT de veículos");
    assert.ok(!selectCall.vals.some((x) => x === undefined), `valores: ${JSON.stringify(selectCall.vals)}`);
    assert.strictEqual(selectCall.vals[selectCall.vals.length - 2], 12);
    assert.strictEqual(selectCall.vals[selectCall.vals.length - 1], 24);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathVm];
    delete require.cache[pathQt];
    delete require.cache[pathDb];
  }
});

test("listManagerRecords aplica filtros exatos de veiculo_id e motorista_id", async () => {
  delete require.cache[pathRm];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, vals) => {
    calls.push({ sql: String(sql), vals: vals ? [...vals] : [] });
    if (String(sql).includes("COUNT(*)")) {
      return { rows: [{ total: 0 }] };
    }
    return { rows: [] };
  };
  try {
    const { listManagerRecords } = require("../src/models/recordModel");
    await listManagerRecords({
      empresa_id: 8,
      veiculo_id: 44,
      motorista_id: 55,
      tipo: "combustivel",
      page: 1,
      limit: 20,
    });
    const countCall = calls.find((c) => String(c.sql).includes("COUNT(*)"));
    assert.ok(countCall, "esperado SELECT de contagem de registros");
    assert.match(countCall.sql, /JOIN usuarios u ON u\.id = r\.usuario_id AND u\.empresa_id = r\.empresa_id/);
    assert.match(countCall.sql, /JOIN usuarios u ON u\.id = c\.usuario_id AND u\.empresa_id = c\.empresa_id/);
    assert.match(countCall.sql, /JOIN usuarios u ON u\.id = p\.usuario_id AND u\.empresa_id = p\.empresa_id/);
    assert.match(countCall.sql, /LEFT JOIN veiculos v ON v\.id = r\.veiculo_id AND v\.empresa_id = r\.empresa_id/);
    assert.match(countCall.sql, /LEFT JOIN veiculos v ON v\.id = c\.veiculo_id AND v\.empresa_id = c\.empresa_id/);
    assert.match(countCall.sql, /LEFT JOIN veiculos v ON v\.id = p\.veiculo_id AND v\.empresa_id = p\.empresa_id/);
    assert.match(countCall.sql, /r\.veiculo_id = \$2/);
    assert.match(countCall.sql, /r\.usuario_id = \$3/);
    assert.match(countCall.sql, /c\.veiculo_id = \$2/);
    assert.match(countCall.sql, /c\.usuario_id = \$3/);
    assert.match(countCall.sql, /p\.veiculo_id = \$2/);
    assert.match(countCall.sql, /p\.usuario_id = \$3/);
    assert.deepStrictEqual(countCall.vals, [8, 44, 55, "combustivel"]);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathRm];
    delete require.cache[pathDb];
  }
});

test("dashboardStats limita ranking por motorista a empresa do registro", async () => {
  delete require.cache[pathRm];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, vals) => {
    calls.push({ sql: String(sql), vals: vals ? [...vals] : [] });
    return {
      rows: [
        {
          total_hoje: 0,
          total_semanal: 0,
          motoristas_ativos: 0,
          veiculos_ativos: 0,
          por_tipo: [],
          por_tipo_semana: [],
          por_motorista: [],
          ultimos_7_dias: [],
        },
      ],
    };
  };
  try {
    const { dashboardStats } = require("../src/models/recordModel");
    await dashboardStats({ empresa_id: 7, periodo: "dia" });
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0].sql, /SELECT empresa_id, DATE\(COALESCE\(recorded_at_client, data\)\) AS dia/);
    assert.match(calls[0].sql, /JOIN usuarios u ON u\.id = b\.usuario_id AND u\.empresa_id = b\.empresa_id/);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathRm];
    delete require.cache[pathDb];
  }
});

test("listUsersByCompany envia LIMIT e OFFSET numéricos (sem undefined)", async () => {
  delete require.cache[pathUm];
  delete require.cache[pathQt];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, vals) => {
    calls.push({ sql: String(sql), vals: vals ? [...vals] : [] });
    if (String(sql).includes("COUNT(*)")) {
      return { rows: [{ total: 0 }] };
    }
    return { rows: [] };
  };
  try {
    const { listUsersByCompany } = require("../src/models/userModel");
    await listUsersByCompany(5, { page: 2, limit: 20, search: "" });
    const selectCall = calls.find((c) => String(c.sql).includes("ORDER BY u.created_at"));
    assert.ok(selectCall, "esperado SELECT de utilizadores");
    assert.ok(!selectCall.vals.some((x) => x === undefined), `valores: ${JSON.stringify(selectCall.vals)}`);
    assert.strictEqual(selectCall.vals[selectCall.vals.length - 2], 20);
    assert.strictEqual(selectCall.vals[selectCall.vals.length - 1], 20);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathUm];
    delete require.cache[pathQt];
    delete require.cache[pathDb];
  }
});
