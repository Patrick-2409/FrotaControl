const { pool } = require("../db");

const insertViagem = async (
  { empresa_id, veiculo_id, motorista_id, tipo, marcacao },
  db = pool
) => {
  const { rows } = await db.query(
    `INSERT INTO viagens (empresa_id, veiculo_id, motorista_id, tipo, marcacao)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, empresa_id, veiculo_id, motorista_id, tipo, marcacao, created_at`,
    [empresa_id, veiculo_id, motorista_id, tipo, marcacao]
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
      COUNT(*) FILTER (WHERE vi.tipo = 'rocha')::int AS total_viagens_rocha,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo = 'esteril' AND COALESCE(v.usa_para_transporte, false) = true
            THEN COALESCE(v.capacidade_ton, 0)
            ELSE 0
          END
        ),
        0
      )::double precision AS total_toneladas_esteril,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo = 'rocha' AND COALESCE(v.usa_para_transporte, false) = true
            THEN COALESCE(v.capacidade_ton, 0)
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
      COALESCE(COUNT(*) FILTER (WHERE vi.tipo = 'rocha'), 0)::int AS rocha,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo = 'esteril' AND COALESCE(v.usa_para_transporte, false) = true
            THEN COALESCE(v.capacidade_ton, 0)
            ELSE 0
          END
        ),
        0
      )::double precision AS ton_esteril,
      COALESCE(
        SUM(
          CASE
            WHEN vi.tipo = 'rocha' AND COALESCE(v.usa_para_transporte, false) = true
            THEN COALESCE(v.capacidade_ton, 0)
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
  const tr = Number(row?.ton_rocha) || 0;
  return {
    esteril: row?.esteril ?? 0,
    rocha: row?.rocha ?? 0,
    ton_esteril: te,
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

/** Limites [start,end) em ISO UTC a partir de datas YYYY-MM-DD inclusive (fim = dia seguinte ao data_fim). */
const utcBoundsFromDateRangeYmd = (data_inicio_ymd, data_fim_ymd) => {
  const parse = (ymd) => {
    const p = String(ymd).trim().split("-").map(Number);
    if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null;
    return { y: p[0], m: p[1], d: p[2] };
  };
  const a = parse(data_inicio_ymd);
  const b = parse(data_fim_ymd);
  if (!a || !b) return null;
  const start = new Date(Date.UTC(a.y, a.m - 1, a.d, 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(b.y, b.m - 1, b.d + 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: endDay.toISOString() };
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
            COALESCE(v.capacidade_ton, 0)::double precision AS ton,
            (vi.marcacao AT TIME ZONE 'America/Sao_Paulo')::date AS dia_local,
            COUNT(*) FILTER (WHERE vi.tipo = 'esteril')::int AS esteril,
            COUNT(*) FILTER (WHERE vi.tipo = 'rocha')::int AS rocha
     FROM viagens vi
     INNER JOIN veiculos v ON v.id = vi.veiculo_id AND v.empresa_id = vi.empresa_id
     WHERE vi.empresa_id = $1
       AND vi.marcacao >= $2::timestamptz
       AND vi.marcacao < $3::timestamptz
     GROUP BY v.id, v.nome, v.placa, v.capacidade_ton, (vi.marcacao AT TIME ZONE 'America/Sao_Paulo')::date
     ORDER BY v.nome, dia_local`,
    [empresa_id, startIso, endIso]
  );
  return rows;
};

const todaySaoPauloClause = `(marcacao AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date`;

/**
 * Remove uma viagem do apontador: por id (se fornecido) ou a mais recente do dia
 * que coincida com veículo, motorista, tipo e marcação temporal (~15s).
 * @param {{ empresa_id: number, veiculo_id: number, motorista_id: number, tipo: string, timestamp_ms: number, viagem_id?: number|null }} p
 */
const deleteViagemApontadorMatch = async (
  { empresa_id, veiculo_id, motorista_id, tipo, timestamp_ms, viagem_id },
  db = pool
) => {
  if (viagem_id != null && Number.isFinite(Number(viagem_id))) {
    const { rows } = await db.query(
      `DELETE FROM viagens
       WHERE id = $1 AND empresa_id = $2 AND veiculo_id = $3 AND motorista_id = $4 AND tipo = $5
         AND ${todaySaoPauloClause}
       RETURNING id`,
      [viagem_id, empresa_id, veiculo_id, motorista_id, tipo]
    );
    return rows[0] || null;
  }

  const { rows } = await db.query(
    `DELETE FROM viagens
     WHERE id = (
       SELECT v.id
       FROM viagens v
       WHERE v.empresa_id = $1
         AND v.veiculo_id = $2
         AND v.motorista_id = $3
         AND v.tipo = $4
         AND ${todaySaoPauloClause.replace(/marcacao/g, "v.marcacao")}
         AND ABS(EXTRACT(EPOCH FROM v.marcacao) * 1000 - $5::double precision) <= 15000
       ORDER BY ABS(EXTRACT(EPOCH FROM v.marcacao) * 1000 - $5::double precision) ASC, v.marcacao DESC
       LIMIT 1
     )
     RETURNING id`,
    [empresa_id, veiculo_id, motorista_id, tipo, timestamp_ms]
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

module.exports = {
  insertViagem,
  getViagensResumoProducao,
  countViagensHojeEmpresaSaoPaulo,
  listRecentViagensHojeEmpresaSaoPaulo,
  utcBoundsFromDateRangeYmd,
  listViagensByVehicleDay,
  deleteViagemApontadorMatch,
  deleteViagensEmpresaDiaAtualSaoPaulo,
};
