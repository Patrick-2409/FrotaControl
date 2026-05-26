const { z } = require("zod");
const { resolveEmpresaScope } = require("../domain/tenantContext");
const { generateOperationalAnalysisPdf } = require("../services/operationalAiAnalysisService");

const periodoSchema = z.enum(["dia", "semana", "mes", "ano"]).optional();

const generateOperationalAnalysisPdfHandler = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  if (!empresaId) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório para gerar análise operacional.",
      message: "Informe empresa_id na query (super admin) ou use conta de administrador de empresa.",
    });
  }

  const parsed = periodoSchema.safeParse(
    req.query.periodo != null ? String(req.query.periodo).trim().toLowerCase() : undefined
  );
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Período inválido.",
      message: "Use periodo=dia, periodo=semana, periodo=mes ou periodo=ano.",
    });
  }

  const periodo = parsed.data || "mes";
  const userId = req.user?.sub ? Number(req.user.sub) : null;

  try {
    const result = await generateOperationalAnalysisPdf({
      empresaId: Number(empresaId),
      userId: Number.isFinite(userId) ? userId : null,
      periodo,
    });
    const companySlug = String(result.companyName || "empresa")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const filename = `analise-operacional-${companySlug || "empresa"}-${periodo}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Operational-AI-Cache", result.cacheHit ? "HIT" : "MISS");
    return res.send(result.buffer);
  } catch (error) {
    const statusCode = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      error: error?.message || "Falha ao gerar análise operacional.",
      message: error?.message || "Falha ao gerar análise operacional.",
    });
  }
};

module.exports = {
  generateOperationalAnalysisPdfHandler,
};

