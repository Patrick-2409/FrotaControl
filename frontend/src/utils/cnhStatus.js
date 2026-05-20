export const CNH_CATEGORIAS = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"];

const parseYmd = (validade) => {
  if (!validade) return null;
  if (typeof validade === "string") {
    const ymd = validade.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
    return new Date(`${ymd}T12:00:00`);
  }
  try {
    const d = new Date(validade);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

/** @returns {'vencida'|'vencendo'|'valida'|null} */
export function getCnhStatus(validade) {
  const exp = parseYmd(validade);
  if (!exp) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diffDays = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "vencida";
  if (diffDays <= 60) return "vencendo";
  return "valida";
}

export function cnhBadgeClass(status) {
  if (status === "vencida") return "bg-rose-500/15 text-rose-100 ring-1 ring-rose-500/35";
  if (status === "vencendo") return "bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/35";
  if (status === "valida") return "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/35";
  return "bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-600/40";
}

export function cnhStatusLabel(status) {
  if (status === "vencida") return "CNH vencida";
  if (status === "vencendo") return "CNH vencendo";
  if (status === "valida") return "CNH válida";
  return "CNH não informada";
}
