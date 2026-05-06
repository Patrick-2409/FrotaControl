const fs = require("fs");
const path = require("path");

const logsDir = path.resolve(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const writeLog = (level, message, meta = {}) => {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    meta,
  });
  fs.appendFileSync(path.join(logsDir, "app.log"), `${line}\n`);
  if (process.env.MONITORING_DSN) {
    // Hook para integração futura com Sentry/Datadog/NewRelic.
    // Aqui é o ponto único para encaminhar eventos para monitoramento externo.
  }
};

const logError = (message, meta) => writeLog("error", message, meta);
const logInfo = (message, meta) => writeLog("info", message, meta);

module.exports = {
  logError,
  logInfo,
};
