const { pool } = require("../db");

/**
 * Indicadores agregados do módulo pessoas (empresa). Consultas leves.
 */
async function getPeopleSummary(empresa_id) {
  const [
    rolesRow,
    statusRow,
    cnhRow,
    rom7Row,
    pd7Row,
    motSem7Row,
    baixaAtivRow,
  ] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE role = 'MOTORISTA')::int AS motoristas,
         COUNT(*) FILTER (WHERE role = 'APONTADOR')::int AS apontadores,
         COUNT(*) FILTER (WHERE role = 'ADMIN_EMPRESA')::int AS admins
       FROM usuarios WHERE empresa_id = $1`,
      [empresa_id]
    ),
    pool.query(
      `SELECT status_operacional, COUNT(*)::int AS c
       FROM usuarios
       WHERE empresa_id = $1 AND role IN ('MOTORISTA', 'APONTADOR')
       GROUP BY status_operacional`,
      [empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM usuarios
       WHERE empresa_id = $1 AND role = 'MOTORISTA'
         AND cnh_validade IS NOT NULL
         AND cnh_validade <= CURRENT_DATE + INTERVAL '60 days'`,
      [empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM romaneios
       WHERE empresa_id = $1 AND data >= NOW() - INTERVAL '7 days'`,
      [empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM parte_diaria
       WHERE empresa_id = $1 AND data >= NOW() - INTERVAL '7 days'`,
      [empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM usuarios u
       WHERE u.empresa_id = $1 AND u.role = 'MOTORISTA'
         AND NOT EXISTS (
           SELECT 1 FROM romaneios r
           WHERE r.usuario_id = u.id AND r.empresa_id = u.empresa_id
             AND r.data >= NOW() - INTERVAL '7 days'
         )`,
      [empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM usuarios u
       WHERE u.empresa_id = $1
         AND u.role = 'MOTORISTA'
         AND (
           SELECT COUNT(*)
           FROM romaneios r
           WHERE r.usuario_id = u.id AND r.empresa_id = u.empresa_id
             AND r.data >= NOW() - INTERVAL '7 days'
         ) <
         0.4 * COALESCE(
           (
             SELECT COUNT(*)
             FROM romaneios r
             WHERE r.usuario_id = u.id AND r.empresa_id = u.empresa_id
               AND r.data >= NOW() - INTERVAL '14 days'
               AND r.data < NOW() - INTERVAL '7 days'
           ),
           0
         )
         AND COALESCE(
           (
             SELECT COUNT(*)
             FROM romaneios r
             WHERE r.usuario_id = u.id AND r.empresa_id = u.empresa_id
               AND r.data >= NOW() - INTERVAL '14 days'
               AND r.data < NOW() - INTERVAL '7 days'
           ),
           0
         ) >= 3`,
      [empresa_id]
    ),
  ]);

  const porStatus = {};
  for (const r of statusRow.rows) {
    porStatus[r.status_operacional] = Number(r.c);
  }

  return {
    motoristas: Number(rolesRow.rows[0]?.motoristas ?? 0),
    apontadores: Number(rolesRow.rows[0]?.apontadores ?? 0),
    admins_empresa: Number(rolesRow.rows[0]?.admins ?? 0),
    por_status: porStatus,
    cnh_janela_60d: Number(cnhRow.rows[0]?.c ?? 0),
    romaneios_7d: Number(rom7Row.rows[0]?.c ?? 0),
    parte_diaria_7d: Number(pd7Row.rows[0]?.c ?? 0),
    motoristas_sem_romaneio_7d: Number(motSem7Row.rows[0]?.c ?? 0),
    motoristas_baixa_atividade: Number(baixaAtivRow.rows[0]?.c ?? 0),
  };
}

async function getPeopleProductivity(empresa_id, { days = 30, limit = 40 } = {}) {
  const d = Math.min(90, Math.max(7, Number(days) || 30));
  const lim = Math.min(100, Math.max(5, Number(limit) || 40));
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.role, u.profile_image_url, u.funcao, u.veiculo_id,
       v.placa AS veiculo_placa, v.nome AS veiculo_nome,
       (SELECT COUNT(*)::int FROM romaneios r
         WHERE r.usuario_id = u.id AND r.empresa_id = u.empresa_id
           AND r.data >= NOW() - ($2::int * INTERVAL '1 day')) AS romaneios,
       (SELECT COUNT(*)::int FROM parte_diaria p
         WHERE p.usuario_id = u.id AND p.empresa_id = u.empresa_id
           AND p.data >= NOW() - ($2::int * INTERVAL '1 day')) AS partes_diaria
     FROM usuarios u
     LEFT JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
     WHERE u.empresa_id = $1 AND u.role IN ('MOTORISTA', 'APONTADOR')
     ORDER BY
       (SELECT COUNT(*) FROM romaneios r
         WHERE r.usuario_id = u.id AND r.empresa_id = u.empresa_id
           AND r.data >= NOW() - ($2::int * INTERVAL '1 day')) DESC NULLS LAST,
       u.nome ASC
     LIMIT $3`,
    [empresa_id, d, lim]
  );
  return rows;
}

module.exports = {
  getPeopleSummary,
  getPeopleProductivity,
};
