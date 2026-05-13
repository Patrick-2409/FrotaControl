import api, { extractApiErrorMessage } from "./api";
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

const hasAuthSession = () => {
  const token = localStorage.getItem("fc_token");
  return Boolean(token && token !== "undefined" && token !== "null");
};
const hasMotoristaSession = () => {
  try {
    const raw = localStorage.getItem("fc_user");
    if (!raw) return false;
    const user = JSON.parse(raw);
    return String(user?.role || "").toUpperCase() === "MOTORISTA";
  } catch {
    return false;
  }
};

const safeLogOfflineError = async (context, err) => {
  try {
    await logOfflineError(context, extractApiErrorMessage(err) || "erro_desconhecido");
  } catch (e) {
    console.warn("logOfflineError:", e);
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
/** Evita corrida entre saveWithOffline (online) e syncNow: mesma fila para IDB + POST. */
let idbPostChain = Promise.resolve();
const runSerialized = (fn) => {
  const run = idbPostChain.then(() => fn());
  idbPostChain = run.catch(() => {});
  return run;
};

const sameClientId = (a, b) => String(a ?? "") === String(b ?? "");

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
const hasTimeComponent = (value) => /T\d{2}:\d{2}/.test(String(value || ""));
const ensureRecordedAt = (payload = {}) => ({
  ...payload,
  recorded_at_client:
    payload?.recorded_at_client ||
    (hasTimeComponent(payload?.data) ? payload?.data : null) ||
    nowLocalDateTimeString(),
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
  const clientKey =
    normalizedPayload?.client_id ?? normalizedPayload?.source_id ?? "";

  if (!navigator.onLine) {
    return runSerialized(async () => {
      try {
        await saveLocal({
          client_id: normalizedPayload.client_id,
          type: normalizedModule,
          data: normalizedPayload,
          status: "pending",
        });
      } catch (e) {
        console.warn("saveLocal offline (sem rede):", e);
        emitToast("Não foi possível guardar localmente. Libere espaço ou verifique o armazenamento do navegador.", "error");
        return { status: "error", error: e };
      }
      emitSyncState("pending");
      emitToast("Sem internet. Registro salvo localmente.", "warning");
      return { status: "pending" };
    });
  }
  if (!hasAuthSession() || !hasMotoristaSession()) {
    return runSerialized(async () => {
      try {
        await saveLocal({
          client_id: normalizedPayload.client_id,
          type: normalizedModule,
          data: normalizedPayload,
          status: "pending",
        });
      } catch (e) {
        console.warn("saveLocal offline (sessão):", e);
        emitToast("Não foi possível guardar o registo localmente.", "error");
        return { status: "error", error: e };
      }
      emitSyncState("pending");
      emitToast("Sessão não autenticada. Registro salvo pendente para sincronizar após novo login.", "warning");
      return { status: "pending" };
    });
  }

  return runSerialized(async () => {
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
      const startedAt = performance.now();
      await api.post(endpointByModule[normalizedModule], normalizedPayload);
      const durationMs = Math.max(0, performance.now() - startedAt);

      try {
        await addSyncMetric({ module: normalizedModule, durationMs, ok: true });
      } catch (metricErr) {
        console.warn("addSyncMetric (saveWithOffline):", metricErr);
      }
      try {
        const pendingRows = await getPending();
        for (const row of pendingRows) {
          const rowSourceId =
            row?.client_id ||
            row?.payload?.client_id ||
            row?.payload?.source_id ||
            row?.dados?.source_id;
          if (sameClientId(rowSourceId, clientKey)) {
            await markAsSynced(row.id);
          }
        }
      } catch (pendingErr) {
        console.warn("markAsSynced pendentes (saveWithOffline):", pendingErr);
      }
      try {
        await saveLocal({
          client_id: normalizedPayload.client_id,
          type: normalizedModule,
          data: normalizedPayload,
          status: "synced",
        });
      } catch (historyErr) {
        console.warn("saveLocal synced (saveWithOffline):", historyErr);
      }
      emitSyncState("synced");
      return { status: "synced" };
    } catch (err) {
      console.error("Erro ao sincronizar:", err);
      try {
        await addSyncMetric({ module: normalizedModule, durationMs: 0, ok: false });
      } catch (metricErr) {
        console.warn("addSyncMetric falha (saveWithOffline):", metricErr);
      }
      try {
        await saveLocal({
          client_id: normalizedPayload.client_id,
          type: normalizedModule,
          data: normalizedPayload,
          status: "pending",
        });
      } catch (localErr) {
        console.warn("saveLocal pending após erro (saveWithOffline):", localErr);
      }
      await safeLogOfflineError("saveWithOffline", err);
      emitSyncState("pending");
      const apiMsg = extractApiErrorMessage(err);
      emitToast(
        apiMsg || "Falha no envio. Registro mantido pendente para nova tentativa.",
        "warning"
      );
      return { status: "pending", error: err, apiMessage: apiMsg || null };
    }
  });
};

export const syncNow = async () => {
  if (runningSync) {
    return runningSync;
  }
  runningSync = (async () => {
    const pendingBefore = (await getPending()).length;
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

    return runSerialized(async () => {
      emitSyncState("syncing");
      const pendings = await getPending();
      let synced = 0;
      let failed = 0;
      const now = Date.now();

      for (const item of pendings) {
        if (item.next_try_at && item.next_try_at > now) continue;
        const moduleName = normalizeModule(item.module || item.tipo || item.type);
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
          const startedAt = performance.now();
          await api.post(endpointByModule[moduleName], payload);
          const durationMs = Math.max(0, performance.now() - startedAt);
          try {
            await addSyncMetric({ module: moduleName, durationMs, ok: true });
          } catch (metricErr) {
            console.warn("addSyncMetric (syncNow):", metricErr);
          }
          try {
            await markAsSynced(item.id);
          } catch (markErr) {
            console.warn("markAsSynced (syncNow):", markErr);
          }
          try {
            await saveLocal({
              client_id: payload.client_id,
              type: moduleName,
              data: payload,
              status: "synced",
            });
          } catch (saveErr) {
            console.warn("saveLocal synced (syncNow):", saveErr);
          }
          synced += 1;
        } catch (err) {
          console.error("Erro ao sincronizar:", err);
          try {
            await addSyncMetric({ module: moduleName, durationMs: 0, ok: false });
          } catch (metricErr) {
            console.warn("addSyncMetric falha (syncNow):", metricErr);
          }
          failed += 1;
          try {
            await updatePendingRetry(item, extractApiErrorMessage(err) || err?.message || "erro");
          } catch (retryErr) {
            console.warn("updatePendingRetry (syncNow):", retryErr);
          }
          try {
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
          } catch (localErr) {
            console.warn("saveLocal pending após erro (syncNow):", localErr);
          }
          await safeLogOfflineError("syncNow", err);
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
    });
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
