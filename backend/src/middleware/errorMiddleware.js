const { logError } = require("../services/loggerService");

const errorMiddleware = (err, req, res, next) => {
  if (err?.name === "ZodError") {
    return res.status(400).json({
      success: false,
      error: "Dados inválidos",
      message: "Dados inválidos",
      issues: err.issues,
    });
  }

  const status = err.status || err.statusCode || 500;
  logError(err.message || "Erro interno", {
    path: req.originalUrl,
    method: req.method,
    stack: err.stack,
  });
  const clientMessage = status >= 500 ? "Erro interno no servidor" : err.message || "Erro na requisição";
  return res.status(status).json({
    success: false,
    error: clientMessage,
    message: clientMessage,
  });
};

module.exports = { errorMiddleware };
