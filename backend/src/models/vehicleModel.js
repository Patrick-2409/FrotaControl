const { pool } = require("../db");
const { queryTimed } = require("../utils/queryTimed");

const STATUS_VALUES = new Set(["ativo", "manutencao", "indisponivel", "parado", "operacao"]);

const MATERIAL_ALLOWED_SQL = {
  esteril: `COALESCE(
    v.transporta_esteril,
    CASE
      WHEN v.capacidade_esteril_ton IS NOT NULL OR v.capacidade_rocha_ton IS NOT NULL
        THEN v.capacidade_esteril_ton IS NOT NULL
      ELSE COALESCE(v.capacidade_ton, 0) > 0
    END
  )`,
  rocha: `COALESCE(
    v.transporta_rocha,
    CASE
      WHEN v.capacidade_esteril_ton IS NOT NULL OR v.capacidade_rocha_ton IS NOT NULL
        THEN v.capacidade_rocha_ton IS NOT NULL
      ELSE COALESCE(v.capacidade_ton, 0) > 0
    END
  )`,
};

const MATERIAL_CAPACITY_SQL = {
  esteril: `CASE
    WHEN ${MATERIAL_ALLOWED_SQL.esteril} THEN
      CASE
        WHEN v.capacidade_esteril_ton IS NOT NULL OR v.capacidade_rocha_ton IS NOT NULL
          THEN COALESCE(v.capacidade_esteril_ton, 0)
        ELSE COALESCE(v.capacidade_ton, 0)
      END
    ELSE 0
  END`,
  rocha: `CASE
    WHEN ${MATERIAL_ALLOWED_SQL.rocha} THEN
      CASE
        WHEN v.capacidade_esteril_ton IS NOT NULL OR v.capacidade_rocha_ton IS NOT NULL
          THEN COALESCE(v.capacidade_rocha_ton, 0)
        ELSE COALESCE(v.capacidade_ton, 0)
      END
    ELSE 0
  END`,
};

const VEHICLE_LIST_COLS = `v.id, v.empresa_id, v.codigo_operacional, v.nome, v.placa, v.marca, v.modelo, v.tipo, v.categoria, v.ano,
  v.renavam, v.chassi, v.combustivel_principal, v.capacidade_litros, v.capacidade_ton,
  v.capacidade_esteril_ton, v.capacidade_rocha_ton, v.transporta_esteril, v.transporta_rocha,
  v.horimetro_atual, v.hodometro_atual, v.usa_para_transporte, v.tipo_operacao, v.status_operacional,
  v.doc_revisao_validade, v.doc_licenciamento_validade, v.doc_seguro_validade, v.doc_inspecao_validade,
  v.manutencao_agendar_ate, v.fleet_telemetry_meta, v.created_at`;

const normalizeCapacidade = (usaParaTransporte, capacidade_ton) => {
  if (!usaParaTransporte) return null;
  if (capacidade_ton === null || capacidade_ton === undefined || capacidade_ton === "") return null;
  const n = Number(capacidade_ton);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const trimOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const normalizeStatus = (v, fallback = "ativo") => {
  const s = trimOrNull(v) || fallback;
  return STATUS_VALUES.has(s) ? s : fallback;
};

const normalizeIntAno = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const y = Math.trunc(n);
  if (y < 1970 || y > new Date().getFullYear() + 2) return null;
  return y;
};

const normalizeNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const normalizeDate = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
};

const normalizeOperationalCode = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
};

const normalizeTipoOperacao = (tipo_operacao, usa_para_transporte) =>
  tipo_operacao === "transporte" || tipo_operacao === "apoio"
    ? tipo_operacao
    : Boolean(usa_para_transporte)
      ? "transporte"
      : "apoio";

