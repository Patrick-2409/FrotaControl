const { z } = require("zod");
const { pool } = require("../db");
const {
  resolveEmpresaScope,
  resolveEmpresaScopeWrite,
  resolveSensitiveTenantScope,
} = require("../domain/tenantContext");
const dailyOps = require("../services/dailyOperationsService");
const fuelSvc = require("../services/fuelService");
const transportSvc = require("../services/transportService");
const { logInfo } = require("../services/loggerService");
const { MATERIAL_CAPACITY_SQL } = require("../utils/transportMaterialSql");

const planejamentoBodySchema = z
  .object({
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    meta_esteril_ton: z.coerce.number().nonnegative(),
    meta_rocha_ton: z.coerce.number().nonnegative().optional(),
    meta_rocha_pulmao_ton: z.coerce.number().nonnegative().optional(),
    meta_rocha_amarracao_ton: z.coerce.number().nonnegative().optional(),
    meta_rocha_armacao_ton: z.coerce.number().nonnegative().optional(),
    empresa_id: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .refine((d) => d.data_inicio <= d.data_fim, {
    message: "data_inicio deve ser anterior ou igual a data_fim.",
  });

const asNonNegativeNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

const resolveRochaPlanMeta = (source = {}) => {
  const legacy = asNonNegativeNumber(source.meta_rocha_ton);
  const pulmao = asNonNegativeNumber(source.meta_rocha_pulmao_ton);
  let amarracao = asNonNegativeNumber(source.meta_rocha_amarracao_ton ?? source.meta_rocha_armacao_ton);
  if (pulmao + amarracao <= 0 && legacy > 0) {
    amarracao = legacy;
  }
  const total = pulmao + amarracao;
  return {
    meta_rocha_ton: total,
    meta_rocha_pulmao_ton: pulmao,
    meta_rocha_armacao_ton: amarracao,
    meta_rocha_amarracao_ton: amarracao,
  };
};

const serializePlanejamento = (plan) => {
  if (!plan) return null;
  const metaRocha = resolveRochaPlanMeta(plan);
  return {
    ...plan,
    ...metaRocha,
  };
};

const dashboardPeriodoSchema = z.enum(["dia", "semana", "mes", "ano"]).optional();

const dashboard = async (req, res) => {
  const scope = resolveSensitiveTenantScope(req, {
    allowSuperAdminGlobal: true,
    requireSuperAdminExplicitScope: true,
  });
  if (!scope.ok) {
    return res.status(scope.statusCode).json({
      success: false,
      error: scope.message,
      message: scope.message,
    });
  }
  if (scope.is_global) {
    logInfo("dashboard:global_scope", {
      usuario_id: req.user?.sub || null,
      role: req.user?.role || null,
      endpoint: req.originalUrl || req.url || "/api/dashboard/stats",
    });
  }
  const rawPeriodo = req.query.periodo != null ? String(req.query.periodo).trim().toLowerCase() : "";
  const periodoParsed = dashboardPeriodoSchema.safeParse(rawPeriodo === "" ? undefined : rawPeriodo);
  if (!periodoParsed.success) {
    return res.status(400).json({
      success: false,
      error: "Período inválido.",
      message: "Use periodo=dia, periodo=semana, periodo=mes ou periodo=ano.",
    });
  }
  const stats = await dailyOps.dashboardStats({
    empresa_id: scope.empresa_id != null ? Number(scope.empresa_id) : null,
    periodo: periodoParsed.data ?? null,
  });
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
  return resolveCombustiveisPeriodBounds(periodo, dataAnchorYmd);
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
    veiculo: req.query.veiculo ? String(req.query.veiculo).trim() : undefined,
    motorista_id: req.query.motorista_id,
    veiculo_id: req.query.veiculo_id,
    tipo: req.query.tipo ? String(req.query.tipo).trim() : undefined,
    include_viagens: req.query.include_viagens,
  };
  if (!normalizedQuery.data) delete normalizedQuery.data;
  if (!normalizedQuery.data_inicio) delete normalizedQuery.data_inicio;
  if (!normalizedQuery.data_fim) delete normalizedQuery.data_fim;
  if (!normalizedQuery.mes) delete normalizedQuery.mes;
  if (!normalizedQuery.motorista) delete normalizedQuery.motorista;
  if (!normalizedQuery.veiculo) delete normalizedQuery.veiculo;
  if (!normalizedQuery.tipo) delete normalizedQuery.tipo;

  const filter = z
    .object({
      data: z.string().optional(),
      data_inicio: z.string().optional(),
      data_fim: z.string().optional(),
      mes: z.string().optional(),
      motorista: z.string().optional(),
      veiculo: z.string().optional(),
      motorista_id: z.coerce.number().int().positive().optional(),
      veiculo_id: z.coerce.number().int().positive().optional(),
      tipo: z.enum(["romaneio", "combustivel", "parte_diaria"]).optional(),
      include_viagens: z.preprocess((v) => {
        const raw = String(v ?? "").trim().toLowerCase();
        if (!raw) return undefined;
        return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
      }, z.boolean().optional()),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(1_000_000).optional(),
    })
    .parse(normalizedQuery);

  const scope = resolveSensitiveTenantScope(req, {
    allowSuperAdminGlobal: true,
    requireSuperAdminExplicitScope: true,
  });
  if (!scope.ok) {
    return res.status(scope.statusCode).json({
      success: false,
      error: scope.message,
      message: scope.message,
    });
  }
  if (scope.is_global) {
    logInfo("dashboard:records_global_scope", {
      usuario_id: req.user?.sub || null,
      role: req.user?.role || null,
      endpoint: req.originalUrl || req.url || "/api/dashboard/registros",
    });
  }

  const page = filter.page || 1;
  const limit = filter.limit || 20;
  const result = await dailyOps.listManagerRecords({
    empresa_id: scope.empresa_id,
    allow_global: scope.is_global === true,
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

  const updated = await dailyOps.updateManagerRecord({
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

  const deleted = await dailyOps.deleteManagerRecord({
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
  const periodoParsed = dashboardPeriodoSchema.safeParse(rawPeriodo === "" ? undefined : rawPeriodo);
  if (!periodoParsed.success) {
    return res.status(400).json({
      success: false,
      error: "Período inválido.",
      message: "Use periodo=dia, periodo=semana, periodo=mes ou periodo=ano. Opcional: data=YYYY-MM-DD.",
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

  const row = await transportSvc.getViagensResumoProducao(empresa_id, bounds || {});

  const toNum = (v) => (v == null ? 0 : Number(v));

  return res.json({
    total_viagens_esteril: toNum(row.total_viagens_esteril),
    total_viagens_rocha_pulmao: toNum(row.total_viagens_rocha_pulmao),
    total_viagens_rocha_armacao: toNum(row.total_viagens_rocha_armacao),
    total_viagens_rocha: toNum(row.total_viagens_rocha),
    total_toneladas_esteril: toNum(row.total_toneladas_esteril),
    total_toneladas_rocha_pulmao: toNum(row.total_toneladas_rocha_pulmao),
    total_toneladas_rocha_armacao: toNum(row.total_toneladas_rocha_armacao),
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

  const row = await transportSvc.getViagensResumoProducao(empresa_id, bounds || {});
  const toNum = (v) => (v == null ? 0 : Number(v));
  const toneladas_total =
    toNum(row.total_toneladas_esteril) + toNum(row.total_toneladas_rocha);

  const custo_total = await fuelSvc.getCombustiveisValorTotalSoma({
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
  const periodoNormalizado = ["dia", "semana", "mes", "ano"].includes(rawPeriodo) ? rawPeriodo : "mes";
  const periodoParsed = z.enum(["dia", "semana", "mes", "ano"]).safeParse(periodoNormalizado);
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

  const payload = await fuelSvc.getCombustiveisResumoMetrics({
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

  const { empresa_id: _ignoredEmpresaId, data_inicio, data_fim, meta_esteril_ton, ...metaRaw } = parsed.data;
  const metaRocha = resolveRochaPlanMeta(metaRaw);
  const row = await transportSvc.insertPlanejamento({
    empresa_id,
    data_inicio,
    data_fim,
    meta_esteril_ton,
    ...metaRocha,
  });

  return res.status(201).json({ success: true, planejamento: serializePlanejamento(row) });
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
  const planejamento = await transportSvc.getPlanejamentoAtual(empresa_id);
  return res.json({ planejamento: serializePlanejamento(planejamento) });
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
    planejado_rocha_pulmao: 0,
    planejado_rocha_amarracao: 0,
    planejado_rocha_armacao: 0,
    planejado_rocha: 0,
    executado_esteril: 0,
    executado_rocha_pulmao: 0,
    executado_rocha_amarracao: 0,
    executado_rocha_armacao: 0,
    executado_rocha: 0,
    percentual_esteril: 0,
    percentual_rocha_pulmao: 0,
    percentual_rocha_amarracao: 0,
    percentual_rocha_armacao: 0,
    percentual_rocha: 0,
    percentual_total: 0,
  });

  const plan = await transportSvc.getPlanejamentoAtual(empresa_id);
  if (!plan) {
    return res.json(empty());
  }

  const di = transportSvc.toYmd(plan.data_inicio);
  const df = transportSvc.toYmd(plan.data_fim);
  const bounds = transportSvc.utcBoundsFromDateRangeYmd(di, df);
  if (!bounds) {
    return res.json(empty());
  }

  const row = await transportSvc.getViagensResumoProducao(empresa_id, bounds);
  const toNum = (v) => (v == null ? 0 : Number(v));
  const pe = toNum(plan.meta_esteril_ton);
  const metaRocha = resolveRochaPlanMeta(plan);
  const prp = toNum(metaRocha.meta_rocha_pulmao_ton);
  const pra = toNum(metaRocha.meta_rocha_amarracao_ton);
  const pr = prp + pra;
  const ee = toNum(row.total_toneladas_esteril);
  const erp = toNum(row.total_toneladas_rocha_pulmao);
  const era = toNum(row.total_toneladas_rocha_armacao);
  const er = toNum(row.total_toneladas_rocha);
  const pct = (exe, planejado) => (planejado > 0 ? (exe / planejado) * 100 : 0);
  const planejTotal = pe + pr;
  const execTotal = ee + er;

  return res.json({
    planejado_esteril: pe,
    planejado_rocha_pulmao: prp,
    planejado_rocha_amarracao: pra,
    planejado_rocha_armacao: pra,
    planejado_rocha: pr,
    executado_esteril: ee,
    executado_rocha_pulmao: erp,
    executado_rocha_amarracao: era,
    executado_rocha_armacao: era,
    executado_rocha: er,
    percentual_esteril: pct(ee, pe),
    percentual_rocha_pulmao: pct(erp, prp),
    percentual_rocha_amarracao: pct(era, pra),
    percentual_rocha_armacao: pct(era, pra),
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
     FROM veiculos v
     WHERE v.empresa_id = $1
       AND COALESCE(v.usa_para_transporte, false) = true
       AND (
         ${MATERIAL_CAPACITY_SQL.esteril} > 0
         OR ${MATERIAL_CAPACITY_SQL.rocha_pulmao} > 0
         OR ${MATERIAL_CAPACITY_SQL.rocha_armacao} > 0
       ) = false`,
    [empresa_id]
  );
  const veiculos_sem_capacidade = Number(capRows[0]?.c ?? 0);

  const rowViagens = await transportSvc.getViagensResumoProducao(empresa_id, boundsCusto || {});
  const toNum = (v) => (v == null ? 0 : Number(v));
  const toneladas_total =
    toNum(rowViagens.total_toneladas_esteril) + toNum(rowViagens.total_toneladas_rocha);
  const custo_total = await fuelSvc.getCombustiveisValorTotalSoma({
    empresa_id,
    bounds: boundsForCombustivel,
  });
  const custo_por_tonelada =
    toneladas_total > 0 ? custo_total / toneladas_total : null;
  const custo_alto =
    custo_por_tonelada != null &&
    Number.isFinite(custo_por_tonelada) &&
    custo_por_tonelada >= CUSTO_POR_TONELADA_ALERTA_ALTO;

  const plan = await transportSvc.getPlanejamentoAtual(empresa_id);
  let meta_risco = false;
  if (plan) {
    const di = transportSvc.toYmd(plan.data_inicio);
    const df = transportSvc.toYmd(plan.data_fim);
    const boundsPlan = transportSvc.utcBoundsFromDateRangeYmd(di, df);
    if (boundsPlan?.start && boundsPlan?.end) {
      const row = await transportSvc.getViagensResumoProducao(empresa_id, boundsPlan);
      const pe = toNum(plan.meta_esteril_ton);
      const metaRocha = resolveRochaPlanMeta(plan);
      const pr = toNum(metaRocha.meta_rocha_ton);
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
