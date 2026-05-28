const { z } = require("zod");
const { resolveEmpresaScopeWrite } = require("../domain/tenantContext");
const { analyzeOperationalData } = require("../services/intelligenceAnalysisService");
const { generateIntelligenceReport } = require("../services/intelligenceAiService");
const { generateIntelligencePdf } = require("../services/intelligencePdfService");
const { buildContext, toIsoDate } = require("../services/inteligencia/common");
const { analisarCombustivel } = require("../services/inteligencia/combustivel");
const { analisarTransporte } = require("../services/inteligencia/transporte");
const { analisarFrota } = require("../services/inteligencia/frota");
const { gerarResumoExecutivo } = require("../services/inteligencia/resumoExecutivo");

const parseOptionalPositiveInt = (value) => {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

const bodySchema = z.object({
  periodo: z.enum(["dia", "semana", "mes", "ano"]).optional(),
  veiculoId: z.union([z.string(), z.number()]).optional().nullable(),
  motoristaId: z.union([z.string(), z.number()]).optional().nullable(),
  tipoAnalise: z.enum(["geral", "combustivel", "transporte", "frota"]).optional(),
});

const SAFE_EMPTY_OVERVIEW = {
  vazio: true,
  consumo_por_veiculo: [],
  custo_por_periodo: [],
  consumo_vs_producao: [],
  erro_debug: false,
  indicadores: {
    totalLitros: 0,
    totalValor: 0,
    precoMedio: 0,
    totalViagens: 0,
    veiculosAtivos: 0,
    veiculosOciosos: 0,
    veiculosConsiderados: 0,
    totalParteDiaria: 0,
  },
};

const parseAnalysisPayload = (req, { allowFallback = false } = {}) => {
  const empresaId = resolveEmpresaScopeWrite(req);
  if (!empresaId) {
    const err = new Error("empresa_id é obrigatório para análise operacional.");
    err.statusCode = 400;
    if (!allowFallback) throw err;
    return {
      empresaId: null,
      payload: {
        periodo: "mes",
        veiculoId: null,
        motoristaId: null,
        tipoAnalise: "geral",
      },
    };
  }

  const queryPeriodo = req.query?.periodo;
  const queryVeiculo = req.query?.veiculo ?? req.query?.veiculoId;
  const queryMotorista = req.query?.motorista ?? req.query?.motoristaId;
  const bodyVeiculo = req.body?.veiculoId ?? req.body?.veiculo_id;
  const bodyMotorista = req.body?.motoristaId ?? req.body?.motorista_id;
  const bodyTipoAnalise = req.body?.tipoAnalise ?? req.body?.tipo_analise;
  const rawPayload = {
    periodo: req.body?.periodo ?? queryPeriodo ?? "mes",
    veiculoId: bodyVeiculo ?? queryVeiculo ?? null,
    motoristaId: bodyMotorista ?? queryMotorista ?? null,
    tipoAnalise: bodyTipoAnalise ?? req.query?.tipoAnalise ?? req.query?.tipo_analise,
  };

  const parsedBody = bodySchema.safeParse(rawPayload);
  if (!parsedBody.success) {
    const err = new Error(parsedBody.error.issues.map((item) => item.message).join(" ") || "Payload inválido.");
    err.statusCode = 400;
    if (!allowFallback) throw err;
    return {
      empresaId: Number(empresaId),
      payload: {
        periodo: "mes",
        veiculoId: null,
        motoristaId: null,
        tipoAnalise: "geral",
      },
    };
  }

  const payload = parsedBody.data;
  return {
    empresaId: Number(empresaId),
    payload: {
      periodo: payload.periodo || "mes",
      veiculoId: parseOptionalPositiveInt(payload.veiculoId),
      motoristaId: parseOptionalPositiveInt(payload.motoristaId),
      tipoAnalise: payload.tipoAnalise || "geral",
    },
  };
};

const parseAndBuildAnalysis = async (req) => {
  const { empresaId, payload } = parseAnalysisPayload(req);

  const analysis = await analyzeOperationalData({
    empresaId,
    periodo: payload.periodo,
    veiculoId: payload.veiculoId,
    motoristaId: payload.motoristaId,
    tipoAnalise: payload.tipoAnalise,
  });

  const inconsistencias = [];
  const indicadores = analysis?.indicadores || {};
  const insights = analysis?.insights || {};
  const litros = Number(indicadores?.totalLitros || 0);
  const valor = Number(indicadores?.totalValor || 0);
  const precoMedio = Number(indicadores?.precoMedio || 0);
  const viagensTransporte = Number(indicadores?.totalViagensTransporte || 0);
  const litrosTransporte = Number(indicadores?.totalLitrosTransporte || 0);
  const dadosTransporteDisponiveis = Boolean(indicadores?.dadosTransporteDisponiveis);

  if (litros < 0) inconsistencias.push("totalLitros negativo.");
  if (valor < 0) inconsistencias.push("totalValor negativo.");
  if (precoMedio < 0) inconsistencias.push("precoMedio negativo.");
  if (litros === 0 && valor > 0) inconsistencias.push("valor informado com litros zerados.");
  if (litros > 0 && valor === 0) inconsistencias.push("litros informados com valor zerado.");
  if (precoMedio > 0 && (litros <= 0 || valor <= 0)) {
    inconsistencias.push("precoMedio informado sem base válida em litros e valor.");
  }
  if (!dadosTransporteDisponiveis && (viagensTransporte > 0 || litrosTransporte > 0)) {
    inconsistencias.push("dados de transporte marcados como indisponíveis com indicadores de transporte preenchidos.");
  }
  if (!dadosTransporteDisponiveis && insights?.consumoSemProducao) {
    inconsistencias.push("insight de consumo sem produção ativo sem base de transporte disponível.");
  }

  const relatorio = await generateIntelligenceReport({
    empresaId: Number(empresaId),
    indicadores: analysis.indicadores,
    insights: {
      ...(analysis.insights || {}),
      inconsistenciasDetectadas: inconsistencias,
    },
    periodo: analysis.periodo,
    tipoAnalise: analysis.tipoAnalise,
    filtros: analysis.filtros,
  });

  if (inconsistencias.length) {
    relatorio.inconsistencias = [...new Set([...(relatorio.inconsistencias || []), ...inconsistencias])];
    relatorio.statusOperacao = `Crítico: ${inconsistencias.length} inconsistência(s) de dados detectada(s).`;
    relatorio.analise = [
      `ERRO DE DADO: ${inconsistencias.join(" ")}`,
      relatorio.analise,
    ]
      .filter(Boolean)
      .join(" ");
    relatorio.textoEstruturado = [
      `STATUS DA OPERAÇÃO: ${relatorio.statusOperacao}`,
      "INCONSISTÊNCIAS DE DADOS:",
      ...relatorio.inconsistencias.map((item) => `- ERRO DE DADO: ${item}`),
      relatorio.textoEstruturado,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return {
    empresaId,
    analysis,
    relatorio,
  };
};

const analisarOperacao = async (req, res) => {
  try {
    const result = await parseAndBuildAnalysis(req);
    return res.json({
      ...result.analysis,
      relatorio: result.relatorio,
    });
  } catch (error) {
    const statusCode = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      error: error?.message || "Falha ao analisar operação.",
      message: error?.message || "Falha ao analisar operação.",
      inconsistencias: Array.isArray(error?.details) ? error.details : [],
    });
  }
};

const exportarPdfInteligencia = async (req, res) => {
  try {
    const result = await parseAndBuildAnalysis(req);
    const pdf = await generateIntelligencePdf({
      empresaId: result.empresaId,
      analysis: result.analysis,
      report: result.relatorio,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`);
    return res.send(pdf.buffer);
  } catch (error) {
    const statusCode = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      error: error?.message || "Falha ao exportar PDF de inteligência.",
      message: error?.message || "Falha ao exportar PDF de inteligência.",
      inconsistencias: Array.isArray(error?.details) ? error.details : [],
    });
  }
};

const getIntelligenceOverview = async (req, res) => {
  try {
    const { periodo = "mes", veiculo = null, motorista = null } = req.query || {};
    console.log("PARAMS:", req.query || {});

    const { empresaId, payload } = parseAnalysisPayload(req, { allowFallback: true });
    if (!empresaId) {
      return res.status(200).json({
        ...SAFE_EMPTY_OVERVIEW,
        filtros_recebidos: { periodo, veiculo, motorista },
      });
    }

    const ctx = buildContext({
      empresaId,
      periodo: payload.periodo,
      veiculoId: payload.veiculoId,
      motoristaId: payload.motoristaId,
      tipoAnalise: payload.tipoAnalise,
    });
    const combustivel = await analisarCombustivel(ctx);
    console.log("[INTELIGENCIA][combustivel]", combustivel);
    const transporte = await analisarTransporte(ctx);
    console.log("[INTELIGENCIA][transporte]", transporte);
    const frota = await analisarFrota({ ...ctx, activeVehicleIds: transporte.support?.activeVehicleIds || new Set() });
    console.log("[INTELIGENCIA][frota]", frota);
    const resumo = gerarResumoExecutivo({ combustivel, transporte, frota });

    const consumo_por_veiculo = combustivel.graficos?.consumoPorVeiculo || [];
    const custo_por_periodo = combustivel.graficos?.custoPorPeriodo || [];
    const consumo_vs_producao = transporte.graficos?.consumoVsProducao || [];
    const indicadores = resumo.indicadores || SAFE_EMPTY_OVERVIEW.indicadores;
    const veiculosConsiderados = Number(indicadores?.veiculosConsiderados || 0);
    const vazio = !consumo_por_veiculo.length && !custo_por_periodo.length && !consumo_vs_producao.length;

    if (vazio || veiculosConsiderados === 0) {
      return res.status(200).json({
        ...SAFE_EMPTY_OVERVIEW,
        mensagem: "Nenhum dado encontrado para o período",
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
        indicadores,
        erro_debug: false,
      });
    }

    return res.status(200).json({
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
      vazio: false,
      mensagem: "",
      consumo_por_veiculo,
      custo_por_periodo,
      consumo_vs_producao,
      indicadores,
    });
  } catch (error) {
    console.error("🔥 ERRO REAL INTELIGENCIA:");
    console.error(error);
    console.error(error?.stack);
    return res.status(200).json({
      ...SAFE_EMPTY_OVERVIEW,
      erro: true,
      erro_debug: true,
      mensagem: error?.message || "Falha no overview de inteligência.",
      stack: error?.stack || null,
    });
  }
};

module.exports = {
  analisarOperacao,
  exportarPdfInteligencia,
  getIntelligenceOverview,
};
