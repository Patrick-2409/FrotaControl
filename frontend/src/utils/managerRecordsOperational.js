/** Utilitários de datas e exportação da página de relatórios (registros). Timezone operacional fixo. */

export const todayAsInput = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

/** Indica se o utilizador preencheu algum critério de data no UI (dia, mês ou datas de intervalo). Se falso, a exportação no servidor aplica os últimos 7 dias. */
export const temPeriodoExplicitoNoFiltro = (filtro) => {
  if (!filtro) return false;
  if (filtro.periodo === "dia") return Boolean(String(filtro.data || "").trim());
  if (filtro.periodo === "mes") return Boolean(String(filtro.mes || "").trim());
  if (filtro.periodo === "intervalo") {
    return Boolean(String(filtro.data_inicio || "").trim() || String(filtro.data_fim || "").trim());
  }
  return false;
};

/** AAAA-MM-DD → DD/MM/AAAA (rótulos de exportação). */
export const formatIsoDateToBr = (iso) => {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

/** Uma linha legível do período que será enviado ao exportar (alinhado ao backend quando não há datas). */
export const formatExportPeriodoLinha = (filtro) => {
  if (!filtro) return "Últimos 7 dias (automático)";
  if (!temPeriodoExplicitoNoFiltro(filtro)) return "Últimos 7 dias (automático)";
  if (filtro.periodo === "dia" && filtro.data?.trim()) return formatIsoDateToBr(filtro.data);
  if (filtro.periodo === "mes" && filtro.mes?.trim()) {
    const parts = filtro.mes.trim().split("-");
    if (parts.length === 2) return `${parts[1]}/${parts[0]} (mês completo)`;
    return filtro.mes;
  }
  if (filtro.periodo === "intervalo") {
    const di = filtro.data_inicio?.trim();
    const df = filtro.data_fim?.trim();
    if (di && df) return `${formatIsoDateToBr(di)} a ${formatIsoDateToBr(df)}`;
    if (di) return `A partir de ${formatIsoDateToBr(di)}`;
    if (df) return `Até ${formatIsoDateToBr(df)}`;
  }
  return "Últimos 7 dias (automático)";
};

export const formatMonthLabel = (yearMonthKey) => {
  const [year, month] = String(yearMonthKey || "").split("-");
  if (!year || !month) return "Mês não informado";
  const parsed = new Date(`${year}-${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Mês não informado";
  return parsed.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export const typeLabelMap = {
  "": "Todas as atividades",
  romaneio: "Romaneio",
  combustivel: "Combustível",
  parte_diaria: "Parte diária",
};

const OPERATION_TIMEZONE = "America/Sao_Paulo";

export const parseOperationalDate = (rawValue) => {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}-03:00`;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toDatePartsInTz = (value) => {
  const parsed = parseOperationalDate(value);
  if (!parsed) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) return null;
  return `${y}-${m}-${d}`;
};

export const formatDayLabel = (dayKey) => {
  if (!dayKey || dayKey === "sem-data") return "Data não informada";
  const instant = parseOperationalDate(`${dayKey}T12:00:00`);
  if (!instant) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(instant);
};

/** Instantâneo do informativo (geração no app ou última alteração no servidor), para pastas / downloads — não confundir com `data` operacional do lançamento. */
export const getFolderAnchorRaw = (row) => row?.recorded_at_client || row?.updated_at || row?.data;

export const formatDateForFilename = (isoDate) => {
  const raw = String(isoDate || "").trim();
  if (!raw) return "sem-data";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split("-");
    return `${dd}-${mm}-${yyyy}`;
  }
  return raw.replace(/[/:]/g, "-");
};

export const normalizeTypeTag = (value) => String(value || "atividade").replaceAll("_", "-");

export const normalizeSearchText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const formatOperationalData = (row) => {
  const raw = row?.data;
  if (!raw) return "-";
  const parsed = parseOperationalDate(raw);
  if (!parsed) return "-";
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

export const formatRecordedAt = (row) => {
  const raw = row?.recorded_at_client || row?.updated_at;
  if (!raw) return "-";
  const parsed = parseOperationalDate(raw);
  if (!parsed) return "-";
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

export const RELATORIOS_PORTO = [
  { id: "romaneio", title: "Romaneio", subtitle: "Transporte — ficha Porto" },
  { id: "producao", title: "Produção", subtitle: "Parte diária — ficha Porto" },
  { id: "combustivel", title: "Combustível", subtitle: "Abastecimento — ficha Porto" },
  { id: "completo", title: "Completo", subtitle: "Romaneio, combustível e parte diária" },
];
