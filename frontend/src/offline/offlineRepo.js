import { dbPromise } from "./db";
import { classifySyncFailure, computeNextTryAt } from "./syncPolicy";

const SYNCED_RETENTION_DAYS = 15;
const SYNCED_MAX_ITEMS = 300;

const MODULE_ALIAS = {
  romaneio: "romaneios",
  romaneios: "romaneios",
  combustivel: "combustiveis",
  combustiveis: "combustiveis",
  parte_diaria: "parteDiaria",
  parteDiaria: "parteDiaria",
};

const resolveOwnerScope = () => {
  try {
    const rawUser = localStorage.getItem("fc_user");
    if (!rawUser) return "anon";
    const user = JSON.parse(rawUser);
    const role = user?.role || "anon";
    const empresa = user?.empresa_id ?? "sem-empresa";
    const id = user?.id ?? "sem-id";
    return `${role}:${empresa}:${id}`;
  } catch {
    return "anon";
  }
};

const getStorePrimaryKey = (storeName, row) => {
  if (storeName === "history") return row?.source_id ?? null;
  return row?.id ?? null;
};

const purgeRowsWithoutOwnerScope = async (db, storeName, rows) => {
  const legacyRows = rows.filter((row) => !row?.owner_scope);
  if (!legacyRows.length) return rows;

  await Promise.all(
    legacyRows.map((row) => {
      const key = getStorePrimaryKey(storeName, row);
      if (key == null) return Promise.resolve();
      return db.delete(storeName, key).catch(() => {});
    })
  );
  return rows.filter((row) => row?.owner_scope);
};

const normalizeClientId = (record = {}) =>
  record.client_id || record.source_id || record?.data?.client_id || record?.data?.source_id;

const normalizeType = (record = {}) => {
  const rawType = record.type || record.module || record.tipo;
  return MODULE_ALIAS[rawType] || rawType;
};

const normalizePayload = (record = {}) => record.data || record.payload || record.dados;

export const saveLocal = async (record) => {
  const db = await dbPromise;
  const clientId = normalizeClientId(record);
  const type = normalizeType(record);
  const payload = normalizePayload(record);
  const status = record.status || "pending";
  const ownerScope = resolveOwnerScope();
  if (!clientId || !type || !payload) {
    throw new Error("saveLocal requer client_id, type e data");
  }

  await db.put("history", {
    source_id: clientId,
    module: type,
    payload,
    status,
    owner_scope: ownerScope,
    updatedAt: new Date().toISOString(),
  });

  if (status === "synced" || status === "sincronizado") {
    await purgeSyncedHistory();
    return;
  }

  const existing = (await db.getAll("pending")).find(
    (item) =>
      item?.owner_scope === ownerScope &&
      (item?.client_id || item?.payload?.client_id || item?.payload?.source_id || item?.dados?.source_id) ===
        clientId && normalizeType(item) === type
  );
  const nextItem = {
    client_id: clientId,
    type,
    data: payload,
    tipo: type,
    dados: payload,
    timestamp: new Date().toISOString(),
    module: type,
    payload,
    attempts: 0,
    next_try_at: Date.now(),
    owner_scope: ownerScope,
    createdAt: new Date().toISOString(),
  };
  if (existing?.id) {
    await db.put("pending", { ...existing, ...nextItem, id: existing.id });
    return;
  }
  await db.add("pending", nextItem);
};

export const getPending = async () => {
  const db = await dbPromise;
  const ownerScope = resolveOwnerScope();
  const allRows = await db.getAll("pending");
  const rows = await purgeRowsWithoutOwnerScope(db, "pending", allRows);
  return rows
    .filter((row) => row?.owner_scope === ownerScope)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
};

export const removePending = async (id) => {
  const db = await dbPromise;
  return db.delete("pending", id);
};

export const markAsSynced = async (id) => {
  const db = await dbPromise;
  const ownerScope = resolveOwnerScope();
  const row = await db.get("pending", id);
  if (row && row?.owner_scope === ownerScope) {
    await db.put("history", {
      source_id: row.client_id || row?.payload?.client_id || row?.payload?.source_id || row?.dados?.source_id,
      module: normalizeType(row),
      payload: row.payload || row.dados || row.data,
      status: "synced",
      owner_scope: ownerScope,
      updatedAt: new Date().toISOString(),
    });
    await db.delete("pending", id);
    await purgeSyncedHistory();
  }
};

export const addPending = async (module, payload) => {
  await saveLocal({
    client_id: payload?.client_id || payload?.source_id,
    type: module,
    data: payload,
    status: "pending",
  });
};

export const allPending = async () => {
  return getPending();
};

export const clearPending = async (id) => {
  return removePending(id);
};

export const updatePendingRetry = async (item, errorMessage) => {
  const db = await dbPromise;
  const attempts = (item.attempts || 0) + 1;
  const now = Date.now();
  const failureKind = classifySyncFailure(errorMessage || "");
  await db.put("pending", {
    ...item,
    owner_scope: item?.owner_scope || resolveOwnerScope(),
    attempts,
    next_try_at: computeNextTryAt(attempts, now),
    last_error: errorMessage || "Falha ao sincronizar",
    last_failure_kind: failureKind,
  });
};

