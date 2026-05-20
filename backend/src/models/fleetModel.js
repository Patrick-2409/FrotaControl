const { queryTimed } = require("../utils/queryTimed");

/**
 * Resumo operacional da frota (consultas agregadas leves).
 */
async function getFleetSummary(empresa_id) {
  const t0 = Date.now();
  const [
    totalRow,
    statusRows,
    dispRow,
    docRow,
    manutRow,
    manutHistRow,
    consumoRow,
    inativosRow,
  ] = await Promise.all([
    queryTimed(`SELECT COUNT(*)::int AS c FROM veiculos WHERE empresa_id = $1`, [empresa_id], {
      label: "frota-summary-total",
    }),
    queryTimed(
      `SELECT status_operacional, COUNT(*)::int AS c
       FROM veiculos WHERE empresa_id = $1
       GROUP BY status_operacional`,
      [empresa_id],
      { label: "frota-summary-status" }
    ),
    queryTimed(
      `SELECT COUNT(*)::int AS c FROM veiculos
       WHERE empresa_id = $1 AND status_operacional IN ('ativo', 'operacao')`,
      [empresa_id],
      { label: "frota-summary-disp" }
    ),
    queryTimed(
      `SELECT COUNT(*)::int AS c FROM veiculos
       WHERE empresa_id = $1
         AND (
           (doc_revisao_validade IS NOT NULL AND doc_revisao_validade <= CURRENT_DATE + INTERVAL '45 days')
           OR (doc_licenciamento_validade IS NOT NULL AND doc_licenciamento_validade <= CURRENT_DATE + INTERVAL '45 days')
           OR (doc_seguro_validade IS NOT NULL AND doc_seguro_validade <= CURRENT_DATE + INTERVAL '45 days')
           OR (doc_inspecao_validade IS NOT NULL AND doc_inspecao_validade <= CURRENT_DATE + INTERVAL '45 days')
         )`,
      [empresa_id],
      { label: "frota-summary-doc" }
    ),
    queryTimed(
      `SELECT COUNT(*)::int AS c FROM veiculos
       WHERE empresa_id = $1
         AND (
           status_operacional = 'manutencao'
           OR (manutencao_agendar_ate IS NOT NULL AND manutencao_agendar_ate <= CURRENT_DATE + INTERVAL '30 days')
         )`,
      [empresa_id],
      { label: "frota-summary-manut" }
    ),
    queryTimed(
      `SELECT COUNT(*)::int AS c FROM veiculo_manutencoes WHERE empresa_id = $1`,
      [empresa_id],
      { label: "frota-summary-manut-hist" }
    ),
    queryTimed(
      `SELECT AVG(sub.lp100)::float8 AS litros_100km
       FROM (
         SELECT veiculo_id,
           CASE WHEN MAX(hodometro) - MIN(hodometro) > 5 THEN
             (SUM(litros) / NULLIF(MAX(hodometro) - MIN(hodometro), 0)) * 100.0
           END AS lp100
         FROM combustiveis
         WHERE empresa_id = $1
           AND data >= NOW() - INTERVAL '90 days'
           AND hodometro IS NOT NULL
         GROUP BY veiculo_id
       ) sub
       WHERE sub.lp100 IS NOT NULL AND sub.lp100 > 0 AND sub.lp100 < 800`,
      [empresa_id],
      { label: "frota-summary-consumo" }
    ),
    queryTimed(
      `WITH last_mov AS (
         SELECT veiculo_id, MAX(dt) AS last_dt
         FROM (
           SELECT veiculo_id, data AS dt FROM romaneios WHERE empresa_id = $1
           UNION ALL
           SELECT veiculo_id, data FROM combustiveis WHERE empresa_id = $1
           UNION ALL
           SELECT veiculo_id, data FROM parte_diaria
             WHERE empresa_id = $1 AND veiculo_id IS NOT NULL
         ) ev
         GROUP BY veiculo_id
       )
       SELECT COUNT(*)::int AS c FROM veiculos v
       LEFT JOIN last_mov lm ON lm.veiculo_id = v.id
       WHERE v.empresa_id = $1
         AND v.created_at < NOW() - INTERVAL '14 days'
         AND COALESCE(lm.last_dt, v.created_at) < NOW() - INTERVAL '14 days'`,
      [empresa_id],
      { label: "frota-summary-inativos" }
    ),
  ]);

  if (process.env.NODE_ENV !== "production") {
    console.log(`[getFleetSummary] empresa=${empresa_id} ${Date.now() - t0}ms`);
  }

  const byStatus = {};
  for (const r of statusRows.rows) {
    byStatus[r.status_operacional] = Number(r.c);
  }

  const consumo_medio_litros_100km =
    consumoRow.rows[0]?.litros_100km != null && Number.isFinite(Number(consumoRow.rows[0].litros_100km))
      ? Math.round(Number(consumoRow.rows[0].litros_100km) * 100) / 100
      : null;

  return {
    total_veiculos: Number(totalRow.rows[0]?.c ?? 0),
    disponiveis_operacao: Number(dispRow.rows[0]?.c ?? 0),
    por_status: byStatus,
    documentacao_janela_45d: Number(docRow.rows[0]?.c ?? 0),
    manutencao_fila_30d: Number(manutRow.rows[0]?.c ?? 0),
    manutencoes_registradas: Number(manutHistRow.rows[0]?.c ?? 0),
    consumo_medio_litros_100km,
    veiculos_sem_movimento_14d: Number(inativosRow.rows[0]?.c ?? 0),
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
  listMaintenance,
  createMaintenance,
  deleteMaintenance,
  assertVehicleOwned,
};
