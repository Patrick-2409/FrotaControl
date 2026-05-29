const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createMentionTracker } = require("../src/services/reportMentionTracker");
const { buildReportContentDeduped } = require("../src/services/reportContentDedup");
const { montarRespostaInteligente, buildOverviewResponse } = require("../src/services/inteligencia.service");

test("alreadyMentioned detecta tema repetido", () => {
  const tracker = createMentionTracker();
  tracker.register("Caminhão Munck: produção sem consumo — 5 viagens sem abastecimento.");
  assert.equal(
    tracker.alreadyMentioned("Viagens sem abastecimento no Caminhão Munck (5 viagens)."),
    true
  );
});

test("claim retorna complemento quando tema já foi explicado", () => {
  const tracker = createMentionTracker();
  tracker.register("Produção sem consumo no veículo Caminhão Munck — viagens sem abastecimento.");
  const complemento = tracker.claim("Produção sem consumo: Caminhão Munck com viagens sem abastecimento.", {
    role: "impacto",
  });
  assert.ok(complemento);
  assert.notEqual(complemento.toLowerCase(), "produção sem consumo no veículo caminhão munck — viagens sem abastecimento.");
});

test("buildReportContentDeduped reduz redundância entre seções", () => {
  const problemaRepetido =
    "Caminhão Munck: produção sem consumo — 5 viagens sem abastecimento registradas no período.";
  const payload = {
    resumo: problemaRepetido,
    statusLabel: "Crítico",
    regraDeOuro: {
      explicacaoPorque: "Há inconsistência crítica: produção sem consumo no Caminhão Munck.",
    },
    painelExecutivo: {
      narrativas: {
        score_operacional: {
          negativas: [problemaRepetido, "Viagens sem abastecimento no Caminhão Munck."],
          positivas: [],
        },
      },
    },
    narrativaExecutiva: {
      o_que_aconteceu: problemaRepetido,
      por_que_importa: "Produção sem consumo distorce eficiência e custo por km no Caminhão Munck.",
      acao_prioritaria: "Reconciliar viagens e abastecimentos do Caminhão Munck imediatamente.",
    },
    topRiscos: [
      {
        posicao: 1,
        problema: problemaRepetido,
        score: 92,
        faixa: "Crítico",
        classificacao: "CRITICO",
        recomendacao: "Reconciliar viagens e abastecimentos do Caminhão Munck imediatamente.",
      },
      {
        posicao: 2,
        problema: "Viagens sem abastecimento no Caminhão Munck (5 viagens).",
        score: 78,
        faixa: "Alto",
        classificacao: "ALTO",
        recomendacao: "Auditar romaneios do Caminhão Munck.",
      },
    ],
    acaoImediata: "Reconciliar viagens e abastecimentos do Caminhão Munck imediatamente.",
    riscoFinanceiroEstimado: {
      mensagem: "Exposição estimada por produção sem consumo no Caminhão Munck: R$ 12.400.",
    },
    problemas: [problemaRepetido, "Viagens sem abastecimento no Caminhão Munck."],
    insights: [{ tipo: "INCONSISTENCIA", mensagem: problemaRepetido }],
    inconsistenciasDetalhadas: [
      {
        veiculo: "Caminhão Munck",
        viagens: 5,
        litros: 0,
        descricao: `[ERRO CRÍTICO] Caminhão Munck: produção sem consumo (5 viagem(ns), 0.0 L)`,
      },
    ],
    diagnostico: problemaRepetido,
  };

  const deduped = buildReportContentDeduped(payload);

  assert.ok(deduped.meta.reducao_percentual >= 15, `redução ${deduped.meta.reducao_percentual}% < 15%`);
  assert.ok(deduped.meta.reducao_percentual <= 60, `redução ${deduped.meta.reducao_percentual}% > 60%`);
  assert.ok(Array.isArray(deduped.meta.paginas_afetadas));
  assert.ok(deduped.meta.paginas_afetadas.length >= 3);
  assert.notEqual(deduped.top_riscos[1].problema, payload.topRiscos[1].problema);
  assert.ok(deduped.meta.caracteres_depois < deduped.meta.caracteres_antes);
});

test("buildOverviewResponse inclui conteudo_relatorio deduplicado", () => {
  const analysisMock = {
    periodo: { tipo: "mes", inicio: "2026-05-01", fim: "2026-05-31" },
    tipoAnalise: "geral",
    indicadores: {
      totalLitros: 500,
      totalValor: 3500,
      precoMedio: 7,
      totalViagensTransporte: 0,
      veiculosConsiderados: 3,
    },
    graficos: { consumoPorVeiculo: [{ veiculo_id: 1, veiculo: "Caminhão A", litros: 400 }] },
    modulos: { frota: { graficos: {}, indicadores: {} } },
    inconsistenciasDetalhadas: [],
  };

  const inteligencia = montarRespostaInteligente(analysisMock);
  const overview = buildOverviewResponse(analysisMock, inteligencia);

  assert.ok(overview.conteudo_relatorio);
  assert.equal(typeof overview.conteudo_relatorio.meta?.reducao_percentual, "number");
  assert.ok(Array.isArray(overview.conteudo_relatorio.meta?.paginas_afetadas));
  assert.ok(overview.conteudo_relatorio.resumo_diretoria?.principalProblema);
});
