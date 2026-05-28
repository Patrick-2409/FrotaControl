const { buildContext, toIsoDate } = require("./inteligencia/common");
const { analisarCombustivel } = require("./inteligencia/combustivel");
const { analisarTransporte } = require("./inteligencia/transporte");
const { analisarFrota } = require("./inteligencia/frota");
const { analisarConsistenciaVeiculos } = require("./inteligencia/consistenciaOperacional");
const { gerarResumoExecutivo } = require("./inteligencia/resumoExecutivo");
const { enriquecerContextoInteligencia, registrarLogBaseInteligencia } = require("./inteligencia/baseInteligencia");

const emptyModulo = () => ({ indicadores: {}, insights: {}, graficos: {}, support: { activeVehicleIds: new Set() } });

const analyzeOperationalData = async ({
  empresaId,
  periodo = "mes",
  veiculoId = null,
  motoristaId = null,
  tipoAnalise = "geral",
}) => {
  const ctx = buildContext({ empresaId, periodo, veiculoId, motoristaId, tipoAnalise });
  const ctxBase = await enriquecerContextoInteligencia(ctx);
  const tipo = ctxBase.tipoAnalise;

  let combustivel = emptyModulo();
  let transporte = emptyModulo();

  if (tipo === "geral" || tipo === "combustivel" || tipo === "transporte" || tipo === "frota") {
    combustivel = await analisarCombustivel(ctxBase);
  }
  if (tipo === "geral" || tipo === "transporte") {
    transporte = await analisarTransporte(ctxBase);
  } else {
    transporte = await analisarTransporte(ctxBase);
  }

  const frota = await analisarFrota({
    ...ctxBase,
    activeVehicleIds: transporte.support?.activeVehicleIds || new Set(),
    fuelActiveVehicleIds: combustivel.support?.fuelActiveVehicleIds || new Set(),
  });

  registrarLogBaseInteligencia({ base: ctxBase.base, combustivel, transporte, frota });

  const consistenciaVeiculos = await analisarConsistenciaVeiculos(ctxBase);
  const periodoBounds = {
    tipo: ctx.periodo,
    inicio: toIsoDate(new Date(ctx.bounds.start)),
    fim: toIsoDate(new Date(ctx.bounds.endInclusive)),
  };
  const resumo = gerarResumoExecutivo({
    combustivel,
    transporte,
    frota,
    periodo: ctx.periodo,
    periodoBounds,
    consistenciaVeiculos,
  });

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
    inconsistenciasDetalhadas: resumo.inconsistenciasDetalhadas || [],
    consistenciaVeiculos,
    contextoOperacional: resumo.insights?.contextoOperacional || null,
    insightsAutomaticos: resumo.insights?.insightsAutomaticos || [],
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
