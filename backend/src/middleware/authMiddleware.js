const jwt = require("jsonwebtoken");
const { pool } = require("../db");

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
    const { rows } = await pool.query(
      `SELECT id, empresa_id, role, nome, COALESCE(conta_status, 'ativo') AS conta_status
       FROM usuarios
       WHERE id = $1`,
      [userId]
    );

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
