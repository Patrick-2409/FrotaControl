"use strict";

/**
 * Seed idempotente do catálogo estrutural de automações (Bloco 2).
 * `diario_obra` é dado ESTRUTURAL da plataforma (um tipo de automação
 * disponível) — nunca inclui dado de cliente (PPFlora, gestores, chat IDs).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const { listActiveCatalog } = require("../src/modules/automations/models/automationCatalogModel");

test.after(async () => {
  await pool.end();
});

test("seed do catálogo cria diario_obra e não duplica em execuções repetidas", async () => {
  await initAutomationsSchema(pool);
  await initAutomationsSchema(pool);
  await initAutomationsSchema(pool);

  const { rows } = await pool.query(`SELECT codigo, nome FROM automacoes WHERE codigo = 'diario_obra'`);
  assert.equal(rows.length, 1, "deve existir exatamente 1 linha, mesmo após 3 chamadas");
  assert.equal(rows[0].nome, "Diário de Obra");
});

test("catálogo não contém dado de cliente (PPFlora, e-mail, chat id)", async () => {
  const catalog = await listActiveCatalog();
  const serialized = JSON.stringify(catalog).toLowerCase();
  assert.ok(!serialized.includes("ppflora"), "catálogo estrutural não deve mencionar PPFlora");
  assert.ok(!/@/.test(serialized), "catálogo estrutural não deve conter e-mail");
});

test("listActiveCatalog expõe apenas tipos ativos, sem campos internos sensíveis", async () => {
  const catalog = await listActiveCatalog();
  const diario = catalog.find((c) => c.codigo === "diario_obra");
  assert.ok(diario);
  assert.deepEqual(Object.keys(diario).sort(), ["codigo", "descricao", "id", "nome"]);
});
