const { z } = require("zod");
const { pool } = require("../db");
const {
  dashboardStats,
  listManagerRecords,
  updateManagerRecord,
  deleteManagerRecord,
  getCombustiveisResumoMetrics,
  getCombustiveisValorTotalSoma,
} = require("../models/recordModel");
const {
  getViagensResumoProducao,
  utcBoundsFromDateRangeYmd,
} = require("../models/viagemModel");
const {
  insertPlanejamento,
  getPlanejamentoAtual,
  toYmd,
} = require("../models/planejamentoModel");

const resolveEmpresaScope = (req) => {
  if (req.user?.role !== "SUPER_ADMIN") {
    return req.user?.empresa_id;
  }
  const fromQuery = req.query?.empresa_id;
  if (fromQuery == null || String(fromQuery).trim() === "") return null;
  const parsed = Number(fromQuery);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Para POST: super admin pode informar empresa_id no corpo ou na query. */
const resolveEmpresaScopeWrite = (req) => {
  if (req.user?.role !== "SUPER_ADMIN") {
    return req.user?.empresa_id ?? null;
  }
  const raw = req.body?.empresa_id ?? req.query?.empresa_id;
  if (raw == null || String(raw).trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const planejamentoBodySchema = z
  .object({
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    meta_esteril_ton: z.coerce.number().nonnegative(),
    meta_rocha_ton: z.coerce.number().nonnegative(),
    empresa_id: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .refine((d) => d.data_inicio <= d.data_fim, {
    message: "data_inicio deve ser anterior ou igual a data_fim.",
  });

const dashboard = async (req, res) => {
  const empresa_id = resolveEmpresaScope(req);
  const stats = await dashboardStats({ empresa_id });
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

const utcMidnight = (y, m0, d) => new Date(Date.UTC(y, m0, d, 0, 0, 0, 0));

/** Interpreta YYYY-MM-DD como dia civil em UTC (início [start,end) em ISO). */
const utcDayBoundsFromYmd = (yyyyMmDd) => {
  const parts = yyyyMmDd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const start = utcMidnight(y, m - 1, d);
  const end = utcMidnight(y, m - 1, d + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

/** Segunda-feira 00:00 UTC da semana ISO que contém o ancoramento (YYYY-MM-DD). */
const utcIsoWeekBoundsFromYmd = (yyyyMmDd) => {
  const dayBounds = utcDayBoundsFromYmd(yyyyMmDd);
  if (!dayBounds) return null;
  const anchor = new Date(dayBounds.start);
  const dow = anchor.getUTCDay();
  const offsetToMonday = (dow + 6) % 7;
  const start = new Date(anchor);
  start.setUTCDate(start.getUTCDate() - offsetToMonday);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
};

/** Primeiro dia do mês do ancoramento até o primeiro do mês seguinte (UTC). */
const utcMonthBoundsFromYmd = (yyyyMmDd) => {
  const parts = yyyyMmDd.split("-").map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m] = parts;
  const start = utcMidnight(y, m - 1, 1);
  const end = utcMidnight(y, m, 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

/** Ano civil do ancoramento (1 jan UTC até 1 jan do ano seguinte). */
const utcYearBoundsFromYmd = (yyyyMmDd) => {
  const parts = String(yyyyMmDd)
    .trim()
    .split("-")
    .map(Number);
  if (parts.length < 1 || parts.some((n) => !Number.isFinite(n))) return null;
  const y = parts[0];
  const start = utcMidnight(y, 0, 1);
  const end = utcMidnight(y + 1, 0, 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

/**
 * YYYY-MM-DD do "hoje" no calendário de São Paulo (alinhado ao que motoristas gravam sem fuso).
 */
const brazilAnchorYmd = (dataAnchorYmd) => {
  if (dataAnchorYmd && /^\d{4}-\d{2}-\d{2}$/.test(String(dataAnchorYmd).trim())) {
    return String(dataAnchorYmd).trim();
  }
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
};

/**
 * Meia-noite em America/Sao_Paulo expressa em ISO UTC (BRT = UTC−3, sem horário de verão desde 2019).
 * Usado para [start,end) compatível com comparação via AT TIME ZONE 'America/Sao_Paulo' na query.
 */
const brazilLocalMidnightUtcIso = (y, m0, d) =>
  new Date(Date.UTC(y, m0, d, 3, 0, 0, 0)).toISOString();

/**
 * Limites do resumo de combustível alinhados ao calendário operacional BR (mesma base que data/hora local gravada na app).
 */
const resolveCombustiveisPeriodBounds = (periodo, dataAnchorYmd) => {
  if (!periodo) return null;
  const ymd = brazilAnchorYmd(dataAnchorYmd);
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, mo, d] = parts;

  if (periodo === "dia") {
    return {
      start: brazilLocalMidnightUtcIso(y, mo - 1, d),
      end: brazilLocalMidnightUtcIso(y, mo - 1, d + 1),
    };
  }
  if (periodo === "semana") {
    const anchorUtcMs = Date.UTC(y, mo - 1, d, 3, 0, 0, 0);
    const dow = new Date(anchorUtcMs).getUTCDay();
    const offsetToMonday = (dow + 6) % 7;
    const mondayUtcMs = anchorUtcMs - offsetToMonday * 86400000;
    const nextMondayUtcMs = mondayUtcMs + 7 * 86400000;
    return {
      start: new Date(mondayUtcMs).toISOString(),
      end: new Date(nextMondayUtcMs).toISOString(),
    };
  }
  if (periodo === "mes") {
    return {
      start: brazilLocalMidnightUtcIso(y, mo - 1, 1),
      end: brazilLocalMidnightUtcIso(y, mo, 1),
    };
  }
  if (periodo === "ano") {
    return {
      start: brazilLocalMidnightUtcIso(y, 0, 1),
      end: brazilLocalMidnightUtcIso(y + 1, 0, 1),
    };
  }
  return null;
};

const resolveViagensPeriodBounds = (periodo, dataAnchorYmd) => {
  if (!periodo) return null;
  const ymd = dataAnchorYmd || new Date().toISOString().slice(0, 10);
  if (periodo === "dia") return utcDayBoundsFromYmd(ymd);
  if (periodo === "semana") return utcIsoWeekBoundsFromYmd(ymd);
  if (periodo === "mes") return utcMonthBoundsFromYmd(ymd);
  return null;
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
  const empresa_id = resolveEmpresaScope(req);
  const result = await listManagerRecords({
    empresa_id,
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
    empresa_id: resolveEmpresaScope(req),
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
    empresa_id: resolveEmpresaScope(req),
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

const viagensResumo = async (req, res) => {
  const empresa_id = resolveEmpresaScope(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório para este relatório.",
      message: "Informe empresa_id na query (super admin) ou use conta de administrador de empresa.",
    });
  }

  const rawPeriodo = req.query.periodo != null ? String(req.query.periodo).trim().toLowerCase() : "";
  const periodoParsed = z
    .enum(["dia", "semana", "mes"])
    .optional()
    .safeParse(rawPeriodo === "" ? undefined : rawPeriodo);
  if (!periodoParsed.success) {
    return res.status(400).json({
      success: false,
      error: "Período inválido.",
      message: "Use periodo=dia, periodo=semana ou periodo=mes. Opcional: data=YYYY-MM-DD.",
    });
  }
  const periodo = periodoParsed.data;

  const hasDataParam = req.query.data != null && String(req.query.data).trim() !== "";
  const normalizedAnchor = normalizeDateFilter(req.query.data);
  if (hasDataParam && normalizedAnchor === null) {
    return res.status(400).json({
      success: false,
      error: "Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.",
      message: "Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.",
    });
  }

  const bounds = resolveViagensPeriodBounds(periodo, normalizedAnchor);

  const row = await getViagensResumoProducao(empresa_id, bounds || {});

  const toNum = (v) => (v == null ? 0 : Number(v));

  return res.json({
    total_viagens_esteril: toNum(row.total_viagens_esteril),
    total_viagens_rocha: toNum(row.total_viagens_rocha),
    total_toneladas_esteril: toNum(row.total_toneladas_esteril),
    total_toneladas_rocha: toNum(row.total_toneladas_rocha),
  });
};

/** Custo de combustível vs toneladas de viagens no mesmo intervalo que /viagens/resumo. */
const custoOperacional = async (req, res) => {
  const empresa_id = resolveEmpresaScope(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório para este relatório.",
      message: "Informe empresa_id na query (super admin) ou use conta de administrador de empresa.",
    });
  }

  const rawPeriodo = req.query.periodo != null ? String(req.query.periodo).trim().toLowerCase() : "";
  const periodoParsed = z
    .enum(["dia", "semana", "mes"])
    .optional()
    .safeParse(rawPeriodo === "" ? undefined : rawPeriodo);
  if (!periodoParsed.success) {
    return res.status(400).json({
      success: false,
      error: "Período inválido.",
      message: "Use periodo=dia, periodo=semana ou periodo=mes. Opcional: data=YYYY-MM-DD.",
    });
  }
  const periodo = periodoParsed.data;

  const hasDataParam = req.query.data != null && String(req.query.data).trim() !== "";
  const normalizedAnchor = normalizeDateFilter(req.query.data);
  if (hasDataParam && normalizedAnchor === null) {
    return res.status(400).json({
      success: false,
      error: "Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.",
      message: "Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.",
    });
  }

  const bounds = resolveViagensPeriodBounds(periodo, normalizedAnchor);
  const boundsForCombustivel = bounds?.start && bounds?.end ? bounds : null;

  const row = await getViagensResumoProducao(empresa_id, bounds || {});
  const toNum = (v) => (v == null ? 0 : Number(v));
  const toneladas_total =
    toNum(row.total_toneladas_esteril) + toNum(row.total_toneladas_rocha);

  const custo_total = await getCombustiveisValorTotalSoma({
    empresa_id,
    bounds: boundsForCombustivel,
  });

  const custo_por_tonelada =
    toneladas_total > 0 ? custo_total / toneladas_total : null;

  return res.json({
    custo_total,
    toneladas_total,
    custo_por_tonelada,
  });
};

const combustiveisResumo = async (req, res) => {
  const empresa_id = resolveEmpresaScope(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório para este relatório.",
      message: "Informe empresa_id na query (super admin) ou use conta de administrador de empresa.",
    });
  }

  const rawPeriodo = req.query.periodo != null ? String(req.query.periodo).trim().toLowerCase() : "";
  const periodoParsed = z
    .enum(["dia", "semana", "mes", "ano"])
    .safeParse(rawPeriodo === "" ? undefined : rawPeriodo);
  if (!periodoParsed.success) {
    return res.status(400).json({
      success: false,
      error: "Período inválido.",
      message:
        "Use periodo=dia, periodo=semana, periodo=mes ou periodo=ano. Opcional: data=YYYY-MM-DD ou DD/MM/AAAA.",
    });
  }
  const periodo = periodoParsed.data;

  const hasDataParam = req.query.data != null && String(req.query.data).trim() !== "";
  const normalizedAnchor = normalizeDateFilter(req.query.data);
  if (hasDataParam && normalizedAnchor === null) {
    return res.status(400).json({
      success: false,
      error: "Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.",
      message: "Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.",
    });
  }

  const bounds = resolveCombustiveisPeriodBounds(periodo, normalizedAnchor);
  if (!bounds) {
    return res.status(400).json({
      success: false,
      error: "Não foi possível calcular o intervalo do período.",
      message: "Verifique o parâmetro data (YYYY-MM-DD ou DD/MM/AAAA).",
    });
  }

  const groupRaw = req.query.group_by != null ? String(req.query.group_by).trim().toLowerCase() : "";
  const groupByVeiculo = groupRaw === "veiculo";

  const parseOptionalPositiveInt = (raw) => {
    if (raw == null || String(raw).trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  };
  const veiculoIdFilter = parseOptionalPositiveInt(req.query.veiculo_id);
  const motoristaIdFilter = parseOptionalPositiveInt(req.query.motorista_id);

  const payload = await getCombustiveisResumoMetrics({
    empresa_id,
    bounds,
    groupByVeiculo,
    veiculoId: veiculoIdFilter,
    motoristaId: motoristaIdFilter,
  });

  return res.json(payload);
};

const postPlanejamento = async (req, res) => {
  const empresa_id = resolveEmpresaScopeWrite(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório para salvar o planejamento.",
      message:
        "Informe empresa_id no corpo ou na query (super admin) ou use conta de administrador de empresa.",
    });
  }

  const parsed = planejamentoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const message =
      parsed.error.issues.map((i) => i.message).join(" ") || "Dados inválidos.";
    return res.status(400).json({
      success: false,
      error: "Dados inválidos.",
      message,
    });
  }

  const { empresa_id: _ignoredEmpresaId, ...payload } = parsed.data;
  const row = await insertPlanejamento({
    empresa_id,
    ...payload,
  });

  return res.status(201).json({ success: true, planejamento: row });
};

const getPlanejamentoAtualHandler = async (req, res) => {
  const empresa_id = resolveEmpresaScope(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório para este recurso.",
      message: "Informe empresa_id na query (super admin) ou use conta de administrador de empresa.",
    });
  }
  const planejamento = await getPlanejamentoAtual(empresa_id);
  return res.json({ planejamento });
};

const getViagensComparacao = async (req, res) => {
  const empresa_id = resolveEmpresaScope(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório para este relatório.",
      message: "Informe empresa_id na query (super admin) ou use conta de administrador de empresa.",
    });
  }

  const empty = () => ({
    planejado_esteril: 0,
    planejado_rocha: 0,
    executado_esteril: 0,
    executado_rocha: 0,
    percentual_esteril: 0,
    percentual_rocha: 0,
    percentual_total: 0,
  });

  const plan = await getPlanejamentoAtual(empresa_id);
  if (!plan) {
    return res.json(empty());
  }

  const di = toYmd(plan.data_inicio);
  const df = toYmd(plan.data_fim);
  const bounds = utcBoundsFromDateRangeYmd(di, df);
  if (!bounds) {
    return res.json(empty());
  }

  const row = await getViagensResumoProducao(empresa_id, bounds);
  const toNum = (v) => (v == null ? 0 : Number(v));
  const pe = toNum(plan.meta_esteril_ton);
  const pr = toNum(plan.meta_rocha_ton);
  const ee = toNum(row.total_toneladas_esteril);
  const er = toNum(row.total_toneladas_rocha);
  const pct = (exe, planejado) => (planejado > 0 ? (exe / planejado) * 100 : 0);
  const planejTotal = pe + pr;
  const execTotal = ee + er;

  return res.json({
    planejado_esteril: pe,
    planejado_rocha: pr,
    executado_esteril: ee,
    executado_rocha: er,
    percentual_esteril: pct(ee, pe),
    percentual_rocha: pct(er, pr),
    percentual_total: planejTotal > 0 ? (execTotal / planejTotal) * 100 : 0,
  });
};

/** Limiares simples para alertas (alinhado ao card de custo no frontend). */
const CUSTO_POR_TONELADA_ALERTA_ALTO = 280;
const META_PERCENTUAL_RISCO = 90;

/**
 * Flags leves para o dashboard: veículos sem capacidade, custo alto no período, meta em risco.
 */
const dashboardAlertas = async (req, res) => {
  const empresa_id = resolveEmpresaScope(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório para este recurso.",
      message: "Informe empresa_id na query (super admin) ou use conta de administrador de empresa.",
    });
  }

  const rawPeriodo = req.query.periodo != null ? String(req.query.periodo).trim().toLowerCase() : "";
  const periodoParsed = z
    .enum(["dia", "semana", "mes"])
    .optional()
    .safeParse(rawPeriodo === "" ? undefined : rawPeriodo);
  if (!periodoParsed.success) {
    return res.status(400).json({
      success: false,
      error: "Período inválido.",
      message: "Use periodo=dia, periodo=semana ou periodo=mes (opcional; padrão: semana). Opcional: data.",
    });
  }
  const periodoCusto = periodoParsed.data ?? "semana";

  const hasDataParam = req.query.data != null && String(req.query.data).trim() !== "";
  const normalizedAnchor = normalizeDateFilter(req.query.data);
  if (hasDataParam && normalizedAnchor === null) {
    return res.status(400).json({
      success: false,
      error: "Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.",
      message: "Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.",
    });
  }

  const boundsCusto = resolveViagensPeriodBounds(periodoCusto, normalizedAnchor);
  const boundsForCombustivel =
    boundsCusto?.start && boundsCusto?.end ? boundsCusto : null;

  const { rows: capRows } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM veiculos
     WHERE empresa_id = $1
       AND COALESCE(usa_para_transporte, false) = true
       AND (capacidade_ton IS NULL OR capacidade_ton <= 0)`,
    [empresa_id]
  );
  const veiculos_sem_capacidade = Number(capRows[0]?.c ?? 0);

  const rowViagens = await getViagensResumoProducao(empresa_id, boundsCusto || {});
  const toNum = (v) => (v == null ? 0 : Number(v));
  const toneladas_total =
    toNum(rowViagens.total_toneladas_esteril) + toNum(rowViagens.total_toneladas_rocha);
  const custo_total = await getCombustiveisValorTotalSoma({
    empresa_id,
    bounds: boundsForCombustivel,
  });
  const custo_por_tonelada =
    toneladas_total > 0 ? custo_total / toneladas_total : null;
  const custo_alto =
    custo_por_tonelada != null &&
    Number.isFinite(custo_por_tonelada) &&
    custo_por_tonelada >= CUSTO_POR_TONELADA_ALERTA_ALTO;

  const plan = await getPlanejamentoAtual(empresa_id);
  let meta_risco = false;
  if (plan) {
    const di = toYmd(plan.data_inicio);
    const df = toYmd(plan.data_fim);
    const boundsPlan = utcBoundsFromDateRangeYmd(di, df);
    if (boundsPlan?.start && boundsPlan?.end) {
      const row = await getViagensResumoProducao(empresa_id, boundsPlan);
      const pe = toNum(plan.meta_esteril_ton);
      const pr = toNum(plan.meta_rocha_ton);
      const ee = toNum(row.total_toneladas_esteril);
      const er = toNum(row.total_toneladas_rocha);
      const planejTotal = pe + pr;
      const execTotal = ee + er;
      const pctTotal = planejTotal > 0 ? (execTotal / planejTotal) * 100 : 0;
      meta_risco = planejTotal > 0 && pctTotal < META_PERCENTUAL_RISCO;
    }
  }

  return res.json({
    veiculos_sem_capacidade,
    custo_alto,
    meta_risco,
  });
};

module.exports = {
  dashboard,
  list,
  updateRecord,
  deleteRecord,
  viagensResumo,
  custoOperacional,
  combustiveisResumo,
  postPlanejamento,
  getPlanejamentoAtualHandler,
  getViagensComparacao,
  dashboardAlertas,
};
