const { logError } = require("../services/loggerService");

const isProduction = process.env.NODE_ENV === "production";

const errorMiddleware = (err, req, res, next) => {
  if (err?.name === "MulterError" || err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      error: "Ficheiro inválido ou demasiado grande.",
      message: "Ficheiro inválido ou demasiado grande.",
    });
  }

  if (typeof err?.message === "string" && /^upload inválido/i.test(err.message)) {
    return res.status(400).json({
      success: false,
      error: err.message,
      message: err.message,
    });
  }

  if (err?.name === "ZodError") {
    const first = err.issues?.[0];
    const detail = first?.message || "Dados inválidos";
    const issues =
      isProduction && Array.isArray(err.issues)
        ? err.issues.map((i) => ({
            message: i?.message,
            path: Array.isArray(i?.path) ? i.path.slice(0, 6) : i?.path,
          }))
        : err.issues;
    return res.status(400).json({
      success: false,
      error: detail,
      message: detail,
      issues,
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
    userId: req.user?.sub ?? null,
    empresaId: req.user?.empresa_id ?? null,
    role: req.user?.role ?? null,
    ...pgMeta,
  });

  let clientMessage =
    status >= 500
      ? typeof err?.code === "string" && /^[0-9A-Z]{5}$/.test(err.code) && typeof err.message === "string"
        ? err.message
        : "Erro interno no servidor"
      : err.message || "Erro na requisição";

  if (isProduction && status >= 500) {
    clientMessage = "Erro interno no servidor";
  }

  const body = {
    success: false,
    error: clientMessage,
    message: clientMessage,
  };
  if (typeof err?.code === "string" && /^[0-9A-Z]{5}$/.test(err.code)) {
    body.code = err.code;
    if (!isProduction && err.detail) {
      body.detail = String(err.detail);
    }
  }
  return res.status(status).json(body);
};

module.exports = { errorMiddleware };
