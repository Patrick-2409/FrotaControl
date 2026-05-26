const { z } = require("zod");
const { resolveEmpresaScopeWrite } = require("../domain/tenantContext");
const { analyzeOperationalData } = require("../services/intelligenceAnalysisService");
const { generateIntelligenceReport } = require("../services/intelligenceAiService");

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

const analisarOperacao = async (req, res) => {
  const empresaId = resolveEmpresaScopeWrite(req);
  if (!empresaId) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório para análise operacional.",
      message: "Informe empresa_id no corpo/query (super admin) ou use conta de administrador de empresa.",
    });
  }

  const parsedBody = bodySchema.safeParse(req.body || {});
  if (!parsedBody.success) {
    const message = parsedBody.error.issues.map((item) => item.message).join(" ") || "Payload inválido.";
    return res.status(400).json({
      success: false,
      error: "Payload inválido.",
      message,
    });
  }

  const payload = parsedBody.data;

  const result = await analyzeOperationalData({
    empresaId: Number(empresaId),
    periodo: payload.periodo || "mes",
    veiculoId: parseOptionalPositiveInt(payload.veiculoId),
    motoristaId: parseOptionalPositiveInt(payload.motoristaId),
    tipoAnalise: payload.tipoAnalise || "geral",
  });

  const relatorio = await generateIntelligenceReport({
    indicadores: result.indicadores,
    insights: result.insights,
    periodo: result.periodo,
    tipoAnalise: result.tipoAnalise,
  });

  return res.json({
    ...result,
    relatorio,
  });
};

module.exports = {
  analisarOperacao,
};
