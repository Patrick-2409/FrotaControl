const { pool } = require("../../db");
const { toNumber } = require("./common");

const emptyResult = () => ({ rows: [] });

const safeFrotaQuery = async (label, sql, params) => {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    console.error(`[INTELIGENCIA][frota][ERRO] ${label}`, error);
    return emptyResult();
  }
};

const analisarFrota = async (ctx) => {
  const { baseParams, activeVehicleIds = new Set() } = ctx;

  const [vehiclesScopeRows, parteDiariaAgg] = await Promise.all([
    safeFrotaQuery(
      "vehiclesScopeRows",
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
    safeFrotaQuery(
      "parteDiariaAgg",
      `SELECT COUNT(*)::int AS total_parte_diaria
       FROM parte_diaria pd
       WHERE pd.empresa_id = $1
         AND COALESCE(pd.recorded_at_client, pd.data) BETWEEN $2::timestamptz AND $3::timestamptz
         AND ($4::int IS NULL OR pd.veiculo_id = $4)
         AND ($5::int IS NULL OR pd.usuario_id = $5)`,
      baseParams
    ),
  ]);

  const scopedVehicles = vehiclesScopeRows.rows || [];
  const veiculosAtivos = scopedVehicles.length
    ? scopedVehicles.filter((row) => activeVehicleIds.has(Number(row.id))).length
    : activeVehicleIds.size;
  const veiculosOciososRows = scopedVehicles.filter((row) => !activeVehicleIds.has(Number(row.id)));
  const veiculosOciosos = veiculosOciososRows.length;

  return {
    indicadores: {
      veiculosAtivos,
      veiculosOciosos,
      totalParteDiaria: toNumber(parteDiariaAgg.rows[0]?.total_parte_diaria),
    },
    insights: {
      veiculosOciosos: veiculosOciososRows.map((row) => ({
        veiculoId: Number(row.id),
        nome: row.nome,
        placa: row.placa,
      })),
    },
  };
};

module.exports = {
  analisarFrota,
};
