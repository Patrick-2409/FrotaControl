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
    const selectCall = calls.find((c) => String(c.sql).includes("v.codigo_operacional ASC NULLS LAST"));
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
    assert.ok(/LEFT JOIN veiculos/.test(fallbackList.sql));
    assert.ok(!/LEFT JOIN LATERAL/.test(fallbackList.sql));
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

test("listUsersByCompany fallback suporta schema legado com company_id e vehicle_id", async () => {
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
            { column_name: "company_id" },
            { column_name: "nome" },
            { column_name: "email" },
            { column_name: "cpf_id" },
            { column_name: "role" },
            { column_name: "vehicle_id" },
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
      return { rows: [{ total: 1 }] };
    }
    return {
      rows: [
        {
          id: 77,
          empresa_id: 9,
          nome: "Pessoa Legada",
          email: "legada@empresa.com",
          cpf_id: "999",
          role: "MOTORISTA",
          veiculo_id: 321,
          created_at: new Date(),
        },
      ],
    };
  };
  try {
    const { listUsersByCompany } = require("../src/models/userModel");
    const result = await listUsersByCompany(9, { page: 1, limit: 20, search: "" });
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].nome, "Pessoa Legada");
    assert.strictEqual(result.items[0].empresa_id, 9);
    const countCall = calls.find((c) => /SELECT COUNT\(\*\)::int AS total FROM usuarios u WHERE/.test(c.sql));
    assert.ok(countCall, "esperada query de contagem");
    assert.match(countCall.sql, /u\.company_id = \$1/);
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

test("listManagerRecords usa fallback essencial quando schema de registros está parcial", async () => {
  delete require.cache[pathRm];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  let modernFailed = false;
  db.pool.query = async (sql, vals) => {
    const text = String(sql);
    calls.push({ sql: text, vals: vals ? [...vals] : [] });
    if (text.includes("information_schema.columns")) {
      const tableName = String(vals?.[0] || "");
      if (tableName === "romaneios") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "usuario_id" },
            { column_name: "veiculo_id" },
            { column_name: "data" },
            { column_name: "destino" },
            { column_name: "tipo_transporte" },
            { column_name: "observacao" },
          ],
        };
      }
      if (tableName === "combustiveis") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "usuario_id" },
            { column_name: "veiculo_id" },
            { column_name: "data" },
            { column_name: "litros" },
            { column_name: "tipo_combustivel" },
            { column_name: "horimetro" },
            { column_name: "hodometro" },
          ],
        };
      }
      if (tableName === "parte_diaria") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "usuario_id" },
            { column_name: "veiculo_id" },
            { column_name: "data" },
            { column_name: "total_horas" },
          ],
        };
      }
      if (tableName === "usuarios") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "nome" },
            { column_name: "cpf_id" },
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
      return { rows: [] };
    }
    if (!modernFailed && text.includes("COUNT(*)::int AS total FROM (") && text.includes("jsonb_each_text")) {
      modernFailed = true;
      const err = new Error("column p.checklist does not exist");
      err.code = "42703";
      throw err;
    }
    if (text.includes("COUNT(*)::int AS total FROM (SELECT * FROM (")) {
      return { rows: [{ total: 1 }] };
    }
    if (text.includes("ORDER BY data DESC") && text.includes("'combustivel' AS tipo")) {
      return {
        rows: [
          {
            id: 33,
            source_id: "33",
            data: "2026-07-01T10:00:00",
            recorded_at_client: null,
            updated_at: "2026-07-01T10:00:00",
            motorista: "Motorista legado",
            tipo: "combustivel",
            tipo_label: "Combustível",
            veiculo: "Veículo legado",
            placa: "ABC1D23",
            destino: null,
            tipo_transporte: null,
            observacao: null,
            litros: 42,
            tipo_combustivel: "Diesel",
            horimetro: null,
            hodometro: null,
            total_horas: null,
            checklist_resumo: null,
            checklist: null,
            contratado: null,
            operador: null,
            equipamento: null,
            marca_modelo: null,
            local: null,
            expediente: null,
            periodo: null,
            clima: null,
            horimetro_inicio: null,
            horimetro_fim: null,
            hodometro_inicio: null,
            hodometro_fim: null,
            total_km: null,
            outros_descricao: null,
            tempo_parado: null,
            observacoes: null,
            producao: null,
            valor_total: null,
            preco_por_litro: null,
          },
        ],
      };
    }
    return { rows: [] };
  };
  try {
    const { listManagerRecords } = require("../src/models/recordModel");
    const result = await listManagerRecords({
      empresa_id: 8,
      tipo: "combustivel",
      motorista: "Motorista",
      page: 1,
      limit: 20,
    });
    assert.strictEqual(modernFailed, true);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].source_id, "33");
    assert.strictEqual(result.items[0].tipo, "combustivel");
    const fallbackQuery = calls.find(
      (c) =>
        c.sql.includes("'combustivel' AS tipo") &&
        c.sql.includes("COALESCE(c.id::text, c.id::text) AS source_id") &&
        c.sql.includes("NULL::numeric AS valor_total") &&
        c.sql.includes("NULL::numeric AS preco_por_litro")
    );
    assert.ok(fallbackQuery, "esperada query de fallback essencial");
    assert.ok(!/c\.valor_total/.test(fallbackQuery.sql));
    assert.ok(!/c\.preco_por_litro/.test(fallbackQuery.sql));
    assert.match(fallbackQuery.sql, /c\.empresa_id = \$1/);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathRm];
    delete require.cache[pathDb];
  }
});

