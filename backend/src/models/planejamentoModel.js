const { pool } = require("../db");

const toYmd = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
};

const insertPlanejamento = async (
  { empresa_id, data_inicio, data_fim, meta_esteril_ton, meta_rocha_ton },
  db = pool
) => {
  const di = toYmd(data_inicio);
  const df = toYmd(data_fim);
  const { rows } = await db.query(
    `INSERT INTO planejamento_semanal (empresa_id, data_inicio, data_fim, meta_esteril_ton, meta_rocha_ton)
     VALUES ($1, $2::date, $3::date, $4, $5)
     RETURNING id, empresa_id, data_inicio, data_fim, meta_esteril_ton, meta_rocha_ton, created_at`,
    [empresa_id, di, df, meta_esteril_ton, meta_rocha_ton]
  );
  return rows[0];
};

/** Planejamento cuja janela [data_inicio, data_fim] inclui a data corrente (servidor), o mais recente por created_at. */
const getPlanejamentoAtual = async (empresa_id, db = pool) => {
  const { rows } = await db.query(
    `SELECT id, empresa_id, data_inicio, data_fim, meta_esteril_ton, meta_rocha_ton, created_at
     FROM planejamento_semanal
     WHERE empresa_id = $1
       AND CURRENT_DATE BETWEEN data_inicio AND data_fim
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [empresa_id]
  );
  return rows[0] || null;
};

module.exports = {
  insertPlanejamento,
  getPlanejamentoAtual,
  toYmd,
};