export const saveHistory = async (module, payload, status = "pendente") => {
  const normalizedStatus =
    status === "sincronizado" ? "synced" : status === "pendente" ? "pending" : status;
  await saveLocal({
    client_id: payload?.client_id || payload?.source_id,
    type: module,
    data: payload,
    status: normalizedStatus,
  });
};

export const listHistory = async () => {
  const db = await dbPromise;
  const ownerScope = resolveOwnerScope();
  const allRows = await db.getAll("history");
  const rows = await purgeRowsWithoutOwnerScope(db, "history", allRows);
  const normalized = rows.map((row) => ({
    ...row,
    module: normalizeType(row),
    status:
      row.status === "sincronizado"
        ? "synced"
        : row.status === "pendente"
        ? "pending"
        : row.status,
  }));
  return normalized
    .filter((row) => row?.owner_scope === ownerScope)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
};

export const removeHistory = async (sourceId) => {
  const db = await dbPromise;
  const ownerScope = resolveOwnerScope();
  const row = await db.get("history", sourceId);
  if (row?.owner_scope === ownerScope) {
    await db.delete("history", sourceId);
  }
};

export const purgeSyncedHistory = async ({
  retentionDays = SYNCED_RETENTION_DAYS,
  maxItems = SYNCED_MAX_ITEMS,
} = {}) => {
  const db = await dbPromise;
  const ownerScope = resolveOwnerScope();
  const rows = await db.getAll("history");
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const syncedRows = rows
    .filter(
      (row) =>
        row?.owner_scope === ownerScope &&
        (row?.status === "synced" || row?.status === "sincronizado")
    )
    .map((row) => ({
      ...row,
      updatedAtMs: new Date(row.updatedAt || 0).getTime() || 0,
    }));

  const toDelete = new Set();

  for (const row of syncedRows) {
    if (row.updatedAtMs < cutoffTime) {
      toDelete.add(row.source_id);
    }
  }

  const remainingSynced = syncedRows
    .filter((row) => !toDelete.has(row.source_id))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);

  const overflow = remainingSynced.slice(maxItems);
  for (const row of overflow) {
    toDelete.add(row.source_id);
  }

  if (!toDelete.size) return;
  await Promise.all(Array.from(toDelete).map((sourceId) => db.delete("history", sourceId)));
};

export const logOfflineError = async (context, message) => {
  const db = await dbPromise;
  await db.add("error_logs", {
    context,
    message,
    owner_scope: resolveOwnerScope(),
    createdAt: new Date().toISOString(),
  });
};

export const addSyncMetric = async ({ module, durationMs, ok }) => {
  const db = await dbPromise;
  await db.add("sync_metrics", {
    module: MODULE_ALIAS[module] || module || "unknown",
    durationMs: Number(durationMs) || 0,
    ok: Boolean(ok),
    owner_scope: resolveOwnerScope(),
    createdAt: new Date().toISOString(),
  });
};

export const listRecentErrors = async (limit = 5) => {
  const db = await dbPromise;
  const ownerScope = resolveOwnerScope();
  const rows = await db.getAll("error_logs");
  return rows
    .filter((row) => row?.owner_scope === ownerScope)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
};

export const getSyncDiagnostics = async ({ errorsLimit = 5, metricsWindow = 100 } = {}) => {
  const db = await dbPromise;
  const ownerScope = resolveOwnerScope();
  const pendingAll = await db.getAll("pending");
  const pendingScoped = await purgeRowsWithoutOwnerScope(db, "pending", pendingAll);
  const pending = pendingScoped.filter((row) => row?.owner_scope === ownerScope);
  const errors = await listRecentErrors(errorsLimit);
  const metricsAll = await db.getAll("sync_metrics");
  const metricsScoped = await purgeRowsWithoutOwnerScope(db, "sync_metrics", metricsAll);
  const allMetrics = metricsScoped.filter((row) => row?.owner_scope === ownerScope);
  const recentMetrics = allMetrics
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, metricsWindow);
  const successMetrics = recentMetrics.filter((m) => m.ok && Number.isFinite(Number(m.durationMs)));
  const avgSendMs = successMetrics.length
    ? Math.round(successMetrics.reduce((acc, item) => acc + Number(item.durationMs || 0), 0) / successMetrics.length)
    : null;
  const failureCount = recentMetrics.filter((m) => !m.ok).length;

  return {
    pendingCount: pending.length,
    avgSendMs,
    samples: recentMetrics.length,
    failureCount,
    lastErrors: errors,
  };
};

export const purgeUnscopedOfflineData = async () => {
  const db = await dbPromise;
  const stores = ["pending", "history", "error_logs", "sync_metrics"];
  await Promise.all(
    stores.map(async (storeName) => {
      const rows = await db.getAll(storeName);
      await purgeRowsWithoutOwnerScope(db, storeName, rows);
    })
  );
};

/**
 * Limpa totalmente o cache offline local da aplicação.
 * Usado no logout para evitar retenção de dados em dispositivos compartilhados.
 */
export const clearAllOfflineData = async () => {
  const db = await dbPromise;
  const stores = ["pending", "history", "error_logs", "sync_metrics"];
  await Promise.all(
    stores.map((storeName) =>
      db.clear(storeName).catch(() => {})
    )
  );
};