const normalizeVehicleCodeSeries = async (client, empresa_id, tipo_operacao, targetId = null, desiredPosition = null) => {
  const tipo = normalizeTipoOperacao(tipo_operacao, tipo_operacao === "transporte");
  const { rows } = await client.query(
    `SELECT id
     FROM veiculos
     WHERE empresa_id = $1 AND tipo_operacao = $2
     ORDER BY codigo_operacional ASC NULLS LAST, created_at ASC, id ASC
     FOR UPDATE`,
    [empresa_id, tipo]
  );
  const target = Number(targetId);
  const hasTarget = Number.isFinite(target) && rows.some((row) => Number(row.id) === target);
  const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && (!hasTarget || id !== target));
  if (hasTarget) {
    const desired = normalizeOperationalCode(desiredPosition);
    const index = desired ? Math.max(0, Math.min(ids.length, desired - 1)) : ids.length;
    ids.splice(index, 0, target);
  }
  if (!ids.length) return;
  await client.query("UPDATE veiculos SET codigo_operacional = NULL WHERE empresa_id = $1 AND id = ANY($2::int[])", [
    empresa_id,
    ids,
  ]);
  for (let i = 0; i < ids.length; i += 1) {
    await client.query(
      "UPDATE veiculos SET codigo_operacional = $3 WHERE empresa_id = $1 AND id = $2",
      [empresa_id, ids[i], i + 1]
    );
  }
};

const normalizeTelemetryMeta = (v) => {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return {};
  try {
    const s = JSON.stringify(v);
    if (s.length > 8000) return { truncated: true };
    return JSON.parse(s);
  } catch {
    return {};
  }
};

