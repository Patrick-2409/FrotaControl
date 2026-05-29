const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildExecutiveScoreNarratives } = require("../src/services/executiveNarrative");

const baseContext = {
  painelExecutivo: {
    score_geral: { valor: 58, faixa: "Atenção", classificacao: "ATENCAO" },
    score_operacional: { valor: 52, faixa: "Atenção", classificacao: "ATENCAO" },
    score_financeiro: { valor: 61, faixa: "Boa", classificacao: "BOA" },
    score_confiabilidade: { valor: 64, faixa: "Atenção", classificacao: "ATENCAO" },
  },
  indicadores: {
    totalLitros: 1000,
    totalValor: 7000,
    totalViagensTransporte: 0,
    totalParteDiaria: 0,
    totalVeiculosEscopo: 4,
    veiculosAtivos: 2,
    veiculosOciosos: 2,
  },
  validacao: {
    problemas: ["ALERTA: consumo de transporte sem viagens registradas no período."],
    inconsistenciasDetalhadas: [{ tipo: "ALERTA", descricao: "consumo sem viagens" }],
    consumoSemProducao: true,
    producaoSemConsumo: false,
  },
  consumoPorVeiculo: [
    { veiculo: "Toyota Hilux", litros: 584 },
    { veiculo: "Retro B", litros: 216 },
  ],
  custoPorPeriodo: [
    { periodo: "2026-05-01", custo: 100 },
    { periodo: "2026-05-02", custo: 110 },
    { periodo: "2026-05-03", custo: 120 },
  ],
  insightsCorrelacao: [
    {
      motor: "M01_CONCENTRACAO",
      diagnostico: "Existe concentração operacional relevante em um único ativo: Toyota Hilux responde por 58,4% do consumo (584 L).",
    },
    {
      motor: "M03_CONSUMO_SEM_PRODUCAO",
      diagnostico: "Foram registrados 800 L de abastecimento de transporte sem viagens no período.",
    },
  ],
  qualidadeInsight: {
    severidade: "ALTA",
    diagnostico: "Foram identificadas 1 inconsistência(s) nos lançamentos. Score de confiabilidade: 64/100 (Atenção).",
  },
};

test("buildExecutiveScoreNarratives gera quatro blocos com dados reais", () => {
  const result = buildExecutiveScoreNarratives(baseContext);

  assert.ok(result.score_geral.positivas.length > 0 || result.score_geral.negativas.length > 0);
  assert.ok(result.score_operacional.negativas.some((line) => /viagem|produtiv/i.test(line)));
  assert.ok(result.score_financeiro.positivas.some((line) => /7\.000|7000|R\$/i.test(line)));
  assert.ok(result.score_financeiro.negativas.some((line) => /Toyota Hilux|58,4|584/i.test(line)));
  assert.ok(result.score_confiabilidade.negativas.some((line) => /inconsist/i.test(line)));
});

test("narrativas não contêm linhas duplicadas", () => {
  const result = buildExecutiveScoreNarratives(baseContext);
  Object.values(result).forEach((block) => {
    if (!block?.positivas) return;
    assert.equal(block.positivas.length, new Set(block.positivas).size);
    assert.equal(block.negativas.length, new Set(block.negativas).size);
  });
});

test("score geral referencia pesos sem recalcular valor", () => {
  const result = buildExecutiveScoreNarratives(baseContext);
  assert.ok(result.score_geral.negativas.some((line) => /40%|30%/.test(line)));
  assert.ok(!result.score_geral.negativas.some((line) => /score geral.*=/i.test(line)));
});
