/**
 * Política central de sincronização offline (Capacitor / PWA).
 * Ajustes aqui propagam para fila, retry e futura resolução de conflitos.
 */

/** Intervalo mínimo entre tentativas após falha (ms). */
export const SYNC_RETRY_BASE_MS = 2000;
/** Teto do backoff exponencial (ms). */
export const SYNC_RETRY_MAX_MS = 60000;
/** Após N falhas consecutivas, manter o teto para não martelar a API. */
export const SYNC_RETRY_ATTEMPT_CAP = 12;
/** Jitter 0–1 aplicado ao atraso para espalhar picos quando vários dispositivos reconectam. */
export const SYNC_RETRY_JITTER_RATIO = 0.25;

/**
 * Calcula `next_try_at` após `attempts` falhas (1-based após incremento no repositório).
 * @param {number} attempts número de tentativas já registadas (>= 1)
 * @param {number} nowMs timestamp de referência
 */
export const computeNextTryAt = (attempts, nowMs = Date.now()) => {
  const n = Math.max(1, Math.min(SYNC_RETRY_ATTEMPT_CAP, Number(attempts) || 1));
  const exp = Math.min(SYNC_RETRY_MAX_MS, SYNC_RETRY_BASE_MS * 2 ** (n - 1));
  const jitter = exp * SYNC_RETRY_JITTER_RATIO * Math.random();
  return nowMs + Math.round(exp + jitter);
};

/**
 * Classificação leve para evolução (409 duplicado, 422 validação, etc.).
 * @param {string} message mensagem já extraída da API
 */
export const classifySyncFailure = (message = "") => {
  const m = String(message).toLowerCase();
  if (/\b409\b|conflito|duplicate|já existe|ja existe/.test(m)) return "conflict";
  if (/\b422\b|valida|inválido|invalido/.test(m)) return "validation";
  if (/\b401\b|403\b|não autorizado|nao autorizado|token/.test(m)) return "auth";
  if (/\b5\d\d\b|servidor|timeout|network|fetch/i.test(m)) return "transient";
  return "unknown";
};
