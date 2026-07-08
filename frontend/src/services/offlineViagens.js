/**
 * Armazenamento local de viagens (IndexedDB) para modo offline.
 * DB: frotacontrol_offline · store: viagens
 */

import api from "./api";
import { normalizeOfflineTipo } from "./offlineViagensTipo.js";

const DB_NAME = "frotacontrol_offline";
const DB_VERSION = 1;
const STORE = "viagens";

/** @type {Promise<IDBDatabase> | null} */
let dbOpenPromise = null;

function resolveApontadorOwner() {
  if (typeof localStorage === "undefined") return null;
  try {
    const rawUser = localStorage.getItem("fc_user");
    if (!rawUser) return null;
    const user = JSON.parse(rawUser);
    if (user?.role !== "APONTADOR") return null;
    const empresaId = Number(user?.empresa_id);
    const apontadorId = Number(user?.id);
    if (!Number.isFinite(empresaId) || empresaId <= 0 || !Number.isFinite(apontadorId) || apontadorId <= 0) {
      return null;
    }
    return {
      owner_scope: `APONTADOR:${empresaId}:${apontadorId}`,
      empresa_id: empresaId,
      apontador_id: apontadorId,
    };
  } catch {
    return null;
  }
}

function hasIndexedDB() {
  return typeof indexedDB !== "undefined" && indexedDB != null;
}

function openDatabase() {
  if (!hasIndexedDB()) {
    return Promise.reject(new Error("IndexedDB não disponível neste ambiente."));
  }
  if (dbOpenPromise) return dbOpenPromise;

  dbOpenPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => {
      dbOpenPromise = null;
      reject(req.error ?? new Error("Falha ao abrir IndexedDB."));
    };

    req.onsuccess = () => resolve(req.result);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id_local" });
        os.createIndex("status", "status", { unique: false });
      }
    };
  });

  return dbOpenPromise;
}

/**
 * @param {object} viagem
 * @param {string} [viagem.id_local]
 * @param {number} viagem.veiculo_id
 * @param {number} viagem.motorista_id
 * @param {"esteril"|"rocha"|"rocha_pulmao"|"rocha_armacao"} viagem.tipo
 * @param {number} viagem.timestamp
 * @returns {Promise<object>}
 */
export async function saveOfflineViagem(viagem) {
  if (!viagem || typeof viagem !== "object") {
    throw new Error("saveOfflineViagem: payload inválido.");
  }
  const owner = resolveApontadorOwner();
  if (!owner) {
    throw new Error("saveOfflineViagem: perfil de apontador invalido.");
  }
  const veiculo_id = Number(viagem.veiculo_id);
  const motorista_id = Number(viagem.motorista_id);
  const timestamp = Number(viagem.timestamp);
  const tipo = normalizeOfflineTipo(viagem.tipo);

  if (!Number.isFinite(veiculo_id) || veiculo_id <= 0) {
    throw new Error("saveOfflineViagem: veiculo_id inválido.");
  }
  if (!Number.isFinite(motorista_id) || motorista_id <= 0) {
    throw new Error("saveOfflineViagem: motorista_id inválido.");
  }
  if (!Number.isFinite(timestamp)) {
    throw new Error("saveOfflineViagem: timestamp inválido.");
  }
  if (!tipo) {
    throw new Error("saveOfflineViagem: tipo inválido para apontamento.");
  }

  const id_local =
    typeof viagem.id_local === "string" && viagem.id_local.trim().length > 0
      ? viagem.id_local.trim()
      : crypto.randomUUID();

  const record = {
    id_local,
    veiculo_id,
    motorista_id,
    tipo,
    timestamp,
    owner_scope: owner.owner_scope,
    empresa_id: owner.empresa_id,
    apontador_id: owner.apontador_id,
    status: "pendente",
  };

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.put(record);

    req.onerror = () => reject(req.error ?? new Error("Falha ao gravar viagem offline."));
    req.onsuccess = () => resolve({ ...record });
    tx.onerror = () => reject(tx.error ?? new Error("Transação IndexedDB falhou."));
  });
}

/**
 * @returns {Promise<Array<{ id_local: string, veiculo_id: number, motorista_id: number, tipo: string, timestamp: number, status: string }>>}
 */
export async function getPendingViagens() {
  if (!hasIndexedDB()) return [];
  const owner = resolveApontadorOwner();
  if (!owner) return [];

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const index = store.index("status");
    const req = index.getAll("pendente");

    req.onerror = () => reject(req.error ?? new Error("Falha ao ler viagens pendentes."));
    req.onsuccess = () => {
      const rows = Array.isArray(req.result) ? req.result : [];
      resolve(rows.filter((row) => row?.owner_scope === owner.owner_scope));
    };
    tx.onerror = () => reject(tx.error ?? new Error("Transação IndexedDB falhou."));
  });
}

/**
 * @param {string} id_local
 * @returns {Promise<void>}
 */