const createVehicle = async ({
  empresa_id,
  nome,
  placa,
  codigo_operacional = null,
  marca = null,
  modelo = null,
  capacidade_ton = null,
  capacidade_esteril_ton = null,
  capacidade_rocha_ton = null,
  transporta_esteril = undefined,
  transporta_rocha = undefined,
  usa_para_transporte = false,
  tipo_operacao = "apoio",
  tipo = null,
  categoria = null,
  ano = null,
  renavam = null,
  chassi = null,
  combustivel_principal = null,
  capacidade_litros = null,
  horimetro_atual = null,
  hodometro_atual = null,
  status_operacional = "ativo",
  doc_revisao_validade = null,
  doc_licenciamento_validade = null,
  doc_seguro_validade = null,
  doc_inspecao_validade = null,
  manutencao_agendar_ate = null,
  fleet_telemetry_meta = {},
}) => {
  const tipoOperacao =
    tipo_operacao === "transporte" || tipo_operacao === "apoio"
      ? tipo_operacao
      : Boolean(usa_para_transporte)
        ? "transporte"
        : "apoio";
  const usa = tipoOperacao === "transporte";
  const hasSpecificCapacity = capacidade_esteril_ton != null || capacidade_rocha_ton != null;
  const transportaEsteril = usa
    ? transporta_esteril === undefined
      ? hasSpecificCapacity
        ? capacidade_esteril_ton != null
        : capacidade_ton != null
      : Boolean(transporta_esteril)
    : false;
  const transportaRocha = usa
    ? transporta_rocha === undefined
      ? hasSpecificCapacity
        ? capacidade_rocha_ton != null
        : capacidade_ton != null
      : Boolean(transporta_rocha)
    : false;
  const capEsteril = transportaEsteril
    ? normalizeCapacidade(usa, hasSpecificCapacity ? capacidade_esteril_ton : capacidade_ton)
    : null;
  const capRocha = transportaRocha
    ? normalizeCapacidade(usa, hasSpecificCapacity ? capacidade_rocha_ton : capacidade_ton)
    : null;
  const cap = normalizeCapacidade(usa, capacidade_ton ?? capEsteril ?? capRocha);
  const meta = normalizeTelemetryMeta(fleet_telemetry_meta);
  const st = normalizeStatus(status_operacional);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO veiculos (
         empresa_id, codigo_operacional, nome, placa, marca, modelo, capacidade_ton, capacidade_esteril_ton, capacidade_rocha_ton,
         transporta_esteril, transporta_rocha,
         usa_para_transporte, tipo_operacao,
         tipo, categoria, ano, renavam, chassi, combustivel_principal, capacidade_litros,
         horimetro_atual, hodometro_atual, status_operacional,
         doc_revisao_validade, doc_licenciamento_validade, doc_seguro_validade, doc_inspecao_validade,
         manutencao_agendar_ate, fleet_telemetry_meta
       )
       VALUES (
         $1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28::jsonb
       )
       RETURNING id`,
      [
        empresa_id,
        nome,
        placa,
        trimOrNull(marca),
        trimOrNull(modelo),
        cap,
        capEsteril,
        capRocha,
        transportaEsteril,
        transportaRocha,
        usa,
        tipoOperacao,
        trimOrNull(tipo),
        trimOrNull(categoria),
        normalizeIntAno(ano),
        trimOrNull(renavam),
        trimOrNull(chassi),
        trimOrNull(combustivel_principal),
        normalizeNum(capacidade_litros),
        normalizeNum(horimetro_atual),
        normalizeNum(hodometro_atual),
        st,
        normalizeDate(doc_revisao_validade),
        normalizeDate(doc_licenciamento_validade),
        normalizeDate(doc_seguro_validade),
        normalizeDate(doc_inspecao_validade),
        normalizeDate(manutencao_agendar_ate),
        JSON.stringify(meta),
      ]
    );
    const id = rows[0].id;
    await normalizeVehicleCodeSeries(client, empresa_id, tipoOperacao, id, codigo_operacional);
    const finalRows = await client.query("SELECT * FROM veiculos WHERE id = $1 AND empresa_id = $2", [id, empresa_id]);
    await client.query("COMMIT");
    return finalRows.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const listVehicles = async (
  empresa_id,
  {
    page = 1,
    limit = 10,
    search = "",
    filtrar_transporte = false,
    exige_capacidade = false,
    status_operacional = "",
    tipo = "",
  } = {}
) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Math.min(500, Number(limit) || 25));
  const offset = (pageNum - 1) * limitNum;

  const transportClause = filtrar_transporte ? "AND COALESCE(v.usa_para_transporte, false) = true" : "";
  const capacidadeClause = exige_capacidade
    ? `AND (
        ${MATERIAL_CAPACITY_SQL.esteril} > 0
        OR ${MATERIAL_CAPACITY_SQL.rocha} > 0
      )`
    : "";
  let paramIdx = 2;
  const extraClauses = [];
  const extraVals = [];

  if (search) {
    extraClauses.push(
      `(v.nome ILIKE $${paramIdx}
        OR v.placa ILIKE $${paramIdx}
        OR COALESCE(v.marca, '') ILIKE $${paramIdx}
        OR COALESCE(v.modelo, '') ILIKE $${paramIdx}
        OR COALESCE(v.tipo, '') ILIKE $${paramIdx}
        OR LPAD(COALESCE(v.codigo_operacional, 0)::text, 2, '0') ILIKE $${paramIdx}
        OR CONCAT(CASE WHEN COALESCE(v.usa_para_transporte, false) THEN '#' ELSE 'A' END, LPAD(COALESCE(v.codigo_operacional, 0)::text, 2, '0')) ILIKE $${paramIdx}
        OR EXISTS (
         SELECT 1
         FROM usuarios u
         LEFT JOIN motorista_veiculos mv ON mv.motorista_id = u.id AND mv.empresa_id = u.empresa_id
         WHERE u.empresa_id = v.empresa_id
           AND u.role = 'MOTORISTA'
           AND (u.veiculo_id = v.id OR mv.veiculo_id = v.id)
           AND u.nome ILIKE $${paramIdx}
       ))`
    );
    extraVals.push(`%${search}%`);
    paramIdx += 1;
  }

  if (status_operacional && STATUS_VALUES.has(String(status_operacional).trim())) {
    extraClauses.push(`v.status_operacional = $${paramIdx}`);
    extraVals.push(String(status_operacional).trim());
    paramIdx += 1;
  }

  if (tipo && String(tipo).trim()) {
    extraClauses.push(`COALESCE(v.tipo, '') ILIKE $${paramIdx}`);
    extraVals.push(`%${String(tipo).trim()}%`);
    paramIdx += 1;
  }

  const whereSearch = extraClauses.length ? `AND ${extraClauses.join(" AND ")}` : "";

  const countValues = [empresa_id, ...extraVals];
  const rowsValues = [empresa_id, ...extraVals, limitNum, offset];
  const qLimit = `$${paramIdx}`;
  const qOffset = `$${paramIdx + 1}`;

  const countSql = `SELECT COUNT(*)::int AS total
     FROM veiculos v
     WHERE v.empresa_id = $1 ${transportClause} ${capacidadeClause} ${whereSearch}`;

  const t0 = Date.now();
  const count = await queryTimed(countSql, countValues, { label: "veiculos-count" });
  const { rows } = await queryTimed(
    `SELECT ${VEHICLE_LIST_COLS}, m.motorista_id, m.motorista_nome, COALESCE(m.motoristas_vinculados, '[]'::json) AS motoristas_vinculados
     FROM veiculos v
     LEFT JOIN LATERAL (
       SELECT
         (array_agg(x.id ORDER BY x.is_principal DESC, x.nome))[1] AS motorista_id,
         (array_agg(x.nome ORDER BY x.is_principal DESC, x.nome))[1] AS motorista_nome,
         json_agg(json_build_object('id', x.id, 'nome', x.nome, 'is_principal', x.is_principal) ORDER BY x.is_principal DESC, x.nome) AS motoristas_vinculados
       FROM (
         SELECT DISTINCT ON (u.id)
           u.id,
           u.nome,
           (u.veiculo_id = v.id OR COALESCE(mv.is_principal, false)) AS is_principal
         FROM usuarios u
         LEFT JOIN motorista_veiculos mv ON mv.motorista_id = u.id
           AND mv.empresa_id = u.empresa_id
           AND mv.veiculo_id = v.id
         WHERE u.empresa_id = v.empresa_id
           AND u.role = 'MOTORISTA'
           AND (u.veiculo_id = v.id OR mv.veiculo_id = v.id)
         ORDER BY u.id, (u.veiculo_id = v.id OR COALESCE(mv.is_principal, false)) DESC
       ) x
     ) m ON true
     WHERE v.empresa_id = $1
     ${transportClause}
     ${capacidadeClause}
     ${whereSearch}
     ORDER BY CASE WHEN COALESCE(v.usa_para_transporte, false) THEN 0 ELSE 1 END,
              v.codigo_operacional ASC NULLS LAST,
              v.created_at ASC,
              v.id ASC
     LIMIT ${qLimit} OFFSET ${qOffset}`,
    rowsValues,
    { label: "veiculos-list" }
  );
  if (process.env.NODE_ENV !== "production") {
    const ms = Date.now() - t0;
    if (ms > 500) console.warn(`[listVehicles] empresa=${empresa_id} ${ms}ms total=${count.rows[0]?.total}`);
  }
  return { items: rows, total: count.rows[0].total };
};

const mergeField = (data, existing, key, transform = (x) => x) => {
  if (!Object.prototype.hasOwnProperty.call(data, key)) return existing[key];
  return transform(data[key], existing);
};

const updateVehicle = async (id, empresa_id, data) => {
  const existing = await getVehicleById(id, empresa_id);
  if (!existing) return null;

  let tipoOperacao =
    data.tipo_operacao === "transporte" || data.tipo_operacao === "apoio"
      ? data.tipo_operacao
      : existing.tipo_operacao === "transporte" || existing.tipo_operacao === "apoio"
        ? existing.tipo_operacao
        : null;
  if (!tipoOperacao) {
    const usaLegacy = Object.prototype.hasOwnProperty.call(data, "usa_para_transporte")
      ? Boolean(data.usa_para_transporte)
      : Boolean(existing.usa_para_transporte);
    tipoOperacao = usaLegacy ? "transporte" : "apoio";
  }
  const usa = tipoOperacao === "transporte";
  const oldTipoOperacao = normalizeTipoOperacao(existing.tipo_operacao, existing.usa_para_transporte);
  const hasCodigoInput = Object.prototype.hasOwnProperty.call(data, "codigo_operacional");
  const desiredCodigo = hasCodigoInput
    ? normalizeOperationalCode(data.codigo_operacional)
    : normalizeOperationalCode(existing.codigo_operacional);

  let capacidade_ton = existing.capacidade_ton;
  let capacidade_esteril_ton = existing.capacidade_esteril_ton;
  let capacidade_rocha_ton = existing.capacidade_rocha_ton;
  let transporta_esteril = existing.transporta_esteril;
  let transporta_rocha = existing.transporta_rocha;
  if (!usa) {
    capacidade_ton = null;
    capacidade_esteril_ton = null;
    capacidade_rocha_ton = null;
    transporta_esteril = false;
    transporta_rocha = false;
  } else if (Object.prototype.hasOwnProperty.call(data, "capacidade_ton")) {
    capacidade_ton = normalizeCapacidade(true, data.capacidade_ton);
  }
  if (usa) {
    const hasCapacidadeTon = Object.prototype.hasOwnProperty.call(data, "capacidade_ton");
    const hasCapacidadeEsteril = Object.prototype.hasOwnProperty.call(data, "capacidade_esteril_ton");
    const hasCapacidadeRocha = Object.prototype.hasOwnProperty.call(data, "capacidade_rocha_ton");
    const hasTransportaEsteril = Object.prototype.hasOwnProperty.call(data, "transporta_esteril");
    const hasTransportaRocha = Object.prototype.hasOwnProperty.call(data, "transporta_rocha");
    const hasSpecificCapacityInput =
      (hasCapacidadeEsteril && data.capacidade_esteril_ton != null && data.capacidade_esteril_ton !== "") ||
      (hasCapacidadeRocha && data.capacidade_rocha_ton != null && data.capacidade_rocha_ton !== "");
    const existingHasSpecificCapacity =
      existing.capacidade_esteril_ton != null || existing.capacidade_rocha_ton != null;
    const shouldFallbackFromCapacityTon = !hasSpecificCapacityInput && !existingHasSpecificCapacity;

    if (hasTransportaEsteril) transporta_esteril = Boolean(data.transporta_esteril);
    if (hasTransportaRocha) transporta_rocha = Boolean(data.transporta_rocha);

    if (hasCapacidadeEsteril) {
      capacidade_esteril_ton = normalizeCapacidade(true, data.capacidade_esteril_ton);
    } else if (hasCapacidadeTon && capacidade_esteril_ton == null && shouldFallbackFromCapacityTon) {
      capacidade_esteril_ton = capacidade_ton;
    }

    if (hasCapacidadeRocha) {
      capacidade_rocha_ton = normalizeCapacidade(true, data.capacidade_rocha_ton);
    } else if (hasCapacidadeTon && capacidade_rocha_ton == null && shouldFallbackFromCapacityTon) {
      capacidade_rocha_ton = capacidade_ton;
    }

    if (!hasCapacidadeTon) {
      capacidade_ton = normalizeCapacidade(true, capacidade_ton ?? capacidade_esteril_ton ?? capacidade_rocha_ton);
    }

    if (transporta_esteril == null) {
      transporta_esteril = capacidade_esteril_ton != null;
    }
    if (transporta_rocha == null) {
      transporta_rocha = capacidade_rocha_ton != null;
    }
    if (!transporta_esteril) capacidade_esteril_ton = null;
    if (!transporta_rocha) capacidade_rocha_ton = null;
  }

  const nome = data.nome ?? existing.nome;
  const placa = data.placa ?? existing.placa;
  const marca = mergeField(data, existing, "marca", (v, ex) => (v === undefined ? ex.marca : trimOrNull(v)));
  const modelo = mergeField(data, existing, "modelo", (v, ex) => (v === undefined ? ex.modelo : trimOrNull(v)));
  const tipoVeiculo = mergeField(data, existing, "tipo", (v, ex) => (v === undefined ? ex.tipo : trimOrNull(v)));
  const categoria = mergeField(data, existing, "categoria", (v, ex) => (v === undefined ? ex.categoria : trimOrNull(v)));
  const ano = mergeField(data, existing, "ano", (v, ex) =>
    v === undefined ? ex.ano : normalizeIntAno(v)
  );
  const renavam = mergeField(data, existing, "renavam", (v, ex) => (v === undefined ? ex.renavam : trimOrNull(v)));
  const chassi = mergeField(data, existing, "chassi", (v, ex) => (v === undefined ? ex.chassi : trimOrNull(v)));
  const combustivel_principal = mergeField(data, existing, "combustivel_principal", (v, ex) =>
    v === undefined ? ex.combustivel_principal : trimOrNull(v)
  );
  const capacidade_litros = mergeField(data, existing, "capacidade_litros", (v, ex) =>
    v === undefined ? ex.capacidade_litros : normalizeNum(v)
  );
  const horimetro_atual = mergeField(data, existing, "horimetro_atual", (v, ex) =>
    v === undefined ? ex.horimetro_atual : normalizeNum(v)
  );
  const hodometro_atual = mergeField(data, existing, "hodometro_atual", (v, ex) =>
    v === undefined ? ex.hodometro_atual : normalizeNum(v)
  );
  const status_operacional = mergeField(data, existing, "status_operacional", (v, ex) =>
    v === undefined ? ex.status_operacional : normalizeStatus(v, ex.status_operacional || "ativo")
  );
  const doc_revisao_validade = mergeField(data, existing, "doc_revisao_validade", (v, ex) =>
    v === undefined ? ex.doc_revisao_validade : normalizeDate(v)
  );
  const doc_licenciamento_validade = mergeField(data, existing, "doc_licenciamento_validade", (v, ex) =>
    v === undefined ? ex.doc_licenciamento_validade : normalizeDate(v)
  );
  const doc_seguro_validade = mergeField(data, existing, "doc_seguro_validade", (v, ex) =>
    v === undefined ? ex.doc_seguro_validade : normalizeDate(v)
  );
  const doc_inspecao_validade = mergeField(data, existing, "doc_inspecao_validade", (v, ex) =>
    v === undefined ? ex.doc_inspecao_validade : normalizeDate(v)
  );
  const manutencao_agendar_ate = mergeField(data, existing, "manutencao_agendar_ate", (v, ex) =>
    v === undefined ? ex.manutencao_agendar_ate : normalizeDate(v)
  );
  let fleet_telemetry_meta = existing.fleet_telemetry_meta;
  if (Object.prototype.hasOwnProperty.call(data, "fleet_telemetry_meta")) {
    fleet_telemetry_meta = normalizeTelemetryMeta(data.fleet_telemetry_meta);
  } else if (existing.fleet_telemetry_meta && typeof existing.fleet_telemetry_meta === "object") {
    fleet_telemetry_meta = existing.fleet_telemetry_meta;
  } else {
    fleet_telemetry_meta = {};
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE veiculos
       SET codigo_operacional = NULL,
           nome = $3,
           placa = $4,
           marca = $5,
           modelo = $6,
           capacidade_ton = $7,
           capacidade_esteril_ton = $8,
           capacidade_rocha_ton = $9,
           transporta_esteril = $10,
           transporta_rocha = $11,
           usa_para_transporte = $12,
           tipo_operacao = $13,
           tipo = $14,
           categoria = $15,
           ano = $16,
           renavam = $17,
           chassi = $18,
           combustivel_principal = $19,
           capacidade_litros = $20,
           horimetro_atual = $21,
           hodometro_atual = $22,
           status_operacional = $23,
           doc_revisao_validade = $24,
           doc_licenciamento_validade = $25,
           doc_seguro_validade = $26,
           doc_inspecao_validade = $27,
           manutencao_agendar_ate = $28,
           fleet_telemetry_meta = $29::jsonb
       WHERE id = $1 AND empresa_id = $2
       RETURNING id`,
      [
        id,
        empresa_id,
        nome,
        placa,
        marca,
        modelo,
        capacidade_ton,
        capacidade_esteril_ton,
        capacidade_rocha_ton,
        transporta_esteril,
        transporta_rocha,
        usa,
        tipoOperacao,
        tipoVeiculo,
        categoria,
        ano,
        renavam,
        chassi,
        combustivel_principal,
        capacidade_litros,
        horimetro_atual,
        hodometro_atual,
        status_operacional,
        doc_revisao_validade,
        doc_licenciamento_validade,
        doc_seguro_validade,
        doc_inspecao_validade,
        manutencao_agendar_ate,
        JSON.stringify(fleet_telemetry_meta || {}),
      ]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    if (oldTipoOperacao !== tipoOperacao) {
      await normalizeVehicleCodeSeries(client, empresa_id, oldTipoOperacao);
    }
    await normalizeVehicleCodeSeries(client, empresa_id, tipoOperacao, Number(id), desiredCodigo);
    const finalRows = await client.query("SELECT * FROM veiculos WHERE id = $1 AND empresa_id = $2", [id, empresa_id]);
    await client.query("COMMIT");
    return finalRows.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const deleteVehicle = async (id, empresa_id) => {
  const result = await pool.query("DELETE FROM veiculos WHERE id = $1 AND empresa_id = $2", [id, empresa_id]);
  return result.rowCount > 0;
};

const getVehicleById = async (id, empresa_id) => {
  const { rows } = await pool.query("SELECT * FROM veiculos WHERE id = $1 AND empresa_id = $2", [id, empresa_id]);
  return rows[0];
};

module.exports = {
  createVehicle,
  listVehicles,
  updateVehicle,
  deleteVehicle,
  getVehicleById,
  STATUS_VALUES,
};
