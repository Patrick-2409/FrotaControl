const EDIT_RECORD_LEGACY_KEY = "fc_edit_record";
const EDIT_RECORD_SCOPED_PREFIX = "fc_edit_record:";

const hasStorage = () => typeof localStorage !== "undefined" && localStorage != null;

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

export const getEditRecordScopeFromUser = (user) => {
  const userId = toPositiveInt(user?.id);
  const empresaId = toPositiveInt(user?.empresa_id);
  if (!userId || !empresaId) return null;
  return { userId, empresaId };
};

export const getEditRecordStorageKey = (scope) => {
  const userId = toPositiveInt(scope?.userId);
  const empresaId = toPositiveInt(scope?.empresaId);
  if (!userId || !empresaId) return null;
  return `${EDIT_RECORD_SCOPED_PREFIX}${empresaId}:${userId}`;
};

const safeParseJson = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readRaw = (key) => {
  if (!hasStorage() || !key) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = safeParseJson(raw);
  if (parsed == null) {
    localStorage.removeItem(key);
    return null;
  }
  return parsed;
};

export const readScopedEditRecord = (scope) => {
  if (!hasStorage()) return null;
  const key = getEditRecordStorageKey(scope);
  if (key) {
    const scoped = readRaw(key);
    if (scoped) return scoped;
  }
  const legacy = readRaw(EDIT_RECORD_LEGACY_KEY);
  if (!legacy) return null;
  if (key) {
    localStorage.setItem(key, JSON.stringify(legacy));
  }
  localStorage.removeItem(EDIT_RECORD_LEGACY_KEY);
  return legacy;
};

export const writeScopedEditRecord = (scope, record) => {
  if (!hasStorage()) return;
  const key = getEditRecordStorageKey(scope);
  if (!key || !record || typeof record !== "object") return;
  localStorage.setItem(key, JSON.stringify(record));
  localStorage.removeItem(EDIT_RECORD_LEGACY_KEY);
};

export const clearScopedEditRecord = (scope) => {
  if (!hasStorage()) return;
  const key = getEditRecordStorageKey(scope);
  if (key) localStorage.removeItem(key);
  localStorage.removeItem(EDIT_RECORD_LEGACY_KEY);
};

export const clearAllEditRecordCache = () => {
  if (!hasStorage()) return;
  localStorage.removeItem(EDIT_RECORD_LEGACY_KEY);
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(EDIT_RECORD_SCOPED_PREFIX)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    localStorage.removeItem(key);
  }
};