test("listManagerRecords inclui viagens no relatório quando ativado e sem romaneios", async () => {
  delete require.cache[pathRm];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, vals) => {
    const text = String(sql);
    calls.push({ sql: text, vals: vals ? [...vals] : [] });
    if (text.includes("FROM romaneios r") || text.includes("FROM combustiveis c") || text.includes("FROM parte_diaria p")) {
      if (text.includes("COUNT(*)::int AS total")) return { rows: [{ total: 0 }] };
      if (text.includes("ORDER BY data DESC")) return { rows: [] };
    }
    if (text.includes("FROM viagens vi")) {
      if (text.includes("COUNT(*)::int AS total")) return { rows: [{ total: 1 }] };
      if (text.includes("ORDER BY data DESC")) {
        return {
          rows: [
            {
              id: null,
              source_id: "viagem:77",
              data: "2026-07-07T08:00:00",
              recorded_at_client: null,
              updated_at: "2026-07-07T08:01:00",
              motorista: "Motorista apontador",
              apontador: "Carlos Apontador",
              tipo: "romaneio",
              tipo_label: "Romaneio",
              veiculo: "Caminhão 07",
              placa: "ABC1D23",
              destino: "Transporte registrado via apontador",
              tipo_transporte: "Estéril",
              observacao: "Origem: viagens",
              litros: null,
              tipo_combustivel: null,
              horimetro: null,
              hodometro: null,
              total_horas: null,
              checklist_resumo: null,
              checklist: null,
              contratado: null,
              operador: null,
              equipamento: null,
              marca_modelo: null,
              local: null,
              expediente: null,
              periodo: null,
              clima: null,
              horimetro_inicio: null,
              horimetro_fim: null,
              hodometro_inicio: null,
              hodometro_fim: null,
              total_km: null,
              outros_descricao: null,
              tempo_parado: null,
              observacoes: null,
              producao: null,
              valor_total: null,
              preco_por_litro: null,
            },
          ],
        };
      }
    }
    return { rows: [] };
  };
  try {
    const { listManagerRecords } = require("../src/models/recordModel");
    const result = await listManagerRecords({
      empresa_id: 8,
      tipo: "romaneio",
      include_viagens: true,
      data_inicio: "2026-07-01",
      data_fim: "2026-07-07",
      page: 1,
      limit: 20,
    });
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].source_id, "viagem:77");
    assert.strictEqual(result.items[0].tipo, "romaneio");
    assert.strictEqual(result.items[0].apontador, "Carlos Apontador");
    const viagensCountCall = calls.find(
      (c) => c.sql.includes("FROM viagens vi") && c.sql.includes("COUNT(*)::int AS total")
    );
    assert.ok(viagensCountCall, "esperada consulta de viagens para relatório");
    assert.match(viagensCountCall.sql, /LEFT JOIN usuarios ap ON ap\.id = vi\.apontador_id AND ap\.empresa_id = vi\.empresa_id/);
    assert.match(viagensCountCall.sql, /vi\.empresa_id = \$1/);
    assert.match(viagensCountCall.sql, /DATE\(vi\.marcacao AT TIME ZONE 'America\/Sao_Paulo'\) >= \$2/);
    assert.match(viagensCountCall.sql, /DATE\(vi\.marcacao AT TIME ZONE 'America\/Sao_Paulo'\) <= \$3/);
    assert.deepStrictEqual(viagensCountCall.vals.slice(0, 3), [8, "2026-07-01", "2026-07-07"]);
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
    assert.match(calls[0].sql, /COUNT\(\*\) FILTER \(WHERE vi\.tipo = 'esteril'\)::int AS viagens_esteril/);
    assert.match(calls[0].sql, /COUNT\(\*\) FILTER \(WHERE vi\.tipo = 'rocha'\)::int AS viagens_rocha/);
    assert.match(calls[0].sql, /COALESCE\(vd\.viagens_esteril, 0\)::int AS viagens_esteril/);
    assert.match(calls[0].sql, /COALESCE\(vd\.viagens_rocha, 0\)::int AS viagens_rocha/);
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
    assert.match(selectCall.sql, /WITH page_users AS/);
    assert.match(selectCall.sql, /FROM page_users u/);
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

