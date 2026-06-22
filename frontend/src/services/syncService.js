import api, { extractApiErrorMessage, getFriendlyApiErrorMessage } from "./api";
import { createLogger } from "./logger";
import { isValidatedSessionRole } from "./sessionSecurity";

const syncLog = createLogger("sync");
const SYNC_SLOW_MS = 5000;
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
const hasMotoristaSession = () => isValidatedSessionRole("MOTORISTA");

const safeLogOfflineError = async (context, err) => {
  try {
    await logOfflineError(context, extractApiErrorMessage(err) || "erro_desconhecido");
  } catch (e) {
    syncLog.warn("log_offline_error_failed", { detail: String(e?.message || e) });
  }
};

const endpointByModule = {
  romaneios: "/app/romaneio",
  combustiveis: "/app/abastecimentos",
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
        syncLog.warn("save_local_offline_network", { detail: String(e?.message || e) });
        emitToast("Não foi possível salvar localmente. Libere espaço ou verifique o armazenamento do navegador.", "error");
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
        syncLog.warn("save_local_offline_session", { detail: String(e?.message || e) });
        emitToast("Não foi possível salvar o registro localmente.", "error");
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
      await api.post(endpointByModule[normalizedModule], normalizedPayload, { skipGlobalErrorToast: true });
      const durationMs = Math.max(0, performance.now() - startedAt);
      if (durationMs >= SYNC_SLOW_MS) {
        syncLog.warn("sync_slow_post", { module: normalizedModule, durationMs, phase: "saveWithOffline" });
      }

      try {
        await addSyncMetric({ module: normalizedModule, durationMs, ok: true });
      } catch (metricErr) {
        syncLog.warn("add_sync_metric_failed", { phase: "saveWithOffline", detail: String(metricErr?.message || metricErr) });
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
        syncLog.warn("mark_synced_pending_failed", { phase: "saveWithOffline", detail: String(pendingErr?.message || pendingErr) });
      }
      try {
        await saveLocal({
          client_id: normalizedPayload.client_id,
          type: normalizedModule,
          data: normalizedPayload,
          status: "synced",
        });
      } catch (historyErr) {
        syncLog.warn("save_local_synced_history_failed", { phase: "saveWithOffline", detail: String(historyErr?.message || historyErr) });
      }
      emitSyncState("synced");
      return { status: "synced" };
    } catch (err) {
      syncLog.error("sync_save_with_offline_failed", {
        module: normalizedModule,
        detail: extractApiErrorMessage(err).slice(0, 400),
      });
      try {
        await addSyncMetric({ module: normalizedModule, durationMs: 0, ok: false });
      } catch (metricErr) {
        syncLog.warn("add_sync_metric_failed", { phase: "saveWithOffline_error", detail: String(metricErr?.message || metricErr) });
      }
      try {
        await saveLocal({
          client_id: normalizedPayload.client_id,
          type: normalizedModule,
          data: normalizedPayload,
          status: "pending",
        });
      } catch (localErr) {
        syncLog.warn("save_local_pending_after_error", { phase: "saveWithOffline", detail: String(localErr?.message || localErr) });
      }
      await safeLogOfflineError("saveWithOffline", err);
      emitSyncState("pending");
      const apiMsg = extractApiErrorMessage(err);
      emitToast(
        getFriendlyApiErrorMessage(err) || "Falha no envio. Registro mantido pendente para nova tentativa.",
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
          await api.post(endpointByModule[moduleName], payload, { skipGlobalErrorToast: true });
          const durationMs = Math.max(0, performance.now() - startedAt);
          if (durationMs >= SYNC_SLOW_MS) {
            syncLog.warn("sync_slow_post", { module: moduleName, durationMs, phase: "syncNow" });
          }
          try {
            await addSyncMetric({ module: moduleName, durationMs, ok: true });
          } catch (metricErr) {
            syncLog.warn("add_sync_metric_failed", { phase: "syncNow", detail: String(metricErr?.message || metricErr) });
          }
          try {
            await markAsSynced(item.id);
          } catch (markErr) {
            syncLog.warn("mark_as_synced_failed", { phase: "syncNow", detail: String(markErr?.message || markErr) });
          }
          try {
            await saveLocal({
              client_id: payload.client_id,
              type: moduleName,
              data: payload,
              status: "synced",
            });
          } catch (saveErr) {
            syncLog.warn("save_local_synced_failed", { phase: "syncNow", detail: String(saveErr?.message || saveErr) });
          }
          synced += 1;
        } catch (err) {
          syncLog.error("sync_now_item_failed", {
            module: moduleName,
            detail: extractApiErrorMessage(err).slice(0, 400),
          });
          try {
            await addSyncMetric({ module: moduleName, durationMs: 0, ok: false });
          } catch (metricErr) {
            syncLog.warn("add_sync_metric_failed", { phase: "syncNow_error", detail: String(metricErr?.message || metricErr) });
          }
          failed += 1;
          try {
            await updatePendingRetry(item, extractApiErrorMessage(err) || err?.message || "erro");
          } catch (retryErr) {
            syncLog.warn("update_pending_retry_failed", { phase: "syncNow", detail: String(retryErr?.message || retryErr) });
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
            syncLog.warn("save_local_pending_after_error", { phase: "syncNow", detail: String(localErr?.message || localErr) });
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
