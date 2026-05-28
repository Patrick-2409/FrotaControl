const { test } = require("node:test");
const assert = require("node:assert/strict");
const { avaliarRegraDeOuro, aplicarRegraDeOuroNoRelatorio } = require("../src/services/inteligencia/regraDeOuro");

test("avaliarRegraDeOuro detecta inconsistência e bloqueia decisão", () => {
  const regra = avaliarRegraDeOuro({
    indicadores: {
      totalLitros: 500,
      totalViagensTransporte: 10,
      totalLitrosTransporte: 0,
      veiculosConsiderados: 3,
      dadosTransporteDisponiveis: true,
    },
    insights: { producaoSemConsumo: true },
    inconsistencias: ["produção sem consumo"],
    periodo: { tipo: "mes" },
    tipoAnalise: "geral",
  });

  assert.equal(regra.dadosSuficientes, true);
  assert.equal(regra.haInconsistencia, true);
  assert.equal(regra.confiavelParaDecisao, false);
  assert.match(regra.explicacaoPorque, /inconsist/i);
});

test("avaliarRegraDeOuro marca dados insuficientes em escopo vazio", () => {
  const regra = avaliarRegraDeOuro({
    indicadores: { totalLitros: 0, totalViagensTransporte: 0, veiculosConsiderados: 0 },
    insights: {},
    periodo: { tipo: "mes" },
    tipoAnalise: "geral",
  });

  assert.equal(regra.dadosSuficientes, false);
  assert.equal(regra.confiavelParaDecisao, false);
});

test("avaliarRegraDeOuro permite decisão tática quando dados coerentes", () => {
  const regra = avaliarRegraDeOuro({
    indicadores: {
      totalLitros: 800,
      totalValor: 5600,
      precoMedio: 7,
      totalViagensTransporte: 20,
      totalLitrosTransporte: 600,
      veiculosConsiderados: 8,
      dadosTransporteDisponiveis: true,
    },
    insights: { contextoTeste: false },
    inconsistencias: [],
    periodo: { tipo: "mes" },
    tipoAnalise: "geral",
    contextoOperacional: { baseEmTeste: false, totalVeiculos: 8 },
  });

  assert.equal(regra.dadosSuficientes, true);
  assert.equal(regra.haInconsistencia, false);
  assert.equal(regra.confiavelParaDecisao, true);
});

test("aplicarRegraDeOuroNoRelatorio força booleans determinísticos", () => {
  const relatorio = aplicarRegraDeOuroNoRelatorio(
    {
      resumoExecutivo: "Teste",
      dados_suficientes: true,
      ha_inconsistencia: false,
      confiavel_para_decisao: true,
      explicacao_porque: "IA diz que está ok.",
    },
    {
      indicadores: {
        totalLitros: 200,
        totalViagensTransporte: 0,
        totalLitrosTransporte: 200,
        veiculosConsiderados: 2,
        dadosTransporteDisponiveis: true,
      },
      insights: { consumoSemProducao: true, contextoTeste: true },
      inconsistencias: ["consumo sem produção"],
      periodo: { tipo: "mes" },
      tipoAnalise: "geral",
    }
  );

  assert.equal(relatorio.regraDeOuro.haInconsistencia, true);
  assert.equal(relatorio.regraDeOuro.confiavelParaDecisao, false);
  assert.equal(relatorio.prioridadeInconsistencia, true);
});
