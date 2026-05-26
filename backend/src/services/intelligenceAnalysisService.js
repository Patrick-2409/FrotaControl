const { pool } = require("../db");

const PERIODOS = new Set(["dia", "semana", "mes", "ano"]);
const TIPOS_ANALISE = new Set(["geral", "combustivel", "transporte", "frota"]);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const rangeFromPeriodo = (periodo, anchor = new Date()) => {
  const p = PERIODOS.has(periodo) ? periodo : "mes";
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const d = anchor.getUTCDate();
  const startDay = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));

  if (p === "dia") return { start: startDay.toISOString(), end: endDay.toISOString() };
  if (p === "semana") {
    const dow = startDay.getUTCDay();
    const offsetToMonday = (dow + 6) % 7;
    const start = new Date(startDay);
    start.setUTCDate(start.getUTCDate() - offsetToMonday);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (p === "ano") {
    const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0));
    return { start: start.toISOString(), end: end.toISOString() };
  }
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
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

  const [fuelAgg, viagemAgg, activeVehiclesRows, vehiclesScopeRows, topFuelRows] = await Promise.all([
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
  ]);

  const fuel = fuelAgg.rows[0] || {};
  const totalLitros = toNumber(fuel.total_litros);
  const totalValor = toNumber(fuel.total_valor);
  const precoMedio = totalLitros > 0 ? totalValor / totalLitros : null;

  const totalViagens = toNumber(viagemAgg.rows[0]?.total_viagens);
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
  };
};

module.exports = {
  analyzeOperationalData,
};
