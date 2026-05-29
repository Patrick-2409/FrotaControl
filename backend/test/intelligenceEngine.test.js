const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  runIntelligenceEngine,
  motor01ConcentracaoOperacional,
  motor02ProducaoSemConsumo,
  motor03ConsumoSemProducao,
  calcularScoreQualidadeDados,
  classifyScore,
} = require("../src/services/intelligenceEngine");

const baseAnalysis = {
  indicadores: {
    totalLitros: 1000,
    totalValor: 7000,
    totalViagensTransporte: 0,
    totalLitrosTransporte: 800,
    totalVeiculosEscopo: 4,
    veiculosAtivos: 2,
    veiculosOciosos: 2,
  },
  graficos: {
    consumoPorVeiculo: [
      { veiculo: "Toyota Hilux", litros: 584 },
      { veiculo: "Retro B", litros: 216 },
      { veiculo: "Caminhão C", litros: 200 },
    ],
    custoPorPeriodo: [
      { periodo: "2026-05-01", custo: 100 },
      { periodo: "2026-05-02", custo: 110 },
      { periodo: "2026-05-03", custo: 120 },
      { periodo: "2026-05-04", custo: 200 },
      { periodo: "2026-05-05", custo: 210 },
    ],
  },
  consistenciaVeiculos: {
    veiculosTransporte: [
      { nome: "Caminhão A", viagens: 0, litros: 800, tipo_operacao: "transporte" },
    ],
  },
};

test("motor01 detecta concentração acima de 50%", () => {
  const insights = motor01ConcentracaoOperacional({
    consumoPorVeiculo: baseAnalysis.graficos.consumoPorVeiculo,
    totalLitros: 1000,
  });
  assert.equal(insights.length, 1);
  assert.match(insights[0].diagnostico, /Toyota Hilux/);
  assert.ok(insights[0].evidencias.participacao_pct > 50);
  assert.equal(insights[0].severidade, "MEDIA");
});

test("motor02 detecta produção sem consumo com viagens reais", () => {
  const insights = motor02ProducaoSemConsumo({
    veiculosTransporte: [{ nome: "Munk ERT3245", viagens: 23, litros: 0 }],
    totalViagens: 23,
    totalLitrosTransporte: 0,
  });
  assert.equal(insights.length, 1);
  assert.match(insights[0].diagnostico, /23 viagem/);
  assert.match(insights[0].recomendacao, /Munk ERT3245/);
});

test("motor03 detecta consumo sem produção", () => {
  const insights = motor03ConsumoSemProducao({
    veiculosTransporte: [{ nome: "Caminhão A", viagens: 0, litros: 400 }],
    totalViagens: 0,
    totalLitrosTransporte: 400,
  });
  assert.equal(insights.length, 1);
  assert.match(insights[0].diagnostico, /400 L/);
});

test("runIntelligenceEngine retorna painel executivo e narrativa", () => {
  const validacao = {
    problemas: ["ALERTA: consumo de transporte sem viagens registradas no período."],
    inconsistenciasDetalhadas: [{ tipo: "ALERTA", descricao: "consumo sem viagens" }],
    consumoSemProducao: true,
    producaoSemConsumo: false,
  };
  const normalized = {
    indicadores: baseAnalysis.indicadores,
    combustivel: { graficos: baseAnalysis.graficos, veiculos: baseAnalysis.graficos.consumoPorVeiculo },
    transporte: { veiculos: baseAnalysis.consistenciaVeiculos.veiculosTransporte },
  };

  const mio = runIntelligenceEngine(baseAnalysis, normalized, validacao);

  assert.ok(mio.painel_executivo?.score_geral?.valor >= 0);
  assert.ok(mio.painel_executivo?.score_operacional);
  assert.ok(mio.painel_executivo?.score_financeiro);
  assert.ok(mio.painel_executivo?.score_confiabilidade);
  assert.equal(typeof mio.narrativa_executiva.o_que_aconteceu, "string");
  assert.equal(typeof mio.narrativa_executiva.por_que_importa, "string");
  assert.equal(typeof mio.narrativa_executiva.acao_prioritaria, "string");
  assert.ok(mio.insights_correlacao.length >= 2);
});

test("classifyScore aplica faixas 90/70/50", () => {
  assert.equal(classifyScore(95).classificacao, "EXCELENTE");
  assert.equal(classifyScore(75).classificacao, "BOA");
  assert.equal(classifyScore(55).classificacao, "ATENCAO");
  assert.equal(classifyScore(30).classificacao, "CRITICA");
});

test("calcularScoreQualidadeDados penaliza inconsistências críticas", () => {
  const score = calcularScoreQualidadeDados({
    inconsistencias: ["erro 1", "erro 2"],
    inconsistenciasDetalhadas: [{ tipo: "ERRO_CRITICO" }, { tipo: "ALERTA" }],
    indicadores: { totalLitros: 100, totalValor: 0 },
    validacao: { producaoSemConsumo: true },
  });
  assert.ok(score < 50);
});
