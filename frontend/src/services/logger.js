/**
 * Logger central do FrotaMax (browser).
 * Níveis: debug < info < warn < error.
 * Metadados são sanitizados (nunca tokens/senhas em texto claro).
 *
 * Integração futura: definir `window.__FC_FORWARD_LOG__ = (entry) => { ... }` ou
 * `VITE_SENTRY_DSN` + SDK Sentry; `forwardToMonitoring` é o único gancho de saída extra.
 */

const LEVEL_NUM = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (import.meta.env?.VITE_LOG_LEVEL || "").toLowerCase();
const defaultMin =
  import.meta.env.DEV && !envLevel ? "debug" : envLevel === "debug" ? "debug" : envLevel === "warn" ? "warn" : envLevel === "error" ? "error" : "info";

const minLevelNum = LEVEL_NUM[defaultMin] ?? LEVEL_NUM.info;

const SENSITIVE_KEY = /^(password|senha|token|authorization|refresh_token|secret|apikey|api_key)$/i;

function sanitizeMeta(value, depth = 0) {
  if (depth > 6) return "[max-depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeMeta(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(k) || k.toLowerCase().includes("password") || k.toLowerCase().includes("token")) {
      out[k] = "[REDACTED]";
      continue;
    }
    out[k] = sanitizeMeta(v, depth + 1);
  }
  return out;
}

function forwardToMonitoring(entry) {
  try {
    if (typeof window !== "undefined" && typeof window.__FC_FORWARD_LOG__ === "function") {
      window.__FC_FORWARD_LOG__(entry);
    }
  } catch {
    /* noop */
  }
  const dsn = import.meta.env?.VITE_SENTRY_DSN;
  if (dsn && import.meta.env.PROD) {
    // Ponto único para Sentry.captureException / captureMessage quando o SDK for adicionado.
  }
}

function emit(level, namespace, message, meta) {
  if ((LEVEL_NUM[level] ?? 99) < minLevelNum) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    namespace,
    message,
    meta: meta && typeof meta === "object" ? sanitizeMeta(meta) : meta,
    source: "frotamax-web",
  };
  forwardToMonitoring(entry);
  const line = `[FrotaMax][${namespace}][${level.toUpperCase()}] ${message}`;
  const payload = entry.meta !== undefined && entry.meta !== null ? entry.meta : "";
  if (level === "error") {
    console.error(line, payload);
  } else if (level === "warn") {
    console.warn(line, payload);
  } else if (level === "info") {
    console.info(line, payload);
  } else {
    console.debug(line, payload);
  }
}

export function createLogger(namespace = "app") {
  return {
    debug: (message, meta) => emit("debug", namespace, message, meta),
    info: (message, meta) => emit("info", namespace, message, meta),
    warn: (message, meta) => emit("warn", namespace, message, meta),
    error: (message, meta) => emit("error", namespace, message, meta),
  };
}

export const fcLogger = createLogger("app");
