const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { logError, logWarn } = require("../services/loggerService");

const TRANSIENT_DB_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "53300",
  "57P01",
  "57P02",
  "57P03",
]);

const isTransientDbError = (err) => {
  const code = String(err?.code || "").trim().toUpperCase();
  return code ? TRANSIENT_DB_ERROR_CODES.has(code) : false;
};

const isMissingSchemaField = (err) => ["42703", "42P01"].includes(String(err?.code || "").trim().toUpperCase());

const loadSessionUser = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, empresa_id, role, nome, COALESCE(conta_status, 'ativo') AS conta_status
       FROM usuarios
       WHERE id = $1`,
      [userId]
    );
    return rows;
  } catch (err) {
    if (!isMissingSchemaField(err)) throw err;
    logWarn("auth:session-validation-schema-fallback", {
      message: err?.message,
      code: err?.code,
    });
    const { rows } = await pool.query(
      `SELECT id, empresa_id, role, nome, 'ativo'::text AS conta_status
       FROM usuarios
       WHERE id = $1`,
      [userId]
    );
    return rows;
  }
};

const isAuthMeRequest = (req) => {
  const path = String(req.originalUrl || req.url || "");
  return req.method === "GET" && /\/api\/auth\/me(?:\?|$)/.test(path);
};

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    return res.status(401).json({ success: false, error: "Token ausente", message: "Token ausente" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, error: "Token inválido", message: "Token inválido" });
  }

  const userId = Number(payload?.sub);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(401).json({
      success: false,
      error: "Token inválido",
      message: "Token inválido",
    });
  }

  try {
    const rows = await loadSessionUser(userId);

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        error: "Sessão inválida",
        message: "Sessão inválida",
      });
    }

    const dbUser = rows[0];
    if (dbUser.conta_status === "inativo") {
      return res.status(403).json({
        success: false,
        error: "Conta desativada",
        message: "Esta conta foi desativada.",
      });
    }

    req.user = {
      ...payload,
      sub: dbUser.id,
      id: dbUser.id,
      empresa_id: dbUser.empresa_id,
      role: dbUser.role,
      nome: dbUser.nome,
      conta_status: dbUser.conta_status,
    };
    return next();
  } catch (err) {
    logError("auth:session-validation-failed", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
    });
    if (isTransientDbError(err)) {
      return res.status(503).json({
        success: false,
        error: "Serviço de autenticação temporariamente indisponível",
        message: "Serviço de autenticação temporariamente indisponível",
      });
    }
    if (isAuthMeRequest(req)) {
      logWarn("auth:session-validation-token-fallback", {
        message: err?.message,
        code: err?.code,
      });
      req.user = {
        ...payload,
        sub: userId,
        id: userId,
        empresa_id: payload.empresa_id,
        role: payload.role,
        nome: payload.nome,
        conta_status: payload.conta_status || "ativo",
      };
      return next();
    }
    return res.status(500).json({
      success: false,
      error: "Falha ao validar sessão",
      message: "Falha ao validar sessão",
    });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: "Acesso negado", message: "Acesso negado" });
  }
  return next();
};

module.exports = {
  authMiddleware,
  requireRole,
};
