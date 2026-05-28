const { buildContext, toIsoDate } = require("./inteligencia/common");
const { analisarCombustivel } = require("./inteligencia/combustivel");
const { analisarTransporte } = require("./inteligencia/transporte");
const { analisarFrota } = require("./inteligencia/frota");
const { gerarResumoExecutivo } = require("./inteligencia/resumoExecutivo");

const emptyModulo = () => ({ indicadores: {}, insights: {}, graficos: {}, support: { activeVehicleIds: new Set() } });

const analyzeOperationalData = async ({
  empresaId,
  periodo = "mes",
  veiculoId = null,
  motoristaId = null,
  tipoAnalise = "geral",
}) => {
  const ctx = buildContext({ empresaId, periodo, veiculoId, motoristaId, tipoAnalise });
  const tipo = ctx.tipoAnalise;

  let combustivel = emptyModulo();
  let transporte = emptyModulo();

  if (tipo === "geral" || tipo === "combustivel" || tipo === "transporte" || tipo === "frota") {
    combustivel = await analisarCombustivel(ctx);
  }
  if (tipo === "geral" || tipo === "transporte") {
    transporte = await analisarTransporte(ctx);
  } else {
    transporte = await analisarTransporte(ctx);
  }

  const frota = await analisarFrota({
    ...ctx,
    activeVehicleIds: transporte.support?.activeVehicleIds || new Set(),
  });

  const resumo = gerarResumoExecutivo({ combustivel, transporte, frota, periodo: ctx.periodo });

  const graficos = {
    consumoPorVeiculo: [],
    custoPorPeriodo: [],
    consumoVsProducao: [],
  };

  if (tipo === "geral" || tipo === "combustivel" || tipo === "frota") {
    graficos.consumoPorVeiculo = combustivel.graficos?.consumoPorVeiculo || [];
    graficos.custoPorPeriodo = combustivel.graficos?.custoPorPeriodo || [];
  }
  if (tipo === "geral" || tipo === "transporte") {
    graficos.consumoVsProducao = transporte.graficos?.consumoVsProducao || [];
  }

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
    statusOperacao: resumo.statusOperacao,
    inconsistencias: resumo.inconsistencias,
    graficos,
    modulos: {
      combustivel,
      transporte,
      frota,
    },
  };
};

module.exports = {
  analyzeOperationalData,
};
