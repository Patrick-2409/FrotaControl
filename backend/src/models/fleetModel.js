const { pool } = require("../db");

/**
 * Resumo operacional da frota (consultas agregadas leves).
 */
async function getFleetSummary(empresa_id) {
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
    pool.query(`SELECT COUNT(*)::int AS c FROM veiculos WHERE empresa_id = $1`, [empresa_id]),
    pool.query(
      `SELECT status_operacional, COUNT(*)::int AS c
       FROM veiculos WHERE empresa_id = $1
       GROUP BY status_operacional`,
      [empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM veiculos
       WHERE empresa_id = $1 AND status_operacional IN ('ativo', 'operacao')`,
      [empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM veiculos
       WHERE empresa_id = $1
         AND (
           (doc_revisao_validade IS NOT NULL AND doc_revisao_validade <= CURRENT_DATE + INTERVAL '45 days')
           OR (doc_licenciamento_validade IS NOT NULL AND doc_licenciamento_validade <= CURRENT_DATE + INTERVAL '45 days')
           OR (doc_seguro_validade IS NOT NULL AND doc_seguro_validade <= CURRENT_DATE + INTERVAL '45 days')
           OR (doc_inspecao_validade IS NOT NULL AND doc_inspecao_validade <= CURRENT_DATE + INTERVAL '45 days')
         )`,
      [empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM veiculos
       WHERE empresa_id = $1
         AND (
           status_operacional = 'manutencao'
           OR (manutencao_agendar_ate IS NOT NULL AND manutencao_agendar_ate <= CURRENT_DATE + INTERVAL '30 days')
         )`,
      [empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM veiculo_manutencoes WHERE empresa_id = $1`,
      [empresa_id]
    ),
    pool.query(
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
      [empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM veiculos v
       WHERE v.empresa_id = $1
         AND v.created_at < NOW() - INTERVAL '14 days'
         AND NOT EXISTS (
           SELECT 1 FROM romaneios r WHERE r.veiculo_id = v.id AND r.empresa_id = v.empresa_id AND r.data >= NOW() - INTERVAL '14 days'
         )
         AND NOT EXISTS (
           SELECT 1 FROM combustiveis c WHERE c.veiculo_id = v.id AND c.empresa_id = v.empresa_id AND c.data >= NOW() - INTERVAL '14 days'
         )
         AND NOT EXISTS (
           SELECT 1 FROM parte_diaria p WHERE p.veiculo_id = v.id AND p.empresa_id = v.empresa_id AND p.data >= NOW() - INTERVAL '14 days'
         )`,
      [empresa_id]
    ),
  ]);

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
  const { rows } = await pool.query(
    `SELECT m.* FROM veiculo_manutencoes m
     INNER JOIN veiculos v ON v.id = m.veiculo_id AND v.empresa_id = m.empresa_id
     WHERE m.empresa_id = $1 AND m.veiculo_id = $2
     ORDER BY m.data_servico DESC, m.id DESC
     LIMIT $3`,
    [empresa_id, veiculo_id, lim]
  );
  return rows;
}

async function createMaintenance(empresa_id, veiculo_id, row) {
  const { rows } = await pool.query(
    `INSERT INTO veiculo_manutencoes (empresa_id, veiculo_id, tipo, titulo, descricao, custo, data_servico, odometro_snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
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
  const r = await pool.query(
    `DELETE FROM veiculo_manutencoes WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    [id, empresa_id]
  );
  return r.rowCount > 0;
}

async function assertVehicleOwned(empresa_id, veiculo_id) {
  const { rows } = await pool.query(`SELECT id FROM veiculos WHERE id = $1 AND empresa_id = $2`, [
    veiculo_id,
    empresa_id,
  ]);
  return Boolean(rows[0]);
}

module.exports = {
  getFleetSummary,
  listMaintenance,
  createMaintenance,
  deleteMaintenance,
  assertVehicleOwned,
};
