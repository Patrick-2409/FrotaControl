"use strict";

const test = require("node:test");
const assert = require("node:assert");

test("ensureSuperAdminSeed bloqueia seed explícito em produção", async () => {
  const pathDb = require.resolve("../src/db");
  const pathSeed = require.resolve("../src/seed");
  delete require.cache[pathSeed];
  const db = require("../src/db");
  const originalQuery = db.pool.query;

  const envBackup = {
    NODE_ENV: process.env.NODE_ENV,
    ENABLE_SUPERADMIN_SEED: process.env.ENABLE_SUPERADMIN_SEED,
    SUPERADMIN_INITIAL_PASSWORD: process.env.SUPERADMIN_INITIAL_PASSWORD,
  };

  let queryCalls = 0;
  db.pool.query = async () => {
    queryCalls += 1;
    return { rowCount: 0, rows: [] };
  };

  process.env.NODE_ENV = "production";
  process.env.ENABLE_SUPERADMIN_SEED = "true";
  process.env.SUPERADMIN_INITIAL_PASSWORD = "SenhaSuperSegura#2026";

  try {
    const { ensureSuperAdminSeed } = require("../src/seed");
    await assert.rejects(
      () => ensureSuperAdminSeed(),
      /não é permitido em produção/i
    );
    assert.strictEqual(queryCalls, 0, "não deve consultar banco quando configuração é inválida");
  } finally {
    db.pool.query = originalQuery;
    process.env.NODE_ENV = envBackup.NODE_ENV;
    process.env.ENABLE_SUPERADMIN_SEED = envBackup.ENABLE_SUPERADMIN_SEED;
    process.env.SUPERADMIN_INITIAL_PASSWORD = envBackup.SUPERADMIN_INITIAL_PASSWORD;
    delete require.cache[pathSeed];
    delete require.cache[pathDb];
  }
});
