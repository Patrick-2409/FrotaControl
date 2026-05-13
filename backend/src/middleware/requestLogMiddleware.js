const { logInfo, logWarn, logError } = require("../services/loggerService");

const SLOW_MS = Math.max(500, Number(process.env.HTTP_SLOW_LOG_MS || 3000));

/**
 * Após a resposta, regista pedido HTTP com duração e contexto de utilizador (se `req.user` existir).
 * Não regista corpo nem cabeçalhos.
 */
function requestLogMiddleware(req, res, next) {
  const started = Date.now();
  const pathOnly = String(req.originalUrl || "").split("?")[0];

  res.on("finish", () => {
    if (pathOnly === "/api/health" || pathOnly === "/" || pathOnly === "/favicon.ico") return;

    const durationMs = Date.now() - started;
    const user = req.user;
    const meta = {
      method: req.method,
      path: pathOnly,
      statusCode: res.statusCode,
      durationMs,
      userId: user?.sub ?? null,
      empresaId: user?.empresa_id ?? null,
      role: user?.role ?? null,
    };

    if (res.statusCode >= 500) {
      logError("http_response_5xx", meta);
      return;
    }
    if (durationMs >= SLOW_MS) {
      logWarn("http_slow_request", meta);
      return;
    }
    logInfo("http_request", meta);
  });

  next();
}

module.exports = { requestLogMiddleware };
