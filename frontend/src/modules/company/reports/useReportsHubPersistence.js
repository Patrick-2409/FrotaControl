import { useCallback, useEffect, useState } from "react";

const LS_FAV = "fc_empresa_reports_favorites_v1";
const LS_RECENT = "fc_empresa_reports_recent_v1";
const LS_EXPORTS = "fc_empresa_reports_export_history_v1";

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / privado */
  }
};

const dedupeById = (arr, idKey = "id") => {
  const seen = new Set();
  return (arr || []).filter((item) => {
    const id = item?.[idKey];
    if (id == null || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

/**
 * Favoritos, relatórios recentes e histórico de exportações (localStorage, por browser).
 */
export function useReportsHubPersistence() {
  const [favorites, setFavorites] = useState(() => readJson(LS_FAV, []));
  const [recent, setRecent] = useState(() => readJson(LS_RECENT, []));
  const [exportHistory, setExportHistory] = useState(() => readJson(LS_EXPORTS, []));

  useEffect(() => writeJson(LS_FAV, favorites), [favorites]);
  useEffect(() => writeJson(LS_RECENT, recent), [recent]);
  useEffect(() => writeJson(LS_EXPORTS, exportHistory), [exportHistory]);

  const pushRecent = useCallback((entry) => {
    setRecent((prev) => dedupeById([{ ...entry, at: new Date().toISOString() }, ...prev], "id").slice(0, 12));
  }, []);

  const toggleFavorite = useCallback((entry) => {
    setFavorites((prev) => {
      const exists = prev.some((x) => x.id === entry.id);
      if (exists) return prev.filter((x) => x.id !== entry.id);
      return dedupeById([{ ...entry, at: new Date().toISOString() }, ...prev], "id").slice(0, 24);
    });
  }, []);

  const logExport = useCallback((line) => {
    setExportHistory((prev) =>
      [{ at: new Date().toISOString(), line: String(line || "").slice(0, 200) }, ...prev].slice(0, 30)
    );
  }, []);

  return {
    favorites,
    recent,
    exportHistory,
    pushRecent,
    toggleFavorite,
    logExport,
  };
}
