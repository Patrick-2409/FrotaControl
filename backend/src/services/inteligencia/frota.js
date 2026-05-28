const { pool } = require("../../db");
const { toNumber, buildTransportVehiclePredicate, buildApoioVehiclePredicate } = require("./common");
const { classificarVeiculos } = require("./classificarVeiculos");

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
  const {
    baseParams,
    filtrosParteDiaria,
    activeVehicleIds = new Set(),
    fuelActiveVehicleIds = new Set(),
    veiculosTransporte: veiculosTransporteCtx = [],
    veiculosApoio: veiculosApoioCtx = [],
  } = ctx;
  const transportPredicate = buildTransportVehiclePredicate("v");
  const apoioPredicate = buildApoioVehiclePredicate("v");

  const [vehiclesScopeRows, parteDiariaAgg, parteDiariaActiveRows, parteDiariaPorVeiculoRows, parteDiariaPorDiaRows, escopoTransporteAgg, escopoApoioAgg] =
    await Promise.all([
      veiculosTransporteCtx.length || veiculosApoioCtx.length
        ? Promise.resolve({ rows: [...veiculosTransporteCtx, ...veiculosApoioCtx] })
        : safeFrotaQuery(
            "vehiclesScopeRows",
            `SELECT
         v.id,
         COALESCE(v.nome, 'Sem nome') AS nome,
         COALESCE(v.placa, '-') AS placa,
         COALESCE(v.usa_para_transporte, false) AS usa_para_transporte,
         COALESCE(v.usa_para_transporte, false) AS usa_romaneio,
         NULLIF(LOWER(TRIM(v.tipo_operacao)), '') AS tipo_operacao
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
       INNER JOIN veiculos v ON v.id = pd.veiculo_id AND v.empresa_id = pd.empresa_id
       WHERE ${filtrosParteDiaria}
         AND ${apoioPredicate}
         AND pd.veiculo_id IS NOT NULL`,
        baseParams
      ),
      safeFrotaQuery(
        "parteDiariaPorVeiculoRows",
        `SELECT
         pd.veiculo_id,
         COALESCE(v.nome, pd.equipamento, 'Sem nome') AS veiculo,
         COALESCE(v.placa, '-') AS placa,
         COUNT(*)::int AS registros,
         COALESCE(SUM(pd.total_horas), 0)::numeric AS total_horas,
         COALESCE(SUM(pd.total_km), 0)::numeric AS total_km
       FROM parte_diaria pd
       INNER JOIN veiculos v ON v.id = pd.veiculo_id AND v.empresa_id = pd.empresa_id
       WHERE ${filtrosParteDiaria}
         AND ${apoioPredicate}
       GROUP BY pd.veiculo_id, v.nome, v.placa, pd.equipamento
       ORDER BY registros DESC, total_horas DESC
       LIMIT 12`,
        baseParams
      ),
      safeFrotaQuery(
        "parteDiariaPorDiaRows",
        `SELECT
         DATE(COALESCE(pd.recorded_at_client, pd.data))::text AS periodo,
         COUNT(*)::int AS registros,
         COALESCE(SUM(pd.total_horas), 0)::numeric AS total_horas
       FROM parte_diaria pd
       INNER JOIN veiculos v ON v.id = pd.veiculo_id AND v.empresa_id = pd.empresa_id
       WHERE ${filtrosParteDiaria}
         AND ${apoioPredicate}
       GROUP BY 1
       ORDER BY 1`,
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

  const parteDiariaActiveIdsRaw = new Set(
    (parteDiariaActiveRows.rows || [])
      .map((row) => Number(row.veiculo_id))
      .filter((id) => Number.isFinite(id) && id > 0)
  );

  const scopedVehicles = classificarVeiculos(vehiclesScopeRows.rows || []);
  const transporteVehicles = scopedVehicles.filter((row) => row.tipo_operacao === "transporte");
  const apoioVehicles = scopedVehicles.filter((row) => row.tipo_operacao === "apoio");
  const apoioVehicleIds = new Set(apoioVehicles.map((row) => Number(row.id)).filter(Number.isFinite));

  const parteDiariaActiveIds = new Set(
    [...parteDiariaActiveIdsRaw].filter((id) => apoioVehicleIds.has(id))
  );

  const isVeiculoAtivoTransporte = (veiculoId) =>
    activeVehicleIds.has(veiculoId) || fuelActiveVehicleIds.has(veiculoId);

  const isVeiculoAtivoApoio = (veiculoId) =>
    fuelActiveVehicleIds.has(veiculoId) || parteDiariaActiveIds.has(veiculoId);

  const countAtivos = (list, predicate) => list.filter((row) => predicate(Number(row.id))).length;
  const countOciosos = (list, predicate) => list.filter((row) => !predicate(Number(row.id))).length;

  const veiculosAtivosTransporte = countAtivos(transporteVehicles, isVeiculoAtivoTransporte);
  const veiculosOciososTransporte = countOciosos(transporteVehicles, isVeiculoAtivoTransporte);
  const veiculosAtivosApoio = countAtivos(apoioVehicles, isVeiculoAtivoApoio);
  const veiculosOciososApoio = countOciosos(apoioVehicles, isVeiculoAtivoApoio);

  const veiculosAtivos = veiculosAtivosTransporte + veiculosAtivosApoio;
  const veiculosOciosos = veiculosOciososTransporte + veiculosOciososApoio;
  const veiculosOciososRows = scopedVehicles.filter(
    (row) =>
      !(row.tipo_operacao === "transporte"
        ? isVeiculoAtivoTransporte(Number(row.id))
        : isVeiculoAtivoApoio(Number(row.id)))
  );

  const totalParteDiaria = toNumber(parteDiariaAgg.rows[0]?.total_parte_diaria);
  const atividadesPorVeiculo = (parteDiariaPorVeiculoRows.rows || []).map((row) => ({
    veiculoId: Number(row.veiculo_id) || null,
    veiculo: row.veiculo,
    placa: row.placa,
    registros: toNumber(row.registros),
    totalHoras: toNumber(row.total_horas),
    totalKm: toNumber(row.total_km),
  }));
  const produtividadePorDia = (parteDiariaPorDiaRows.rows || []).map((row) => ({
    periodo: row.periodo,
    registros: toNumber(row.registros),
    totalHoras: toNumber(row.total_horas),
  }));
  const totalHorasParteDiaria = atividadesPorVeiculo.reduce((acc, row) => acc + row.totalHoras, 0);
  const veiculosComParteDiaria = atividadesPorVeiculo.filter((row) => row.registros > 0).length;
  const mediaHorasPorRegistro = totalParteDiaria > 0 ? totalHorasParteDiaria / totalParteDiaria : 0;

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
      totalParteDiaria,
      totalHorasParteDiaria,
      mediaHorasPorRegistro,
      veiculosComParteDiaria,
    },
    insights: {
      veiculosOciosos: veiculosOciososRows.map((row) => ({
        veiculoId: Number(row.id),
        nome: row.nome,
        placa: row.placa,
        tipoOperacao: row.tipo_operacao === "transporte" ? "transporte" : "apoio",
      })),
    },
    graficos: {
      atividadesPorVeiculo,
      produtividadePorDia,
    },
  };
};

module.exports = {
  analisarFrota,
};
