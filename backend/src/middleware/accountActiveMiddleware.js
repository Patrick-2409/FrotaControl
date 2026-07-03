const { pool } = require("../db");
const { logWarn } = require("../services/loggerService");
const { asyncHandler } = require("../utils/asyncHandler");

const isMissingSchemaField = (err) => ["42703", "42P01"].includes(String(err?.code || "").trim().toUpperCase());

const loadAccountStatus = async (id) => {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(conta_status, 'ativo') AS conta_status FROM usuarios WHERE id = $1`,
      [id]
    );
    return rows;
  } catch (err) {
    if (!isMissingSchemaField(err)) throw err;
    logWarn("account-active:schema-fallback", {
      message: err?.message,
      code: err?.code,
    });
    const { rows } = await pool.query(
      `SELECT 'ativo'::text AS conta_status FROM usuarios WHERE id = $1`,
      [id]
    );
    return rows;
  }
};

/** Bloqueia pedidos com JWT válido mas conta desativada (conta_status = inativo). */
const requireAccountActive = asyncHandler(async (req, res, next) => {
  const id = Number(req.user?.sub);
  if (!id) {
    return res.status(401).json({ success: false, error: "Sessão inválida", message: "Sessão inválida." });
  }
  const rows = await loadAccountStatus(id);
  if (!rows.length) {
    return res.status(403).json({
      success: false,
      error: "Conta não disponível",
      message: "Conta não disponível.",
    });
  }
  if (rows[0].conta_status === "inativo") {
    return res.status(403).json({
      success: false,
      error: "Conta desativada",
      message: "Esta conta foi desativada. Contacte o administrador da plataforma ou da sua empresa.",
    });
  }
  next();
});

module.exports = { requireAccountActive };
