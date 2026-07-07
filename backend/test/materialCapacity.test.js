"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { vehicleBodySchema, toVehicleWritePayload } = require("../src/validators/vehicleWriteSchema");
const {
  getViagensResumoProducao,
  listViagensByVehicleDay,
  utcBoundsFromDateRangeYmd,
} = require("../src/models/viagemModel");

const createDb = (responses = []) => {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return responses.shift() || { rows: [], rowCount: 0 };
    },
  };
};

test("cadastro de veiculo de transporte preserva capacidades por material", () => {
  const parsed = vehicleBodySchema.parse({
    nome: "Caminhao teste",
    placa: "MAT1A23",
    tipo_operacao: "transporte",
    usa_para_transporte: true,
    capacidade_esteril_ton: 32,
    capacidade_rocha_ton: 28,
  });

  const out = toVehicleWritePayload(parsed);

  assert.strictEqual(out.capacidade_ton, 32);
  assert.strictEqual(out.transporta_esteril, true);
  assert.strictEqual(out.transporta_rocha, true);
  assert.strictEqual(out.capacidade_esteril_ton, 32);
  assert.strictEqual(out.capacidade_rocha_ton, 28);
});

test("cadastro de veiculo de transporte nao preenche material nao transportado", () => {
  const parsed = vehicleBodySchema.parse({
    nome: "Caminhao esteril",
    placa: "MAT1A24",
    tipo_operacao: "transporte",
    usa_para_transporte: true,
    capacidade_esteril_ton: 32,
    capacidade_rocha_ton: null,
  });

  const out = toVehicleWritePayload(parsed);

  assert.strictEqual(out.capacidade_ton, 32);
  assert.strictEqual(out.transporta_esteril, true);
  assert.strictEqual(out.transporta_rocha, false);
  assert.strictEqual(out.capacidade_esteril_ton, 32);
  assert.strictEqual(out.capacidade_rocha_ton, null);
});

test("cadastro respeita material desmarcado mesmo com tonelagem residual", () => {
  const parsed = vehicleBodySchema.parse({
    nome: "Caminhao bloqueio",
    placa: "MAT1A25",
    tipo_operacao: "transporte",
    usa_para_transporte: true,
    transporta_esteril: true,
    transporta_rocha: false,
    capacidade_esteril_ton: 32,
    capacidade_rocha_ton: 28,
  });

  const out = toVehicleWritePayload(parsed);

  assert.strictEqual(out.transporta_esteril, true);
  assert.strictEqual(out.transporta_rocha, false);
  assert.strictEqual(out.capacidade_esteril_ton, 32);
  assert.strictEqual(out.capacidade_rocha_ton, null);
});

test("resumo de viagens usa capacidade vinculada ao material transportado", async () => {
  const db = createDb([
    {
      rows: [
        {
          total_viagens_esteril: 1,
          total_viagens_rocha: 1,
          total_toneladas_esteril: 32,
          total_toneladas_rocha: 28,
        },
      ],
    },
  ]);

  const result = await getViagensResumoProducao(7, {}, db);

  assert.match(db.calls[0].sql, /capacidade_esteril_ton/);
  assert.match(db.calls[0].sql, /capacidade_rocha_ton/);
  assert.deepStrictEqual(result, {
    total_viagens_esteril: 1,
    total_viagens_rocha: 1,
    total_toneladas_esteril: 32,
    total_toneladas_rocha: 28,
  });
});

test("exportacao por veiculo retorna capacidades separadas para esteril e rocha", async () => {
  const db = createDb([
    {
      rows: [
        {
          veiculo_id: 10,
          veiculo_nome: "Truck",
          placa: "MAT1A23",
          ton_esteril: 32,
          ton_rocha: 28,
          dia_local: "2026-07-02",
          esteril: 2,
          rocha: 1,
        },
      ],
    },
  ]);

  const rows = await listViagensByVehicleDay(7, "2026-07-01T03:00:00.000Z", "2026-07-03T03:00:00.000Z", db);

  assert.match(db.calls[0].sql, /capacidade_esteril_ton/);
  assert.match(db.calls[0].sql, /capacidade_rocha_ton/);
  assert.strictEqual(rows[0].ton_esteril, 32);
  assert.strictEqual(rows[0].ton_rocha, 28);
});

test("intervalo de viagens usa dia operacional America/Sao_Paulo", () => {
  const bounds = utcBoundsFromDateRangeYmd("2026-07-07", "2026-07-07");

  assert.deepStrictEqual(bounds, {
    start: "2026-07-07T03:00:00.000Z",
    end: "2026-07-08T03:00:00.000Z",
  });
});
