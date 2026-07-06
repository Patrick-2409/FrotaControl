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

test("listUsersByCompany usa fallback sem depender de profile_image_url e preserva isolamento por empresa", async () => {
  delete require.cache[pathUm];
  delete require.cache[pathQt];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, vals) => {
    const text = String(sql);
    calls.push({ sql: text, vals: vals ? [...vals] : [] });
    if (text.includes("information_schema.columns")) {
      const tableName = String(vals?.[0] || "");
      if (tableName === "usuarios") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "nome" },
            { column_name: "email" },
            { column_name: "cpf_id" },
            { column_name: "role" },
            { column_name: "veiculo_id" },
            { column_name: "created_at" },
          ],
        };
      }
      if (tableName === "veiculos") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "nome" },
            { column_name: "placa" },
            { column_name: "marca" },
            { column_name: "modelo" },
            { column_name: "tipo_operacao" },
            { column_name: "usa_para_transporte" },
          ],
        };
      }
      if (tableName === "motorista_veiculos") {
        return {
          rows: [
            { column_name: "empresa_id" },
            { column_name: "motorista_id" },
            { column_name: "veiculo_id" },
            { column_name: "is_principal" },
          ],
        };
      }
      return { rows: [] };
    }
    if (text.includes("COUNT(*)")) {
      return { rows: [{ total: 1 }] };
    }
    return {
      rows: [
        {
          id: 12,
          empresa_id: 5,
          nome: "Motorista Sem Vinculo Novo",
          email: "m@empresa.com",
          cpf_id: "123",
          role: "MOTORISTA",
          veiculo_id: null,
          profile_image_url: null,
          created_at: new Date(),
        },
      ],
    };
  };
  try {
    const { listUsersByCompany } = require("../src/models/userModel");
    const result = await listUsersByCompany(5, { page: 1, limit: 20, search: "" });
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.items[0].nome, "Motorista Sem Vinculo Novo");
    const fallbackList = calls.find((c) => /usuarios-list-basic/.test(c.sql) || /'ativo'::text AS status_operacional/.test(c.sql));
    assert.ok(fallbackList, "esperada query basica de fallback");
    assert.ok(!/LEFT JOIN LATERAL/.test(fallbackList.sql));
    assert.ok(!/u\.profile_image_url/.test(fallbackList.sql));
    assert.ok(!/v\.marca/.test(fallbackList.sql));
    assert.ok(!/v\.modelo/.test(fallbackList.sql));
    const countCall = calls.find((c) => /SELECT COUNT\(\*\)::int AS total FROM usuarios u WHERE/.test(c.sql));
    assert.ok(countCall, "esperada query de contagem");
    assert.match(countCall.sql, /u\.empresa_id = \$1/);
    assert.strictEqual(countCall.vals[0], 5);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathUm];
    delete require.cache[pathQt];
    delete require.cache[pathDb];
  }
});

