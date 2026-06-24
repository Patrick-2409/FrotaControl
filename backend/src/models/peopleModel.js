const { queryTimed } = require("../utils/queryTimed");

const USER_PROD_COLS = `u.id, u.nome, u.role, u.profile_image_url, u.funcao, u.veiculo_id`;
const VEHICLE_PROD_COLS = `v.placa AS veiculo_placa, v.nome AS veiculo_nome,
  COALESCE(
    NULLIF(TRIM(v.tipo_operacao), ''),
    CASE WHEN COALESCE(v.usa_para_transporte, false) THEN 'transporte' ELSE 'apoio' END
  ) AS tipo_operacao`;

/**
 * Indicadores agregados do módulo pessoas (empresa). Consultas leves com agregações únicas.
 */
async function getPeopleSummary(empresa_id) {
  const t0 = Date.now();
  const [
    rolesRow,
    statusRow,
    cnhRow,
    rom7Row,
    pd7Row,
    motSem7Row,
    baixaAtivRow,
  ] = await Promise.all([
    queryTimed(
      `SELECT
         COUNT(*) FILTER (WHERE role = 'MOTORISTA')::int AS motoristas,
         COUNT(*) FILTER (WHERE role = 'APONTADOR')::int AS apontadores,
         COUNT(*) FILTER (WHERE role = 'ADMIN_EMPRESA')::int AS admins
       FROM usuarios WHERE empresa_id = $1`,
      [empresa_id],
      { label: "pessoas-summary-roles" }
    ),
    queryTimed(
      `SELECT status_operacional, COUNT(*)::int AS c
       FROM usuarios
       WHERE empresa_id = $1 AND role IN ('MOTORISTA', 'APONTADOR')
       GROUP BY status_operacional`,
      [empresa_id],
      { label: "pessoas-summary-status" }
    ),
    queryTimed(
      `SELECT
         COUNT(*) FILTER (
           WHERE cnh_validade IS NOT NULL AND cnh_validade < CURRENT_DATE
         )::int AS vencidas,
         COUNT(*) FILTER (
           WHERE cnh_validade IS NOT NULL
             AND cnh_validade >= CURRENT_DATE
             AND cnh_validade <= CURRENT_DATE + INTERVAL '60 days'
         )::int AS vencendo,
         COUNT(*) FILTER (
           WHERE cnh_validade IS NOT NULL
             AND cnh_validade > CURRENT_DATE + INTERVAL '60 days'
         )::int AS validas
       FROM usuarios
       WHERE empresa_id = $1 AND role = 'MOTORISTA'`,
      [empresa_id],
      { label: "pessoas-summary-cnh" }
    ),
    queryTimed(
      `SELECT COUNT(*)::int AS c FROM romaneios
       WHERE empresa_id = $1 AND data >= NOW() - INTERVAL '7 days'`,
      [empresa_id],
      { label: "pessoas-summary-rom7" }
    ),
    queryTimed(
      `SELECT COUNT(*)::int AS c FROM parte_diaria
       WHERE empresa_id = $1 AND data >= NOW() - INTERVAL '7 days'`,
      [empresa_id],
      { label: "pessoas-summary-pd7" }
    ),
    queryTimed(
      `SELECT COUNT(*)::int AS c FROM usuarios u
       INNER JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
       WHERE u.empresa_id = $1 AND u.role = 'MOTORISTA'
         AND COALESCE(
           NULLIF(TRIM(v.tipo_operacao), ''),
           CASE WHEN COALESCE(v.usa_para_transporte, false) THEN 'transporte' ELSE 'apoio' END
         ) = 'transporte'
         AND NOT EXISTS (
           SELECT 1 FROM romaneios r
           WHERE r.usuario_id = u.id AND r.empresa_id = $1
             AND r.data >= NOW() - INTERVAL '7 days'
         )`,
      [empresa_id],
      { label: "pessoas-summary-sem-rom7" }
    ),
    queryTimed(
      `WITH rom_stats AS (
         SELECT usuario_id,
           COUNT(*) FILTER (WHERE data >= NOW() - INTERVAL '7 days')::int AS c7,
           COUNT(*) FILTER (
             WHERE data >= NOW() - INTERVAL '14 days' AND data < NOW() - INTERVAL '7 days'
           )::int AS cprev
         FROM romaneios
         WHERE empresa_id = $1 AND data >= NOW() - INTERVAL '14 days'
         GROUP BY usuario_id
       )
       SELECT COUNT(*)::int AS c
       FROM usuarios u
       INNER JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
       INNER JOIN rom_stats rs ON rs.usuario_id = u.id
       WHERE u.empresa_id = $1 AND u.role = 'MOTORISTA'
         AND COALESCE(
           NULLIF(TRIM(v.tipo_operacao), ''),
           CASE WHEN COALESCE(v.usa_para_transporte, false) THEN 'transporte' ELSE 'apoio' END
         ) = 'transporte'
         AND rs.c7 < 0.4 * COALESCE(NULLIF(rs.cprev, 0), 0)
         AND COALESCE(rs.cprev, 0) >= 3`,
      [empresa_id],
      { label: "pessoas-summary-baixa-atividade" }
    ),
  ]);

  if (process.env.NODE_ENV !== "production") {
    console.log(`[getPeopleSummary] empresa=${empresa_id} ${Date.now() - t0}ms`);
  }

  const porStatus = {};
  for (const r of statusRow.rows) {
    porStatus[r.status_operacional] = Number(r.c);
  }

  return {
    motoristas: Number(rolesRow.rows[0]?.motoristas ?? 0),
    apontadores: Number(rolesRow.rows[0]?.apontadores ?? 0),
    admins_empresa: Number(rolesRow.rows[0]?.admins ?? 0),
    por_status: porStatus,
    cnh_vencidas: Number(cnhRow.rows[0]?.vencidas ?? 0),
    cnh_vencendo: Number(cnhRow.rows[0]?.vencendo ?? 0),
    cnh_validas: Number(cnhRow.rows[0]?.validas ?? 0),
    cnh_janela_60d:
      Number(cnhRow.rows[0]?.vencidas ?? 0) + Number(cnhRow.rows[0]?.vencendo ?? 0),
    romaneios_7d: Number(rom7Row.rows[0]?.c ?? 0),
    parte_diaria_7d: Number(pd7Row.rows[0]?.c ?? 0),
    motoristas_sem_romaneio_7d: Number(motSem7Row.rows[0]?.c ?? 0),
    motoristas_baixa_atividade: Number(baixaAtivRow.rows[0]?.c ?? 0),
  };
}

