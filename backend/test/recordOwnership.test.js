"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  upsertRomaneio,
  upsertCombustivel,
  upsertParteDiaria,
} = require("../src/models/recordModel");

const createDb = () => {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      return { rows: [] };
    },
  };
};

test("upsertRomaneio nao atualiza source_id de outro motorista", async () => {
  const db = createDb();

  const row = await upsertRomaneio(
    1,
    22,
    {
      veiculo_id: 3,
      source_id: "source-romaneio-1",
      data: "2026-06-18T08:00:00",
      tipo_transporte: "Esteril",
      destino: "Mina",
    },
    db
  );

  assert.strictEqual(row, undefined);
  assert.match(db.calls[0].sql, /WHERE romaneios\.usuario_id = EXCLUDED\.usuario_id/);
  assert.deepStrictEqual(db.calls[0].params.slice(0, 4), [1, 22, 3, "source-romaneio-1"]);
});

test("upsertCombustivel nao atualiza source_id de outro motorista", async () => {
  const db = createDb();

  const row = await upsertCombustivel(
    1,
    22,
    {
      veiculo_id: 3,
      source_id: "source-combustivel-1",
      data: "2026-06-18T08:00:00",
      litros: 10,
      valor_total: 60,
      tipo_combustivel: "Diesel",
    },
    db
  );

  assert.strictEqual(row, undefined);
  assert.match(db.calls[0].sql, /WHERE combustiveis\.usuario_id = EXCLUDED\.usuario_id/);
  assert.deepStrictEqual(db.calls[0].params.slice(0, 4), [1, 22, 3, "source-combustivel-1"]);
});

test("upsertParteDiaria nao atualiza source_id de outro motorista", async () => {
  const db = createDb();

  const row = await upsertParteDiaria(
    1,
    22,
    {
      veiculo_id: 3,
      source_id: "source-parte-1",
      data: "2026-06-18T08:00:00",
      contratado: "Empresa",
      operador: "Motorista",
      equipamento: "Escavadeira",
      marca_modelo: "Modelo",
      local: "Patio",
      periodo: "dia",
      clima: "bom",
      horimetro_inicio: 1,
      horimetro_fim: 2,
      total_horas: 1,
      checklist: {},
    },
    db
  );

  assert.strictEqual(row, undefined);
  assert.match(db.calls[0].sql, /WHERE parte_diaria\.usuario_id = EXCLUDED\.usuario_id/);
  assert.deepStrictEqual(db.calls[0].params.slice(0, 4), [1, 22, 3, "source-parte-1"]);
});
