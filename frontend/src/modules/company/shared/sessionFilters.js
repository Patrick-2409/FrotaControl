/** Prefixo único por módulo para evitar colisão no sessionStorage. */
const PREFIX = "fc:opctx:";

export function readSessionJson(key, fallback = null) {
  if (typeof sessionStorage === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeSessionJson(key, value) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  } catch {
    /* quota ou modo privado */
  }
}
