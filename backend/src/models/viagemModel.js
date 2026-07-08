const { pool } = require("../db");
const {
  MATERIAL_CAPACITY_SQL,
  ROCHA_TIPOS_SQL,
  rochaTotalTonSql,
} = require("../utils/transportMaterialSql");

const CAPACIDADE_ESTERIL_SQL = MATERIAL_CAPACITY_SQL.esteril;
const CAPACIDADE_ROCHA_SQL = MATERIAL_CAPACITY_SQL.rocha;
const CAPACIDADE_ROCHA_PULMAO_SQL = MATERIAL_CAPACITY_SQL.rocha_pulmao;
const CAPACIDADE_ROCHA_ARMACAO_SQL = MATERIAL_CAPACITY_SQL.rocha_armacao;

const insertViagem = async (
  { empresa_id, veiculo_id, motorista_id, apontador_id = null, tipo, marcacao },
  db = pool
) => {
  const { rows } = await db.query(
    `INSERT INTO viagens (empresa_id, veiculo_id, motorista_id, apontador_id, tipo, marcacao)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, empresa_id, veiculo_id, motorista_id, apontador_id, tipo, marcacao, created_at`,
    [empresa_id, veiculo_id, motorista_id, apontador_id, tipo, marcacao]
  );
  return rows[0];
};

/**
 * Agrega viagens por tipo e toneladas (capacidade do veículo no momento do join).
 * @param {number} empresa_id
 * @param {{ start?: string, end?: string }} bounds - ISO timestamptz bounds [start, end)
 */
const getViagensResumoProducao = async (empresa_id, bounds = {}, db = pool) => {
  let sql = `
    SELECT
      COUNT(*) FILTER (WHERE vi.tipo = 'esteril')::int AS total_viagens_esteril,
      COUNT(*) FILTER (WHERE vi.tipo = 'rocha_pulmao')::int AS total_viagens_rocha_pulmao,
      COUNT(*) FILTER (WHERE vi.tipo IN ('rocha_armacao', 'rocha'))::int AS total_viagens_rocha_armacao,
      COUNT(*) FILTER (WHERE vi.tipo IN (${ROCHA_TIPOS_SQL}))::int AS total_viagens_rocha,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo = 'esteril' AND COALESCE(v.usa_para_transporte, false) = true
            THEN ${CAPACIDADE_ESTERIL_SQL}
            ELSE 0
          END
        ),
        0
      )::double precision AS total_toneladas_esteril,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo = 'rocha_pulmao' AND COALESCE(v.usa_para_transporte, false) = true
            THEN ${CAPACIDADE_ROCHA_PULMAO_SQL}
            ELSE 0
          END
        ),
        0
      )::double precision AS total_toneladas_rocha_pulmao,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo IN ('rocha_armacao', 'rocha') AND COALESCE(v.usa_para_transporte, false) = true
            THEN CASE
              WHEN vi.tipo = 'rocha_armacao' THEN ${CAPACIDADE_ROCHA_ARMACAO_SQL}
              ELSE ${CAPACIDADE_ROCHA_SQL}
            END
            ELSE 0
          END
        ),
        0
      )::double precision AS total_toneladas_rocha_armacao,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo IN (${ROCHA_TIPOS_SQL}) AND COALESCE(v.usa_para_transporte, false) = true
            THEN ${rochaTotalTonSql("vi.tipo")}
            ELSE 0
          END
        ),
        0
      )::double precision AS total_toneladas_rocha
    FROM viagens vi
    INNER JOIN veiculos v ON v.id = vi.veiculo_id AND v.empresa_id = vi.empresa_id
    WHERE vi.empresa_id = $1`;
  const params = [empresa_id];
  if (bounds.start != null && bounds.end != null) {
    sql += ` AND vi.marcacao >= $2::timestamptz AND vi.marcacao < $3::timestamptz`;
    params.push(bounds.start, bounds.end);
  }
  const { rows } = await db.query(sql, params);
  return rows[0];
};

