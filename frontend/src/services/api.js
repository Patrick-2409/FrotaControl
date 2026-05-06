import axios from "axios";

export const getBaseURL = () => {
  const rawEnvUrl = (import.meta.env.VITE_API_URL || "").trim();
  if (rawEnvUrl) {
    return rawEnvUrl.replace(/\/+$/, "").replace(/\/api$/i, "");
  }
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:4000`;
  }
  return "";
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
      const message =
        error?.response?.data?.message ||
        (navigator.onLine ? "Servidor indisponível" : "Você está sem internet.");
      window.dispatchEvent(new CustomEvent("fc:api-error", { detail: message }));
    }
    return Promise.reject(error);
  }
);

export default api;
