const { logError } = require("../services/loggerService");

const errorMiddleware = (err, req, res, next) => {
  if (err?.name === "ZodError") {
    const first = err.issues?.[0];
    const detail = first?.message || "Dados inválidos";
    return res.status(400).json({
      success: false,
      error: detail,
      message: detail,
      issues: err.issues,
    });
  }

  const status = err.status || err.statusCode || 500;
  const pgMeta =
    err?.code && typeof err.code === "string"
      ? { pgCode: err.code, pgDetail: err.detail, pgConstraint: err.constraint, pgTable: err.table }
      : {};
  logError(err.message || "Erro interno", {
    path: req.originalUrl,
    method: req.method,
    stack: err.stack,
    ...pgMeta,
  });
  const clientMessage =
    status >= 500
      ? typeof err?.code === "string" && /^[0-9A-Z]{5}$/.test(err.code) && typeof err.message === "string"
        ? err.message
        : "Erro interno no servidor"
      : err.message || "Erro na requisição";
  const body = {
    success: false,
    error: clientMessage,
    message: clientMessage,
  };
  if (typeof err?.code === "string" && /^[0-9A-Z]{5}$/.test(err.code)) {
    body.code = err.code;
    if (err.detail) body.detail = String(err.detail);
  }
  return res.status(status).json(body);
};

module.exports = { errorMiddleware };
