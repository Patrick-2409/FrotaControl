const { pool } = require("../db");

const upsertRomaneio = async (empresa_id, usuario_id, payload) => {
  const { rows } = await pool.query(
    `INSERT INTO romaneios
      (empresa_id, usuario_id, veiculo_id, source_id, version_of, data, recorded_at_client, tipo_transporte, destino, observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (empresa_id, source_id)
     DO UPDATE SET
       data = EXCLUDED.data,
       recorded_at_client = COALESCE(EXCLUDED.recorded_at_client, romaneios.recorded_at_client),
       tipo_transporte = EXCLUDED.tipo_transporte,
       destino = EXCLUDED.destino,
       observacao = EXCLUDED.observacao,
       veiculo_id = EXCLUDED.veiculo_id,
       updated_at = NOW()
     RETURNING *`,
    [
      empresa_id,
      usuario_id,
      payload.veiculo_id || null,
      payload.source_id,
      payload.version_of || null,
      payload.data,
      payload.recorded_at_client || null,
      payload.tipo_transporte,
      payload.destino,
      payload.observacao || null,
    ]
  );
  return rows[0];
};

const upsertCombustivel = async (empresa_id, usuario_id, payload) => {
  const { rows } = await pool.query(
    `INSERT INTO combustiveis
      (empresa_id, usuario_id, veiculo_id, source_id, version_of, data, recorded_at_client, litros, tipo_combustivel, horimetro, hodometro)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (empresa_id, source_id)
     DO UPDATE SET
       data = EXCLUDED.data,
       recorded_at_client = COALESCE(EXCLUDED.recorded_at_client, combustiveis.recorded_at_client),
       litros = EXCLUDED.litros,
       tipo_combustivel = EXCLUDED.tipo_combustivel,
       horimetro = EXCLUDED.horimetro,
       hodometro = EXCLUDED.hodometro,
       veiculo_id = EXCLUDED.veiculo_id,
       updated_at = NOW()
     RETURNING *`,
    [
      empresa_id,
      usuario_id,
      payload.veiculo_id || null,
      payload.source_id,
      payload.version_of || null,
      payload.data,
      payload.recorded_at_client || null,
      payload.litros,
      payload.tipo_combustivel,
      payload.horimetro || null,
      payload.hodometro || null,
    ]
  );
  return rows[0];
};

const upsertParteDiaria = async (empresa_id, usuario_id, payload) => {
  const { rows } = await pool.query(
    `INSERT INTO parte_diaria
      (empresa_id, usuario_id, veiculo_id, source_id, version_of, data, recorded_at_client, contratado, operador, equipamento,
       marca_modelo, local, expediente, periodo, clima, horimetro_inicio, horimetro_fim, total_horas,
       hodometro_inicio, hodometro_fim, total_km, checklist, outros_descricao, tempo_parado, observacoes, producao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
     ON CONFLICT (empresa_id, source_id)
     DO UPDATE SET
       data = EXCLUDED.data,
       recorded_at_client = COALESCE(EXCLUDED.recorded_at_client, parte_diaria.recorded_at_client),
       contratado = EXCLUDED.contratado,
       operador = EXCLUDED.operador,
       equipamento = EXCLUDED.equipamento,
       marca_modelo = EXCLUDED.marca_modelo,
       local = EXCLUDED.local,
       expediente = EXCLUDED.expediente,
       periodo = EXCLUDED.periodo,
       clima = EXCLUDED.clima,
       horimetro_inicio = EXCLUDED.horimetro_inicio,
       horimetro_fim = EXCLUDED.horimetro_fim,
       total_horas = EXCLUDED.total_horas,
       hodometro_inicio = EXCLUDED.hodometro_inicio,
       hodometro_fim = EXCLUDED.hodometro_fim,
       total_km = EXCLUDED.total_km,
       checklist = EXCLUDED.checklist,
       outros_descricao = EXCLUDED.outros_descricao,
       tempo_parado = EXCLUDED.tempo_parado,
       observacoes = EXCLUDED.observacoes,
       producao = EXCLUDED.producao,
       veiculo_id = EXCLUDED.veiculo_id,
       updated_at = NOW()
     RETURNING *`,
    [
      empresa_id,
      usuario_id,
      payload.veiculo_id || null,
      payload.source_id,
      payload.version_of || null,
      payload.data,
      payload.recorded_at_client || null,
      payload.contratado,
      payload.operador,
      payload.equipamento,
      payload.marca_modelo,
      payload.local,
      payload.expediente || null,
      payload.periodo,
      payload.clima,
      payload.horimetro_inicio,
      payload.horimetro_fim,
      payload.total_horas,
      payload.hodometro_inicio || null,
      payload.hodometro_fim || null,
      payload.total_km || null,
      JSON.stringify(payload.checklist),
      payload.outros_descricao || null,
      payload.tempo_parado || null,
      payload.observacoes || null,
      payload.producao || null,
    ]
  );
  return rows[0];
};

