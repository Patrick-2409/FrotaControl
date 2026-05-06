import { dbPromise } from "./db";

const SYNCED_RETENTION_DAYS = 15;
const SYNCED_MAX_ITEMS = 300;

const normalizeClientId = (record = {}) =>
  record.client_id || record.source_id || record?.data?.client_id || record?.data?.source_id;

const normalizeType = (record = {}) => record.type || record.module || record.tipo;

const normalizePayload = (record = {}) => record.data || record.payload || record.dados;

export const saveLocal = async (record) => {
  const db = await dbPromise;
  const clientId = normalizeClientId(record);
  const type = normalizeType(record);
  const payload = normalizePayload(record);
  const status = record.status || "pending";
  if (!clientId || !type || !payload) {
    throw new Error("saveLocal requer client_id, type e data");
  }

  await db.put("history", {
    source_id: clientId,
    module: type,
    payload,
    status,
    updatedAt: new Date().toISOString(),
  });

  if (status === "synced" || status === "sincronizado") {
    await purgeSyncedHistory();
    return;
  }

  const existing = (await db.getAll("pending")).find(
    (item) =>
      (item?.client_id || item?.payload?.client_id || item?.payload?.source_id || item?.dados?.source_id) ===
        clientId && (item?.module || item?.tipo) === type
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
  const rows = await db.getAll("pending");
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
};

export const removePending = async (id) => {
  const db = await dbPromise;
  return db.delete("pending", id);
};

export const markAsSynced = async (id) => {
  const db = await dbPromise;
  const row = await db.get("pending", id);
  if (row) {
    await db.put("history", {
      source_id: row.client_id || row?.payload?.client_id || row?.payload?.source_id || row?.dados?.source_id,
      module: row.module || row.tipo || row.type,
      payload: row.payload || row.dados || row.data,
      status: "synced",
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
  const waitMs = Math.min(30000, 2000 * attempts);
  await db.put("pending", {
    ...item,
    attempts,
    next_try_at: Date.now() + waitMs,
    last_error: errorMessage || "Falha ao sincronizar",
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
  const rows = await db.getAll("history");
  const normalized = rows.map((row) => ({
    ...row,
    status:
      row.status === "sincronizado"
        ? "synced"
        : row.status === "pendente"
        ? "pending"
        : row.status,
  }));
  return normalized.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
};

export const removeHistory = async (sourceId) => {
  const db = await dbPromise;
  await db.delete("history", sourceId);
};

export const purgeSyncedHistory = async ({
  retentionDays = SYNCED_RETENTION_DAYS,
  maxItems = SYNCED_MAX_ITEMS,
} = {}) => {
  const db = await dbPromise;
  const rows = await db.getAll("history");
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const syncedRows = rows
    .filter((row) => row?.status === "synced" || row?.status === "sincronizado")
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
    createdAt: new Date().toISOString(),
  });
};

export const addSyncMetric = async ({ module, durationMs, ok }) => {
  const db = await dbPromise;
  await db.add("sync_metrics", {
    module: module || "unknown",
    durationMs: Number(durationMs) || 0,
    ok: Boolean(ok),
    createdAt: new Date().toISOString(),
  });
};

export const listRecentErrors = async (limit = 5) => {
  const db = await dbPromise;
  const rows = await db.getAll("error_logs");
  return rows
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
};

export const getSyncDiagnostics = async ({ errorsLimit = 5, metricsWindow = 100 } = {}) => {
  const db = await dbPromise;
  const pending = await db.getAll("pending");
  const errors = await listRecentErrors(errorsLimit);
  const allMetrics = await db.getAll("sync_metrics");
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
