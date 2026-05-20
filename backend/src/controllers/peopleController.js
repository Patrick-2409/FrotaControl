const peopleModel = require("../models/peopleModel");

const resolveEmpresaId = (req) => {
  if (req.user?.role === "SUPER_ADMIN") {
    const id = Number(req.query.empresa_id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  const id = req.user?.empresa_id;
  return id ? Number(id) : null;
};

const getSummary = async (req, res) => {
  const empresaId = resolveEmpresaId(req);
  if (!empresaId) {
    return res.status(400).json({ success: false, error: "empresa_id é obrigatório" });
  }
  const t0 = Date.now();
  const summary = await peopleModel.getPeopleSummary(empresaId);
  if (process.env.NODE_ENV !== "production") {
    const ms = Date.now() - t0;
    if (ms > 800) console.warn(`[getPeopleSummary] empresa=${empresaId} ${ms}ms`);
  }
  return res.json({
    success: true,
    summary,
    alertas_operacionais: {
      cnh_vencida: "Ver feed em Alertas (categoria pessoas).",
      cnh_vencendo: "Ver feed em Alertas (categoria pessoas).",
      ausencia_lancamentos: "Motoristas sem romaneio em 72h.",
      baixa_atividade: "Comparativo de romaneios entre semanas.",
    },
  });
};

const getProductivity = async (req, res) => {
  const empresaId = resolveEmpresaId(req);
  if (!empresaId) {
    return res.status(400).json({ success: false, error: "empresa_id é obrigatório" });
  }
  const days = Math.min(90, Math.max(7, Number(req.query.days || 30)));
  const limit = Math.min(100, Math.max(5, Number(req.query.limit || 40)));
  const t0 = Date.now();
  const items = await peopleModel.getPeopleProductivity(empresaId, { days, limit });
  if (process.env.NODE_ENV !== "production") {
    const ms = Date.now() - t0;
    if (ms > 800) console.warn(`[getPeopleProductivity] empresa=${empresaId} days=${days} ${ms}ms`);
  }
  return res.json({
    success: true,
    items,
    period_days: days,
  });
};

module.exports = {
  getSummary,
  getProductivity,
};
