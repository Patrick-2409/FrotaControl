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
    cnh_proximas: [],
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
