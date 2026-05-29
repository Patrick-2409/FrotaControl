const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calcularScoreRisco, classifyRisk, runRiskEngine, PESOS } = require("../src/services/riskEngine");

test("calcularScoreRisco aplica pesos da fórmula oficial", () => {
  const score = calcularScoreRisco({
    impactoFinanceiro: 80,
    impactoOperacional: 95,
    recorrenciaHistorica: 60,
    quantidadeOcorrencias: 85,
    criticidadeDados: 90,
  });
  assert.equal(score.valor, 82);
  assert.equal(score.classificacao, "CRITICO");
});

test("classifyRisk aplica faixas 0-29 / 30-59 / 60-79 / 80-100", () => {
  assert.equal(classifyRisk(20).classificacao, "BAIXO");
  assert.equal(classifyRisk(45).classificacao, "MEDIO");
  assert.equal(classifyRisk(70).classificacao, "ALTO");
  assert.equal(classifyRisk(86).classificacao, "CRITICO");
});

test("runRiskEngine prioriza produção sem consumo com 23 viagens", () => {
  const analysis = {
    indicadores: {
      totalValor: 2619.64,
      totalLitros: 500,
      precoMedio: 5.24,
      totalViagensTransporte: 23,
      totalLitrosTransporte: 0,
      totalVeiculosEscopo: 3,
    },
    graficos: { custoPorPeriodo: [] },
    inconsistenciasDetalhadas: [
      {
        tipo: "ERRO_CRITICO",
        veiculo: "Munk ERT3245",
        placa: "ERT3245",
        veiculoId: 9,
        viagens: 23,
        litros: 0,
      },
    ],
  };

  const mio = {
    insights_correlacao: [
      {
        motor: "M02_PRODUCAO_SEM_CONSUMO",
        titulo: "Produção sem consumo",
        recomendacao: "Auditar imediatamente os lançamentos do caminhão Munk ERT3245.",
        evidencias: { viagens_sem_consumo: 23, veiculos_afetados: 1, veiculo_exemplo: "Munk ERT3245" },
      },
    ],
    painel_executivo: { score_confiabilidade: { valor: 42 } },
  };

  const validacao = {
    producaoSemConsumo: true,
    inconsistenciasDetalhadas: analysis.inconsistenciasDetalhadas,
    problemas: ["ERRO DE DADO: produção de transporte sem consumo correspondente no período."],
  };

  const result = runRiskEngine({
    analysis,
    normalized: { indicadores: analysis.indicadores, transporte: { veiculos: [{ nome: "Munk ERT3245", viagens: 23, litros: 0 }] } },
    validacao,
    mio,
  });

  assert.ok(result.top_riscos.length >= 1);
  assert.equal(result.top_riscos[0].score >= 80, true);
  assert.equal(result.top_riscos[0].classificacao, "CRITICO");
  assert.match(result.acao_imediata, /Munk ERT3245/);
  assert.match(result.risco_financeiro_estimado.mensagem, /R\$/);
  assert.equal(result.formula.pesos.impactoFinanceiro, PESOS.impactoFinanceiro);
});

test("runRiskEngine retorna no máximo 5 riscos ordenados", () => {
  const mio = {
    insights_correlacao: [
      { motor: "M01", titulo: "A", recomendacao: "A1", evidencias: { participacao_pct: 80, veiculo: "V1", litros: 100 } },
      { motor: "M03", titulo: "B", recomendacao: "B1", evidencias: { litros_sem_producao: 200 } },
      { motor: "M04", titulo: "C", recomendacao: "C1", evidencias: { crescimento_pct: 25, media_recente: 200, media_periodo: 150, dias_analisados: 3 } },
      { motor: "M05", titulo: "D", recomendacao: "D1", evidencias: { veiculos_ociosos: 3, taxa_ociosidade_pct: 60 } },
      { motor: "M02", titulo: "E", recomendacao: "E1", evidencias: { viagens_sem_consumo: 10 } },
      { motor: "M02", titulo: "F", recomendacao: "F1", evidencias: { viagens_sem_consumo: 5 } },
    ],
    painel_executivo: { score_confiabilidade: { valor: 70 } },
  };

  const result = runRiskEngine({
    analysis: { indicadores: { totalValor: 5000, totalLitros: 800, totalViagensTransporte: 30 }, graficos: { custoPorPeriodo: [] } },
    normalized: { indicadores: { totalValor: 5000, totalLitros: 800, totalViagensTransporte: 30 } },
    validacao: {},
    mio,
  });

  assert.ok(result.top_riscos.length <= 5);
  for (let i = 1; i < result.top_riscos.length; i += 1) {
    assert.ok(result.top_riscos[i - 1].score >= result.top_riscos[i].score);
  }
});