export async function markAsSynced(id_local) {
  if (typeof id_local !== "string" || !id_local.trim()) {
    throw new Error("markAsSynced: id_local inválido.");
  }

  const owner = resolveApontadorOwner();
  if (!owner) {
    throw new Error("markAsSynced: perfil de apontador invalido.");
  }

  const db = await openDatabase();
  const key = id_local.trim();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(key);

    getReq.onerror = () => reject(getReq.error ?? new Error("Falha ao ler registro offline."));

    getReq.onsuccess = () => {
      const row = getReq.result;
      if (!row) {
        reject(new Error(`markAsSynced: registro não encontrado (${key}).`));
        return;
      }
      if (row.owner_scope !== owner.owner_scope) {
        reject(new Error("markAsSynced: registro pertence a outro perfil."));
        return;
      }
      row.status = "sincronizado";
      const putReq = store.put(row);
      putReq.onerror = () => reject(putReq.error ?? new Error("Falha ao atualizar registro offline."));
      putReq.onsuccess = () => resolve();
    };

    tx.onerror = () => reject(tx.error ?? new Error("Transação IndexedDB falhou."));
  });
}

/**
 * Remove um registo local (pendente ou já marcado como sincronizado).
 * @param {string} id_local
 * @returns {Promise<void>}
 */
export async function deleteViagemLocal(id_local) {
  if (typeof id_local !== "string" || !id_local.trim()) {
    throw new Error("deleteViagemLocal: id_local inválido.");
  }
  if (!hasIndexedDB()) return;
  const owner = resolveApontadorOwner();
  if (!owner) return;

  const db = await openDatabase();
  const key = id_local.trim();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(key);
    getReq.onerror = () => reject(getReq.error ?? new Error("Falha ao ler registro offline."));
    getReq.onsuccess = () => {
      const row = getReq.result;
      if (!row || row.owner_scope !== owner.owner_scope) {
        resolve();
        return;
      }
      const delReq = store.delete(key);
      delReq.onerror = () => reject(delReq.error ?? new Error("Falha ao remover registro offline."));
      delReq.onsuccess = () => resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Transação IndexedDB falhou."));
  });
}

/**
 * Remove viagens offline cuja data civil (America/Sao_Paulo) é hoje e o veículo está na lista.
 * @param {number[]} veiculoIds
 * @returns {Promise<number>}
 */
export async function clearLocalViagensForSpTodayMatchingVehicles(veiculoIds) {
  const ids = Array.isArray(veiculoIds)
    ? [...new Set(veiculoIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))]
    : [];
  if (!hasIndexedDB() || ids.length === 0) return 0;
  const owner = resolveApontadorOwner();
  if (!owner) return 0;

  const alvo = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const permitidos = new Set(ids);
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    let removidos = 0;
    req.onerror = () => reject(req.error ?? new Error("Falha ao percorrer viagens offline."));
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(removidos);
        return;
      }
      const row = cursor.value;
      if (row?.owner_scope !== owner.owner_scope) {
        cursor.continue();
        return;
      }
      const vid = Number(row?.veiculo_id);
      if (permitidos.has(vid)) {
        const ymd = new Date(Number(row.timestamp)).toLocaleDateString("sv-SE", {
          timeZone: "America/Sao_Paulo",
        });
        if (ymd === alvo) {
          cursor.delete();
          removidos += 1;
        }
      }
      cursor.continue();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Transação IndexedDB falhou."));
  });
}

/**
 * Remove registros antigos sem owner_scope para evitar reaproveitamento cross-sessão.
 * @returns {Promise<number>}
 */
export async function purgeUnscopedOfflineViagens() {
  if (!hasIndexedDB()) return 0;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    let removidos = 0;
    req.onerror = () => reject(req.error ?? new Error("Falha ao percorrer viagens offline."));
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(removidos);
        return;
      }
      const row = cursor.value;
      if (!row?.owner_scope) {
        cursor.delete();
        removidos += 1;
      }
      cursor.continue();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Transação IndexedDB falhou."));
  });
}

/**
 * Remove toda a store de viagens offline local.
 * Usado no logout para eliminar qualquer dado residual do dispositivo.
 */
export async function clearAllOfflineViagens() {
  if (!hasIndexedDB()) return;
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.clear();
    req.onerror = () => reject(req.error ?? new Error("Falha ao limpar viagens offline."));
    req.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transação IndexedDB falhou."));
  });
}

/** Fila global: evita dois syncs em paralelo (mesmo registo enviado duas vezes). */
let syncTail = Promise.resolve();

async function syncPendentesInternal() {
  let pending;
  try {
    pending = await getPendingViagens();
  } catch {
    return;
  }
  for (const v of pending) {
    try {
      await api.post(
        "/apontador/viagens",
        {
          veiculo_id: v.veiculo_id,
          motorista_id: v.motorista_id,
          tipo: normalizeOfflineTipo(v.tipo) || v.tipo,
          timestamp: v.timestamp,
        },
        { skipGlobalErrorToast: true }
      );
      await markAsSynced(v.id_local);
    } catch {
      /* mantém pendente */
    }
  }
}

/**
 * Envia viagens com status pendente ao servidor, em série.
 * Chamadas simultâneas ficam em fila (sem envio duplicado do mesmo lote em paralelo).
 * @returns {Promise<void>}
 */
export function syncPendentes() {
  syncTail = syncTail.then(() => syncPendentesInternal()).catch(() => {});
  return syncTail;
}
