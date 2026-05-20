/**
 * Feed de alertas operacionais — leitura rápida da tabela persistida.
 * Cálculos pesados (produção, combustível, risco) ficam em endpoints específicos / refresh leve em background.
 */

const crypto = require("crypto");
const { pool } = require("../db");
const { queryTimed } = require("../utils/queryTimed");
const { buildAlertsFromSignals } = require("./alertRules");
const { logWarn } = require("./loggerService");

const FEED_LIMIT = Math.min(50, Math.max(5, Number(process.env.NOTIFICATIONS_FEED_LIMIT || 20)));
const CACHE_TTL_MS = Math.min(120_000, Math.max(15_000, Number(process.env.NOTIFICATIONS_CACHE_MS || 60_000)));
const BACKGROUND_REFRESH_MS = Math.min(600_000, Math.max(60_000, Number(process.env.NOTIFICATIONS_BG_REFRESH_MS || 300_000)));

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

async function fetchReadKeys(usuarioId) {
  const { rows } = await queryTimed(
    `SELECT alert_key FROM operational_alert_reads WHERE usuario_id = $1`,
    [usuarioId],
    { label: "feed-read-keys", timeoutMs: 3000 }
  );
  return new Set(rows.map((r) => r.alert_key));
}

async function loadActiveAlertsFromDb(empresaId, limit = FEED_LIMIT) {
  const { rows } = await queryTimed(
    `SELECT alert_key, severity, category, title, body, payload, first_seen_at, last_seen_at
     FROM operational_alert_events
     WHERE empresa_id = $1 AND is_active = true
     ORDER BY last_seen_at DESC
     LIMIT $2`,
    [empresaId, limit],
    { label: "feed-load-db", timeoutMs: 5000 }
  );
  return rows.map(mapDbRowToFeedItem);
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
        `SELECT COUNT(*)::int AS c FROM veiculos
         WHERE empresa_id = $1 AND COALESCE(usa_para_transporte, false) = true
           AND (capacidade_ton IS NULL OR capacidade_ton <= 0)`,
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

function scheduleBackgroundRefresh(empresaId) {
  if (refreshInFlight.has(empresaId)) return;
  const hit = feedCache.get(empresaId);
  if (hit && Date.now() - hit.t < BACKGROUND_REFRESH_MS) return;
  refreshInFlight.add(empresaId);
  setImmediate(async () => {
    try {
      const items = await refreshFeedLite(empresaId);
      const etag = `w/${items.length}-${crypto.createHash("sha1").update(items.map((i) => i.alert_key).join("|")).digest("hex").slice(0, 24)}`;
      feedCache.set(empresaId, { t: Date.now(), items, etag });
    } catch (e) {
      logWarn("feed_background_refresh_failed", { empresaId, message: e?.message });
    } finally {
      refreshInFlight.delete(empresaId);
    }
  });
}

function buildEtag(items) {
  const baseKeys = items.map((i) => i.alert_key).join("|");
  return `w/${items.length}-${crypto.createHash("sha1").update(baseKeys).digest("hex").slice(0, 24)}`;
}

async function enrichWithReadState(items, usuarioId) {
  const readKeys = await fetchReadKeys(usuarioId);
  return items.map((it) => ({ ...it, read: readKeys.has(it.alert_key) }));
}

async function getOperationalFeed(empresaId, usuarioId, { bypassCache = false } = {}) {
  const now = Date.now();
  try {
    if (!bypassCache) {
      const hit = feedCache.get(empresaId);
      if (hit && now - hit.t < CACHE_TTL_MS) {
        const enriched = await enrichWithReadState(hit.items, usuarioId);
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

    let items = await loadActiveAlertsFromDb(empresaId, FEED_LIMIT);

    if (bypassCache) {
      try {
        await refreshFeedLite(empresaId);
        items = await loadActiveAlertsFromDb(empresaId, FEED_LIMIT);
      } catch (e) {
        logWarn("feed_sync_refresh_failed", { empresaId, message: e?.message });
      }
    } else {
      scheduleBackgroundRefresh(empresaId);
    }

    const etag = buildEtag(items);
    feedCache.set(empresaId, { t: now, items: items.map((i) => ({ ...i })), etag });
    const enriched = await enrichWithReadState(items, usuarioId);

    if (process.env.NODE_ENV !== "production") {
      console.log(`[getOperationalFeed] empresa=${empresaId} items=${enriched.length} cached=false`);
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
