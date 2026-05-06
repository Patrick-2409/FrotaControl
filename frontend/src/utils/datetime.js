const toLocalDateTimeString = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
};

export const toIsoWithCurrentTimeIfDateOnly = (rawValue) => {
  const raw = String(rawValue || "").trim();
  if (!raw) return toLocalDateTimeString(new Date());

  // Caso venha apenas a data (YYYY-MM-DD), injeta a hora local atual.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const withTime = `${raw}T${hh}:${mm}:00`;
    const parsed = new Date(withTime);
    return Number.isNaN(parsed.getTime()) ? toLocalDateTimeString(now) : toLocalDateTimeString(parsed);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return toLocalDateTimeString(new Date());
  return toLocalDateTimeString(parsed);
};

export const nowLocalDateTimeString = () => toLocalDateTimeString(new Date());
