const { pool } = require("../../db");
const { toNumber, buildTransportVehiclePredicate, buildApoioVehiclePredicate } = require("./common");

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
  const { baseParams, filtrosParteDiaria, activeVehicleIds = new Set(), fuelActiveVehicleIds = new Set() } = ctx;
  const transportPredicate = buildTransportVehiclePredicate("v");
  const apoioPredicate = buildApoioVehiclePredicate("v");

  const [vehiclesScopeRows, parteDiariaAgg, parteDiariaActiveRows, escopoTransporteAgg, escopoApoioAgg] =
    await Promise.all([
      safeFrotaQuery(
        "vehiclesScopeRows",
        `SELECT
         v.id,
         COALESCE(v.nome, 'Sem nome') AS nome,
         COALESCE(v.placa, '-') AS placa,
         CASE WHEN ${transportPredicate} THEN 'transporte' ELSE 'apoio' END AS tipo_operacao
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
       INNER JOIN veiculos v ON v.id = pd.veiculo_id AND v.empresa_id = pd.empresa_id
       WHERE ${filtrosParteDiaria}
         AND ${apoioPredicate}`,
        baseParams
      ),
      safeFrotaQuery(
        "parteDiariaActiveRows",
        `SELECT DISTINCT pd.veiculo_id
       FROM parte_diaria pd
       WHERE ${filtrosParteDiaria}
         AND pd.veiculo_id IS NOT NULL`,
        baseParams
      ),
      safeFrotaQuery(
        "escopoTransporteAgg",
        `SELECT COUNT(*)::int AS total
       FROM veiculos v
       WHERE v.empresa_id = $1
         AND ($4::int IS NULL OR v.id = $4)
         AND ${transportPredicate}`,
        baseParams
      ),
      safeFrotaQuery(
        "escopoApoioAgg",
        `SELECT COUNT(*)::int AS total
       FROM veiculos v
       WHERE v.empresa_id = $1
         AND ($4::int IS NULL OR v.id = $4)
         AND ${apoioPredicate}`,
        baseParams
      ),
    ]);

  const parteDiariaActiveIds = new Set(
    (parteDiariaActiveRows.rows || [])
      .map((row) => Number(row.veiculo_id))
      .filter((id) => Number.isFinite(id) && id > 0)
  );

  const isVeiculoAtivo = (veiculoId) =>
    activeVehicleIds.has(veiculoId) || fuelActiveVehicleIds.has(veiculoId) || parteDiariaActiveIds.has(veiculoId);

  const scopedVehicles = vehiclesScopeRows.rows || [];
  const transporteVehicles = scopedVehicles.filter((row) => row.tipo_operacao === "transporte");
  const apoioVehicles = scopedVehicles.filter((row) => row.tipo_operacao !== "transporte");

  const countAtivos = (list) => list.filter((row) => isVeiculoAtivo(Number(row.id))).length;
  const countOciosos = (list) => list.filter((row) => !isVeiculoAtivo(Number(row.id))).length;

  const veiculosAtivosTransporte = countAtivos(transporteVehicles);
  const veiculosOciososTransporte = countOciosos(transporteVehicles);
  const veiculosAtivosApoio = countAtivos(apoioVehicles);
  const veiculosOciososApoio = countOciosos(apoioVehicles);

  const veiculosAtivos = veiculosAtivosTransporte + veiculosAtivosApoio;
  const veiculosOciosos = veiculosOciososTransporte + veiculosOciososApoio;
  const veiculosOciososRows = scopedVehicles.filter((row) => !isVeiculoAtivo(Number(row.id)));

  return {
    indicadores: {
      veiculosAtivos,
      veiculosOciosos,
      veiculosAtivosTransporte,
      veiculosOciososTransporte,
      veiculosAtivosApoio,
      veiculosOciososApoio,
      totalVeiculosTransporte: toNumber(escopoTransporteAgg.rows[0]?.total),
      totalVeiculosApoio: toNumber(escopoApoioAgg.rows[0]?.total),
      totalVeiculosEscopo: scopedVehicles.length,
      totalParteDiaria: toNumber(parteDiariaAgg.rows[0]?.total_parte_diaria),
    },
    insights: {
      veiculosOciosos: veiculosOciososRows.map((row) => ({
        veiculoId: Number(row.id),
        nome: row.nome,
        placa: row.placa,
        tipoOperacao: row.tipo_operacao === "transporte" ? "transporte" : "apoio",
      })),
    },
  };
};

module.exports = {
  analisarFrota,
};
