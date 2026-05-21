"use strict";

const test = require("node:test");
const assert = require("node:assert");

const pathDb = require.resolve("../src/db");
const pathVm = require.resolve("../src/models/vehicleModel");
const pathUm = require.resolve("../src/models/userModel");
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
