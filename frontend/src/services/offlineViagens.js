/**
 * Armazenamento local de viagens (IndexedDB) para modo offline.
 * DB: frotacontrol_offline · store: viagens
 */

import api from "./api";

const DB_NAME = "frotacontrol_offline";
const DB_VERSION = 1;
const STORE = "viagens";

/** @type {Promise<IDBDatabase> | null} */
let dbOpenPromise = null;

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
 * @param {"esteril"|"rocha"} viagem.tipo
 * @param {number} viagem.timestamp
 * @returns {Promise<object>}
 */
export async function saveOfflineViagem(viagem) {
  if (!viagem || typeof viagem !== "object") {
    throw new Error("saveOfflineViagem: payload inválido.");
  }
  const veiculo_id = Number(viagem.veiculo_id);
  const motorista_id = Number(viagem.motorista_id);
  const timestamp = Number(viagem.timestamp);
  const tipo = viagem.tipo;

  if (!Number.isFinite(veiculo_id) || veiculo_id <= 0) {
    throw new Error("saveOfflineViagem: veiculo_id inválido.");
  }
  if (!Number.isFinite(motorista_id) || motorista_id <= 0) {
    throw new Error("saveOfflineViagem: motorista_id inválido.");
  }
  if (!Number.isFinite(timestamp)) {
    throw new Error("saveOfflineViagem: timestamp inválido.");
  }
  if (tipo !== "esteril" && tipo !== "rocha") {
    throw new Error("saveOfflineViagem: tipo deve ser 'esteril' ou 'rocha'.");
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

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const index = store.index("status");
    const req = index.getAll("pendente");

    req.onerror = () => reject(req.error ?? new Error("Falha ao ler viagens pendentes."));
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
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

  const db = await openDatabase();
  const key = id_local.trim();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(key);

    getReq.onerror = () => reject(getReq.error ?? new Error("Falha ao ler registo offline."));

    getReq.onsuccess = () => {
      const row = getReq.result;
      if (!row) {
        reject(new Error(`markAsSynced: registo não encontrado (${key}).`));
        return;
      }
      row.status = "sincronizado";
      const putReq = store.put(row);
      putReq.onerror = () => reject(putReq.error ?? new Error("Falha ao atualizar registo offline."));
      putReq.onsuccess = () => resolve();
    };

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
      await api.post("/apontador/viagens", {
        veiculo_id: v.veiculo_id,
        motorista_id: v.motorista_id,
        tipo: v.tipo,
        timestamp: v.timestamp,
      });
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
