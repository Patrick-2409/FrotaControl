const { z } = require("zod");
const { resolveEmpresaScopeWrite } = require("../domain/tenantContext");
const { analyzeOperationalData } = require("../services/intelligenceAnalysisService");
const { generateIntelligenceReport } = require("../services/intelligenceAiService");
const { generateIntelligencePdf } = require("../services/intelligencePdfService");

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

const parseAndBuildAnalysis = async (req) => {
  const empresaId = resolveEmpresaScopeWrite(req);
  if (!empresaId) {
    const err = new Error("empresa_id é obrigatório para análise operacional.");
    err.statusCode = 400;
    throw err;
  }

  const rawPayload = {
    periodo: req.body?.periodo ?? req.query?.periodo,
    veiculoId: req.body?.veiculoId ?? req.query?.veiculoId,
    motoristaId: req.body?.motoristaId ?? req.query?.motoristaId,
    tipoAnalise: req.body?.tipoAnalise ?? req.query?.tipoAnalise,
  };

  const parsedBody = bodySchema.safeParse(rawPayload);
  if (!parsedBody.success) {
    const err = new Error(parsedBody.error.issues.map((item) => item.message).join(" ") || "Payload inválido.");
    err.statusCode = 400;
    throw err;
  }

  const payload = parsedBody.data;

  const analysis = await analyzeOperationalData({
    empresaId: Number(empresaId),
    periodo: payload.periodo || "mes",
    veiculoId: parseOptionalPositiveInt(payload.veiculoId),
    motoristaId: parseOptionalPositiveInt(payload.motoristaId),
    tipoAnalise: payload.tipoAnalise || "geral",
  });

  const relatorio = await generateIntelligenceReport({
    empresaId: Number(empresaId),
    indicadores: analysis.indicadores,
    insights: analysis.insights,
    periodo: analysis.periodo,
    tipoAnalise: analysis.tipoAnalise,
    filtros: analysis.filtros,
  });

  return {
    empresaId: Number(empresaId),
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
    });
  }
};

module.exports = {
  analisarOperacao,
  exportarPdfInteligencia,
};
