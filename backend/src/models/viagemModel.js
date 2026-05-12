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
        SUM(CASE WHEN vi.tipo = 'esteril' THEN COALESCE(v.capacidade_ton, 0) ELSE 0 END),
        0
      )::double precision AS total_toneladas_esteril,
      COALESCE(
        SUM(CASE WHEN vi.tipo = 'rocha' THEN COALESCE(v.capacidade_ton, 0) ELSE 0 END),
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

module.exports = {
  insertViagem,
  getViagensResumoProducao,
  utcBoundsFromDateRangeYmd,
};
