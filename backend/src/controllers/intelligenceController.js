const { z } = require("zod");
const { resolveEmpresaScopeWrite } = require("../domain/tenantContext");
const { analyzeOperationalData } = require("../services/intelligenceAnalysisService");
const { generateIntelligenceReport } = require("../services/intelligenceAiService");
const { generateExecutivePdf } = require("../services/pdfReport");
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

  const inconsistencias = [...(analysis?.inconsistencias || [])];
  const statusOperacao = analysis?.statusOperacao || null;

  const relatorio = await generateIntelligenceReport({
    empresaId: Number(empresaId),
    indicadores: analysis.indicadores,
    insights: {
      ...(analysis.insights || {}),
      inconsistenciasDetectadas: inconsistencias,
    },
    inconsistencias,
    metricasExecutivas: analysis.metricasExecutivas,
    statusOperacao,
    periodo: analysis.periodo,
    tipoAnalise: analysis.tipoAnalise,
    filtros: analysis.filtros,
  });

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
    console.log("[PDF] Iniciando exportação de PDF de inteligência...");
    const result = await parseAndBuildAnalysis(req);
    console.log("[PDF] Analysis concluída, gerando documento...");
    const pdf = await generateExecutivePdf({
      empresaId: result.empresaId,
      analysis: result.analysis,
      report: result.relatorio,
    });
    console.log("[PDF] pdfDoc criado, filename:", pdf.filename);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`);

    pdf.pdfDoc.on("error", (streamErr) => {
      console.error("[PDF] Erro no stream do PDF:", streamErr?.message, streamErr?.stack);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Erro ao gerar stream do PDF.", message: streamErr?.message });
      }
    });

    pdf.pdfDoc.pipe(res);
    pdf.pdfDoc.end();
    console.log("[PDF] Stream iniciado.");
    return;
  } catch (error) {
    console.error("[PDF] Erro ao exportar PDF:", error?.message, error?.stack);
    const statusCode = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (!res.headersSent) {
      return res.status(statusCode).json({
        success: false,
        error: error?.message || "Falha ao exportar PDF de inteligência.",
        message: error?.message || "Falha ao exportar PDF de inteligência.",
      });
    }
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
    const resumo = gerarResumoExecutivo({ combustivel, transporte, frota, periodo: ctx.periodo });

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
      insights: resumo.insights,
      status_operacao: resumo.statusOperacao,
      inconsistencias: resumo.inconsistencias,
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

const debugPdfInteligencia = async (req, res) => {
  try {
    const result = await parseAndBuildAnalysis(req);
    const pdf = await generateExecutivePdf({
      empresaId: result.empresaId,
      analysis: result.analysis,
      report: result.relatorio,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="debug-inteligencia.pdf"`);
    pdf.pdfDoc.pipe(res);
    pdf.pdfDoc.end();
    return;
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error?.message || "Falha ao gerar PDF de debug.",
    });
  }
};

module.exports = {
  analisarOperacao,
  exportarPdfInteligencia,
  getIntelligenceOverview,
  debugPdfInteligencia,
};
