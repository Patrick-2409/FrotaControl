const { pool } = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");

/** Bloqueia pedidos com JWT válido mas conta desativada (conta_status = inativo). */
const requireAccountActive = asyncHandler(async (req, res, next) => {
  const id = Number(req.user?.sub);
  if (!id) {
    return res.status(401).json({ success: false, error: "Sessão inválida", message: "Sessão inválida." });
  }
  const { rows } = await pool.query(
    `SELECT COALESCE(conta_status, 'ativo') AS conta_status FROM usuarios WHERE id = $1`,
    [id]
  );
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