const listManagerRecords = async ({
  empresa_id,
  usuario_id,
  data,
  data_inicio,
  data_fim,
  mes,
  motorista,
  tipo,
  source_id,
  page = 1,
  limit = 20,
}) => {
  const values = [];
  const where = [];
  if (empresa_id != null) {
    values.push(empresa_id);
    where.push(`r.empresa_id = $${values.length}`);
  }
  if (!where.length) where.push("1=1");
  const dateExpr = "DATE(COALESCE(r.recorded_at_client, r.data))";
  const accentSource = "ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ";
  const accentTarget = "AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn";

  if (data) {
    values.push(data);
    where.push(`${dateExpr} = $${values.length}`);
  } else if (mes) {
    const [year, month] = String(mes).split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    const startText = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const endText = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;
    values.push(startText);
    where.push(`${dateExpr} >= $${values.length}`);
    values.push(endText);
    where.push(`${dateExpr} <= $${values.length}`);
  } else {
    if (data_inicio) {
      values.push(data_inicio);
      where.push(`${dateExpr} >= $${values.length}`);
    }
    if (data_fim) {
      values.push(data_fim);
      where.push(`${dateExpr} <= $${values.length}`);
    }
  }
  if (motorista) {
    values.push(`%${String(motorista).toLowerCase()}%`);
    where.push(
      `(
        LOWER(translate(COALESCE(u.nome, ''), '${accentSource}', '${accentTarget}')) LIKE
        LOWER(translate($${values.length}, '${accentSource}', '${accentTarget}'))
        OR COALESCE(u.cpf_id, '') LIKE REPLACE($${values.length}, '%', '')
      )`
    );
  }
  if (usuario_id != null) {
    values.push(usuario_id);
    where.push(`r.usuario_id = $${values.length}`);
  }

  const unions = [
    `SELECT
       r.id,
       r.source_id,
       to_char(r.data, 'YYYY-MM-DD"T"HH24:MI:SS') AS data,
       CASE
         WHEN r.recorded_at_client IS NULL THEN NULL
         ELSE to_char(r.recorded_at_client, 'YYYY-MM-DD"T"HH24:MI:SS')
       END AS recorded_at_client,
       to_char(r.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at,
       u.nome AS motorista,
       'romaneio' AS tipo,
       'Romaneio' AS tipo_label,
       v.nome AS veiculo,
       v.placa,
       r.destino,
       r.tipo_transporte,
       r.observacao,
       NULL::numeric AS litros,
       NULL::text AS tipo_combustivel,
       NULL::numeric AS horimetro,
       NULL::numeric AS hodometro,
       NULL::numeric AS total_horas,
       NULL::text AS checklist_resumo,
       NULL::jsonb AS checklist,
       NULL::text AS contratado,
       NULL::text AS operador,
       NULL::text AS equipamento,
       NULL::text AS marca_modelo,
       NULL::text AS local,
       NULL::text AS expediente,
       NULL::text AS periodo,
       NULL::text AS clima,
       NULL::numeric AS horimetro_inicio,
       NULL::numeric AS horimetro_fim,
       NULL::numeric AS hodometro_inicio,
       NULL::numeric AS hodometro_fim,
       NULL::numeric AS total_km,
       NULL::text AS outros_descricao,
       NULL::text AS tempo_parado,
       NULL::text AS observacoes,
       NULL::text AS producao
     FROM romaneios r
     JOIN usuarios u ON u.id = r.usuario_id
     LEFT JOIN veiculos v ON v.id = r.veiculo_id
     WHERE ${where.join(" AND ")}`,
    `SELECT
       c.id,
       c.source_id,
       to_char(c.data, 'YYYY-MM-DD"T"HH24:MI:SS') AS data,
       CASE
         WHEN c.recorded_at_client IS NULL THEN NULL
         ELSE to_char(c.recorded_at_client, 'YYYY-MM-DD"T"HH24:MI:SS')
       END AS recorded_at_client,
       to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at,
       u.nome AS motorista,
       'combustivel' AS tipo,
       'Combustível' AS tipo_label,
       v.nome AS veiculo,
       v.placa,
       NULL::text AS destino,
       NULL::text AS tipo_transporte,
       NULL::text AS observacao,
       c.litros,
       c.tipo_combustivel,
       c.horimetro,
       c.hodometro,
       NULL::numeric AS total_horas,
       NULL::text AS checklist_resumo,
       NULL::jsonb AS checklist,
       NULL::text AS contratado,
       NULL::text AS operador,
       NULL::text AS equipamento,
       NULL::text AS marca_modelo,
       NULL::text AS local,
       NULL::text AS expediente,
       NULL::text AS periodo,
       NULL::text AS clima,
       NULL::numeric AS horimetro_inicio,
       NULL::numeric AS horimetro_fim,
       NULL::numeric AS hodometro_inicio,
       NULL::numeric AS hodometro_fim,
       NULL::numeric AS total_km,
       NULL::text AS outros_descricao,
       NULL::text AS tempo_parado,
       NULL::text AS observacoes,
       NULL::text AS producao
     FROM combustiveis c
     JOIN usuarios u ON u.id = c.usuario_id
     LEFT JOIN veiculos v ON v.id = c.veiculo_id
     WHERE ${where.join(" AND ").replaceAll("r.", "c.")}`,
    `SELECT
       p.id,
       p.source_id,
       to_char(p.data, 'YYYY-MM-DD"T"HH24:MI:SS') AS data,
       CASE
         WHEN p.recorded_at_client IS NULL THEN NULL
         ELSE to_char(p.recorded_at_client, 'YYYY-MM-DD"T"HH24:MI:SS')
       END AS recorded_at_client,
       to_char(p.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at,
       u.nome AS motorista,
       'parte_diaria' AS tipo,
       'Parte Diária' AS tipo_label,
       v.nome AS veiculo,
       v.placa,
       NULL::text AS destino,
       NULL::text AS tipo_transporte,
       NULL::text AS observacao,
       NULL::numeric AS litros,
       NULL::text AS tipo_combustivel,
       NULL::numeric AS horimetro,
       NULL::numeric AS hodometro,
       p.total_horas,
       (
         SELECT
           CASE
             WHEN COUNT(*) = 0 THEN 'Checklist sem itens'
             ELSE CONCAT(COUNT(*) FILTER (WHERE value <> 'ok'), ' pendência(s)')
           END
         FROM jsonb_each_text(COALESCE(p.checklist, '{}'::jsonb))
       ) AS checklist_resumo
       ,
       p.checklist,
       p.contratado,
       p.operador,
       p.equipamento,
       p.marca_modelo,
       p.local,
       p.expediente,
       p.periodo,
       p.clima,
       p.horimetro_inicio,
       p.horimetro_fim,
       p.hodometro_inicio,
       p.hodometro_fim,
       p.total_km,
       p.outros_descricao,
       p.tempo_parado,
       p.observacoes,
       p.producao
     FROM parte_diaria p
     JOIN usuarios u ON u.id = p.usuario_id
     LEFT JOIN veiculos v ON v.id = p.veiculo_id
     WHERE ${where.join(" AND ").replaceAll("r.", "p.")}`,
  ];

  const wrapperValues = [...values];
  let sql = unions.join(" UNION ALL ");
  const wrapperWhere = [];
  if (tipo) {
    wrapperValues.push(tipo);
    wrapperWhere.push(`t.tipo = $${wrapperValues.length}`);
  }
  if (source_id) {
    wrapperValues.push(source_id);
    wrapperWhere.push(`t.source_id = $${wrapperValues.length}`);
  }
  sql = `SELECT * FROM (${sql}) t${
    wrapperWhere.length ? ` WHERE ${wrapperWhere.join(" AND ")}` : ""
  }`;

  const baseQuery = `${sql}`;
  const countQuery = `SELECT COUNT(*)::int AS total FROM (${baseQuery}) c`;
  const countResult = await pool.query(countQuery, wrapperValues);
  const offset = (page - 1) * limit;
  const pagedQuery = `${baseQuery} ORDER BY data DESC LIMIT $${
    wrapperValues.length + 1
  } OFFSET $${wrapperValues.length + 2}`;
  const { rows } = await pool.query(pagedQuery, [...wrapperValues, limit, offset]);
  return { items: rows, total: countResult.rows[0].total };
};

