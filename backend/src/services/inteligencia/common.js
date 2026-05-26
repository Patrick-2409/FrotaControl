const PERIODOS = new Set(["dia", "semana", "mes", "ano"]);
const TIPOS_ANALISE = new Set(["geral", "combustivel", "transporte", "frota"]);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeDivide = (numerator, denominator) => {
  const d = Number(denominator);
  if (!Number.isFinite(d) || d === 0) return 0;
  const n = Number(numerator);
  return Number.isFinite(n) ? n / d : 0;
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const safeIsoFromDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const startOfDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
const endExclusiveOfDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0));
const startOfMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
const endExclusiveOfMonth = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
const startOfYear = (date) => new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
const endExclusiveOfYear = (date) => new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0));
const startOfWeek = (date) => {
  const start = startOfDay(date);
  const dow = start.getUTCDay();
  const offsetToMonday = (dow + 6) % 7;
  start.setUTCDate(start.getUTCDate() - offsetToMonday);
  return start;
};
const endExclusiveOfWeek = (date) => {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
};

function getRange(periodo) {
  const now = new Date();
  const p = PERIODOS.has(periodo) ? periodo : "mes";
  if (p === "dia") return [startOfDay(now), endExclusiveOfDay(now)];
  if (p === "semana") return [startOfWeek(now), endExclusiveOfWeek(now)];
  if (p === "ano") return [startOfYear(now), endExclusiveOfYear(now)];
  return [startOfMonth(now), endExclusiveOfMonth(now)];
}

const rangeFromPeriodo = (periodo) => {
  const [start, end] = getRange(periodo);
  const endDate = new Date(end);
  const endInclusive = new Date(endDate.getTime() - 1);
  return {
    start: safeIsoFromDate(start) || new Date(0).toISOString(),
    end: safeIsoFromDate(end) || new Date().toISOString(),
    endInclusive: safeIsoFromDate(endInclusive) || new Date().toISOString(),
  };
};

const toNullablePositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed) : null;
};

const buildContext = ({ empresaId, periodo = "mes", veiculoId = null, motoristaId = null, tipoAnalise = "geral" }) => {
  if (!Number.isFinite(Number(empresaId)) || Number(empresaId) <= 0) {
    const err = new Error("empresa_id inválido para análise operacional.");
    err.statusCode = 400;
    throw err;
  }
  if (!TIPOS_ANALISE.has(tipoAnalise)) {
    const err = new Error("tipoAnalise inválido.");
    err.statusCode = 400;
    throw err;
  }

  const bounds = rangeFromPeriodo(periodo);
  const parsedEmpresaId = Number(empresaId);
  const parsedVeiculoId = toNullablePositiveInt(veiculoId);
  const parsedMotoristaId = toNullablePositiveInt(motoristaId);
  const baseParams = [parsedEmpresaId, bounds.start, bounds.endInclusive, parsedVeiculoId, parsedMotoristaId];

  const filtrosCombustivel = `
    c.empresa_id = $1
    AND COALESCE(c.recorded_at_client, c.data) BETWEEN $2::timestamptz AND $3::timestamptz
    AND ($4::int IS NULL OR c.veiculo_id = $4)
    AND ($5::int IS NULL OR c.usuario_id = $5)
  `;

  const filtrosViagens = `
    vi.empresa_id = $1
    AND vi.marcacao BETWEEN $2::timestamptz AND $3::timestamptz
    AND ($4::int IS NULL OR vi.veiculo_id = $4)
    AND ($5::int IS NULL OR vi.motorista_id = $5)
  `;

  const filtrosParteDiaria = `
    pd.empresa_id = $1
    AND COALESCE(pd.recorded_at_client, pd.data) BETWEEN $2::timestamptz AND $3::timestamptz
    AND ($4::int IS NULL OR pd.veiculo_id = $4)
    AND ($5::int IS NULL OR pd.usuario_id = $5)
  `;

  return {
    empresaId: parsedEmpresaId,
    periodo: PERIODOS.has(periodo) ? periodo : "mes",
    tipoAnalise,
    veiculoId: parsedVeiculoId,
    motoristaId: parsedMotoristaId,
    bounds,
    baseParams,
    filtrosCombustivel,
    filtrosViagens,
    filtrosParteDiaria,
  };
};

const buildTransportVehiclePredicate = (alias = "v") => `
  (
    COALESCE(${alias}.usa_para_transporte, false) = true
    OR COALESCE(${alias}.tipo_operacao, '') = 'transporte'
    OR LOWER(COALESCE(${alias}.tipo, '')) LIKE '%transport%'
    OR LOWER(COALESCE(${alias}.categoria, '')) LIKE '%transport%'
  )
`;

module.exports = {
  PERIODOS,
  TIPOS_ANALISE,
  toNumber,
  safeDivide,
  toIsoDate,
  safeIsoFromDate,
  getRange,
  rangeFromPeriodo,
  toNullablePositiveInt,
  buildContext,
  buildTransportVehiclePredicate,
};
