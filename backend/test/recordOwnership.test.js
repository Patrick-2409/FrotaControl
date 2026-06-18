"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  upsertRomaneio,
  upsertCombustivel,
  upsertParteDiaria,
} = require("../src/models/recordModel");

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
  return res;
};

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

test("createCombustivel rejeita veiculo que nao pertence a empresa do motorista", async () => {
  const pathDb = require.resolve("../src/db");
  const pathCtrl = require.resolve("../src/controllers/recordController");
  delete require.cache[pathCtrl];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    if (/SELECT 1 FROM veiculos WHERE id = \$1 AND empresa_id = \$2/.test(String(sql))) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`consulta inesperada: ${sql}`);
  };
  try {
    const { createCombustivel } = require("../src/controllers/recordController");
    const res = createRes();
    await createCombustivel(
      {
        user: { role: "MOTORISTA", empresa_id: 7, sub: 22 },
        body: {
          source_id: "source-combustivel-fora-empresa",
          data: "2026-06-18T08:00:00",
          veiculo_id: 99,
          litros: 10,
          valor_total: 60,
          tipo_combustivel: "Diesel",
        },
      },
      res
    );

    assert.strictEqual(res.statusCode, 400);
    assert.match(res.body?.message || "", /veiculo invalido/i);
    assert.deepStrictEqual(calls[0].params, [99, 7]);
    assert.ok(!calls.some((c) => /INSERT INTO combustiveis/.test(c.sql)));
  } finally {
    db.pool.query = orig;
    delete require.cache[pathCtrl];
    delete require.cache[pathDb];
  }
});

test("listMotoristaRecords junta veiculo somente quando pertence a mesma empresa do registro", async () => {
  const pathDb = require.resolve("../src/db");
  const pathRm = require.resolve("../src/models/recordModel");
  delete require.cache[pathRm];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    return { rows: [] };
  };
  try {
    const { listMotoristaRecords } = require("../src/models/recordModel");
    await listMotoristaRecords({ empresa_id: 7, usuario_id: 22 });
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0].sql, /LEFT JOIN veiculos v ON v\.id = r\.veiculo_id AND v\.empresa_id = r\.empresa_id/);
    assert.match(calls[0].sql, /LEFT JOIN veiculos v ON v\.id = c\.veiculo_id AND v\.empresa_id = c\.empresa_id/);
    assert.match(calls[0].sql, /LEFT JOIN veiculos v ON v\.id = p\.veiculo_id AND v\.empresa_id = p\.empresa_id/);
    assert.deepStrictEqual(calls[0].params, [7, 22]);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathRm];
    delete require.cache[pathDb];
  }
});
