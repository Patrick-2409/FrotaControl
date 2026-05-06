import { openDB } from "idb";

export const dbPromise = openDB("frotacontrol_db", 3, {
  upgrade(db) {
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
  },
});