test("listUsersByCompany usa fallback sem depender de marca/modelo e retorna lista essencial paginada", async () => {
  delete require.cache[pathUm];
  delete require.cache[pathQt];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, vals) => {
    const text = String(sql);
    calls.push({ sql: text, vals: vals ? [...vals] : [] });
    if (text.includes("information_schema.columns")) {
      const tableName = String(vals?.[0] || "");
      if (tableName === "usuarios") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "nome" },
            { column_name: "email" },
            { column_name: "cpf_id" },
            { column_name: "role" },
            { column_name: "veiculo_id" },
            { column_name: "profile_image_url" },
            { column_name: "funcao" },
            { column_name: "cnh_categoria" },
            { column_name: "cnh_numero" },
            { column_name: "cnh_validade" },
            { column_name: "treinamentos" },
            { column_name: "observacoes" },
            { column_name: "equipamento_vinculo" },
            { column_name: "operacao_escopo" },
            { column_name: "status_operacional" },
            { column_name: "conta_status" },
            { column_name: "created_at" },
          ],
        };
      }
      if (tableName === "veiculos") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "nome" },
            { column_name: "placa" },
          ],
        };
      }
      if (tableName === "motorista_veiculos") {
        return {
          rows: [
            { column_name: "empresa_id" },
            { column_name: "motorista_id" },
            { column_name: "veiculo_id" },
            { column_name: "is_principal" },
          ],
        };
      }
      return { rows: [] };
    }
    if (text.includes("COUNT(*)")) {
      return { rows: [{ total: 2 }] };
    }
    return {
      rows: [
        {
          id: 21,
          empresa_id: 5,
          nome: "Pessoa A",
          email: "a@empresa.com",
          cpf_id: "111",
          role: "APONTADOR",
          veiculo_id: null,
          created_at: new Date(),
        },
      ],
    };
  };
  try {
    const { listUsersByCompany } = require("../src/models/userModel");
    const result = await listUsersByCompany(5, {
      page: 2,
      limit: 20,
      search: "Pessoa",
      role: "APONTADOR",
      status_operacional: "ativo",
    });
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].nome, "Pessoa A");
    const fallbackList = calls.find((c) => /'\[\]'::json AS veiculos_vinculados/.test(c.sql) || /NULL::text AS veiculo_marca/.test(c.sql));
    assert.ok(fallbackList, "esperada query essencial de fallback");
    assert.ok(!/LEFT JOIN veiculos/.test(fallbackList.sql));
    assert.ok(!/v\.marca/.test(fallbackList.sql));
    assert.ok(!/v\.modelo/.test(fallbackList.sql));
    assert.ok(!/u\.profile_image_url/.test(fallbackList.sql));
    assert.ok(!fallbackList.vals.some((x) => x === undefined), `valores: ${JSON.stringify(fallbackList.vals)}`);
    assert.strictEqual(fallbackList.vals[fallbackList.vals.length - 2], 20);
    assert.strictEqual(fallbackList.vals[fallbackList.vals.length - 1], 20);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathUm];
    delete require.cache[pathQt];
    delete require.cache[pathDb];
  }
});

test("listUsersByCompany fallback mantém filtro de status mesmo sem coluna status_operacional", async () => {
  delete require.cache[pathUm];
  delete require.cache[pathQt];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, vals) => {
    const text = String(sql);
    calls.push({ sql: text, vals: vals ? [...vals] : [] });
    if (text.includes("information_schema.columns")) {
      const tableName = String(vals?.[0] || "");
      if (tableName === "usuarios") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "nome" },
            { column_name: "email" },
            { column_name: "cpf_id" },
            { column_name: "role" },
            { column_name: "created_at" },
          ],
        };
      }
      return { rows: [] };
    }
    if (text.includes("COUNT(*)")) {
      return { rows: [{ total: 0 }] };
    }
    return { rows: [] };
  };
  try {
    const { listUsersByCompany } = require("../src/models/userModel");
    const result = await listUsersByCompany(5, {
      page: 1,
      limit: 20,
      status_operacional: "afastado",
    });
    assert.strictEqual(result.total, 0);
    assert.deepStrictEqual(result.items, []);
    const countCall = calls.find((c) => /SELECT COUNT\(\*\)::int AS total FROM usuarios u WHERE/.test(c.sql));
    assert.ok(countCall, "esperada query de contagem no fallback");
    assert.match(countCall.sql, /1=0/);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathUm];
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
    const text = String(sql);
    calls.push({ sql: text, vals: vals ? [...vals] : [] });
    if (text.includes("information_schema.columns")) {
      const tableName = String(vals?.[0] || "");
      if (tableName === "usuarios") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "nome" },
            { column_name: "email" },
            { column_name: "cpf_id" },
            { column_name: "role" },
            { column_name: "veiculo_id" },
            { column_name: "profile_image_url" },
            { column_name: "funcao" },
            { column_name: "cnh_categoria" },
            { column_name: "cnh_numero" },
            { column_name: "cnh_validade" },
            { column_name: "treinamentos" },
            { column_name: "observacoes" },
            { column_name: "equipamento_vinculo" },
            { column_name: "operacao_escopo" },
            { column_name: "status_operacional" },
            { column_name: "conta_status" },
            { column_name: "created_at" },
          ],
        };
      }
      if (tableName === "veiculos") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "nome" },
            { column_name: "placa" },
            { column_name: "marca" },
            { column_name: "modelo" },
            { column_name: "tipo_operacao" },
            { column_name: "usa_para_transporte" },
          ],
        };
      }
      if (tableName === "motorista_veiculos") {
        return {
          rows: [
            { column_name: "empresa_id" },
            { column_name: "motorista_id" },
            { column_name: "veiculo_id" },
            { column_name: "is_principal" },
          ],
        };
      }
      return { rows: [] };
    }
    if (text.includes("COUNT(*)")) {
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
