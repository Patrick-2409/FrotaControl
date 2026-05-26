const { pool } = require("../../db");
const { toNumber, safeDivide, toIsoDate, safeIsoFromDate, buildTransportVehiclePredicate } = require("./common");

const emptyResult = () => ({ rows: [] });

const safeCombustivelQuery = async (label, sql, params) => {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    console.error(`[INTELIGENCIA][combustivel][ERRO] ${label}`, error);
    return emptyResult();
  }
};

const analisarCombustivel = async (ctx) => {
  const { baseParams, filtrosCombustivel } = ctx;
  const transportVehiclePredicate = buildTransportVehiclePredicate("v");

  const [fuelAgg, fuelAggTransporte, topFuelRows, pieFuelRows, lineCostRows] = await Promise.all([
    safeCombustivelQuery(
      "fuelAgg",
      `SELECT
         COALESCE(SUM(c.litros), 0)::double precision AS total_litros,
         COALESCE(SUM(c.valor_total), 0)::double precision AS total_valor
       FROM combustiveis c
       WHERE ${filtrosCombustivel}`,
      baseParams
    ),
    safeCombustivelQuery(
      "fuelAggTransporte",
      `SELECT
         COALESCE(SUM(c.litros), 0)::double precision AS total_litros_transporte,
         COALESCE(SUM(c.valor_total), 0)::double precision AS total_valor_transporte
       FROM combustiveis c
       INNER JOIN veiculos v ON v.id = c.veiculo_id AND v.empresa_id = c.empresa_id
       WHERE ${filtrosCombustivel}
         AND ${transportVehiclePredicate}`,
      baseParams
    ),
    safeCombustivelQuery(
      "topFuelRows",
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
    safeCombustivelQuery(
      "pieFuelRows",
      `SELECT
         c.veiculo_id AS veiculo_id,
         COALESCE(v.nome, 'Sem nome') AS nome,
         COALESCE(v.placa, '-') AS placa,
         COALESCE(SUM(c.litros), 0)::double precision AS litros
       FROM combustiveis c
       LEFT JOIN veiculos v ON v.id = c.veiculo_id AND v.empresa_id = c.empresa_id
       WHERE ${filtrosCombustivel}
       GROUP BY c.veiculo_id, v.nome, v.placa
       ORDER BY litros DESC`,
      baseParams
    ),
    safeCombustivelQuery(
      "lineCostRows",
      `SELECT
         DATE(COALESCE(c.recorded_at_client, c.data)) AS dia,
         COALESCE(SUM(c.valor_total), 0)::double precision AS custo
       FROM combustiveis c
       WHERE ${filtrosCombustivel}
       GROUP BY DATE(COALESCE(c.recorded_at_client, c.data))
       ORDER BY dia`,
      baseParams
    ),
  ]);

  const fuel = fuelAgg.rows[0] || {};
  const totalLitros = toNumber(fuel.total_litros);
  const totalValor = toNumber(fuel.total_valor);
  const precoMedio = safeDivide(totalValor, totalLitros);
  const totalLitrosTransporte = toNumber(fuelAggTransporte.rows[0]?.total_litros_transporte);
  const totalValorTransporte = toNumber(fuelAggTransporte.rows[0]?.total_valor_transporte);

  const combustivelRows = pieFuelRows.rows || [];
  const veiculosUnicos = new Set(
    combustivelRows.map((row) => Number(row.veiculo_id)).filter((id) => Number.isFinite(id) && id > 0)
  );
  const veiculosConsiderados = veiculosUnicos.size;

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

  return {
    indicadores: {
      totalLitros,
      totalValor,
      precoMedio,
      totalLitrosTransporte,
      totalValorTransporte,
      veiculosConsiderados,
    },
    insights: {
      veiculoDestaque,
    },
    graficos: {
      consumoPorVeiculo: combustivelRows.map((row) => ({
        veiculo: `${row.nome} (${row.placa})`,
        litros: toNumber(row.litros),
        veiculo_id: row.veiculo_id == null ? null : Number(row.veiculo_id),
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
    },
  };
};

module.exports = {
  analisarCombustivel,
};
