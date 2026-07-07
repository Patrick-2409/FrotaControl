"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { buildAlertsFromSignals } = require("../src/services/alertRules");
const { vehicleBodySchema, toVehicleWritePayload } = require("../src/validators/vehicleWriteSchema");

test("alerta licenciamento próximo", () => {
  const items = buildAlertsFromSignals({
    veiculos_sem_capacidade: 0,
    custo_alto: false,
    meta_risco: false,
    romaneios_72h: 1,
    transport_veiculos: 0,
    produtividade_queda: false,
    combustivel: {},
    motoristas_sem_lancamento: [],
    motoristas_baixa_atividade: [],
    veiculos_inativos: [],
    cnh_vencidas: [],
    cnh_vencendo: [],
    docs_proximos: [],
    doc_licenciamento_proximos: [{ id: 9, nome: "Caminhão 1", placa: "ABC1D23", dias: 12 }],
    doc_seguro_proximos: [],
    doc_inspecao_proximos: [],
    manut_pendentes: [],
  });
  assert.ok(items.some((i) => i.alert_key === "frota.licenciamento:9"));
});

test("payload parcial não define tipo", () => {
  const parsed = vehicleBodySchema.parse({
    nome: "Unidade teste",
    placa: "TST1A11",
    usa_para_transporte: false,
  });
  const out = toVehicleWritePayload(parsed);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(out, "tipo"), false);
});

test("payload de veiculo aceita codigo operacional editavel", () => {
  const parsed = vehicleBodySchema.parse({
    nome: "Caminhao posicao",
    placa: "POS1A11",
    codigo_operacional: 3,
    tipo_operacao: "transporte",
    usa_para_transporte: true,
  });
  const out = toVehicleWritePayload(parsed);
  assert.strictEqual(out.codigo_operacional, 3);
});

test("updateVehicle reposiciona codigo dentro da serie operacional", async () => {
  const pathDb = require.resolve("../src/db");
  const pathModel = require.resolve("../src/models/vehicleModel");
  delete require.cache[pathModel];
  const db = require("../src/db");
  const origQuery = db.pool.query;
  const origConnect = db.pool.connect;
  const clientCalls = [];
  db.pool.query = async () => ({
    rows: [
      {
        id: 10,
        empresa_id: 7,
        codigo_operacional: 2,
        nome: "Caminhao 10",
        placa: "POS1A10",
        marca: null,
        modelo: null,
        tipo: null,
        categoria: null,
        ano: null,
        renavam: null,
        chassi: null,
        combustivel_principal: null,
        capacidade_litros: null,
        capacidade_ton: 30,
        capacidade_esteril_ton: 30,
        capacidade_rocha_ton: null,
        transporta_esteril: true,
        transporta_rocha: false,
        horimetro_atual: null,
        hodometro_atual: null,
        usa_para_transporte: true,
        tipo_operacao: "transporte",
        status_operacional: "ativo",
        doc_revisao_validade: null,
        doc_licenciamento_validade: null,
        doc_seguro_validade: null,
        doc_inspecao_validade: null,
        manutencao_agendar_ate: null,
        fleet_telemetry_meta: {},
      },
    ],
  });
  db.pool.connect = async () => ({
    query: async (sql, params) => {
      clientCalls.push({ sql: String(sql), params });
      if (/^BEGIN/.test(String(sql)) || /^COMMIT/.test(String(sql)) || /^ROLLBACK/.test(String(sql))) {
        return { rows: [] };
      }
      if (/UPDATE veiculos\s+SET codigo_operacional = NULL,\s+nome/.test(String(sql))) {
        return { rows: [{ id: 10 }], rowCount: 1 };
      }
      if (/SELECT id\s+FROM veiculos/.test(String(sql)) && /FOR UPDATE/.test(String(sql))) {
        return { rows: [{ id: 5 }, { id: 10 }, { id: 11 }] };
      }
      if (/UPDATE veiculos SET codigo_operacional = NULL/.test(String(sql))) {
        return { rows: [], rowCount: 3 };
      }
      if (/UPDATE veiculos SET codigo_operacional = \$3/.test(String(sql))) {
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT \* FROM veiculos/.test(String(sql))) {
        return { rows: [{ id: 10, codigo_operacional: 1, tipo_operacao: "transporte" }] };
      }
      throw new Error(`consulta inesperada: ${sql}`);
    },
    release: () => {},
  });
  try {
    const { updateVehicle } = require("../src/models/vehicleModel");
    const row = await updateVehicle(10, 7, {
      nome: "Caminhao 10",
      placa: "POS1A10",
      codigo_operacional: 1,
      tipo_operacao: "transporte",
      usa_para_transporte: true,
    });
    assert.strictEqual(row.codigo_operacional, 1);
    assert.deepStrictEqual(
      clientCalls
        .filter((c) => /UPDATE veiculos SET codigo_operacional = \$3/.test(c.sql))
        .map((c) => c.params),
      [
        [7, 10, 1],
        [7, 5, 2],
        [7, 11, 3],
      ]
    );
  } finally {
    db.pool.query = origQuery;
    db.pool.connect = origConnect;
    delete require.cache[pathModel];
    delete require.cache[pathDb];
  }
});