const dashboardStats = async ({ empresa_id = null } = {}) => {
  const values = [];
  const companyWhere = empresa_id != null ? `WHERE empresa_id = $1` : "";
  if (empresa_id != null) {
    values.push(empresa_id);
  }
  const { rows } = await pool.query(
    `WITH ref AS (
      SELECT (timezone('America/Sao_Paulo', now()))::date AS hoje
    ),
    base AS (
      SELECT DATE(COALESCE(recorded_at_client, data)) AS dia, usuario_id, 'romaneio' AS tipo
      FROM romaneios
      ${companyWhere}
      UNION ALL
      SELECT DATE(COALESCE(recorded_at_client, data)) AS dia, usuario_id, 'combustivel' AS tipo
      FROM combustiveis
      ${companyWhere}
      UNION ALL
      SELECT DATE(COALESCE(recorded_at_client, data)) AS dia, usuario_id, 'parte_diaria' AS tipo
      FROM parte_diaria
      ${companyWhere}
    )
    SELECT
      (SELECT COUNT(*) FROM base, ref WHERE dia = ref.hoje) AS total_hoje,
      (SELECT COUNT(*)::int FROM base, ref WHERE dia >= ref.hoje - INTERVAL '6 days') AS total_semanal,
      (
        SELECT COUNT(DISTINCT usuario_id)::int
        FROM base, ref
        WHERE dia >= ref.hoje - INTERVAL '6 days'
      ) AS motoristas_ativos,
      (
        SELECT COUNT(*)::int
        FROM veiculos
        ${companyWhere}
      ) AS veiculos_ativos,
      (SELECT json_agg(x) FROM (SELECT tipo, COUNT(*)::int AS total FROM base GROUP BY tipo) x) AS por_tipo,
      (SELECT json_agg(y) FROM (
        SELECT u.nome AS motorista, COUNT(*)::int AS total
        FROM base b
        JOIN usuarios u ON u.id = b.usuario_id
        GROUP BY u.nome
        ORDER BY total DESC
      ) y) AS por_motorista,
      (SELECT json_agg(z) FROM (
        SELECT d::date AS dia, COALESCE(COUNT(b.tipo), 0)::int AS total
        FROM ref,
             generate_series(ref.hoje - INTERVAL '6 days', ref.hoje, INTERVAL '1 day') d
        LEFT JOIN base b ON b.dia = d::date
        GROUP BY d
        ORDER BY d
      ) z) AS ultimos_7_dias`,
    values
  );
  return rows[0];
};