/**
 * Produtividade por pessoa — agregações em JOIN (sem subquery correlacionada por linha).
 * with_7d: inclui romaneios_7d / partes_diaria_7d na mesma consulta (evita 2ª requisição).
 */
async function getPeopleProductivity(empresa_id, { days = 30, limit = 40, with_7d = false } = {}) {
  const d = Math.min(90, Math.max(7, Number(days) || 30));
  const lim = Math.min(50, Math.max(5, Number(limit) || 40));
  const dual = Boolean(with_7d);

  const metricsSelect = dual
    ? `COALESCE(r.c_d, 0)::int AS romaneios,
       COALESCE(r.c_7, 0)::int AS romaneios_7d,
       COALESCE(p.c_d, 0)::int AS partes_diaria,
       COALESCE(p.c_7, 0)::int AS partes_diaria_7d`
    : `COALESCE(r.c_d, 0)::int AS romaneios,
       COALESCE(p.c_d, 0)::int AS partes_diaria`;

  const romAgg = dual
    ? `SELECT usuario_id,
         COUNT(*) FILTER (WHERE data >= NOW() - ($2::int * INTERVAL '1 day'))::int AS c_d,
         COUNT(*) FILTER (WHERE data >= NOW() - INTERVAL '7 days')::int AS c_7
       FROM romaneios
       WHERE empresa_id = $1 AND data >= NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY usuario_id`
    : `SELECT usuario_id, COUNT(*)::int AS c_d
       FROM romaneios
       WHERE empresa_id = $1 AND data >= NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY usuario_id`;

  const pdAgg = dual
    ? `SELECT usuario_id,
         COUNT(*) FILTER (WHERE data >= NOW() - ($2::int * INTERVAL '1 day'))::int AS c_d,
         COUNT(*) FILTER (WHERE data >= NOW() - INTERVAL '7 days')::int AS c_7
       FROM parte_diaria
       WHERE empresa_id = $1 AND data >= NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY usuario_id`
    : `SELECT usuario_id, COUNT(*)::int AS c_d
       FROM parte_diaria
       WHERE empresa_id = $1 AND data >= NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY usuario_id`;

  const t0 = Date.now();
  const { rows } = await queryTimed(
    `SELECT ${USER_PROD_COLS}, ${VEHICLE_PROD_COLS}, ${metricsSelect}
     FROM usuarios u
     LEFT JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
     LEFT JOIN (${romAgg}) r ON r.usuario_id = u.id
     LEFT JOIN (${pdAgg}) p ON p.usuario_id = u.id
     WHERE u.empresa_id = $1 AND u.role IN ('MOTORISTA', 'APONTADOR')
     ORDER BY COALESCE(r.c_d, 0) DESC, u.nome ASC
     LIMIT $3`,
    [empresa_id, d, lim],
    { label: dual ? "pessoas-prod-dual" : "pessoas-prod" }
  );

  if (process.env.NODE_ENV !== "production") {
    console.log(`[getPeopleProductivity] empresa=${empresa_id} days=${d} ${Date.now() - t0}ms`);
  }
  return rows;
}

module.exports = {
  getPeopleSummary,
  getPeopleProductivity,
};
