const { pool } = require("../../db");
const { classificarVeiculos, separarVeiculosPorTipo } = require("./classificarVeiculos");
const { buildTransportVehiclePredicate } = require("./operacionalRules");

const emptyResult = () => ({ rows: [] });

const mapVeiculoRowFromDb = (row) => ({
  id: Number(row.id),
  veiculo_id: Number(row.id),
  nome: row.nome,
  placa: row.placa,
  tipo_operacao: row.tipo_operacao,
  usa_romaneio: row.usa_romaneio,
  usa_para_transporte: row.usa_para_transporte,
});

const carregarVeiculosEscopo = async (ctx) => {
  const { baseParams } = ctx;
  const transportPredicate = buildTransportVehiclePredicate("v");

  try {
    const result = await pool.query(
      `SELECT
         v.id,
         COALESCE(v.nome, 'Sem nome') AS nome,
         COALESCE(v.placa, '-') AS placa,
         NULLIF(LOWER(TRIM(v.tipo_operacao)), '') AS tipo_operacao,
         COALESCE(v.usa_para_transporte, false) AS usa_para_transporte,
         COALESCE(v.usa_para_transporte, false) AS usa_romaneio,
         CASE WHEN ${transportPredicate} THEN 'transporte' ELSE 'apoio' END AS tipo_operacao_sql
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
    );

    const classificados = classificarVeiculos((result.rows || []).map(mapVeiculoRowFromDb));
    return separarVeiculosPorTipo(classificados);
  } catch (error) {
    console.error("[INTELIGENCIA][BASE][ERRO] carregarVeiculosEscopo", error);
    return separarVeiculosPorTipo([]);
  }
};

const registrarLogBaseInteligencia = ({ base, combustivel, transporte, frota }) => {
  const totalTransporte =
    base?.transporte?.length ??
    transporte?.indicadores?.totalViagensTransporte ??
    frota?.indicadores?.totalVeiculosTransporte ??
    0;
  const totalApoio = base?.apoio?.length ?? frota?.indicadores?.totalVeiculosApoio ?? 0;
  const totalCombustivel = combustivel?.indicadores?.totalLitros ?? 0;

  console.log("[INTELIGENCIA][BASE]", {
    transporte: totalTransporte,
    apoio: totalApoio,
    abastecimentos: totalCombustivel,
  });

  return {
    transporte: totalTransporte,
    apoio: totalApoio,
    abastecimentos: totalCombustivel,
  };
};

const enriquecerContextoInteligencia = async (ctx) => {
  const base = await carregarVeiculosEscopo(ctx);
  return {
    ...ctx,
    base,
    veiculosClassificados: base.veiculos,
    veiculosTransporte: base.transporte,
    veiculosApoio: base.apoio,
  };
};

module.exports = {
  carregarVeiculosEscopo,
  enriquecerContextoInteligencia,
  registrarLogBaseInteligencia,
};