/** Contagem de viagens do dia corrente no fuso America/Sao_Paulo, com toneladas aproximadas (capacidade × viagens). */
const countViagensHojeEmpresaSaoPaulo = async (empresa_id, db = pool) => {
  const { rows } = await db.query(
    `SELECT
      COALESCE(COUNT(*) FILTER (WHERE vi.tipo = 'esteril'), 0)::int AS esteril,
      COALESCE(COUNT(*) FILTER (WHERE vi.tipo = 'rocha_pulmao'), 0)::int AS rocha_pulmao,
      COALESCE(COUNT(*) FILTER (WHERE vi.tipo IN ('rocha_armacao', 'rocha')), 0)::int AS rocha_armacao,
      COALESCE(COUNT(*) FILTER (WHERE vi.tipo IN (${ROCHA_TIPOS_SQL})), 0)::int AS rocha,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo = 'esteril' AND COALESCE(v.usa_para_transporte, false) = true
            THEN ${CAPACIDADE_ESTERIL_SQL}
            ELSE 0
          END
        ),
        0
      )::double precision AS ton_esteril,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo = 'rocha_pulmao' AND COALESCE(v.usa_para_transporte, false) = true
            THEN ${CAPACIDADE_ROCHA_PULMAO_SQL}
            ELSE 0
          END
        ),
        0
      )::double precision AS ton_rocha_pulmao,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo IN ('rocha_armacao', 'rocha') AND COALESCE(v.usa_para_transporte, false) = true
            THEN CASE
              WHEN vi.tipo = 'rocha_armacao' THEN ${CAPACIDADE_ROCHA_ARMACAO_SQL}
              ELSE ${CAPACIDADE_ROCHA_SQL}
            END
            ELSE 0
          END
        ),
        0
      )::double precision AS ton_rocha_armacao,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo IN (${ROCHA_TIPOS_SQL}) AND COALESCE(v.usa_para_transporte, false) = true
            THEN ${rochaTotalTonSql("vi.tipo")}
            ELSE 0
          END
        ),
        0
      )::double precision AS ton_rocha
     FROM viagens vi
     INNER JOIN veiculos v ON v.id = vi.veiculo_id AND v.empresa_id = vi.empresa_id
     WHERE vi.empresa_id = $1
       AND (vi.marcacao AT TIME ZONE 'America/Sao_Paulo')::date
         = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date`,
    [empresa_id]
  );
  const row = rows[0];
  const te = Number(row?.ton_esteril) || 0;
  const trp = Number(row?.ton_rocha_pulmao) || 0;
  const tra = Number(row?.ton_rocha_armacao) || 0;
  const tr = Number(row?.ton_rocha) || 0;
  return {
    esteril: row?.esteril ?? 0,
    rocha_pulmao: row?.rocha_pulmao ?? 0,
    rocha_armacao: row?.rocha_armacao ?? 0,
    rocha: row?.rocha ?? 0,
    ton_esteril: te,
    ton_rocha_pulmao: trp,
    ton_rocha_armacao: tra,
    ton_rocha: tr,
    ton_total: te + tr,
  };
};

/** Contagem de viagens do dia corrente por apontador (isolamento empresa + apontador). */
const countViagensHojeApontadorSaoPaulo = async (empresa_id, apontador_id, db = pool) => {
  const { rows } = await db.query(
    `SELECT
      COALESCE(COUNT(*) FILTER (WHERE vi.tipo = 'esteril'), 0)::int AS esteril,
      COALESCE(COUNT(*) FILTER (WHERE vi.tipo = 'rocha_pulmao'), 0)::int AS rocha_pulmao,
      COALESCE(COUNT(*) FILTER (WHERE vi.tipo IN ('rocha_armacao', 'rocha')), 0)::int AS rocha_armacao,
      COALESCE(COUNT(*) FILTER (WHERE vi.tipo IN (${ROCHA_TIPOS_SQL})), 0)::int AS rocha,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo = 'esteril' AND COALESCE(v.usa_para_transporte, false) = true
            THEN ${CAPACIDADE_ESTERIL_SQL}
            ELSE 0
          END
        ),
        0
      )::double precision AS ton_esteril,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo = 'rocha_pulmao' AND COALESCE(v.usa_para_transporte, false) = true
            THEN ${CAPACIDADE_ROCHA_PULMAO_SQL}
            ELSE 0
          END
        ),
        0
      )::double precision AS ton_rocha_pulmao,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo IN ('rocha_armacao', 'rocha') AND COALESCE(v.usa_para_transporte, false) = true
            THEN CASE
              WHEN vi.tipo = 'rocha_armacao' THEN ${CAPACIDADE_ROCHA_ARMACAO_SQL}
              ELSE ${CAPACIDADE_ROCHA_SQL}
            END
            ELSE 0
          END
        ),
        0
      )::double precision AS ton_rocha_armacao,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo IN (${ROCHA_TIPOS_SQL}) AND COALESCE(v.usa_para_transporte, false) = true
            THEN ${rochaTotalTonSql("vi.tipo")}
            ELSE 0
          END
        ),
        0
      )::double precision AS ton_rocha
     FROM viagens vi
     INNER JOIN veiculos v ON v.id = vi.veiculo_id AND v.empresa_id = vi.empresa_id
     WHERE vi.empresa_id = $1
       AND vi.apontador_id = $2
       AND (vi.marcacao AT TIME ZONE 'America/Sao_Paulo')::date
         = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date`,
    [empresa_id, apontador_id]
  );
  const row = rows[0];
  const te = Number(row?.ton_esteril) || 0;
  const trp = Number(row?.ton_rocha_pulmao) || 0;
  const tra = Number(row?.ton_rocha_armacao) || 0;
  const tr = Number(row?.ton_rocha) || 0;
  return {
    esteril: row?.esteril ?? 0,
    rocha_pulmao: row?.rocha_pulmao ?? 0,
    rocha_armacao: row?.rocha_armacao ?? 0,
    rocha: row?.rocha ?? 0,
    ton_esteril: te,
    ton_rocha_pulmao: trp,
    ton_rocha_armacao: tra,
    ton_rocha: tr,
    ton_total: te + tr,
  };
};

