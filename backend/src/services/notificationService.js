/**
 * Feed de alertas operacionais — leitura rápida da tabela persistida.
 * Cálculos pesados (produção, combustível, risco) ficam em endpoints específicos / refresh leve em background.
 */

const crypto = require("crypto");
const { pool } = require("../db");
const { queryTimed } = require("../utils/queryTimed");
const { MATERIAL_CAPACITY_SQL } = require("../utils/transportMaterialSql");
const { buildAlertsFromSignals } = require("./alertRules");
const { logWarn } = require("./loggerService");

const FEED_LIMIT = Math.min(50, Math.max(5, Number(process.env.NOTIFICATIONS_FEED_LIMIT || 20)));
const CACHE_TTL_MS = Math.min(120_000, Math.max(15_000, Number(process.env.NOTIFICATIONS_CACHE_MS || 60_000)));
const feedCache = new Map();
const refreshInFlight = new Set();

const futureChannels = {
  push: { status: "planned", doc: "FC_NOTIFICATIONS_PUSH" },
  email: { status: "planned", doc: "FC_NOTIFICATIONS_EMAIL" },
  whatsapp: { status: "planned", doc: "FC_NOTIFICATIONS_WHATSAPP" },
  sms: { status: "planned", doc: "FC_NOTIFICATIONS_SMS" },
};

const emptyFeedPayload = () => ({
  success: true,
  items: [],
  unread_count: 0,
  etag: "w/0-empty",
  generated_at: new Date().toISOString(),
  cached: false,
  future_channels: futureChannels,
});

