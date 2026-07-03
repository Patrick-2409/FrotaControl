const { pool } = require("../../db");
const { toNumber, toIsoDate, safeIsoFromDate, buildTransportVehiclePredicate } = require("./common");

const emptyResult = () => ({ rows: [] });

const safeTransporteQuery = async (label, sql, params) => {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    console.error(`[INTELIGENCIA][transporte][ERRO] ${label}`, error);
    return emptyResult();
  }
};

const analisarTransporte = async (ctx) => {
  const { baseParams, filtrosViagens, filtrosCombustivel } = ctx;
  const transportVehiclePredicate = buildTransportVehiclePredicate("v");

  const [viagemAgg, viagemTransporteAgg, activeVehiclesRows, consumoVsProducaoRows, escopoTransporteAgg] =
    await Promise.all([
    safeTransporteQuery(
      "viagemAgg",
      `SELECT COUNT(*)::int AS total_viagens
       FROM viagens vi
       WHERE ${filtrosViagens}`,
      baseParams
    ),
      safeTransporteQuery(
        "viagemTransporteAgg",
        `SELECT COUNT(*)::int AS total_viagens_transporte
       FROM viagens vi
       INNER JOIN veiculos v ON v.id = vi.veiculo_id AND v.empresa_id = vi.empresa_id
       WHERE ${filtrosViagens}
         AND ${transportVehiclePredicate}`,
        baseParams
      ),
    safeTransporteQuery(
      "activeVehiclesRows",
      `SELECT DISTINCT vi.veiculo_id
       FROM viagens vi
       WHERE ${filtrosViagens}
         AND vi.veiculo_id IS NOT NULL`,
      baseParams
    ),
    safeTransporteQuery(
      "consumoVsProducaoRows",
        `WITH consumo AS (
         SELECT
           DATE(COALESCE(c.recorded_at_client, c.data)) AS dia,
           COALESCE(SUM(c.litros), 0)::double precision AS consumo
         FROM combustiveis c
         INNER JOIN veiculos vc ON vc.id = c.veiculo_id AND vc.empresa_id = c.empresa_id
         WHERE ${filtrosCombustivel}
           AND ${buildTransportVehiclePredicate("vc")}
         GROUP BY DATE(COALESCE(c.recorded_at_client, c.data))
       ),
       producao AS (
         SELECT
           DATE(vi.marcacao) AS dia,
           COUNT(*)::double precision AS producao
         FROM viagens vi
         INNER JOIN veiculos v ON v.id = vi.veiculo_id AND v.empresa_id = vi.empresa_id
         WHERE ${filtrosViagens}
           AND ${transportVehiclePredicate}
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
      safeTransporteQuery(
        "escopoTransporteAgg",
        `SELECT COUNT(*)::int AS total_veiculos_transporte
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
                 AND (
                   u.veiculo_id = v.id
                   OR EXISTS (
                     SELECT 1
                     FROM motorista_veiculos mv
                     WHERE mv.empresa_id = v.empresa_id
                       AND mv.motorista_id = u.id
                       AND mv.veiculo_id = v.id
                   )
                 )
             )
           )
           AND ${transportVehiclePredicate}`,
        baseParams
      ),
    ]);

  const activeVehicleIds = new Set(
    (activeVehiclesRows.rows || []).map((row) => Number(row.veiculo_id)).filter(Number.isFinite)
  );

  const totalViagens = toNumber(viagemAgg.rows[0]?.total_viagens);
  const totalViagensTransporte = toNumber(viagemTransporteAgg.rows[0]?.total_viagens_transporte);
  const totalVeiculosTransporte = toNumber(escopoTransporteAgg.rows[0]?.total_veiculos_transporte);
  const dadosTransporteDisponiveis = totalVeiculosTransporte > 0 || totalViagensTransporte > 0;

  return {
    indicadores: {
      totalViagens,
      totalViagensTransporte,
      dadosTransporteDisponiveis,
    },
    support: {
      activeVehicleIds,
    },
    graficos: {
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
  analisarTransporte,
};
