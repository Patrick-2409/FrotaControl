const { queryTimed } = require("../utils/queryTimed");

const EMPTY_FLEET_SUMMARY = () => ({
  total_veiculos: 0,
  disponiveis_operacao: 0,
  por_status: {},
  documentacao_janela_45d: 0,
  manutencao_fila_30d: 0,
  manutencoes_registradas: 0,
  consumo_medio_litros_100km: null,
  veiculos_sem_movimento_14d: null,
});

/**
 * Resumo operacional da frota — poucas consultas agregadas (sem scan de combustível/romaneio).
 */
async function getFleetSummary(empresa_id) {
  const t0 = Date.now();
  const [aggRow, statusRows, manutHistRow] = await Promise.all([
    queryTimed(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status_operacional IN ('ativo', 'operacao'))::int AS disponiveis,
         COUNT(*) FILTER (
           WHERE status_operacional = 'manutencao'
              OR (manutencao_agendar_ate IS NOT NULL AND manutencao_agendar_ate <= CURRENT_DATE + INTERVAL '30 days')
         )::int AS manut_fila,
         COUNT(*) FILTER (
           WHERE (doc_revisao_validade IS NOT NULL AND doc_revisao_validade <= CURRENT_DATE + INTERVAL '45 days')
              OR (doc_licenciamento_validade IS NOT NULL AND doc_licenciamento_validade <= CURRENT_DATE + INTERVAL '45 days')
              OR (doc_seguro_validade IS NOT NULL AND doc_seguro_validade <= CURRENT_DATE + INTERVAL '45 days')
              OR (doc_inspecao_validade IS NOT NULL AND doc_inspecao_validade <= CURRENT_DATE + INTERVAL '45 days')
         )::int AS doc_janela
       FROM veiculos
       WHERE empresa_id = $1`,
      [empresa_id],
      { label: "frota-summary-agg", timeoutMs: 6000 }
    ),
    queryTimed(
      `SELECT status_operacional, COUNT(*)::int AS c
       FROM veiculos WHERE empresa_id = $1
       GROUP BY status_operacional`,
      [empresa_id],
      { label: "frota-summary-status", timeoutMs: 5000 }
    ),
    queryTimed(
      `SELECT COUNT(*)::int AS c FROM veiculo_manutencoes WHERE empresa_id = $1`,
      [empresa_id],
      { label: "frota-summary-manut-hist", timeoutMs: 5000 }
    ),
  ]);

  if (process.env.NODE_ENV !== "production") {
    console.log(`[getFleetSummary] empresa=${empresa_id} ${Date.now() - t0}ms`);
  }

  const agg = aggRow.rows[0] || {};
  const byStatus = {};
  for (const r of statusRows.rows) {
    byStatus[r.status_operacional] = Number(r.c);
  }

  return {
    total_veiculos: Number(agg.total ?? 0),
    disponiveis_operacao: Number(agg.disponiveis ?? 0),
    por_status: byStatus,
    documentacao_janela_45d: Number(agg.doc_janela ?? 0),
    manutencao_fila_30d: Number(agg.manut_fila ?? 0),
    manutencoes_registradas: Number(manutHistRow.rows[0]?.c ?? 0),
    consumo_medio_litros_100km: null,
    veiculos_sem_movimento_14d: null,
  };
}

async function listMaintenance(empresa_id, veiculo_id, { limit = 50 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const { rows } = await queryTimed(
    `SELECT m.id, m.empresa_id, m.veiculo_id, m.tipo, m.titulo, m.descricao, m.custo,
            m.data_servico, m.odometro_snapshot, m.created_at
     FROM veiculo_manutencoes m
     INNER JOIN veiculos v ON v.id = m.veiculo_id AND v.empresa_id = m.empresa_id
     WHERE m.empresa_id = $1 AND m.veiculo_id = $2
     ORDER BY m.data_servico DESC, m.id DESC
     LIMIT $3`,
    [empresa_id, veiculo_id, lim],
    { label: "frota-manut-list" }
  );
  return rows;
}

async function createMaintenance(empresa_id, veiculo_id, row) {
  const { pool } = require("../db");
  const { rows } = await pool.query(
    `INSERT INTO veiculo_manutencoes (empresa_id, veiculo_id, tipo, titulo, descricao, custo, data_servico, odometro_snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, empresa_id, veiculo_id, tipo, titulo, descricao, custo, data_servico, odometro_snapshot, created_at`,
    [
      empresa_id,
      veiculo_id,
      row.tipo,
      row.titulo,
      row.descricao ?? null,
      row.custo ?? null,
      row.data_servico,
      row.odometro_snapshot ?? null,
    ]
  );
  return rows[0];
}

async function deleteMaintenance(empresa_id, id) {
  const { pool } = require("../db");
  const r = await pool.query(
    `DELETE FROM veiculo_manutencoes WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    [id, empresa_id]
  );
  return r.rowCount > 0;
}

async function assertVehicleOwned(empresa_id, veiculo_id) {
  const { rows } = await queryTimed(
    `SELECT id FROM veiculos WHERE id = $1 AND empresa_id = $2`,
    [veiculo_id, empresa_id],
    { label: "frota-assert-vehicle" }
  );
  return Boolean(rows[0]);
}

module.exports = {
  getFleetSummary,
  EMPTY_FLEET_SUMMARY,
  listMaintenance,
  createMaintenance,
  deleteMaintenance,
  assertVehicleOwned,
};