function mapDbRowToFeedItem(row) {
  let payload = row.payload;
  if (payload && typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  return {
    alert_key: row.alert_key,
    severity: row.severity,
    category: row.category,
    title: row.title,
    body: row.body,
    payload: payload || {},
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
  };
}

async function loadFeedWithReadState(empresaId, usuarioId, limit = FEED_LIMIT) {
  const { rows } = await queryTimed(
    `SELECT e.alert_key, e.severity, e.category, e.title, e.body, e.payload, e.first_seen_at, e.last_seen_at,
            (r.alert_key IS NOT NULL) AS read
     FROM operational_alert_events e
     LEFT JOIN operational_alert_reads r
       ON r.usuario_id = $2 AND r.alert_key = e.alert_key
     WHERE e.empresa_id = $1 AND e.is_active = true
     ORDER BY e.last_seen_at DESC
     LIMIT $3`,
    [empresaId, usuarioId, limit],
    { label: "feed-load-enriched", timeoutMs: 4000 }
  );
  return rows.map((row) => ({
    ...mapDbRowToFeedItem(row),
    read: Boolean(row.read),
  }));
}

/**
 * Sinais leves (sem transporte/combustível/risco por motorista).
 * Produção e risco: ver /dashboard/people/summary e módulos dedicados.
 */
async function gatherSignalsLite(empresaId) {
  const t0 = Date.now();
  const [capRows, rom72, transpCount, cnhRows, docRevisaoRows, docExtrasRows, manutRows] =
    await Promise.all([
      queryTimed(
        `SELECT COUNT(*)::int AS c FROM veiculos v
         WHERE v.empresa_id = $1 AND COALESCE(v.usa_para_transporte, false) = true
           AND (
            ${MATERIAL_CAPACITY_SQL.esteril} > 0
            OR ${MATERIAL_CAPACITY_SQL.rocha_pulmao} > 0
            OR ${MATERIAL_CAPACITY_SQL.rocha_armacao} > 0
           ) = false`,
        [empresaId],
        { label: "feed-lite-cap", timeoutMs: 4000 }
      ),
      queryTimed(
        `SELECT COUNT(*)::int AS c FROM romaneios
         WHERE empresa_id = $1 AND data >= NOW() - INTERVAL '72 hours'`,
        [empresaId],
        { label: "feed-lite-rom72", timeoutMs: 4000 }
      ),
      queryTimed(
        `SELECT COUNT(*)::int AS c FROM veiculos
         WHERE empresa_id = $1 AND COALESCE(usa_para_transporte, false) = true`,
        [empresaId],
        { label: "feed-lite-transp", timeoutMs: 4000 }
      ),
      queryTimed(
        `SELECT id, nome, cnh_validade, (cnh_validade - CURRENT_DATE)::int AS dias
         FROM usuarios
         WHERE empresa_id = $1 AND role = 'MOTORISTA'
           AND cnh_validade IS NOT NULL
           AND cnh_validade <= CURRENT_DATE + INTERVAL '60 days'
         ORDER BY cnh_validade ASC
         LIMIT 25`,
        [empresaId],
        { label: "feed-lite-cnh", timeoutMs: 4000 }
      ),
      queryTimed(
        `SELECT id, nome, placa, doc_revisao_validade,
          (doc_revisao_validade - CURRENT_DATE)::int AS dias
         FROM veiculos
         WHERE empresa_id = $1
           AND doc_revisao_validade IS NOT NULL
           AND doc_revisao_validade <= CURRENT_DATE + INTERVAL '60 days'
         ORDER BY doc_revisao_validade ASC
         LIMIT 15`,
        [empresaId],
        { label: "feed-lite-doc-rev", timeoutMs: 4000 }
      ),
      queryTimed(
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
        ) x
        ORDER BY dias ASC
        LIMIT 20`,
        [empresaId],
        { label: "feed-lite-doc-extra", timeoutMs: 4000 }
      ),
      queryTimed(
        `SELECT id, nome, placa, manutencao_agendar_ate,
          (manutencao_agendar_ate - CURRENT_DATE)::int AS dias
         FROM veiculos
         WHERE empresa_id = $1
           AND manutencao_agendar_ate IS NOT NULL
           AND manutencao_agendar_ate <= CURRENT_DATE + INTERVAL '60 days'
         ORDER BY manutencao_agendar_ate ASC
         LIMIT 15`,
        [empresaId],
        { label: "feed-lite-manut", timeoutMs: 4000 }
      ),
    ]);

  if (process.env.NODE_ENV !== "production") {
    console.log(`[gatherSignalsLite] empresa=${empresaId} ${Date.now() - t0}ms`);
  }

  const doc_licenciamento_proximos = [];
  const doc_seguro_proximos = [];
  const doc_inspecao_proximos = [];
  for (const r of docExtrasRows.rows) {
    const row = { id: r.id, nome: r.nome, placa: r.placa, dias: Number(r.dias) };
    if (r.doc_tipo === "licenciamento") doc_licenciamento_proximos.push(row);
    else if (r.doc_tipo === "seguro") doc_seguro_proximos.push(row);
    else if (r.doc_tipo === "inspecao") doc_inspecao_proximos.push(row);
  }

  return {
    veiculos_sem_capacidade: Number(capRows.rows[0]?.c ?? 0),
    custo_alto: false,
    meta_risco: false,
    romaneios_72h: Number(rom72.rows[0]?.c ?? 0),
    transport_veiculos: Number(transpCount.rows[0]?.c ?? 0),
    produtividade_queda: false,
    combustivel: {
      consumo_elevado_count: 0,
      preco_acima_media: false,
      consumo_alto_periodo: false,
      preco_fora_historico: false,
    },
    motoristas_sem_lancamento: [],
    motoristas_baixa_atividade: [],
    veiculos_inativos: [],
    cnh_vencidas: cnhRows.rows.filter((r) => Number(r.dias) < 0).slice(0, 10),
    cnh_vencendo: cnhRows.rows.filter((r) => Number(r.dias) >= 0).slice(0, 10),
    docs_proximos: docRevisaoRows.rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      placa: r.placa,
      dias: Number(r.dias),
    })),
    doc_licenciamento_proximos,
    doc_seguro_proximos,
    doc_inspecao_proximos,
    manut_pendentes: manutRows.rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      placa: r.placa,
      dias: Number(r.dias),
    })),
  };
}

async function persistActiveAlerts(empresaId, items) {
  const client = await pool.connect();
  const keys = items.map((i) => i.alert_key);
  try {
    await client.query("BEGIN");
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
        [
          empresaId,
          it.alert_key,
          it.severity,
          it.category,
          it.title,
          it.body,
          JSON.stringify(it.payload || {}),
        ]
      );
    }
    if (!keys.length) {
      await client.query(
        `UPDATE operational_alert_events SET is_active = false, last_seen_at = NOW() WHERE empresa_id = $1`,
        [empresaId]
      );
    } else {
      await client.query(
        `UPDATE operational_alert_events SET is_active = false, last_seen_at = NOW()
         WHERE empresa_id = $1 AND NOT (alert_key = ANY($2::text[]))`,
        [empresaId, keys]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function refreshFeedLite(empresaId) {
  const signals = await gatherSignalsLite(empresaId);
  const items = buildAlertsFromSignals(signals).slice(0, FEED_LIMIT);
  await persistActiveAlerts(empresaId, items);
  return items;
}

function scheduleAsyncRefresh(empresaId) {
  if (refreshInFlight.has(empresaId)) return;
  refreshInFlight.add(empresaId);
  setImmediate(async () => {
    try {
      const items = await refreshFeedLite(empresaId);
      const etag = buildEtag(items);
      feedCache.set(empresaId, { t: Date.now(), items, etag });
    } catch (e) {
      logWarn("feed_async_refresh_failed", { empresaId, message: e?.message });
    } finally {
      refreshInFlight.delete(empresaId);
    }
  });
}

function buildEtag(items) {
  const baseKeys = items.map((i) => i.alert_key).join("|");
  return `w/${items.length}-${crypto.createHash("sha1").update(baseKeys).digest("hex").slice(0, 24)}`;
}

async function getOperationalFeed(empresaId, usuarioId, { bypassCache = false } = {}) {
  const now = Date.now();
  try {
    if (!bypassCache) {
      const hit = feedCache.get(empresaId);
      if (hit && now - hit.t < CACHE_TTL_MS) {
        const enriched = await loadFeedWithReadState(empresaId, usuarioId, FEED_LIMIT);
        return {
          success: true,
          items: enriched,
          unread_count: enriched.filter((i) => !i.read).length,
          etag: hit.etag,
          generated_at: new Date(hit.t).toISOString(),
          cached: true,
          future_channels: futureChannels,
        };
      }
    }

    const enriched = await loadFeedWithReadState(empresaId, usuarioId, FEED_LIMIT);
    const itemsForCache = enriched.map(({ read, ...rest }) => rest);

    if (bypassCache) {
      scheduleAsyncRefresh(empresaId);
    }

    const etag = buildEtag(itemsForCache);
    feedCache.set(empresaId, { t: now, items: itemsForCache, etag });

    if (process.env.NODE_ENV !== "production") {
      console.log(`[getOperationalFeed] empresa=${empresaId} items=${enriched.length} refresh_async=${bypassCache}`);
    }

    return {
      success: true,
      items: enriched,
      unread_count: enriched.filter((i) => !i.read).length,
      etag,
      generated_at: new Date(now).toISOString(),
      cached: false,
      future_channels: futureChannels,
    };
  } catch (e) {
    logWarn("feed_request_failed", { empresaId, message: e?.message, code: e?.code });
    return emptyFeedPayload();
  }
}

/** @deprecated Mantido para testes; use gatherSignalsLite em produção. */
async function gatherSignals(empresaId) {
  return gatherSignalsLite(empresaId);
}

async function markAlertsRead(empresaId, usuarioId, keys) {
  const list = (keys || []).map((k) => String(k).trim()).filter(Boolean).slice(0, 200);
  if (!list.length) return { success: true, updated: 0 };
  await queryTimed(
    `INSERT INTO operational_alert_reads (usuario_id, alert_key, read_at)
     SELECT $1, unnest($2::text[]), NOW()
     ON CONFLICT (usuario_id, alert_key) DO UPDATE SET read_at = EXCLUDED.read_at`,
    [usuarioId, list],
    { label: "feed-mark-read", timeoutMs: 5000 }
  );
  invalidateCompanyCache(empresaId);
  return { success: true, updated: list.length };
}

async function listHistory(empresaId, limit = 40) {
  const lim = Math.min(50, Math.max(1, Number(limit) || 40));
  const { rows } = await queryTimed(
    `SELECT id, alert_key, severity, category, title, body, payload, is_active, first_seen_at, last_seen_at
     FROM operational_alert_events
     WHERE empresa_id = $1
     ORDER BY last_seen_at DESC
     LIMIT $2`,
    [empresaId, lim],
    { label: "feed-history", timeoutMs: 5000 }
  );
  return rows;
}

function invalidateCompanyCache(empresaId) {
  feedCache.delete(empresaId);
}

module.exports = {
  getOperationalFeed,
  markAlertsRead,
  listHistory,
  gatherSignals,
  gatherSignalsLite,
  refreshFeedLite,
  futureChannels,
  invalidateCompanyCache,
};
