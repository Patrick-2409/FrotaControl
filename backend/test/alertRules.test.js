"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { buildAlertsFromSignals } = require("../src/services/alertRules");

test("meta risco gera alerta critical", () => {
  const items = buildAlertsFromSignals({
    veiculos_sem_capacidade: 0,
    custo_alto: false,
    meta_risco: true,
    romaneios_72h: 1,
    transport_veiculos: 1,
    produtividade_queda: false,
    combustivel: {},
    motoristas_sem_lancamento: [],
    motoristas_baixa_atividade: [],
    veiculos_inativos: [],
    cnh_proximas: [],
    docs_proximos: [],
    doc_licenciamento_proximos: [],
    doc_seguro_proximos: [],
    doc_inspecao_proximos: [],
    manut_pendentes: [],
  });
  assert.ok(items.some((i) => i.alert_key === "transport.meta_abaixo_planejado"));
  assert.strictEqual(items.find((i) => i.alert_key === "transport.meta_abaixo_planejado").severity, "critical");
});

test("ausência romaneios com frota de transporte", () => {
  const items = buildAlertsFromSignals({
    veiculos_sem_capacidade: 0,
    custo_alto: false,
    meta_risco: false,
    romaneios_72h: 0,
    transport_veiculos: 2,
    produtividade_queda: false,
    combustivel: {},
    motoristas_sem_lancamento: [],
    motoristas_baixa_atividade: [],
    veiculos_inativos: [],
    cnh_proximas: [],
    docs_proximos: [],
    doc_licenciamento_proximos: [],
    doc_seguro_proximos: [],
    doc_inspecao_proximos: [],
    manut_pendentes: [],
  });
  assert.ok(items.some((i) => i.alert_key === "transport.ausencia_lancamentos_romaneios"));
});
