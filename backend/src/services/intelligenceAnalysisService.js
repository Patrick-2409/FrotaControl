const { pool } = require("../db");

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

const startOfDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
const endExclusiveOfDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0));
const startOfMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
const endExclusiveOfMonth = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
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
  return {
    start: safeIsoFromDate(start) || new Date(0).toISOString(),
    end: safeIsoFromDate(end) || new Date().toISOString(),
  };
};

const analyzeOperationalData = async ({
  empresaId,
  periodo = "mes",
  veiculoId = null,
  motoristaId = null,
  tipoAnalise = "geral",
}) => {
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
  const parsedVeiculoId = Number.isFinite(Number(veiculoId)) && Number(veiculoId) > 0 ? Number(veiculoId) : null;
  const parsedMotoristaId =
    Number.isFinite(Number(motoristaId)) && Number(motoristaId) > 0 ? Number(motoristaId) : null;

  const baseParams = [parsedEmpresaId, bounds.start, bounds.end, parsedVeiculoId, parsedMotoristaId];
  const filtrosCombustivel = `
    c.empresa_id = $1
    AND COALESCE(c.recorded_at_client, c.data) >= $2::timestamptz
    AND COALESCE(c.recorded_at_client, c.data) < $3::timestamptz
    AND ($4::int IS NULL OR c.veiculo_id = $4)
    AND ($5::int IS NULL OR c.usuario_id = $5)
  `;
  const filtrosViagens = `
    vi.empresa_id = $1
    AND vi.marcacao >= $2::timestamptz
    AND vi.marcacao < $3::timestamptz
    AND ($4::int IS NULL OR vi.veiculo_id = $4)
    AND ($5::int IS NULL OR vi.motorista_id = $5)
  `;

  const [
    fuelAgg,
    viagemAgg,
    parteDiariaAgg,
    activeVehiclesRows,
    vehiclesScopeRows,
    topFuelRows,
    pieFuelRows,
    lineCostRows,
    consumoVsProducaoRows,
  ] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(c.litros), 0)::double precision AS total_litros,
         COALESCE(SUM(c.valor_total), 0)::double precision AS total_valor
       FROM combustiveis c
       WHERE ${filtrosCombustivel}`,
      baseParams
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total_viagens
       FROM viagens vi
       WHERE ${filtrosViagens}`,
      baseParams
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total_parte_diaria
       FROM parte_diaria pd
       WHERE pd.empresa_id = $1
         AND COALESCE(pd.recorded_at_client, pd.data) >= $2::timestamptz
         AND COALESCE(pd.recorded_at_client, pd.data) < $3::timestamptz
         AND ($4::int IS NULL OR pd.veiculo_id = $4)
         AND ($5::int IS NULL OR pd.usuario_id = $5)`,
      baseParams
    ),
    pool.query(
      `SELECT DISTINCT vi.veiculo_id
       FROM viagens vi
       WHERE ${filtrosViagens}
         AND vi.veiculo_id IS NOT NULL`,
      baseParams
    ),
    pool.query(
      `SELECT v.id, COALESCE(v.nome, 'Sem nome') AS nome, COALESCE(v.placa, '-') AS placa
       FROM veiculos v
       WHERE v.empresa_id = $1
         AND ($4::int IS NULL OR v.id = $4)
         AND (
           $5::int IS NULL
           OR EXISTS (
             SELECT 1
             FROM usuarios u
             WHERE u.id = $5
               AND u.empresa_id = v.empresa_id
               AND u.veiculo_id = v.id
           )
         )
       ORDER BY v.nome`,
      baseParams
    ),
    pool.query(
      `SELECT
         c.veiculo_id,
         COALESCE(v.nome, 'Sem nome') AS nome,
         COALESCE(v.placa, '-') AS placa,
         COALESCE(SUM(c.litros), 0)::double precision AS total_litros,
         COALESCE(SUM(c.valor_total), 0)::double precision AS total_valor
       FROM combustiveis c
       LEFT JOIN veiculos v ON v.id = c.veiculo_id AND v.empresa_id = c.empresa_id
       WHERE ${filtrosCombustivel}
       GROUP BY c.veiculo_id, v.nome, v.placa
       ORDER BY total_litros DESC
       LIMIT 1`,
      baseParams
    ),
    pool.query(
      `SELECT
         COALESCE(v.nome, 'Sem nome') AS nome,
         COALESCE(v.placa, '-') AS placa,
         COALESCE(SUM(c.litros), 0)::double precision AS litros
       FROM combustiveis c
       LEFT JOIN veiculos v ON v.id = c.veiculo_id AND v.empresa_id = c.empresa_id
       WHERE ${filtrosCombustivel}
       GROUP BY v.nome, v.placa
      ORDER BY litros DESC`,
      baseParams
    ),
    pool.query(
      `SELECT
         DATE(COALESCE(c.recorded_at_client, c.data)) AS dia,
         COALESCE(SUM(c.valor_total), 0)::double precision AS custo
       FROM combustiveis c
       WHERE ${filtrosCombustivel}
       GROUP BY DATE(COALESCE(c.recorded_at_client, c.data))
       ORDER BY dia`,
      baseParams
    ),
    pool.query(
      `WITH consumo AS (
         SELECT
           DATE(COALESCE(c.recorded_at_client, c.data)) AS dia,
           COALESCE(SUM(c.litros), 0)::double precision AS consumo
         FROM combustiveis c
         WHERE ${filtrosCombustivel}
         GROUP BY DATE(COALESCE(c.recorded_at_client, c.data))
       ),
       producao AS (
         SELECT
           DATE(vi.marcacao) AS dia,
           COUNT(*)::double precision AS producao
         FROM viagens vi
         WHERE ${filtrosViagens}
         GROUP BY DATE(vi.marcacao)
       )
       SELECT
         COALESCE(consumo.dia, producao.dia) AS dia,
         COALESCE(consumo.consumo, 0)::double precision AS consumo,
         COALESCE(producao.producao, 0)::double precision AS producao
       FROM consumo
       FULL OUTER JOIN producao ON producao.dia = consumo.dia
       ORDER BY dia`,
      baseParams
    ),
  ]);

  const fuel = fuelAgg.rows[0] || {};
  const totalLitros = toNumber(fuel.total_litros);
  const totalValor = toNumber(fuel.total_valor);
  const precoMedio = safeDivide(totalValor, totalLitros);

  const totalViagens = toNumber(viagemAgg.rows[0]?.total_viagens);
  const totalParteDiaria = toNumber(parteDiariaAgg.rows[0]?.total_parte_diaria);
  const activeVehiclesSet = new Set(activeVehiclesRows.rows.map((row) => Number(row.veiculo_id)).filter(Number.isFinite));
  const scopedVehicles = vehiclesScopeRows.rows || [];
  const veiculosAtivos = scopedVehicles.length
    ? scopedVehicles.filter((row) => activeVehiclesSet.has(Number(row.id))).length
    : activeVehiclesSet.size;
  const veiculosOciososRows = scopedVehicles.filter((row) => !activeVehiclesSet.has(Number(row.id)));
  const veiculosOciosos = veiculosOciososRows.length;

  const topFuel = topFuelRows.rows[0] || null;
  const veiculoDestaque = topFuel
    ? {
        veiculoId: topFuel.veiculo_id == null ? null : Number(topFuel.veiculo_id),
        nome: topFuel.nome,
        placa: topFuel.placa,
        totalLitros: toNumber(topFuel.total_litros),
        totalValor: toNumber(topFuel.total_valor),
      }
    : null;

  const operacaoParada = totalViagens === 0 && totalLitros > 0;
  const consumoSemProducao = totalLitros > 0 && totalViagens === 0;

  return {
    periodo: {
      tipo: PERIODOS.has(periodo) ? periodo : "mes",
      inicio: toIsoDate(new Date(bounds.start)),
      fim: toIsoDate(new Date(new Date(bounds.end).getTime() - 1)),
    },
    tipoAnalise,
    filtros: {
      veiculoId: parsedVeiculoId,
      motoristaId: parsedMotoristaId,
    },
    indicadores: {
      totalLitros,
      totalValor,
      precoMedio,
      totalViagens,
      totalParteDiaria,
      veiculosAtivos,
      veiculosOciosos,
    },
    insights: {
      operacaoParada,
      consumoSemProducao,
      veiculosOciosos: veiculosOciososRows.map((row) => ({
        veiculoId: Number(row.id),
        nome: row.nome,
        placa: row.placa,
      })),
      veiculoDestaque,
    },
    graficos: {
      consumoPorVeiculo: (pieFuelRows.rows || []).map((row) => ({
        veiculo: `${row.nome} (${row.placa})`,
        litros: toNumber(row.litros),
      })),
      custoPorPeriodo: (lineCostRows.rows || [])
        .map((row) => {
          const diaIso = safeIsoFromDate(row.dia);
          if (!diaIso) return null;
          return {
            periodo: toIsoDate(new Date(diaIso)),
            custo: toNumber(row.custo),
          };
        })
        .filter(Boolean),
      consumoVsProducao: (consumoVsProducaoRows.rows || [])
        .map((row) => {
          const diaIso = safeIsoFromDate(row.dia);
          if (!diaIso) return null;
          return {
            periodo: toIsoDate(new Date(diaIso)),
            consumo: toNumber(row.consumo),
            producao: toNumber(row.producao),
          };
        })
        .filter(Boolean),
    },
  };
};

module.exports = {
  analyzeOperationalData,
};
