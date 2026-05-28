const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gerarContexto, detectContextoTeste } = require("../src/services/inteligencia/operacionalRules");

test("gerarContexto usa indicadores quando disponíveis", () => {
  const ctx = gerarContexto({
    veiculos: [{ ativo: true }, { ativo: false }],
    periodo: { inicio: "2026-05-01", fim: "2026-05-31" },
    indicadores: { totalVeiculosEscopo: 8, veiculosAtivos: 6 },
  });

  assert.equal(ctx.totalVeiculos, 8);
  assert.equal(ctx.veiculosAtivos, 6);
  assert.equal(ctx.periodoInicial, "2026-05-01");
  assert.equal(ctx.periodoFinal, "2026-05-31");
  assert.equal(ctx.baseEmTeste, false);
});

test("gerarContexto marca baseEmTeste com frota pequena", () => {
  const ctx = gerarContexto({
    indicadores: { totalVeiculosEscopo: 3, veiculosAtivos: 2 },
    periodo: { inicio: "2026-05-01", fim: "2026-05-07" },
  });

  assert.equal(ctx.baseEmTeste, true);
});

test("gerarContexto infere veículos ativos pela movimentação", () => {
  const ctx = gerarContexto({
    veiculos: [
      { viagens: 2, litros: 0 },
      { viagens: 0, litros: 50 },
      { viagens: 0, litros: 0 },
    ],
    periodo: {},
  });

  assert.equal(ctx.totalVeiculos, 3);
  assert.equal(ctx.veiculosAtivos, 2);
  assert.equal(ctx.baseEmTeste, true);
});

test("detectContextoTeste combina baseEmTeste, frota pequena ativa e período curto", () => {
  assert.equal(
    detectContextoTeste({
      periodo: "mes",
      contexto: { baseEmTeste: true, veiculosAtivos: 10 },
    }),
    true
  );
  assert.equal(
    detectContextoTeste({
      periodo: "mes",
      contexto: { baseEmTeste: false, veiculosAtivos: 2 },
    }),
    true
  );
  assert.equal(
    detectContextoTeste({
      periodo: "dia",
      contexto: { baseEmTeste: false, veiculosAtivos: 10 },
    }),
    true
  );
  assert.equal(
    detectContextoTeste({
      periodo: "mes",
      contexto: { baseEmTeste: false, veiculosAtivos: 10 },
    }),
    false
  );
});
