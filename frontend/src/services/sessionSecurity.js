const SENSITIVE_LOCAL_KEYS = ["fc_token", "fc_user", "fc_edit_record"];
const SENSITIVE_LOCAL_PREFIXES = ["fc_edit_record:", "fc_draft_parte_", "fc_apontador_veiculo_id:"];
export const SESSION_VALIDATED_ROLE_KEY = "fc_session_validated_role";

const getBrowserStorage = (candidate, globalName) => {
  if (candidate) return candidate;
  if (typeof globalThis === "undefined") return null;
  const storage = globalThis[globalName];
  return storage && typeof storage.getItem === "function" ? storage : null;
};

const removeByPrefixes = (storage, prefixes) => {
  if (!storage || typeof storage.length !== "number") return;
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    storage.removeItem(key);
  }
};

const normalizeRole = (value) => String(value || "").trim().toUpperCase();

export const clearTemporarySessionStateCaches = ({ localStorageRef } = {}) => {
  const local = getBrowserStorage(localStorageRef, "localStorage");
  if (!local) return;

  local.removeItem("fc_edit_record");
  removeByPrefixes(local, SENSITIVE_LOCAL_PREFIXES);
};

export const clearSensitiveLocalCaches = ({ localStorageRef, sessionStorageRef } = {}) => {
  const local = getBrowserStorage(localStorageRef, "localStorage");
  if (local) {
    for (const key of SENSITIVE_LOCAL_KEYS) {
      local.removeItem(key);
    }
    removeByPrefixes(local, SENSITIVE_LOCAL_PREFIXES);
  }

  const session = getBrowserStorage(sessionStorageRef, "sessionStorage");
  if (!session) return;
  try {
    session.removeItem(SESSION_VALIDATED_ROLE_KEY);
    session.clear();
  } catch {
    /* noop */
  }
};

export const setValidatedSessionRole = (role, sessionStorageRef) => {
  const session = getBrowserStorage(sessionStorageRef, "sessionStorage");
  if (!session) return;
  const normalized = normalizeRole(role);
  if (!normalized) {
    session.removeItem(SESSION_VALIDATED_ROLE_KEY);
    return;
  }
  session.setItem(SESSION_VALIDATED_ROLE_KEY, normalized);
};

export const clearValidatedSessionRole = (sessionStorageRef) => {
  const session = getBrowserStorage(sessionStorageRef, "sessionStorage");
  if (!session) return;
  session.removeItem(SESSION_VALIDATED_ROLE_KEY);
};

export const readValidatedSessionRole = (sessionStorageRef) => {
  const session = getBrowserStorage(sessionStorageRef, "sessionStorage");
  if (!session) return "";
  return normalizeRole(session.getItem(SESSION_VALIDATED_ROLE_KEY));
};

export const isValidatedSessionRole = (role, sessionStorageRef) =>
  readValidatedSessionRole(sessionStorageRef) === normalizeRole(role);

