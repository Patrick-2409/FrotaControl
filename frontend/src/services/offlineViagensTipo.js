export const OFFLINE_TIPOS_VALIDOS = new Set(["esteril", "rocha", "rocha_pulmao", "rocha_armacao"]);

export function normalizeOfflineTipo(tipo) {
  const normalized = String(tipo ?? "").trim().toLowerCase();
  if (normalized === "rocha_amarracao" || normalized === "rocha-amarracao") return "rocha_armacao";
  if (OFFLINE_TIPOS_VALIDOS.has(normalized)) return normalized;
  return null;
}
