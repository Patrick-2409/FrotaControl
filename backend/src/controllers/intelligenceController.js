const { z } = require("zod");
const { resolveEmpresaScopeWrite } = require("../domain/tenantContext");
const { getCompanyById } = require("../models/companyModel");
const { analyzeOperationalData } = require("../services/intelligenceAnalysisService");
const { generateIntelligenceHtml } = require("../services/intelligencePdfService");
const { generateIntelligencePdfFromReportPage } = require("../services/intelligenceReportPdfPuppeteerService");
const { generateIntelligenceReport } = require("../services/intelligenceAiService");
const {
  montarRespostaInteligente,
  mapRelatorioCompativel,
  buildOverviewResponse,
  buildOverviewVazio,
  buildPayloadGeracaoIA,
  mesclarComplementoGpt,
} = require("../services/inteligencia.service");
const { logError } = require("../services/loggerService");

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

const parseAndBuildAnalysis = async (req, { withGpt = false } = {}) => {
  const { empresaId, payload } = parseAnalysisPayload(req);

  const analysis = await analyzeOperationalData({
    empresaId,
    periodo: payload.periodo,
    veiculoId: payload.veiculoId,
    motoristaId: payload.motoristaId,
    tipoAnalise: payload.tipoAnalise,
  });

  const inteligenciaMotor = montarRespostaInteligente(analysis);
  let inteligencia = inteligenciaMotor;
  let gptReport = null;

  if (withGpt) {
    const gptPayload = buildPayloadGeracaoIA(analysis, inteligenciaMotor, empresaId);
    gptReport = await generateIntelligenceReport(gptPayload);
    inteligencia = mesclarComplementoGpt(inteligenciaMotor, gptReport, analysis);
  }

  const relatorio = mapRelatorioCompativel(inteligencia, analysis);

  return {
    empresaId,
    analysis,
    relatorio,
    inteligencia,
    inteligenciaMotor,
    gptReport,
  };
};

const analisarOperacao = async (req, res) => {
  try {
    const result = await parseAndBuildAnalysis(req, { withGpt: true });
    const overview = buildOverviewResponse(result.analysis, result.inteligencia);
    return res.json({
      ...result.analysis,
      relatorio: result.relatorio,
      inteligencia: result.inteligencia,
      overview,
      gpt: {
        origem: result.gptReport?.origem || null,
        complemento: result.inteligencia?.complemento_gpt || null,
      },
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

const buildHtmlFilename = (analysis) => {
  const periodo = analysis?.periodo?.tipo || "mes";
  const inicio = String(analysis?.periodo?.inicio || "").replaceAll("/", "-");
  return inicio ? `relatorio-inteligencia-${periodo}-${inicio}.html` : `relatorio-inteligencia-${periodo}.html`;
};

const exportarHtmlInteligencia = async (req, res) => {
  try {
    const result = await parseAndBuildAnalysis(req);
    const company = await getCompanyById(result.empresaId);
    const html = await generateIntelligenceHtml({
      company,
      analysis: result.analysis,
      report: result.relatorio,
    });

    const download = String(req.query?.download || "").toLowerCase();
    const asAttachment = download === "1" || download === "true" || download === "yes";

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Report-Format", "html");
    if (asAttachment) {
      res.setHeader("Content-Disposition", `attachment; filename="${buildHtmlFilename(result.analysis)}"`);
    }

    return res.status(200).send(html);
  } catch (error) {
    const statusCode = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (!res.headersSent) {
      return res.status(statusCode).json({
        success: false,
        error: error?.message || "Falha ao exportar HTML de inteligência.",
        message: error?.message || "Falha ao exportar HTML de inteligência.",
      });
    }
  }
};

const exportarPdfInteligencia = async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Token ausente",
        message: "Token ausente para exportação PDF.",
      });
    }

    const { payload } = parseAnalysisPayload(req);
    const { buffer, filename } = await generateIntelligencePdfFromReportPage({
      token,
      user: req.user || null,
      filters: payload,
      req,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Report-Format", "pdf-layout-bi");
    return res.status(200).send(buffer);
  } catch (error) {
    const statusCode = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    console.error("[PDF] falha na exportação:", error?.message || error);
    return res.status(statusCode).json({
      success: false,
      error: error?.message || "Falha ao exportar PDF de inteligência.",
      message: error?.message || "Falha ao exportar PDF de inteligência.",
    });
  }
};

const getIntelligenceOverview = async (req, res) => {
  try {
    const { periodo = "mes", veiculo = null, motorista = null } = req.query || {};
    const { empresaId, payload } = parseAnalysisPayload(req, { allowFallback: true });

    if (!empresaId) {
      return res.status(200).json({
        ...buildOverviewVazio({ periodo, veiculo, motorista }),
        filtros_recebidos: { periodo, veiculo, motorista },
      });
    }

    const analysis = await analyzeOperationalData({
      empresaId,
      periodo: payload.periodo,
      veiculoId: payload.veiculoId,
      motoristaId: payload.motoristaId,
      tipoAnalise: payload.tipoAnalise,
    });

    const inteligencia = montarRespostaInteligente(analysis);
    const overview = buildOverviewResponse(analysis, inteligencia);

    console.log("[INTELIGENCIA][overview]", {
      status: overview.status,
      problemas: overview.problemas?.length || 0,
      insights: overview.insights?.length || 0,
      vazio: overview.vazio,
    });

    return res.status(200).json(overview);
  } catch (error) {
    const statusCode = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const isServerError = statusCode >= 500;
    const friendlyMessage = isServerError
      ? "Não foi possível carregar o overview de inteligência no momento."
      : error?.message || "Falha no overview de inteligência.";

    logError("intelligence:overview-failed", {
      statusCode,
      message: error?.message || "overview_failed",
      stack: error?.stack || null,
      empresa_id: req?.user?.empresa_id || null,
      usuario_id: req?.user?.sub || null,
    });

    return res.status(statusCode).json({
      success: false,
      error: friendlyMessage,
      message: friendlyMessage,
    });
  }
};

const debugPdfInteligencia = async (req, res) => {
  try {
    return exportarPdfInteligencia(req, res);
  } catch (error) {
    return res.status(500).json({ erro: error?.message || "Falha ao processar PDF de debug." });
  }
};

module.exports = {
  analisarOperacao,
  exportarHtmlInteligencia,
  exportarPdfInteligencia,
  getIntelligenceOverview,
  debugPdfInteligencia,
};
