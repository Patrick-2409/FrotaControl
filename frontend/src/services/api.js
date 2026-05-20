import axios from "axios";
import { createLogger } from "./logger";

const PROD_API_FALLBACK = "https://frotacontrol.onrender.com";
const httpLogger = createLogger("http");

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
 * Mensagem para o utilizador (toast / UI), sem detalhes técnicos agressivos.
 */
export const getFriendlyApiErrorMessage = (error) => {
  if (!error) return "Ocorreu um erro inesperado.";
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "Sem ligação à internet. Verifique a rede e tente novamente.";
  }
  if (error.code === "ECONNABORTED" || error.response?.status === 503) {
    return error.response?.data?.message || "O pedido excedeu o tempo limite. Tente novamente.";
  }
  if (String(error.message || "").toLowerCase().includes("timeout")) {
    return "O pedido excedeu o tempo limite. Tente novamente.";
  }
  if (error.code === "ERR_NETWORK" || !error.response) {
    return "Não foi possível contactar o servidor. Verifique a ligação ou tente mais tarde.";
  }
  const status = error.response?.status;
  const fromServer = extractApiErrorMessage(error);
  if (status === 401) return "Sessão expirada ou inválida. Faça login novamente.";
  if (status === 403) return fromServer || "Não tem permissão para esta operação.";
  if (status === 404) return fromServer || "O recurso pedido não foi encontrado.";
  if (status === 408 || status === 504) return "Tempo de espera esgotado. Tente novamente.";
  if (status !== undefined && status >= 500) {
    return "O servidor está temporariamente indisponível. Tente dentro de instantes.";
  }
  if (fromServer) return fromServer;
  return "Não foi possível concluir o pedido.";
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

const apiTimeoutMs = Math.min(120000, Math.max(5000, Number(import.meta.env.VITE_API_TIMEOUT_MS || 45000)));

if (import.meta.env.DEV) {
  httpLogger.info("api_client_init", { baseURL: getBaseURL() || "(relativo /api)", timeoutMs: apiTimeoutMs });
}

const api = axios.create({
  baseURL: apiBaseURL,
  timeout: apiTimeoutMs,
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
  if (typeof performance !== "undefined") {
    config.metadata = { startedAt: performance.now() };
  } else {
    config.metadata = { startedAt: Date.now() };
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const cfg = response.config;
    const start = cfg?.metadata?.startedAt;
    if (start != null && typeof performance !== "undefined") {
      const durationMs = Math.round(performance.now() - start);
      const slowMs = Math.max(2000, Number(import.meta.env.VITE_API_SLOW_MS || 4000));
      if (durationMs >= slowMs) {
        httpLogger.warn("api_slow_response", {
          url: cfg?.url,
          method: cfg?.method,
          status: response.status,
          durationMs,
        });
      }
    }
    return response;
  },
  (error) => {
    const status = error?.response?.status;
    const cfg = error?.config || {};
    const requestUrl = String(cfg?.url || "");
    const token = getStoredToken();
    const isAuthLoginEndpoint =
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/motorista-login") ||
      requestUrl.includes("/auth/admin-empresa-login") ||
      requestUrl.includes("/auth/apontador-login") ||
      requestUrl.includes("/auth/super-admin-login");
    const isAuthSessionEndpoint = requestUrl.includes("/auth/me");
    const isExpectedAuth401 = status === 401 && (isAuthLoginEndpoint || isAuthSessionEndpoint);

    const start = cfg?.metadata?.startedAt;
    const durationMs =
      start != null && typeof performance !== "undefined" ? Math.round(performance.now() - start) : null;

    if (!isExpectedAuth401) {
      httpLogger.error("api_request_failed", {
        url: requestUrl,
        method: cfg?.method,
        status: status ?? null,
        code: error?.code ?? null,
        durationMs,
        detail: extractApiErrorMessage(error).slice(0, 240),
      });
    } else {
      httpLogger.debug("api_expected_401", { url: requestUrl });
    }

    if (status === 401 && token && !isAuthLoginEndpoint) {
      clearCriticalCache();
      httpLogger.warn("auth_session_expired", { url: requestUrl });
      window.dispatchEvent(new CustomEvent("fc:auth-expired"));
    }

    if (!isExpectedAuth401 && !cfg.skipGlobalErrorToast) {
      const friendly = getFriendlyApiErrorMessage(error);
      const forToast =
        typeof friendly === "string" && friendly.length > MAX_API_ERROR_MESSAGE_LEN
          ? `${friendly.slice(0, MAX_API_ERROR_MESSAGE_LEN)}…`
          : friendly;
      window.dispatchEvent(new CustomEvent("fc:api-error", { detail: forToast }));
    }
    return Promise.reject(error);
  }
);

export default api;
