const { buildContext, toIsoDate } = require("./inteligencia/common");
const { analisarCombustivel } = require("./inteligencia/combustivel");
const { analisarTransporte } = require("./inteligencia/transporte");
const { analisarFrota } = require("./inteligencia/frota");
const { gerarResumoExecutivo } = require("./inteligencia/resumoExecutivo");

const analyzeOperationalData = async ({
  empresaId,
  periodo = "mes",
  veiculoId = null,
  motoristaId = null,
  tipoAnalise = "geral",
}) => {
  const ctx = buildContext({ empresaId, periodo, veiculoId, motoristaId, tipoAnalise });
  const combustivel = await analisarCombustivel(ctx);
  const transporte = await analisarTransporte(ctx);
  const frota = await analisarFrota({ ...ctx, activeVehicleIds: transporte.support?.activeVehicleIds || new Set() });
  const resumo = gerarResumoExecutivo({ combustivel, transporte, frota });

  return {
    periodo: {
      tipo: ctx.periodo,
      inicio: toIsoDate(new Date(ctx.bounds.start)),
      fim: toIsoDate(new Date(ctx.bounds.endInclusive)),
    },
    tipoAnalise: ctx.tipoAnalise,
    filtros: {
      veiculoId: ctx.veiculoId,
      motoristaId: ctx.motoristaId,
    },
    indicadores: resumo.indicadores,
    insights: resumo.insights,
    graficos: {
      consumoPorVeiculo: combustivel.graficos?.consumoPorVeiculo || [],
      custoPorPeriodo: combustivel.graficos?.custoPorPeriodo || [],
      consumoVsProducao: transporte.graficos?.consumoVsProducao || [],
    },
  };
};

module.exports = {
  analyzeOperationalData,
};
