import api, { getBaseURL } from "./api";
import {
  getPending,
  markAsSynced,
  removePending,
  saveLocal,
  addSyncMetric,
  logOfflineError,
  removeHistory,
  updatePendingRetry,
} from "../offline/offlineRepo";
import { emitToast } from "./uiEvents";
import { nowLocalDateTimeString } from "../utils/datetime";

const SYNC_API_URL = getBaseURL();
const hasAuthSession = () => {
  const token = localStorage.getItem("fc_token");
  return Boolean(token && token !== "undefined" && token !== "null");
};
const hasMotoristaSession = () => {
  try {
    const raw = localStorage.getItem("fc_user");
    if (!raw) return false;
    const user = JSON.parse(raw);
    return user?.role === "MOTORISTA";
  } catch {
    return false;
  }
};

const endpointByModule = {
  romaneios: "/app/romaneio",
  combustiveis: "/app/combustivel",
  parteDiaria: "/app/parte-diaria",
};
const MODULE_ALIAS = {
  romaneio: "romaneios",
  romaneios: "romaneios",
  combustivel: "combustiveis",
  combustiveis: "combustiveis",
  parte_diaria: "parteDiaria",
  parteDiaria: "parteDiaria",
};
let runningSync = null;
const normalizeModule = (value) => MODULE_ALIAS[value] || value;
const checklistAllowed = new Set(["ok", "ajuste", "não_funcional"]);
const sanitizePayloadForModule = (module, payload = {}) => {
  if (module !== "parteDiaria") return payload;
  const checklist = payload?.checklist;
  if (!checklist || typeof checklist !== "object") return payload;
  const nextChecklist = { ...checklist };
  if (!checklistAllowed.has(nextChecklist.outros)) {
    delete nextChecklist.outros;
  }
  return {
    ...payload,
    checklist: nextChecklist,
  };
};

const emitSyncState = (state) => {
  window.dispatchEvent(new CustomEvent("fc:sync-state", { detail: state }));
};
const ensureRecordedAt = (payload = {}) => ({
  ...payload,
  recorded_at_client: payload?.recorded_at_client || nowLocalDateTimeString(),
});

export const saveWithOffline = async (module, payload) => {
  const normalizedModule = normalizeModule(module);
  const payloadWithRecordedAt = ensureRecordedAt(payload);
  const sanitizedPayload = sanitizePayloadForModule(normalizedModule, payloadWithRecordedAt);
  const normalizedPayload = {
    ...sanitizedPayload,
    client_id: sanitizedPayload?.client_id || sanitizedPayload?.source_id,
    source_id: sanitizedPayload?.source_id || sanitizedPayload?.client_id,
  };
  console.log("SYNC START");
  if (!navigator.onLine) {
    await saveLocal({
      client_id: normalizedPayload.client_id,
      type: normalizedModule,
      data: normalizedPayload,
      status: "pending",
    });
    emitSyncState("pending");
    emitToast("Sem internet. Registro salvo localmente.", "warning");
    return { status: "pending" };
  }
  if (!hasAuthSession() || !hasMotoristaSession()) {
    await saveLocal({
      client_id: normalizedPayload.client_id,
      type: normalizedModule,
      data: normalizedPayload,
      status: "pending",
    });
    emitSyncState("pending");
    emitToast("Sessão não autenticada. Registro salvo pendente para sincronizar após novo login.", "warning");
    return { status: "pending" };
  }

  try {
    if (!endpointByModule[normalizedModule]) {
      throw new Error(`Módulo inválido para sincronização: ${normalizedModule}`);
    }
    emitSyncState("syncing");
    await saveLocal({
      client_id: normalizedPayload.client_id,
      type: normalizedModule,
      data: normalizedPayload,
      status: "syncing",
    });
    console.log("SYNC PAYLOAD:", normalizedPayload);
    console.log("Sync API URL:", SYNC_API_URL);
    const startedAt = performance.now();
    const response = await api.post(endpointByModule[normalizedModule], normalizedPayload);
    const durationMs = Math.max(0, performance.now() - startedAt);
    await addSyncMetric({ module: normalizedModule, durationMs, ok: true });
    console.log("SYNC RESPONSE:", response?.data);
    const pendingRows = await getPending();
    for (const row of pendingRows) {
      const rowSourceId = row?.client_id || row?.payload?.client_id || row?.payload?.source_id || row?.dados?.source_id;
      if (rowSourceId === normalizedPayload?.client_id) {
        await markAsSynced(row.id);
      }
    }
    await saveLocal({
      client_id: normalizedPayload.client_id,
      type: normalizedModule,
      data: normalizedPayload,
      status: "synced",
    });
    emitSyncState("synced");
    emitToast("Registro sincronizado com sucesso.");
    console.log("SYNC OK");
    return { status: "synced" };
  } catch (err) {
    console.error("Erro ao sincronizar:", err);
    await addSyncMetric({ module: normalizedModule, durationMs: 0, ok: false });
    await saveLocal({
      client_id: normalizedPayload.client_id,
      type: normalizedModule,
      data: normalizedPayload,
      status: "pending",
    });
    await logOfflineError("saveWithOffline", err.message);
    emitSyncState("pending");
    emitToast("Falha no envio. Registro mantido pendente para nova tentativa.", "warning");
    console.log("SYNC FAIL");
    return { status: "pending", error: err };
  }
};

