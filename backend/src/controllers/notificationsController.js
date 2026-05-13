const { z } = require("zod");
const { resolveEmpresaScope } = require("../domain/tenantContext");
const notificationSvc = require("../services/notificationService");

const readBodySchema = z.object({
  keys: z.array(z.string().min(1).max(190)).max(200),
});

const notificationsFeed = async (req, res) => {
  const empresa_id = resolveEmpresaScope(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório.",
      message: "Informe empresa_id na query (super admin) ou use conta de administrador de empresa.",
    });
  }
  const bypassCache = String(req.query.refresh || "").trim() === "1";
  const payload = await notificationSvc.getOperationalFeed(empresa_id, req.user.sub, { bypassCache });
  return res.json(payload);
};

const notificationsHistory = async (req, res) => {
  const empresa_id = resolveEmpresaScope(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório.",
      message: "Informe empresa_id na query (super admin) ou use conta de administrador de empresa.",
    });
  }
  const lim = z.coerce.number().int().min(1).max(200).safeParse(req.query.limit);
  const rows = await notificationSvc.listHistory(empresa_id, lim.success ? lim.data : 40);
  return res.json({ success: true, items: rows, future_channels: notificationSvc.futureChannels });
};

const notificationsRead = async (req, res) => {
  const empresa_id = resolveEmpresaScope(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório.",
      message: "Informe empresa_id na query (super admin) ou use conta de administrador de empresa.",
    });
  }
  const parsed = readBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Body inválido.",
      message: parsed.error.issues.map((i) => i.message).join(" ") || "Envie { keys: string[] }.",
    });
  }
  const result = await notificationSvc.markAlertsRead(empresa_id, req.user.sub, parsed.data.keys);
  return res.json(result);
};

module.exports = {
  notificationsFeed,
  notificationsHistory,
  notificationsRead,
};