test("listUsersByCompany cai para lista essencial quando query moderna falha", async () => {
  delete require.cache[pathUm];
  delete require.cache[pathQt];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  let modernListFailed = false;
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
    if (/SELECT COUNT\(\*\)::int AS total FROM usuarios u WHERE/.test(text)) {
      return { rows: [{ total: 1 }] };
    }
    if (text.includes("WITH page_users AS")) {
      modernListFailed = true;
      const err = new Error("falha simulada na query moderna");
      err.code = "42601";
      throw err;
    }
    if (text.includes("AS veiculo_nome") && text.includes("NULL::text AS veiculo_marca")) {
      return {
        rows: [
          {
            id: 41,
            empresa_id: 5,
            nome: "Pessoa Fallback",
            email: "fallback@empresa.com",
            cpf_id: "555",
            role: "MOTORISTA",
            veiculo_id: 8,
            veiculo_nome: "Scania P360",
            placa: "SGC2J38",
            veiculos_vinculados: [{ id: 8, nome: "Scania P360", placa: "SGC2J38", is_principal: true }],
            status_operacional: "ativo",
            conta_status: "ativo",
            created_at: new Date(),
          },
        ],
      };
    }
    return { rows: [] };
  };
  try {
    const { listUsersByCompany } = require("../src/models/userModel");
    const result = await listUsersByCompany(5, { page: 1, limit: 20, search: "" });
    assert.strictEqual(modernListFailed, true);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.items[0].nome, "Pessoa Fallback");
    assert.strictEqual(result.items[0].veiculo_nome, "Scania P360");
    assert.deepStrictEqual(result.items[0].veiculos_vinculados?.[0]?.placa, "SGC2J38");
    const fallbackList = calls.find((c) => c.sql.includes("AS veiculo_nome") && c.sql.includes("NULL::text AS veiculo_marca"));
    assert.ok(fallbackList, "esperada query essencial depois da falha moderna");
    assert.match(fallbackList.sql, /u\.empresa_id = \$1/);
    assert.strictEqual(fallbackList.vals[0], 5);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathUm];
    delete require.cache[pathQt];
    delete require.cache[pathDb];
  }
});