/**
 * Lista os últimos lançamentos do dia corrente no fuso America/Sao_Paulo.
 * @param {number} empresa_id
 * @param {number} limit
 */
const listRecentViagensHojeEmpresaSaoPaulo = async (empresa_id, limit = 5, db = pool) => {
  const parsedLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const { rows } = await db.query(
    `SELECT id, tipo, marcacao
     FROM viagens
     WHERE empresa_id = $1
       AND (marcacao AT TIME ZONE 'America/Sao_Paulo')::date
         = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
     ORDER BY marcacao DESC
     LIMIT $2`,
    [empresa_id, parsedLimit]
  );
  return rows;
};

/**
 * Lista os últimos lançamentos do dia corrente no fuso America/Sao_Paulo por apontador.
 * @param {number} empresa_id
 * @param {number} apontador_id
 * @param {number} limit
 */
const listRecentViagensHojeApontadorSaoPaulo = async (empresa_id, apontador_id, limit = 5, db = pool) => {
  const parsedLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const { rows } = await db.query(
    `SELECT id, veiculo_id, motorista_id, tipo, marcacao
     FROM viagens
     WHERE empresa_id = $1
       AND apontador_id = $2
       AND (marcacao AT TIME ZONE 'America/Sao_Paulo')::date
         = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
     ORDER BY marcacao DESC
     LIMIT $3`,
    [empresa_id, apontador_id, parsedLimit]
  );
  return rows;
};

const saoPauloLocalMidnightUtcIso = (y, m0, d) =>
  new Date(Date.UTC(y, m0, d, 3, 0, 0, 0)).toISOString();

/**
 * Limites [start,end) em ISO UTC a partir de datas YYYY-MM-DD inclusivas.
 * As datas representam o dia civil operacional em America/Sao_Paulo.
 */
const utcBoundsFromDateRangeYmd = (data_inicio_ymd, data_fim_ymd) => {
  const parse = (ymd) => {
    const p = String(ymd).trim().split("-").map(Number);
    if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null;
    return { y: p[0], m: p[1], d: p[2] };
  };
  const a = parse(data_inicio_ymd);
  const b = parse(data_fim_ymd);
  if (!a || !b) return null;
  return {
    start: saoPauloLocalMidnightUtcIso(a.y, a.m - 1, a.d),
    end: saoPauloLocalMidnightUtcIso(b.y, b.m - 1, b.d + 1),
  };
};

/**
 * Viagens agregadas por veículo e dia civil (America/Sao_Paulo) — exportações tipo Porto.
 * @param {number} empresa_id
 * @param {string} startIso
 * @param {string} endIso
 */
