const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gerarInsights, buildCandidatosDominancia } = require("../src/services/inteligencia/insightsOperacionais");

test("gerarInsights detecta concentração no veículo dominante de transporte", () => {
  const insights = gerarInsights({
    combustivel: [{ nome: "A", litros: 100 }],
    transporte: [
      { nome: "Caminhão A", litros: 300 },
      { nome: "Caminhão B", litros: 100 },
    ],
    indicadores: { totalLitros: 400 },
  });

  assert.equal(insights.length, 1);
  assert.equal(insights[0].tipo, "CONCENTRACAO");
  assert.match(insights[0].mensagem, /Caminhão A/);
  assert.equal(insights[0].percentual, 75);
});

test("gerarInsights sinaliza ausência de consumo", () => {
  const insights = gerarInsights({
    combustivel: [],
    transporte: [],
    indicadores: { totalLitros: 0 },
  });

  assert.equal(insights.length, 1);
  assert.equal(insights[0].tipo, "ERRO_DADOS");
});

test("gerarInsights usa combustivel quando transporte não tem consumo", () => {
  const insights = gerarInsights({
    combustivel: [
      { nome: "Retro 01", litros: 220 },
      { nome: "Retro 02", litros: 80 },
    ],
    transporte: [{ nome: "Caminhão", litros: 0, viagens: 5 }],
    indicadores: { totalLitros: 300 },
  });

  assert.equal(insights[0].tipo, "CONCENTRACAO");
  assert.match(insights[0].mensagem, /Retro 01/);
});

test("buildCandidatosDominancia prioriza transporte com litros", () => {
  const candidatos = buildCandidatosDominancia(
    [{ nome: "Apoio", litros: 500 }],
    [{ nome: "Transporte", litros: 120 }]
  );

  assert.equal(candidatos.length, 1);
  assert.equal(candidatos[0].nome, "Transporte");
});
