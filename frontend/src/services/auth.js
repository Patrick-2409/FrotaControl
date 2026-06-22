import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api, { resolveBackendAssetUrl } from "./api";
import { isJwtExpired, sanitizePlainText } from "../utils/security";
import {
  getEditRecordScopeFromUser,
  getEditRecordStorageKey,
} from "./editRecordStorage";
import {
  clearSensitiveLocalCaches,
  clearTemporarySessionStateCaches,
  clearValidatedSessionRole,
  setValidatedSessionRole,
} from "./sessionSecurity";
import { clearAllOfflineData, purgeUnscopedOfflineData } from "../offline/offlineRepo";
import { clearAllOfflineViagens, purgeUnscopedOfflineViagens } from "./offlineViagens";

const AuthContext = createContext(null);

const MAX_LOGIN_LEN = 254;
const MAX_PASSWORD_LEN = 128;

const readStoredUser = () => {
  const raw = localStorage.getItem("fc_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem("fc_user");
    return null;
  }
};

const normalizeUser = (user) => {
  if (!user) return user;
  const tipoOperacao = String(user.veiculo_tipo_operacao || "").trim().toLowerCase();
  const isTransporte =
    user.role === "MOTORISTA" &&
    Number(user.veiculo_id) > 0 &&
    (tipoOperacao === "transporte" || Boolean(user.veiculo_usa_para_transporte));
  return {
    ...user,
    logo_url: resolveBackendAssetUrl(user.logo_url),
    profile_image_url: resolveBackendAssetUrl(user.profile_image_url),
    motorista_perfil_operacional: isTransporte ? "motorista_transporte" : "motorista_apoio",
    is_motorista_transporte: isTransporte,
    is_motorista_apoio: user.role === "MOTORISTA" && !isTransporte,
  };
};

const buildMotoristaLoginPayload = (payload = {}) => {
  const rawLogin = sanitizePlainText(String(payload.login ?? payload.cpf_id ?? "").trim(), MAX_LOGIN_LEN);
  const senha = String(payload.senha ?? payload.password ?? "").slice(0, MAX_PASSWORD_LEN);
  return {
    login: rawLogin,
    senha,
  };
};

const buildUniversalLoginPayload = (payload = {}) => {
  const rawLogin = String(payload.login ?? payload.email ?? payload.cpf_id ?? "").trim();
  const login = sanitizePlainText(rawLogin, MAX_LOGIN_LEN);
  const senha = String(payload.senha ?? payload.password ?? "").slice(0, MAX_PASSWORD_LEN);
  return {
    login,
    senha,
  };
};

