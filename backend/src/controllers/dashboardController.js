const { z } = require("zod");
const {
  dashboardStats,
  listManagerRecords,
  updateManagerRecord,
  deleteManagerRecord,
} = require("../models/recordModel");

const dashboard = async (req, res) => {
  const stats = await dashboardStats(req.user.empresa_id);
  return res.json(stats);
};

const normalizeDateFilter = (rawValue) => {
  if (!rawValue) return undefined;
  const raw = String(rawValue).trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
};
const normalizeMonthFilter = (rawValue) => {
  if (!rawValue) return undefined;
  const raw = String(rawValue).trim();
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return raw;
};

const list = async (req, res) => {
  const normalizedDate = normalizeDateFilter(req.query.data);
  const normalizedDateStart = normalizeDateFilter(req.query.data_inicio);
  const normalizedDateEnd = normalizeDateFilter(req.query.data_fim);
  const normalizedMonth = normalizeMonthFilter(req.query.mes);
  if (normalizedDate === null) {
    return res.status(400).json({
      success: false,
      error: "Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.",
      message: "Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.",
    });
  }
  if (normalizedDateStart === null || normalizedDateEnd === null) {
    return res.status(400).json({
      success: false,
      error: "Período inválido. Use YYYY-MM-DD ou DD/MM/AAAA.",
      message: "Período inválido. Use YYYY-MM-DD ou DD/MM/AAAA.",
    });
  }
  if (normalizedMonth === null) {
    return res.status(400).json({
      success: false,
      error: "Mês inválido. Use YYYY-MM.",
      message: "Mês inválido. Use YYYY-MM.",
    });
  }
  if (normalizedDateStart && normalizedDateEnd && normalizedDateStart > normalizedDateEnd) {
    return res.status(400).json({
      success: false,
      error: "Data inicial não pode ser maior que a data final.",
      message: "Data inicial não pode ser maior que a data final.",
    });
  }
  const normalizedQuery = {
    ...req.query,
    data: normalizedDate,
    data_inicio: normalizedDateStart,
    data_fim: normalizedDateEnd,
    mes: normalizedMonth,
    motorista: req.query.motorista ? String(req.query.motorista).trim() : undefined,
    tipo: req.query.tipo ? String(req.query.tipo).trim() : undefined,
  };
  if (!normalizedQuery.data) delete normalizedQuery.data;
  if (!normalizedQuery.data_inicio) delete normalizedQuery.data_inicio;
  if (!normalizedQuery.data_fim) delete normalizedQuery.data_fim;
  if (!normalizedQuery.mes) delete normalizedQuery.mes;
  if (!normalizedQuery.motorista) delete normalizedQuery.motorista;
  if (!normalizedQuery.tipo) delete normalizedQuery.tipo;

  const filter = z
    .object({
      data: z.string().optional(),
      data_inicio: z.string().optional(),
      data_fim: z.string().optional(),
      mes: z.string().optional(),
      motorista: z.string().optional(),
      tipo: z.enum(["romaneio", "combustivel", "parte_diaria"]).optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    })
    .parse(normalizedQuery);

  const page = filter.page || 1;
  const limit = filter.limit || 20;
  const result = await listManagerRecords({
    empresa_id: req.user.empresa_id,
    ...filter,
    page,
    limit,
  });
  return res.json({
    ...result,
    page,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};

const recordTypeSchema = z.enum(["romaneio", "combustivel", "parte_diaria"]);

const updateRecord = async (req, res) => {
  const params = z.object({
    tipo: recordTypeSchema,
    id: z.coerce.number().int().positive(),
  }).parse(req.params);

  const payload = z.object({
    data: z.string().optional(),
    destino: z.string().optional(),
    observacao: z.string().optional(),
    litros: z.coerce.number().positive().optional(),
    tipo_combustivel: z.string().optional(),
    total_horas: z.coerce.number().nonnegative().optional(),
    observacoes: z.string().optional(),
  }).parse(req.body);

  const updated = await updateManagerRecord({
    empresa_id: req.user.empresa_id,
    tipo: params.tipo,
    id: params.id,
    payload,
  });
  if (!updated) {
    return res.status(404).json({
      success: false,
      error: "Registro não encontrado.",
      message: "Registro não encontrado.",
    });
  }
  return res.json({ success: true, ok: true });
};

const deleteRecord = async (req, res) => {
  const params = z.object({
    tipo: recordTypeSchema,
    id: z.coerce.number().int().positive(),
  }).parse(req.params);

  const deleted = await deleteManagerRecord({
    empresa_id: req.user.empresa_id,
    tipo: params.tipo,
    id: params.id,
  });
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: "Registro não encontrado.",
      message: "Registro não encontrado.",
    });
  }
  return res.status(204).send();
};

module.exports = {
  dashboard,
  list,
  updateRecord,
  deleteRecord,
};
