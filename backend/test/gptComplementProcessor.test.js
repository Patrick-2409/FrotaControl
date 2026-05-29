const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildConteudoProibidoRepetir,
  sanitizeGptComplement,
  containsShownNumber,
} = require("../src/services/gptComplementProcessor");
const { mesclarComplementoGpt, montarRespostaInteligente } = require("../src/services/inteligencia.service");

const analysisMock = {
  periodo: { tipo: "mes", inicio: "2026-05-01", fim: "2026-05-31" },
  tipoAnalise: "geral",
  indicadores: {
    totalLitros: 500,
    totalValor: 3500,
    totalViagensTransporte: 0,
    veiculosConsiderados: 3,
  },
  graficos: { consumoPorVeiculo: [{ veiculo_id: 1, veiculo: "Caminhão A", litros: 400 }] },
  modulos: { frota: { graficos: {}, indicadores: {} } },
  inconsistenciasDetalhadas: [],
};

test("buildConteudoProibidoRepetir lista textos e números do motor", () => {
  const motor = {
    resumo: "Consumo sem produção: Caminhão A com 400 L e 0 viagens.",
    problemas: ["Consumo sem produção no transporte"],
    top_riscos: [{ posicao: 1, problema: "Consumo sem produção no Caminhão A", recomendacao: "Auditar lançamentos" }],
    acao_imediata: "Auditar lançamentos do Caminhão A",
  };

  const proibido = buildConteudoProibidoRepetir(motor, { totalLitros: 500, totalValor: 3500 });
  assert.ok(proibido.problemas.length > 0);
  assert.ok(proibido.numeros_ja_exibidos.includes("500"));
  assert.ok(proibido.numeros_ja_exibidos.includes("3500"));
});

test("containsShownNumber detecta repetição de totais", () => {
  const shown = new Set(["500", "3500"]);
  assert.equal(containsShownNumber("Exposição de R$ 3.500 no período com 500 litros.", shown), true);
  assert.equal(containsShownNumber("Risco de distorção na governança de lançamentos.", shown), false);
});

test("sanitizeGptComplement substitui campo repetitivo por complemento genérico", () => {
  const motor = {
    resumo: "Produção sem consumo no Caminhão Munck — 5 viagens sem abastecimento.",
    problemas: ["Produção sem consumo no Caminhão Munck"],
    recomendacoes: ["Reconciliar viagens e abastecimentos do Caminhão Munck"],
    acao_imediata: "Reconciliar viagens e abastecimentos do Caminhão Munck imediatamente.",
  };

  const gptReport = {
    complemento_executivo: {
      hipotese_provavel: "Produção sem consumo no Caminhão Munck — 5 viagens sem abastecimento.",
      consequencia: "Exposição de R$ 3.500 e distorção de eficiência com 500 litros.",
      risco_futuro: "Recorrência pode mascarar ineficiência estrutural na operação.",
      acao_recomendada: "Reconciliar viagens e abastecimentos do Caminhão Munck imediatamente.",
    },
  };

  const sanitized = sanitizeGptComplement(gptReport, motor, { totalValor: 3500, totalLitros: 500 });
  assert.notEqual(sanitized.hipotese_provavel, gptReport.complemento_executivo.hipotese_provavel);
  assert.ok(sanitized.consequencia);
  assert.ok(sanitized.risco_futuro);
  assert.notEqual(sanitized.acao_recomendada, gptReport.complemento_executivo.acao_recomendada);
  assert.ok(sanitized.campos_preenchidos >= 3);
});

test("sanitizeGptComplement preserva complemento novo e agregador", () => {
  const motor = {
    resumo: "Consumo sem produção no transporte.",
    problemas: ["Consumo sem produção"],
  };

  const gptReport = {
    complemento_executivo: {
      hipotese_provavel: "Possível falha de integração entre sistema de romaneio e módulo de abastecimento.",
      consequencia: "Decisões de alocação permanecem expostas enquanto a origem do desvio não for isolada.",
      risco_futuro: "O padrão pode se repetir silenciosamente em outros ativos do mesmo contrato.",
      acao_recomendada: "Mapear o fluxo ponta a ponta e definir responsável por reconciliação diária.",
    },
  };

  const sanitized = sanitizeGptComplement(gptReport, motor, { totalLitros: 500 });
  assert.equal(sanitized.hipotese_provavel, gptReport.complemento_executivo.hipotese_provavel);
  assert.equal(sanitized.consequencia, gptReport.complemento_executivo.consequencia);
  assert.equal(sanitized.risco_futuro, gptReport.complemento_executivo.risco_futuro);
  assert.equal(sanitized.acao_recomendada, gptReport.complemento_executivo.acao_recomendada);
});

test("mesclarComplementoGpt usa estrutura hipótese/consequência/risco/ação", () => {
  const motor = montarRespostaInteligente(analysisMock);
  const merged = mesclarComplementoGpt(
    motor,
    {
      origem: "openai",
      complemento_executivo: {
        hipotese_provavel: "Possível classificação incorreta entre transporte e apoio nos lançamentos.",
        consequencia: "Comparativos de produtividade perdem validade até a reclassificação.",
        risco_futuro: "Novos veículos podher herdar o mesmo padrão de lançamento.",
        acao_recomendada: "Revisar cadastro de tipo_operacao dos veículos com consumo sem viagem.",
      },
    },
    analysisMock
  );

  assert.equal(merged.origem, "motor_operacional+gpt");
  assert.ok(merged.complemento_gpt?.hipotese_provavel);
  assert.ok(merged.complemento_gpt?.consequencia);
  assert.ok(merged.complemento_gpt?.risco_futuro);
  assert.ok(merged.complemento_gpt?.acao_recomendada);
  assert.equal(merged.complemento_gpt.diagnostico, merged.complemento_gpt.hipotese_provavel);
});