export const AuthProvider = ({ children }) => {
  const [storedUser, setStoredUser] = useState(() => normalizeUser(readStoredUser()));
  const [isSessionValidated, setIsSessionValidated] = useState(false);
  const [loading, setLoading] = useState(true);
  const trustedUserScopeRef = useRef(null);

  const user = isSessionValidated ? storedUser : null;

  const sanitizeOfflineCaches = useCallback(() => {
    Promise.resolve(purgeUnscopedOfflineData()).catch(() => {});
    Promise.resolve(purgeUnscopedOfflineViagens()).catch(() => {});
  }, []);

  const clearOfflineCachesOnLogout = useCallback(() => {
    Promise.resolve(clearAllOfflineData()).catch(() => {});
    Promise.resolve(clearAllOfflineViagens()).catch(() => {});
  }, []);

  const clearSensitiveSessionCache = useCallback(() => {
    clearSensitiveLocalCaches();
    trustedUserScopeRef.current = null;
    clearOfflineCachesOnLogout();
  }, [clearOfflineCachesOnLogout]);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get("/auth/me");
    const normalized = normalizeUser(data);
    setStoredUser(normalized);
    setIsSessionValidated(true);
    localStorage.setItem("fc_user", JSON.stringify(normalized));
    setValidatedSessionRole(normalized?.role);
    sanitizeOfflineCaches();
    return normalized;
  }, [sanitizeOfflineCaches]);

  useEffect(() => {
    sanitizeOfflineCaches();
  }, [sanitizeOfflineCaches]);

  useEffect(() => {
    const token = localStorage.getItem("fc_token");
    if (!token) {
      clearSensitiveSessionCache();
      setStoredUser(null);
      setIsSessionValidated(false);
      setLoading(false);
      return;
    }
    if (isJwtExpired(token)) {
      clearSensitiveSessionCache();
      setStoredUser(null);
      setIsSessionValidated(false);
      setLoading(false);
      return;
    }
    refreshUser()
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          clearSensitiveSessionCache();
          setStoredUser(null);
        }
        clearValidatedSessionRole();
        setIsSessionValidated(false);
      })
      .finally(() => setLoading(false));
  }, [refreshUser, clearSensitiveSessionCache]);

  useEffect(() => {
    const onAuthExpired = () => {
      clearSensitiveSessionCache();
      setStoredUser(null);
      setIsSessionValidated(false);
    };
    window.addEventListener("fc:auth-expired", onAuthExpired);
    return () => window.removeEventListener("fc:auth-expired", onAuthExpired);
  }, [clearSensitiveSessionCache]);

  useEffect(() => {
    const nextScope = getEditRecordStorageKey(getEditRecordScopeFromUser(user));
    const previousScope = trustedUserScopeRef.current;
    if (previousScope && previousScope !== nextScope) {
      clearTemporarySessionStateCaches();
      sanitizeOfflineCaches();
    }
    trustedUserScopeRef.current = nextScope;
  }, [user, sanitizeOfflineCaches]);

  const login = useCallback(async (payload) => {
    const { data } = await api.post("/auth/motorista-login", buildMotoristaLoginPayload(payload));
    const normalized = normalizeUser(data.user);
    localStorage.setItem("fc_token", data.token);
    localStorage.setItem("fc_user", JSON.stringify(normalized));
    setStoredUser(normalized);
    setIsSessionValidated(false);
    clearValidatedSessionRole();
    const fresh = await refreshUser();
    return fresh;
  }, [refreshUser]);

  const adminEmpresaLogin = useCallback(async (payload) => {
    const { data } = await api.post("/auth/admin-empresa-login", buildUniversalLoginPayload(payload));
    const normalized = normalizeUser(data.user);
    localStorage.setItem("fc_token", data.token);
    localStorage.setItem("fc_user", JSON.stringify(normalized));
    setStoredUser(normalized);
    setIsSessionValidated(false);
    clearValidatedSessionRole();
    const fresh = await refreshUser();
    return fresh;
  }, [refreshUser]);

  const apontadorLogin = useCallback(async (payload) => {
    const { data } = await api.post("/auth/apontador-login", buildUniversalLoginPayload(payload));
    const normalized = normalizeUser(data.user);
    localStorage.setItem("fc_token", data.token);
    localStorage.setItem("fc_user", JSON.stringify(normalized));
    setStoredUser(normalized);
    setIsSessionValidated(false);
    clearValidatedSessionRole();
    const fresh = await refreshUser();
    return fresh;
  }, [refreshUser]);

  const superAdminLogin = useCallback(async (payload) => {
    const { data } = await api.post("/auth/super-admin-login", buildUniversalLoginPayload(payload));
    const normalized = normalizeUser(data.user);
    localStorage.setItem("fc_token", data.token);
    localStorage.setItem("fc_user", JSON.stringify(normalized));
    setStoredUser(normalized);
    setIsSessionValidated(false);
    clearValidatedSessionRole();
    const fresh = await refreshUser();
    return fresh;
  }, [refreshUser]);

  const logout = useCallback(() => {
    clearSensitiveSessionCache();
    setStoredUser(null);
    setIsSessionValidated(false);
  }, [clearSensitiveSessionCache]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      adminEmpresaLogin,
      apontadorLogin,
      superAdminLogin,
      logout,
      refreshUser,
      isAuthenticated: Boolean(user),
      isAdminEmpresa: user?.role === "ADMIN_EMPRESA",
      isSuperAdmin: user?.role === "SUPER_ADMIN",
      isMotorista: user?.role === "MOTORISTA",
      isMotoristaTransporte: Boolean(user?.is_motorista_transporte),
      isMotoristaApoio: Boolean(user?.is_motorista_apoio),
      isApontador: user?.role === "APONTADOR",
    }),
    [user, loading, login, adminEmpresaLogin, apontadorLogin, superAdminLogin, logout, refreshUser]
  );

  // eslint-disable-next-line react-hooks/refs
  return createElement(AuthContext.Provider, { value }, children);
};

export const useAuth = () => useContext(AuthContext);
