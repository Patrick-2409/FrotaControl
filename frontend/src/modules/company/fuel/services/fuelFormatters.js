import {
  parseOperationalDate,
  toDatePartsInTz,
} from "../../../../utils/managerRecordsOperational";

export const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
export const fmtPct = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
export const fmtBRL = (n) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const fmtLitros = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const OPERATION_TIMEZONE = "America/Sao_Paulo";

const saoPauloTodayYmd = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: OPERATION_TIMEZONE });

const addDaysYmd = (ymd, days) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

/** Parâmetros de `/dashboard/registros` alinhados ao período do painel de combustível. */
export function buildRegistrosParamsFromFuelPeriod(periodo) {
  const today = saoPauloTodayYmd();
  const [y, mo] = today.split("-").map(Number);
  const p = String(periodo || "mes").trim().toLowerCase();
  if (p === "dia") return { data_inicio: today, data_fim: today };
  if (p === "semana") return { data_inicio: addDaysYmd(today, -6), data_fim: today };
  if (p === "mes") return { mes: `${y}-${String(mo).padStart(2, "0")}` };
  if (p === "ano") return { data_inicio: `${y}-01-01`, data_fim: today };
  return { data_inicio: addDaysYmd(today, -29), data_fim: today };
}

/** Instante do abastecimento: recorded_at_client (prioritário) ou data. */
export function getAbastecimentoInstant(row) {
  return parseOperationalDate(row?.recorded_at_client || row?.data);
}

export function formatAbastecimentoDateTime(row) {
  const parsed = getAbastecimentoInstant(row);
  if (!parsed) return "—";
  const datePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
  const timePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
  return `${datePart} — ${timePart}`;
}

export function formatAbastecimentoTime(row) {
  const parsed = getAbastecimentoInstant(row);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export function formatAbastecimentoDayKey(row) {
  return toDatePartsInTz(row?.recorded_at_client || row?.data) || "sem-data";
}

export function formatAbastecimentoDayLabel(dayKey) {
  if (!dayKey || dayKey === "sem-data") return "Data não informada";
  const instant = parseOperationalDate(`${dayKey}T12:00:00`);
  if (!instant) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: OPERATION_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(instant);
}

export function veiculoLabelFromRegistro(row) {
  const nome = String(row?.veiculo ?? "").trim();
  const placa = String(row?.placa ?? "").trim();
  if (nome && placa) return `${nome} — ${placa}`;
  if (nome) return nome;
  if (placa) return placa;
  return "Sem veículo";
}

export function fmtPrecoLitroAbastecimento(row) {
  const stored = row?.preco_por_litro;
  if (stored != null && Number.isFinite(Number(stored))) return fmtBRL(stored);
  const litros = Number(row?.litros);
  const valor = Number(row?.valor_total);
  if (litros > 0 && Number.isFinite(valor)) return fmtBRL(valor / litros);
  return "—";
}

export function groupAbastecimentosByDay(rows) {
  const sorted = [...(rows || [])].sort((a, b) => {
    const ta = getAbastecimentoInstant(a)?.getTime() ?? 0;
    const tb = getAbastecimentoInstant(b)?.getTime() ?? 0;
    return tb - ta;
  });
  const map = new Map();
  for (const row of sorted) {
    const key = formatAbastecimentoDayKey(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].map(([dayKey, items]) => ({
    dayKey,
    dayLabel: formatAbastecimentoDayLabel(dayKey),
    items,
  }));
}

export function veiculoCombustivelLabel(row) {
  const nome = String(row?.veiculo_nome ?? "").trim();
  const placa = String(row?.veiculo_placa ?? "").trim();
  if (nome && placa) return `${nome} — ${placa}`;
  if (nome) return nome;
  if (placa) return placa;
  if (row?.veiculo_id != null) return `Veículo #${row.veiculo_id}`;
  return "Sem veículo";
}
