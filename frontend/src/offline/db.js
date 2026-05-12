import { openDB } from "idb";

/** Versão do schema IndexedDB. Nunca diminuir: o browser recusa open com versão < à já existente ("requested version…"). */
export const DB_VERSION = 10;

export const dbPromise = openDB("frotacontrol_db", DB_VERSION, {
  upgrade(db, _oldVersion, _newVersion, transaction) {
    if (!db.objectStoreNames.contains("pending")) {
      db.createObjectStore("pending", { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains("history")) {
      db.createObjectStore("history", { keyPath: "source_id" });
    }
    if (!db.objectStoreNames.contains("error_logs")) {
      db.createObjectStore("error_logs", { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains("sync_metrics")) {
      db.createObjectStore("sync_metrics", { keyPath: "id", autoIncrement: true });
    }

    if (db.objectStoreNames.contains("pending")) {
      const store = transaction.objectStore("pending");
      if (!store.indexNames.contains("by_owner_scope")) {
        store.createIndex("by_owner_scope", "owner_scope", { unique: false });
      }
    }
    if (db.objectStoreNames.contains("history")) {
      const store = transaction.objectStore("history");
      if (!store.indexNames.contains("by_owner_scope")) {
        store.createIndex("by_owner_scope", "owner_scope", { unique: false });
      }
    }
    if (db.objectStoreNames.contains("error_logs")) {
      const store = transaction.objectStore("error_logs");
      if (!store.indexNames.contains("by_owner_scope")) {
        store.createIndex("by_owner_scope", "owner_scope", { unique: false });
      }
    }
    if (db.objectStoreNames.contains("sync_metrics")) {
      const store = transaction.objectStore("sync_metrics");
      if (!store.indexNames.contains("by_owner_scope")) {
        store.createIndex("by_owner_scope", "owner_scope", { unique: false });
      }
    }
  },
});
