/**
 * Serviço de notificações / alertas operacionais (empresa).
 * Cache em memória por empresa (TTL curto) para evitar rajadas de consultas.
 * Persistência: operational_alert_events + operational_alert_reads.
 *
 * Canais futuros (push, e-mail, WhatsApp, SMS): ver `futureChannels` exportado.
 */

const { pool } = require("../db");
const fuelSvc = require("./fuelService");
const transportSvc = require("./transportService");
const { buildAlertsFromSignals } = require("./alertRules");

const CUSTO_POR_TONELADA_ALERTA_ALTO = 280;
const META_PERCENTUAL_RISCO = 90;
const CACHE_TTL_MS = Math.min(120_000, Math.max(15_000, Number(process.env.NOTIFICATIONS_CACHE_MS || 45000)));
const feedCache = new Map();

const utcMidnight = (y, m0, d) => new Date(Date.UTC(y, m0, d, 0, 0, 0, 0));
const utcDayBoundsFromYmd = (yyyyMmDd) => {
  const parts = String(yyyyMmDd)
    .trim()
    .split("-")
    .map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const start = utcMidnight(y, m - 1, d);
  const end = utcMidnight(y, m - 1, d + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};
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
const utcMonthBoundsFromYmd = (yyyyMmDd) => {
  const parts = String(yyyyMmDd)
    .trim()
    .split("-")
    .map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m] = parts;
  const start = utcMidnight(y, m - 1, 1);
  const end = utcMidnight(y, m, 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

const resolveViagensPeriodBounds = (periodo, dataAnchorYmd) => {
  if (!periodo) return null;
  const ymd = dataAnchorYmd || new Date().toISOString().slice(0, 10);
  if (periodo === "dia") return utcDayBoundsFromYmd(ymd);
  if (periodo === "semana") return utcIsoWeekBoundsFromYmd(ymd);
  if (periodo === "mes") return utcMonthBoundsFromYmd(ymd);
  return null;
};

const brazilAnchorYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const brazilLocalMidnightUtcIso = (y, m0, d) => new Date(Date.UTC(y, m0, d, 3, 0, 0, 0)).toISOString();

const resolveCombustiveisPeriodBounds = (periodo, dataAnchorYmd) => {
  if (!periodo) return null;
  const ymd = brazilAnchorYmd();
  const parts = (dataAnchorYmd && /^\d{4}-\d{2}-\d{2}$/.test(String(dataAnchorYmd).trim())
    ? String(dataAnchorYmd).trim()
    : ymd
  )
    .split("-")
    .map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, mo, d] = parts;
  if (periodo === "semana") {
    const anchorUtcMs = Date.UTC(y, mo - 1, d, 3, 0, 0, 0);
    const dow = new Date(anchorUtcMs).getUTCDay();
    const offsetToMonday = (dow + 6) % 7;
    const mondayUtcMs = anchorUtcMs - offsetToMonday * 86400000;
    const nextMondayUtcMs = mondayUtcMs + 7 * 86400000;
    return { start: new Date(mondayUtcMs).toISOString(), end: new Date(nextMondayUtcMs).toISOString() };
  }
  if (periodo === "mes") {
    return { start: brazilLocalMidnightUtcIso(y, mo - 1, 1), end: brazilLocalMidnightUtcIso(y, mo, 1) };
  }
  return { start: brazilLocalMidnightUtcIso(y, mo - 1, d), end: brazilLocalMidnightUtcIso(y, mo - 1, d + 1) };
};

const toNum = (v) => (v == null ? 0 : Number(v));

async function gatherSignals(empresaId) {
  const boundsSemana = resolveViagensPeriodBounds("semana", null);
  const prevAnchor = new Date();
  prevAnchor.setUTCDate(prevAnchor.getUTCDate() - 7);
  const boundsSemanaPrev = resolveViagensPeriodBounds("semana", prevAnchor.toISOString().slice(0, 10));

  const [
    capRows,
    rowViagens,
    rowViagensPrev,
    rom72,
    transpCount,
    plan,
    combResumo,
    motoristasRows,
    inativosRows,
    cnhRows,
    docRevisaoRows,
    docExtrasRows,
    manutRows,
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM veiculos
       WHERE empresa_id = $1
         AND COALESCE(usa_para_transporte, false) = true
         AND (capacidade_ton IS NULL OR capacidade_ton <= 0)`,
      [empresaId]
    ),
    transportSvc.getViagensResumoProducao(empresaId, boundsSemana || {}),
    transportSvc.getViagensResumoProducao(empresaId, boundsSemanaPrev || {}),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM romaneios
       WHERE empresa_id = $1 AND data >= NOW() - INTERVAL '72 hours'`,
      [empresaId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM veiculos
       WHERE empresa_id = $1 AND COALESCE(usa_para_transporte, false) = true`,
      [empresaId]
    ),
    transportSvc.getPlanejamentoAtual(empresaId),
    (async () => {
      const b = resolveCombustiveisPeriodBounds("semana", null);
      if (!b?.start || !b?.end) return { alertas_combustivel: {} };
      return fuelSvc.getCombustiveisResumoMetrics({
        empresa_id: empresaId,
        bounds: b,
        groupByVeiculo: true,
        veiculoId: null,
        motoristaId: null,
      });
    })(),
    pool.query(
      `SELECT u.id, u.nome,
        (SELECT COUNT(*) FROM romaneios r WHERE r.empresa_id = u.empresa_id AND r.usuario_id = u.id
          AND r.data >= NOW() - INTERVAL '72 hours') AS c72
       FROM usuarios u
       WHERE u.empresa_id = $1 AND u.role = 'MOTORISTA'`,
      [empresaId]
    ),
    pool.query(
      `SELECT v.id, v.nome, v.placa, v.created_at,
        GREATEST(
          (SELECT MAX(r.data) FROM romaneios r WHERE r.veiculo_id = v.id AND r.empresa_id = v.empresa_id),
          (SELECT MAX(c.data) FROM combustiveis c WHERE c.veiculo_id = v.id AND c.empresa_id = v.empresa_id),
          (SELECT MAX(p.data) FROM parte_diaria p WHERE p.veiculo_id = v.id AND p.empresa_id = v.empresa_id)
        ) AS last_ev
       FROM veiculos v
       WHERE v.empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT id, nome, cnh_validade,
        (cnh_validade - CURRENT_DATE)::int AS dias
       FROM usuarios
       WHERE empresa_id = $1 AND role = 'MOTORISTA'
         AND cnh_validade IS NOT NULL
         AND cnh_validade <= CURRENT_DATE + INTERVAL '60 days'`,
      [empresaId]
    ),
    pool.query(
      `SELECT id, nome, placa, doc_revisao_validade,
        (doc_revisao_validade - CURRENT_DATE)::int AS dias
       FROM veiculos
       WHERE empresa_id = $1
         AND doc_revisao_validade IS NOT NULL
         AND doc_revisao_validade <= CURRENT_DATE + INTERVAL '60 days'`,
      [empresaId]
    ),
    pool.query(
      `SELECT id, nome, placa, doc_tipo, dias FROM (
        SELECT id, nome, placa, 'licenciamento'::text AS doc_tipo,
          (doc_licenciamento_validade - CURRENT_DATE)::int AS dias
        FROM veiculos
        WHERE empresa_id = $1
          AND doc_licenciamento_validade IS NOT NULL
          AND doc_licenciamento_validade <= CURRENT_DATE + INTERVAL '60 days'
        UNION ALL
        SELECT id, nome, placa, 'seguro',
          (doc_seguro_validade - CURRENT_DATE)::int
        FROM veiculos
        WHERE empresa_id = $1
          AND doc_seguro_validade IS NOT NULL
          AND doc_seguro_validade <= CURRENT_DATE + INTERVAL '60 days'
        UNION ALL
        SELECT id, nome, placa, 'inspecao',
          (doc_inspecao_validade - CURRENT_DATE)::int
        FROM veiculos
        WHERE empresa_id = $1
          AND doc_inspecao_validade IS NOT NULL
          AND doc_inspecao_validade <= CURRENT_DATE + INTERVAL '60 days'
      ) x`,
      [empresaId]
    ),
    pool.query(
      `SELECT id, nome, placa, manutencao_agendar_ate,
        (manutencao_agendar_ate - CURRENT_DATE)::int AS dias
       FROM veiculos
       WHERE empresa_id = $1
         AND manutencao_agendar_ate IS NOT NULL
         AND manutencao_agendar_ate <= CURRENT_DATE + INTERVAL '60 days'`,
      [empresaId]
    ),
  ]);

  const veiculos_sem_capacidade = Number(capRows.rows[0]?.c ?? 0);
  const tonCur = toNum(rowViagens.total_toneladas_esteril) + toNum(rowViagens.total_toneladas_rocha);
  const tonPrev = toNum(rowViagensPrev.total_toneladas_esteril) + toNum(rowViagensPrev.total_toneladas_rocha);
  const custo_total = await fuelSvc.getCombustiveisValorTotalSoma({
    empresa_id: empresaId,
    bounds: boundsSemana?.start && boundsSemana?.end ? boundsSemana : null,
  });
  const custo_por_tonelada = tonCur > 0 ? custo_total / tonCur : null;
  const custo_alto =
    custo_por_tonelada != null &&
    Number.isFinite(custo_por_tonelada) &&
    custo_por_tonelada >= CUSTO_POR_TONELADA_ALERTA_ALTO;

  let meta_risco = false;
  if (plan) {
    const di = transportSvc.toYmd(plan.data_inicio);
    const df = transportSvc.toYmd(plan.data_fim);
    const boundsPlan = transportSvc.utcBoundsFromDateRangeYmd(di, df);
    if (boundsPlan?.start && boundsPlan?.end) {
      const row = await transportSvc.getViagensResumoProducao(empresaId, boundsPlan);
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

  const romaneios_72h = Number(rom72.rows[0]?.c ?? 0);
  const transport_veiculos = Number(transpCount.rows[0]?.c ?? 0);
  const produtividade_queda = tonPrev >= 10 && tonCur < tonPrev * 0.5;

  const ac = combResumo?.alertas_combustivel || {};
  const combustivel = {
    consumo_elevado_count: Array.isArray(ac.consumo_elevado) ? ac.consumo_elevado.length : 0,
    preco_acima_media: Boolean(ac.preco_acima_media),
    consumo_alto_periodo: Boolean(ac.consumo_alto_periodo),
    preco_fora_historico: Boolean(ac.preco_fora_media_historico),
  };

  const motoristas_sem_lancamento = [];
  for (const r of motoristasRows.rows) {
    if (Number(r.c72) === 0) motoristas_sem_lancamento.push({ id: r.id, nome: r.nome });
  }

  const motoristas_baixa_atividade = [];
  const actRows = await pool.query(
    `SELECT u.id, u.nome,
      (SELECT COUNT(*) FROM romaneios r WHERE r.usuario_id = u.id AND r.empresa_id = u.empresa_id
        AND r.data >= NOW() - INTERVAL '7 days') AS cur7,
      (SELECT COUNT(*) FROM romaneios r WHERE r.usuario_id = u.id AND r.empresa_id = u.empresa_id
        AND r.data >= NOW() - INTERVAL '14 days' AND r.data < NOW() - INTERVAL '7 days') AS prev7
     FROM usuarios u WHERE u.empresa_id = $1 AND u.role = 'MOTORISTA'`,
    [empresaId]
  );
  for (const r of actRows.rows) {
    const c = Number(r.cur7);
    const p = Number(r.prev7);
    if (p >= 3 && c < p * 0.4) motoristas_baixa_atividade.push({ id: r.id, nome: r.nome });
  }

  const veiculos_inativos = [];
  for (const r of inativosRows.rows) {
    const createdMs = new Date(r.created_at).getTime();
    const oldEnough = Number.isFinite(createdMs) && Date.now() - createdMs > 14 * 86400000;
    if (!r.last_ev) {
      if (oldEnough) veiculos_inativos.push({ id: r.id, nome: r.nome, placa: r.placa });
      continue;
    }
    const dt = new Date(r.last_ev).getTime();
    if (Number.isFinite(dt) && Date.now() - dt > 14 * 86400000) {
      veiculos_inativos.push({ id: r.id, nome: r.nome, placa: r.placa });
    }
  }

  const cnh_proximas = cnhRows.rows.map((r) => ({ id: r.id, nome: r.nome, dias: Number(r.dias) }));
  const docs_proximos = docRevisaoRows.rows.map((r) => ({ id: r.id, nome: r.nome, placa: r.placa, dias: Number(r.dias) }));
  const doc_licenciamento_proximos = [];
  const doc_seguro_proximos = [];
  const doc_inspecao_proximos = [];
  for (const r of docExtrasRows.rows) {
    const row = { id: r.id, nome: r.nome, placa: r.placa, dias: Number(r.dias) };
    if (r.doc_tipo === "licenciamento") doc_licenciamento_proximos.push(row);
    else if (r.doc_tipo === "seguro") doc_seguro_proximos.push(row);
    else if (r.doc_tipo === "inspecao") doc_inspecao_proximos.push(row);
  }
  const manut_pendentes = manutRows.rows.map((r) => ({ id: r.id, nome: r.nome, placa: r.placa, dias: Number(r.dias) }));

  return {
    veiculos_sem_capacidade,
    custo_alto,
    meta_risco,
    romaneios_72h,
    transport_veiculos,
    produtividade_queda,
    combustivel,
    motoristas_sem_lancamento,
    motoristas_baixa_atividade,
    veiculos_inativos,
    cnh_proximas,
    docs_proximos,
    doc_licenciamento_proximos,
    doc_seguro_proximos,
    doc_inspecao_proximos,
    manut_pendentes,
  };
}

async function persistActiveAlerts(client, empresaId, items) {
  const keys = items.map((i) => i.alert_key);
  for (const it of items) {
    await client.query(
      `INSERT INTO operational_alert_events
        (empresa_id, alert_key, severity, category, title, body, payload, is_active, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true, NOW(), NOW())
       ON CONFLICT (empresa_id, alert_key) DO UPDATE SET
         severity = EXCLUDED.severity,
         category = EXCLUDED.category,
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         payload = EXCLUDED.payload,
         is_active = true,
         last_seen_at = NOW()`,
      [empresaId, it.alert_key, it.severity, it.category, it.title, it.body, JSON.stringify(it.payload || {})]
    );
  }
  if (!keys.length) {
    await client.query(`UPDATE operational_alert_events SET is_active = false, last_seen_at = NOW() WHERE empresa_id = $1`, [
      empresaId,
    ]);
  } else {
    await client.query(
      `UPDATE operational_alert_events SET is_active = false, last_seen_at = NOW()
       WHERE empresa_id = $1 AND NOT (alert_key = ANY($2::text[]))`,
      [empresaId, keys]
    );
  }
}

async function fetchReadKeys(usuarioId) {
  const { rows } = await pool.query(`SELECT alert_key FROM operational_alert_reads WHERE usuario_id = $1`, [
    usuarioId,
  ]);
  return new Set(rows.map((r) => r.alert_key));
}

async function getOperationalFeed(empresaId, usuarioId, { bypassCache = false } = {}) {
  const now = Date.now();
  if (!bypassCache) {
    const hit = feedCache.get(empresaId);
    if (hit && now - hit.t < CACHE_TTL_MS) {
      const readKeys = await fetchReadKeys(usuarioId);
      const items = hit.items.map((it) => ({
        ...it,
        read: readKeys.has(it.alert_key),
      }));
      return {
        success: true,
        items,
        unread_count: items.filter((i) => !i.read).length,
        etag: hit.etag,
        generated_at: new Date(hit.t).toISOString(),
        cached: true,
        future_channels: futureChannels,
      };
    }
  }

  const signals = await gatherSignals(empresaId);
  const items = buildAlertsFromSignals(signals);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await persistActiveAlerts(client, empresaId, items);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const readKeys = await fetchReadKeys(usuarioId);
  const crypto = require("crypto");
  const baseKeys = items.map((i) => i.alert_key).join("|");
  const etag = `w/${items.length}-${crypto.createHash("sha1").update(baseKeys).digest("hex").slice(0, 24)}`;
  const enriched = items.map((it) => ({ ...it, read: readKeys.has(it.alert_key) }));
  feedCache.set(empresaId, { t: now, items: items.map((i) => ({ ...i })), etag });

  return {
    success: true,
    items: enriched,
    unread_count: enriched.filter((i) => !i.read).length,
    etag,
    generated_at: new Date(now).toISOString(),
    cached: false,
    future_channels: futureChannels,
  };
}

async function markAlertsRead(empresaId, usuarioId, keys) {
  const list = (keys || []).map((k) => String(k).trim()).filter(Boolean).slice(0, 200);
  if (!list.length) return { success: true, updated: 0 };
  const client = await pool.connect();
  try {
    let n = 0;
    for (const k of list) {
      await client.query(
        `INSERT INTO operational_alert_reads (usuario_id, alert_key, read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (usuario_id, alert_key) DO UPDATE SET read_at = EXCLUDED.read_at`,
        [usuarioId, k]
      );
      n += 1;
    }
    invalidateCompanyCache(empresaId);
    return { success: true, updated: n };
  } finally {
    client.release();
  }
}

async function listHistory(empresaId, limit = 40) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 40));
  const { rows } = await pool.query(
    `SELECT id, alert_key, severity, category, title, body, payload, is_active, first_seen_at, last_seen_at
     FROM operational_alert_events
     WHERE empresa_id = $1
     ORDER BY last_seen_at DESC
     LIMIT $2`,
    [empresaId, lim]
  );
  return rows;
}

const futureChannels = {
  push: { status: "planned", doc: "FC_NOTIFICATIONS_PUSH" },
  email: { status: "planned", doc: "FC_NOTIFICATIONS_EMAIL" },
  whatsapp: { status: "planned", doc: "FC_NOTIFICATIONS_WHATSAPP" },
  sms: { status: "planned", doc: "FC_NOTIFICATIONS_SMS" },
};

function invalidateCompanyCache(empresaId) {
  feedCache.delete(empresaId);
}

module.exports = {
  getOperationalFeed,
  markAlertsRead,
  listHistory,
  gatherSignals,
  futureChannels,
  invalidateCompanyCache,
};
