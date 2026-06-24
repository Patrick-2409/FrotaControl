const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildCacheKey } = require("../src/services/intelligenceAiService");
const { buildOperationalDatasetHash } = require("../src/services/operationalAiExecutiveService");

test("cache de IA muda quando os dados operacionais mudam", () => {
  const base = {
    periodo: { tipo: "mes", inicio: "2026-06-01", fim: "2026-06-30" },
    tipoAnalise: "geral",
    filtros: { veiculoId: null, motoristaId: null },
    indicadores: { totalLitros: 100, totalValor: 700, totalViagensTransporte: 3 },
    inconsistencias: [],
    inconsistenciasDetalhadas: [],
    graficos: {
      consumoPorVeiculo: [{ veiculo_id: 1, veiculo: "Caminhao A", litros: 100 }],
      custoPorPeriodo: [{ periodo: "2026-06-01", custo: 700 }],
    },
    modulos: {
      combustivel: { indicadores: { totalLitros: 100 }, graficos: {} },
      transporte: { indicadores: { totalViagensTransporte: 3 }, graficos: {} },
      frota: { indicadores: { veiculosAtivos: 1 }, graficos: {} },
    },
    inteligenciaMotor: {
      status: "OK",
      problemas: [],
      insights: [{ tipo: "INFO", mensagem: "Operacao normal" }],
      recomendacoes: ["Manter acompanhamento"],
    },
  };

  const changed = {
    ...base,
    indicadores: { ...base.indicadores, totalLitros: 150 },
    graficos: {
      ...base.graficos,
      consumoPorVeiculo: [{ veiculo_id: 1, veiculo: "Caminhao A", litros: 150 }],
    },
  };

  assert.notEqual(buildCacheKey(base), buildCacheKey(changed));
});

test("hash do relatorio operacional ignora apenas gerado_em", () => {
  const datasetA = {
    empresa: { id: 7, nome: "ACME" },
    periodo: { tipo: "mes", inicio: "2026-06-01", fim: "2026-06-30", gerado_em: "2026-06-24T10:00:00.000Z" },
    combustivel: { total_litros: 100 },
    transporte: { viagens: 3 },
  };
  const datasetB = {
    ...datasetA,
    periodo: { ...datasetA.periodo, gerado_em: "2026-06-24T11:00:00.000Z" },
  };
  const datasetC = {
    ...datasetA,
    combustivel: { total_litros: 101 },
  };

  assert.equal(buildOperationalDatasetHash(datasetA), buildOperationalDatasetHash(datasetB));
  assert.notEqual(buildOperationalDatasetHash(datasetA), buildOperationalDatasetHash(datasetC));
});
