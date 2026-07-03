const { pool } = require("../../db");
const { toNumber, buildTransportVehiclePredicate } = require("./common");
const { classificarVeiculos } = require("./classificarVeiculos");

const normalizarDadosOperacionais = ({ veiculosTransporte = [], veiculosApoio = [], parteDiaria = [] } = {}) => ({
  transporte: Array.isArray(veiculosTransporte) ? veiculosTransporte : [],
  apoio: Array.isArray(veiculosApoio) ? veiculosApoio : [],
  combustivel: [...(veiculosTransporte || []), ...(veiculosApoio || [])].filter(
    (row) => toNumber(row?.litros ?? row?.consumo) > 0
  ),
  parteDiaria: Array.isArray(parteDiaria) ? parteDiaria : [],
});

const validarConsistenciaPorVeiculo = (dados = {}) => {
  const inconsistencias = [];
  const transporte = Array.isArray(dados.transporte) ? dados.transporte : [];

  transporte.forEach((veiculo) => {
    const viagens = toNumber(veiculo?.viagens ?? veiculo?.totalViagens);
    const litros = toNumber(veiculo?.litros ?? veiculo?.consumo ?? veiculo?.totalLitros);
    const nome = veiculo?.nome || veiculo?.veiculo || `Veículo ${veiculo?.veiculoId ?? veiculo?.id ?? "?"}`;
    const placa = veiculo?.placa || "-";
    const veiculoId = veiculo?.veiculoId ?? veiculo?.id ?? null;

    if (viagens > 0 && litros === 0) {
      inconsistencias.push({
        tipo: "ERRO_CRITICO",
        descricao: "Transporte com produção sem consumo",
        veiculo: nome,
        placa,
        veiculoId,
        viagens,
        litros,
      });
    }

    if (litros > 0 && viagens === 0) {
      inconsistencias.push({
        tipo: "ALERTA",
        descricao: "Consumo sem produção (possível ociosidade ou tipo_operacao incorreto)",
        veiculo: nome,
        placa,
        veiculoId,
        viagens,
        litros,
      });
    }
  });

  return inconsistencias;
};

const formatarInconsistenciaVeiculo = (item) => {
  const label = item?.tipo === "ERRO_CRITICO" ? "ERRO_CRITICO" : "ALERTA";
  const ident =
    item?.placa && item.placa !== "-" ? `${item.veiculo} (${item.placa})` : String(item?.veiculo || "Veículo");
  const litros = toNumber(item?.litros);
  const viagens = toNumber(item?.viagens);
  return `[${label}] ${ident}: ${item?.descricao || "Inconsistência operacional"} (${viagens} viagem(ns), ${litros.toFixed(1)} L)`;
};

const mergeInconsistencias = (globais = [], porVeiculo = []) => {
  const textoVeiculo = (Array.isArray(porVeiculo) ? porVeiculo : []).map(formatarInconsistenciaVeiculo);
  return [...new Set([...(Array.isArray(globais) ? globais : []), ...textoVeiculo].filter(Boolean))];
};

const mapVeiculoRow = (row) => ({
  veiculoId: Number(row.veiculo_id),
  id: Number(row.veiculo_id),
  nome: row.nome,
  placa: row.placa,
  viagens: toNumber(row.viagens),
  litros: toNumber(row.litros),
  tipo_operacao: row.tipo_operacao === "transporte" ? "transporte" : "apoio",
});

const analisarConsistenciaVeiculos = async (ctx) => {
  const { baseParams, filtrosViagens, filtrosCombustivel } = ctx;
  const transportPredicate = buildTransportVehiclePredicate("v");

  const sql = `
    WITH veiculos_escopo AS (
      SELECT
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
    ),
    viagens_agg AS (
      SELECT vi.veiculo_id, COUNT(*)::int AS viagens
      FROM viagens vi
      WHERE ${filtrosViagens}
        AND vi.veiculo_id IS NOT NULL
      GROUP BY vi.veiculo_id
    ),
    litros_agg AS (
      SELECT c.veiculo_id, COALESCE(SUM(c.litros), 0)::double precision AS litros
      FROM combustiveis c
      WHERE ${filtrosCombustivel}
        AND c.veiculo_id IS NOT NULL
      GROUP BY c.veiculo_id
    )
    SELECT
      ve.id AS veiculo_id,
      ve.nome,
      ve.placa,
      ve.tipo_operacao,
      COALESCE(va.viagens, 0)::int AS viagens,
      COALESCE(la.litros, 0)::double precision AS litros
    FROM veiculos_escopo ve
    LEFT JOIN viagens_agg va ON va.veiculo_id = ve.id
    LEFT JOIN litros_agg la ON la.veiculo_id = ve.id
    WHERE COALESCE(va.viagens, 0) > 0 OR COALESCE(la.litros, 0) > 0
    ORDER BY ve.nome
  `;

  try {
    const result = await pool.query(sql, baseParams);
    const rows = classificarVeiculos(result.rows || []);
    const veiculosTransporte = rows.filter((row) => row.tipo_operacao === "transporte").map(mapVeiculoRow);
    const veiculosApoio = rows.filter((row) => row.tipo_operacao === "apoio").map(mapVeiculoRow);
    const dadosNormalizados = normalizarDadosOperacionais({ veiculosTransporte, veiculosApoio });
    const inconsistenciasDetalhadas = validarConsistenciaPorVeiculo(dadosNormalizados);

    return {
      dadosNormalizados,
      inconsistenciasDetalhadas,
      veiculosTransporte,
      veiculosApoio,
    };
  } catch (error) {
    console.error("[INTELIGENCIA][consistencia][ERRO]", error);
    return {
      dadosNormalizados: normalizarDadosOperacionais(),
      inconsistenciasDetalhadas: [],
      veiculosTransporte: [],
      veiculosApoio: [],
    };
  }
};

module.exports = {
  normalizarDadosOperacionais,
  validarConsistenciaPorVeiculo,
  formatarInconsistenciaVeiculo,
  mergeInconsistencias,
  analisarConsistenciaVeiculos,
};