const updateManagerRecord = async ({ empresa_id, tipo, id, payload }) => {
  const empresaFilter = empresa_id == null ? "id = $1" : "empresa_id = $1 AND id = $2";
  const baseValues = empresa_id == null ? [id] : [empresa_id, id];
  const dataIdx = empresa_id == null ? 2 : 3;
  const next = (offset) => `$${dataIdx + offset}`;

  if (tipo === "romaneio") {
    const { rows } = await pool.query(
      `UPDATE romaneios
       SET data = COALESCE(${next(0)}, data),
           destino = COALESCE(${next(1)}, destino),
           observacao = COALESCE(${next(2)}, observacao),
           updated_at = NOW()
       WHERE ${empresaFilter}
       RETURNING id`,
      [...baseValues, payload.data || null, payload.destino || null, payload.observacao || null]
    );
    return rows[0];
  }

  if (tipo === "combustivel") {
    const { rows } = await pool.query(
      `UPDATE combustiveis
       SET data = COALESCE(${next(0)}, data),
           litros = COALESCE(${next(1)}, litros),
           tipo_combustivel = COALESCE(${next(2)}, tipo_combustivel),
           updated_at = NOW()
       WHERE ${empresaFilter}
       RETURNING id`,
      [...baseValues, payload.data || null, payload.litros || null, payload.tipo_combustivel || null]
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `UPDATE parte_diaria
     SET data = COALESCE(${next(0)}, data),
         total_horas = COALESCE(${next(1)}, total_horas),
         observacoes = COALESCE(${next(2)}, observacoes),
         updated_at = NOW()
     WHERE ${empresaFilter}
     RETURNING id`,
    [...baseValues, payload.data || null, payload.total_horas || null, payload.observacoes || null]
  );
  return rows[0];
};

const deleteManagerRecord = async ({ empresa_id, tipo, id }) => {
  const table =
    tipo === "romaneio"
      ? "romaneios"
      : tipo === "combustivel"
      ? "combustiveis"
      : "parte_diaria";
  const sql =
    empresa_id == null
      ? `DELETE FROM ${table} WHERE id = $1`
      : `DELETE FROM ${table} WHERE empresa_id = $1 AND id = $2`;
  const values = empresa_id == null ? [id] : [empresa_id, id];
  const result = await pool.query(sql, values);
  return result.rowCount > 0;
};

const listMotoristaRecords = async ({ empresa_id, usuario_id }) => {
  const { rows } = await pool.query(
    `SELECT *
     FROM (
       SELECT
         r.source_id,
         'romaneios' AS module,
         'synced' AS status,
         COALESCE(r.recorded_at_client, r.data) AS sort_at,
        to_char(r.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "updatedAt",
         jsonb_build_object(
           'source_id', r.source_id,
           'client_id', r.source_id,
          'data', to_char(r.data, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'recorded_at_client', CASE
            WHEN r.recorded_at_client IS NULL THEN NULL
            ELSE to_char(r.recorded_at_client, 'YYYY-MM-DD"T"HH24:MI:SS')
          END,
           'veiculo_id', r.veiculo_id,
           'veiculo_nome', v.nome,
           'placa', v.placa,
           'tipo_transporte', r.tipo_transporte,
           'destino', r.destino,
           'observacao', r.observacao
         ) AS payload
       FROM romaneios r
       LEFT JOIN veiculos v ON v.id = r.veiculo_id
       WHERE r.empresa_id = $1 AND r.usuario_id = $2

       UNION ALL

       SELECT
         c.source_id,
         'combustiveis' AS module,
         'synced' AS status,
         COALESCE(c.recorded_at_client, c.data) AS sort_at,
        to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "updatedAt",
         jsonb_build_object(
           'source_id', c.source_id,
           'client_id', c.source_id,
          'data', to_char(c.data, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'recorded_at_client', CASE
            WHEN c.recorded_at_client IS NULL THEN NULL
            ELSE to_char(c.recorded_at_client, 'YYYY-MM-DD"T"HH24:MI:SS')
          END,
           'veiculo_id', c.veiculo_id,
           'veiculo_nome', v.nome,
           'placa', v.placa,
           'litros', c.litros,
           'tipo_combustivel', c.tipo_combustivel,
           'horimetro', c.horimetro,
           'hodometro', c.hodometro
         ) AS payload
       FROM combustiveis c
       LEFT JOIN veiculos v ON v.id = c.veiculo_id
       WHERE c.empresa_id = $1 AND c.usuario_id = $2

       UNION ALL

       SELECT
         p.source_id,
         'parteDiaria' AS module,
         'synced' AS status,
         COALESCE(p.recorded_at_client, p.data) AS sort_at,
        to_char(p.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "updatedAt",
         jsonb_build_object(
           'source_id', p.source_id,
           'client_id', p.source_id,
          'data', to_char(p.data, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'recorded_at_client', CASE
            WHEN p.recorded_at_client IS NULL THEN NULL
            ELSE to_char(p.recorded_at_client, 'YYYY-MM-DD"T"HH24:MI:SS')
          END,
           'veiculo_id', p.veiculo_id,
           'veiculo_nome', v.nome,
           'placa', v.placa,
           'contratado', p.contratado,
           'operador', p.operador,
           'equipamento', p.equipamento,
           'marca_modelo', p.marca_modelo,
           'local', p.local,
           'expediente', p.expediente,
           'periodo', p.periodo,
           'clima', p.clima,
           'horimetro_inicio', p.horimetro_inicio,
           'horimetro_fim', p.horimetro_fim,
           'total_horas', p.total_horas,
           'hodometro_inicio', p.hodometro_inicio,
           'hodometro_fim', p.hodometro_fim,
           'total_km', p.total_km,
           'checklist', p.checklist,
           'outros_descricao', p.outros_descricao,
           'tempo_parado', p.tempo_parado,
           'observacoes', p.observacoes,
           'producao', p.producao
         ) AS payload
       FROM parte_diaria p
       LEFT JOIN veiculos v ON v.id = p.veiculo_id
       WHERE p.empresa_id = $1 AND p.usuario_id = $2
     ) t
     ORDER BY t.sort_at DESC, t."updatedAt" DESC`,
    [empresa_id, usuario_id]
  );
  return rows;
};

module.exports = {
  upsertRomaneio,
  upsertCombustivel,
  upsertParteDiaria,
  listManagerRecords,
  listMotoristaRecords,
  dashboardStats,
  updateManagerRecord,
  deleteManagerRecord,
};
