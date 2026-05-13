export const OPERATION_TIMEZONE = "America/Sao_Paulo";

export const parseOperationalDate = (rawValue) => {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}-03:00`;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatOperationalDateTime = (raw) => {
  const parsed = parseOperationalDate(raw);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
};

export const fmtHoras = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export const fmtHorimetroPair = (ini, fim) => {
  const a = ini != null && ini !== "" ? Number(ini) : null;
  const b = fim != null && fim !== "" ? Number(fim) : null;
  const left = a != null && Number.isFinite(a) ? fmtHoras(a) : "—";
  const right = b != null && Number.isFinite(b) ? fmtHoras(b) : "—";
  return `${left} → ${right}`;
};

export const safeChecklistObject = (raw) => {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed != null && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

export const countChecklistPendencias = (raw) => {
  const obj = safeChecklistObject(raw);
  const entries = Object.entries(obj);
  if (!entries.length) return { itens: 0, pendencias: 0, semItens: true };
  const pendencias = entries.filter(([, v]) => String(v || "").trim() !== "ok").length;
  return { itens: entries.length, pendencias, semItens: false };
};