export const syncNow = async () => {
  if (runningSync) {
    return runningSync;
  }
  runningSync = (async () => {
  console.log("SYNC START");
  const pendingBefore = (await getPending()).length;
  console.log("PENDENTES:", pendingBefore);
  if (!navigator.onLine) {
    emitSyncState("sem_internet");
    return { synced: 0, pending: pendingBefore, state: "sem_internet" };
  }
  if (!hasAuthSession()) {
    const state = pendingBefore > 0 ? "pending" : "synced";
    emitSyncState(state);
    return { synced: 0, failed: 0, pending: pendingBefore, state };
  }
  if (!hasMotoristaSession()) {
    const state = pendingBefore > 0 ? "pending" : "synced";
    emitSyncState(state);
    return { synced: 0, failed: 0, pending: pendingBefore, state };
  }
  emitSyncState("syncing");
  const pendings = await getPending();
  console.log("PENDENTES:", pendings);
  let synced = 0;
  let failed = 0;
  const now = Date.now();

  for (const item of pendings) {
    if (item.next_try_at && item.next_try_at > now) continue;
    let moduleName = normalizeModule(item.module || item.tipo || item.type);
    try {
      const rawPayload = {
        ...(item.payload || item.dados || item.data),
        client_id:
          item.client_id ||
          item?.payload?.client_id ||
          item?.payload?.source_id ||
          item?.dados?.source_id,
      };
      const payload = sanitizePayloadForModule(moduleName, rawPayload);
      payload.source_id = payload.source_id || payload.client_id;
      if (!endpointByModule[moduleName]) {
        throw new Error(`Módulo pendente inválido: ${moduleName}`);
      }
      await saveLocal({
        client_id: payload.client_id,
        type: moduleName,
        data: payload,
        status: "syncing",
      });
      console.log("SYNC PAYLOAD:", payload);
      console.log("Sync API URL:", SYNC_API_URL);
      const startedAt = performance.now();
      const response = await api.post(endpointByModule[moduleName], payload);
      const durationMs = Math.max(0, performance.now() - startedAt);
      await addSyncMetric({ module: moduleName, durationMs, ok: true });
      console.log("SYNC RESPONSE:", response?.data);
      await markAsSynced(item.id);
      await saveLocal({
        client_id: payload.client_id,
        type: moduleName,
        data: payload,
        status: "synced",
      });
      console.log("SYNC OK:", item.id);
      synced += 1;
    } catch (err) {
      console.error("Erro ao sincronizar:", err);
      await addSyncMetric({ module: moduleName, durationMs: 0, ok: false });
      console.error("SYNC FAIL:", item.id);
      failed += 1;
      await updatePendingRetry(item, err.message);
      await saveLocal({
        client_id:
          item.client_id ||
          item?.payload?.client_id ||
          item?.payload?.source_id ||
          item?.dados?.source_id,
        type: moduleName,
        data: item.payload || item.dados || item.data,
        status: "pending",
      });
      await logOfflineError("syncNow", err.message);
      continue;
    }
  }

  const pendingAfter = (await getPending()).length;
  const state = pendingAfter > 0 ? "pending" : "synced";
  emitSyncState(state);
  return {
    synced,
    failed,
    pending: pendingAfter,
    state,
  };
  })()
    .finally(() => {
      runningSync = null;
    });
  return runningSync;
};

export const syncPending = syncNow;

export const deleteHistoryItem = async (record) => {
  const moduleMap = {
    romaneios: "romaneios",
    combustiveis: "combustiveis",
    parteDiaria: "parte_diaria",
  };
  try {
    await api.delete(`/app/${moduleMap[record.module]}/${record.source_id}`);
  } catch {
    // falha remota não impede limpeza local antes de sync
  }

  const pending = await getPending();
  for (const p of pending) {
    if ((p.client_id || p?.payload?.source_id) === record.source_id) {
      await removePending(p.id);
    }
  }
  await removeHistory(record.source_id);
  return true;
};

export const countPending = async () => {
  const rows = await getPending();
  return rows.length;
};
