import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { resolveBackendAssetUrl } from "./api";
import { isJwtExpired, sanitizePlainText } from "../utils/security";

const AuthContext = createContext(null);

const MAX_EMAIL_LEN = 254;
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

const buildEmailLoginPayload = (payload = {}) => {
  const email = sanitizePlainText(String(payload.email ?? "").trim().toLowerCase(), MAX_EMAIL_LEN);
  const senha = String(payload.senha ?? payload.password ?? "").slice(0, MAX_PASSWORD_LEN);
  return {
    email,
    senha,
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => normalizeUser(readStoredUser()));
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get("/auth/me");
    const normalized = normalizeUser(data);
    setUser(normalized);
    localStorage.setItem("fc_user", JSON.stringify(normalized));
    return normalized;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("fc_token");
    if (!token) {
      setLoading(false);
      return;
    }
    if (isJwtExpired(token)) {
      localStorage.removeItem("fc_token");
      localStorage.removeItem("fc_user");
      setUser(null);
      setLoading(false);
      return;
    }
    refreshUser()
      .catch((err) => {
        const status = err?.response?.status;
        // Em modo offline, mantemos a sessão local para navegação do app.
        if (status === 401 || status === 403) {
          localStorage.removeItem("fc_token");
          localStorage.removeItem("fc_user");
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    const onAuthExpired = () => {
      localStorage.removeItem("fc_token");
      localStorage.removeItem("fc_user");
      setUser(null);
    };
    window.addEventListener("fc:auth-expired", onAuthExpired);
    return () => window.removeEventListener("fc:auth-expired", onAuthExpired);
  }, []);

  const login = async (payload) => {
    const { data } = await api.post("/auth/motorista-login", buildMotoristaLoginPayload(payload));
    const normalized = normalizeUser(data.user);
    localStorage.setItem("fc_token", data.token);
    localStorage.setItem("fc_user", JSON.stringify(normalized));
    setUser(normalized);
    const fresh = await refreshUser();
    return fresh;
  };

  const adminEmpresaLogin = async (payload) => {
    const { data } = await api.post("/auth/admin-empresa-login", buildEmailLoginPayload(payload));
    const normalized = normalizeUser(data.user);
    localStorage.setItem("fc_token", data.token);
    localStorage.setItem("fc_user", JSON.stringify(normalized));
    setUser(normalized);
    const fresh = await refreshUser();
    return fresh;
  };

  const apontadorLogin = async (payload) => {
    const { data } = await api.post("/auth/apontador-login", buildEmailLoginPayload(payload));
    const normalized = normalizeUser(data.user);
    localStorage.setItem("fc_token", data.token);
    localStorage.setItem("fc_user", JSON.stringify(normalized));
    setUser(normalized);
    const fresh = await refreshUser();
    return fresh;
  };

  const superAdminLogin = async (payload) => {
    const { data } = await api.post("/auth/super-admin-login", buildEmailLoginPayload(payload));
    const normalized = normalizeUser(data.user);
    localStorage.setItem("fc_token", data.token);
    localStorage.setItem("fc_user", JSON.stringify(normalized));
    setUser(normalized);
    const fresh = await refreshUser();
    return fresh;
  };

  const logout = () => {
    localStorage.removeItem("fc_token");
    localStorage.removeItem("fc_user");
    setUser(null);
  };

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
      isAdminEmpresa: user?.role === "ADMIN_EMPRESA",
      isSuperAdmin: user?.role === "SUPER_ADMIN",
      isMotorista: user?.role === "MOTORISTA",
      isMotoristaTransporte: Boolean(user?.is_motorista_transporte),
      isMotoristaApoio: Boolean(user?.is_motorista_apoio),
      isApontador: user?.role === "APONTADOR",
    }),
    [user, loading]
  );

  return createElement(AuthContext.Provider, { value }, children);
};

export const useAuth = () => useContext(AuthContext);
