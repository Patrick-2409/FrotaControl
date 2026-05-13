import axios from "axios";

const PROD_API_FALLBACK = "https://frotacontrol.onrender.com";

export const getBaseURL = () => {
  const rawEnvUrl = (import.meta.env.VITE_API_URL || "").trim();
  if (rawEnvUrl) {
    return rawEnvUrl.replace(/\/+$/, "").replace(/\/api$/i, "");
  }
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:4000`;
  }
  return PROD_API_FALLBACK;
};

const MAX_API_ERROR_MESSAGE_LEN = 600;

/** Mensagem legível a partir de erro Axios ou genérico (para toast / logs). */
export const extractApiErrorMessage = (err) => {
  if (!err) return "";
  const data = err?.response?.data;
  let out;
  if (typeof data === "string" && data.trim()) {
    out = data.trim();
  } else {
    const fromIssues = Array.isArray(data?.issues) ? data.issues.find((i) => i?.message)?.message : null;
    out =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      (typeof fromIssues === "string" && fromIssues) ||
      (typeof err.message === "string" && err.message) ||
      "";
  }
  if (typeof out !== "string") return "";
  return out.length > MAX_API_ERROR_MESSAGE_LEN ? `${out.slice(0, MAX_API_ERROR_MESSAGE_LEN)}…` : out;
};

/**
 * Resolve URL de ficheiro do backend para uso em <img src> etc.
 * Rejeita esquemas não http(s) e URLs protocol-relative (//host) para reduzir risco de XSS/open redirect em atributos.
 */
export const resolveBackendAssetUrl = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.href;
    } catch {
      return null;
    }
  }
  const normalized = raw.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return null;
  const relative = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${getBaseURL()}${relative}`;
};

const resolvedBaseURL = getBaseURL();
const apiBaseURL = resolvedBaseURL ? `${resolvedBaseURL}/api` : "/api";

if (import.meta.env.DEV) {
  console.info("[FrotaControl] API base:", getBaseURL() || "(relativo /api)");
}

const api = axios.create({
  baseURL: apiBaseURL,
});

const clearCriticalCache = () => {
  localStorage.removeItem("fc_token");
  localStorage.removeItem("fc_user");
  localStorage.removeItem("fc_edit_record");
  sessionStorage.clear();
};

const getStoredToken = () => {
  const token = localStorage.getItem("fc_token");
  if (!token || token === "undefined" || token === "null") {
    return null;
  }
  return token;
};

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (config?.headers?.Authorization) {
    delete config.headers.Authorization;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || "");
    const token = getStoredToken();
    const isAuthLoginEndpoint =
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/motorista-login") ||
      requestUrl.includes("/auth/admin-empresa-login") ||
      requestUrl.includes("/auth/apontador-login") ||
      requestUrl.includes("/auth/super-admin-login");
    const isAuthSessionEndpoint = requestUrl.includes("/auth/me");
    const isExpectedAuth401 = status === 401 && (isAuthLoginEndpoint || isAuthSessionEndpoint);
    if (!isExpectedAuth401 && import.meta.env.DEV) {
      console.error("API error:", error);
    }

    if (status === 401 && token && !isAuthLoginEndpoint) {
      clearCriticalCache();
      window.dispatchEvent(new CustomEvent("fc:auth-expired"));
    }

    if (!isExpectedAuth401) {
      const raw =
        error?.response?.data?.message ||
        (navigator.onLine ? "Servidor indisponível" : "Você está sem internet.");
      const message =
        typeof raw === "string" && raw.length > MAX_API_ERROR_MESSAGE_LEN
          ? `${raw.slice(0, MAX_API_ERROR_MESSAGE_LEN)}…`
          : raw;
      window.dispatchEvent(new CustomEvent("fc:api-error", { detail: message }));
    }
    return Promise.reject(error);
  }
);

export default api;
