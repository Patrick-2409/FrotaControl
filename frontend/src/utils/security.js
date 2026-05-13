/**
 * Sanitização defensiva de texto livre (formulários, notas).
 * Não substitui validação no servidor. Reduz risco de XSS se valor for re-injetado em HTML no futuro.
 */
export function sanitizePlainText(value, maxLen = 8000) {
  if (value == null) return "";
  let s = String(value);
  s = s.split("\0").join("");
  s = s.replace(/<\/(?:script|iframe|object|embed)\b/gi, "</disabled-");
  s = s.replace(/<(?:script|iframe|object|embed)\b/gi, "<disabled-");
  s = s.trim();
  if (s.length > maxLen) return s.slice(0, maxLen);
  return s;
}

/**
 * Decodifica payload JWT (Base64URL) sem verificar assinatura — apenas para UX (ex.: exp).
 * Nunca usar para autorização; o servidor continua a fonte de verdade.
 */
export function decodeJwtPayloadUnsafe(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isJwtExpired(token, skewSeconds = 30) {
  const p = decodeJwtPayloadUnsafe(token);
  if (!p || typeof p.exp !== "number") return false;
  return p.exp * 1000 < Date.now() + skewSeconds * 1000;
}