const listViagensByVehicleDay = async (empresa_id, startIso, endIso, db = pool) => {
  const { rows } = await db.query(
    `SELECT v.id AS veiculo_id,
            v.nome AS veiculo_nome,
            v.placa,
            ${CAPACIDADE_ESTERIL_SQL}::double precision AS ton_esteril,
            ${CAPACIDADE_ROCHA_PULMAO_SQL}::double precision AS ton_rocha_pulmao,
            ${CAPACIDADE_ROCHA_ARMACAO_SQL}::double precision AS ton_rocha_armacao,
            ${CAPACIDADE_ROCHA_SQL}::double precision AS ton_rocha,
            (vi.marcacao AT TIME ZONE 'America/Sao_Paulo')::date AS dia_local,
            COUNT(*) FILTER (WHERE vi.tipo = 'esteril')::int AS esteril,
            COUNT(*) FILTER (WHERE vi.tipo = 'rocha_pulmao')::int AS rocha_pulmao,
            COUNT(*) FILTER (WHERE vi.tipo IN ('rocha_armacao', 'rocha'))::int AS rocha_armacao,
            COUNT(*) FILTER (WHERE vi.tipo IN (${ROCHA_TIPOS_SQL}))::int AS rocha
     FROM viagens vi
     INNER JOIN veiculos v ON v.id = vi.veiculo_id AND v.empresa_id = vi.empresa_id
     WHERE vi.empresa_id = $1
       AND vi.marcacao >= $2::timestamptz
       AND vi.marcacao < $3::timestamptz
     GROUP BY v.id, v.nome, v.placa,
       v.capacidade_ton, v.capacidade_esteril_ton, v.capacidade_rocha_ton, v.capacidade_rocha_pulmao_ton, v.capacidade_rocha_armacao_ton,
       v.transporta_esteril, v.transporta_rocha, v.transporta_rocha_pulmao, v.transporta_rocha_armacao,
       (vi.marcacao AT TIME ZONE 'America/Sao_Paulo')::date
     ORDER BY v.nome, dia_local`,
    [empresa_id, startIso, endIso]
  );
  return rows;
};

const todaySaoPauloClause = `(marcacao AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date`;

/**
 * Remove uma viagem do apontador: por id (se fornecido) ou a mais recente do dia
 * que coincida com veículo, motorista, tipo e marcação temporal (~15s).
 * @param {{ empresa_id: number, apontador_id: number, veiculo_id: number, motorista_id: number, tipo: string, timestamp_ms: number, viagem_id?: number|null }} p
 */
const deleteViagemApontadorMatch = async (
  { empresa_id, apontador_id, veiculo_id, motorista_id, tipo, timestamp_ms, viagem_id },
  db = pool
) => {
  if (viagem_id != null && Number.isFinite(Number(viagem_id))) {
    const { rows } = await db.query(
      `DELETE FROM viagens
       WHERE id = $1 AND empresa_id = $2 AND apontador_id = $3
         AND ${todaySaoPauloClause}
       RETURNING id`,
      [viagem_id, empresa_id, apontador_id]
    );
    return rows[0] || null;
  }

  const { rows } = await db.query(
    `DELETE FROM viagens
     WHERE id = (
       SELECT v.id
       FROM viagens v
       WHERE v.empresa_id = $1
         AND v.apontador_id = $2
         AND v.veiculo_id = $3
         AND v.motorista_id = $4
         AND v.tipo = $5
         AND ${todaySaoPauloClause.replace(/marcacao/g, "v.marcacao")}
         AND ABS(EXTRACT(EPOCH FROM v.marcacao) * 1000 - $6::double precision) <= 15000
       ORDER BY ABS(EXTRACT(EPOCH FROM v.marcacao) * 1000 - $6::double precision) ASC, v.marcacao DESC
       LIMIT 1
     )
     RETURNING id`,
    [empresa_id, apontador_id, veiculo_id, motorista_id, tipo, timestamp_ms]
  );
  return rows[0] || null;
};

/** Apaga todas as viagens da empresa com data civil «hoje» em America/Sao_Paulo. */
const deleteViagensEmpresaDiaAtualSaoPaulo = async (empresa_id, db = pool) => {
  const r = await db.query(
    `DELETE FROM viagens
     WHERE empresa_id = $1
       AND (marcacao AT TIME ZONE 'America/Sao_Paulo')::date
         = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date`,
    [empresa_id]
  );
  return r.rowCount ?? 0;
};

/** Apaga viagens de hoje apenas do apontador autenticado (isolamento por perfil). */
const deleteViagensApontadorDiaAtualSaoPaulo = async ({ empresa_id, apontador_id }, db = pool) => {
  const r = await db.query(
    `DELETE FROM viagens
     WHERE empresa_id = $1
       AND apontador_id = $2
       AND (marcacao AT TIME ZONE 'America/Sao_Paulo')::date
         = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date`,
    [empresa_id, apontador_id]
  );
  return r.rowCount ?? 0;
};

module.exports = {
  insertViagem,
  getViagensResumoProducao,
  countViagensHojeEmpresaSaoPaulo,
  countViagensHojeApontadorSaoPaulo,
  listRecentViagensHojeEmpresaSaoPaulo,
  listRecentViagensHojeApontadorSaoPaulo,
  utcBoundsFromDateRangeYmd,
  listViagensByVehicleDay,
  deleteViagemApontadorMatch,
  deleteViagensEmpresaDiaAtualSaoPaulo,
  deleteViagensApontadorDiaAtualSaoPaulo,
};
