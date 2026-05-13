const fs = require("fs");
const path = require("path");

const logsDir = path.resolve(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const SENSITIVE_KEY =
  /^(password|senha|token|authorization|refresh_token|secret|apikey|api_key|jwt|cookie)$/i;

function sanitizeMeta(value, depth = 0) {
  if (depth > 8) return "[max-depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeMeta(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const kl = k.toLowerCase();
    if (SENSITIVE_KEY.test(k) || kl.includes("password") || kl.includes("token") || kl.includes("secret")) {
      out[k] = "[REDACTED]";
      continue;
    }
    out[k] = sanitizeMeta(v, depth + 1);
  }
  return out;
}

/**
 * Encaminhamento futuro: Sentry, Datadog Agent, Loki push, Grafana Alloy, etc.
 * Usar MONITORING_DSN ou variáveis específicas do fornecedor quando integrar.
 */
function forwardToMonitoring(entry) {
  if (!process.env.MONITORING_DSN) return;
  try {
    // Ex.: Sentry.init no bootstrap + captureMessage(entry)
    // Ex.: @datadog/datadog-ci / dogstatsd
  } catch {
    /* noop */
  }
}

const writeLog = (level, message, meta = {}) => {
  const safeMeta = sanitizeMeta(meta);
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    meta: safeMeta,
    service: "frotacontrol-api",
  });
  fs.appendFileSync(path.join(logsDir, "app.log"), `${line}\n`);
  forwardToMonitoring({ level, message, meta: safeMeta });
};

const logDebug = (message, meta) => writeLog("debug", message, meta);
const logInfo = (message, meta) => writeLog("info", message, meta);
const logWarn = (message, meta) => writeLog("warn", message, meta);
const logError = (message, meta) => writeLog("error", message, meta);

module.exports = {
  logDebug,
  logInfo,
  logWarn,
  logError,
  sanitizeMeta,
};
