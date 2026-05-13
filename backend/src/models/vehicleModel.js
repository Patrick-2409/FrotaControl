const { pool } = require("../db");

const STATUS_VALUES = new Set(["ativo", "manutencao", "indisponivel", "parado", "operacao"]);

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
  marca = null,
  modelo = null,
  capacidade_ton = null,
  usa_para_transporte = false,
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
  const usa = Boolean(usa_para_transporte);
  const cap = normalizeCapacidade(usa, capacidade_ton);
  const meta = normalizeTelemetryMeta(fleet_telemetry_meta);
  const st = normalizeStatus(status_operacional);
  const { rows } = await pool.query(
    `INSERT INTO veiculos (
       empresa_id, nome, placa, marca, modelo, capacidade_ton, usa_para_transporte,
       tipo, categoria, ano, renavam, chassi, combustivel_principal, capacidade_litros,
       horimetro_atual, hodometro_atual, status_operacional,
       doc_revisao_validade, doc_licenciamento_validade, doc_seguro_validade, doc_inspecao_validade,
       manutencao_agendar_ate, fleet_telemetry_meta
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
     RETURNING *`,
    [
      empresa_id,
      nome,
      placa,
      trimOrNull(marca),
      trimOrNull(modelo),
      cap,
      usa,
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
  return rows[0];
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
  const transportClause = filtrar_transporte ? "AND COALESCE(v.usa_para_transporte, false) = true" : "";
  const capacidadeClause = exige_capacidade
    ? "AND v.capacidade_ton IS NOT NULL AND v.capacidade_ton > 0"
    : "";
  let paramIdx = 2;
  const extraClauses = [];
  const extraVals = [];

  if (search) {
    extraClauses.push(
      `(v.nome ILIKE $${paramIdx} OR v.placa ILIKE $${paramIdx} OR COALESCE(v.marca, '') ILIKE $${paramIdx} OR COALESCE(v.modelo, '') ILIKE $${paramIdx} OR COALESCE(v.tipo, '') ILIKE $${paramIdx} OR u.nome ILIKE $${paramIdx})`
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
  const rowsValues = [empresa_id, ...extraVals, limit, offset];
  const qLimit = `$${paramIdx}`;
  const qOffset = `$${paramIdx + 1}`;

  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM veiculos v
     LEFT JOIN usuarios u ON u.veiculo_id = v.id AND u.empresa_id = v.empresa_id
     WHERE v.empresa_id = $1 ${transportClause} ${capacidadeClause} ${whereSearch}`,
    countValues
  );
  const { rows } = await pool.query(
    `SELECT v.*, u.id AS motorista_id, u.nome AS motorista_nome
     FROM veiculos v
     LEFT JOIN usuarios u ON u.veiculo_id = v.id AND u.empresa_id = v.empresa_id
     WHERE v.empresa_id = $1
     ${transportClause}
     ${capacidadeClause}
     ${whereSearch}
     ORDER BY v.created_at DESC
     LIMIT ${qLimit} OFFSET ${qOffset}`,
    rowsValues
  );
  return { items: rows, total: count.rows[0].total };
};

const mergeField = (data, existing, key, transform = (x) => x) => {
  if (!Object.prototype.hasOwnProperty.call(data, key)) return existing[key];
  return transform(data[key], existing);
};

const updateVehicle = async (id, empresa_id, data) => {
  const existing = await getVehicleById(id, empresa_id);
  if (!existing) return null;

  const usa = Object.prototype.hasOwnProperty.call(data, "usa_para_transporte")
    ? Boolean(data.usa_para_transporte)
    : Boolean(existing.usa_para_transporte);

  let capacidade_ton = existing.capacidade_ton;
  if (!usa) {
    capacidade_ton = null;
  } else if (Object.prototype.hasOwnProperty.call(data, "capacidade_ton")) {
    capacidade_ton = normalizeCapacidade(true, data.capacidade_ton);
  }

  const nome = data.nome ?? existing.nome;
  const placa = data.placa ?? existing.placa;
  const marca = mergeField(data, existing, "marca", (v, ex) => (v === undefined ? ex.marca : trimOrNull(v)));
  const modelo = mergeField(data, existing, "modelo", (v, ex) => (v === undefined ? ex.modelo : trimOrNull(v)));
  const tipo = mergeField(data, existing, "tipo", (v, ex) => (v === undefined ? ex.tipo : trimOrNull(v)));
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

  const { rows } = await pool.query(
    `UPDATE veiculos
     SET nome = $3,
         placa = $4,
         marca = $5,
         modelo = $6,
         capacidade_ton = $7,
         usa_para_transporte = $8,
         tipo = $9,
         categoria = $10,
         ano = $11,
         renavam = $12,
         chassi = $13,
         combustivel_principal = $14,
         capacidade_litros = $15,
         horimetro_atual = $16,
         hodometro_atual = $17,
         status_operacional = $18,
         doc_revisao_validade = $19,
         doc_licenciamento_validade = $20,
         doc_seguro_validade = $21,
         doc_inspecao_validade = $22,
         manutencao_agendar_ate = $23,
         fleet_telemetry_meta = $24::jsonb
     WHERE id = $1 AND empresa_id = $2
     RETURNING *`,
    [
      id,
      empresa_id,
      nome,
      placa,
      marca,
      modelo,
      capacidade_ton,
      usa,
      tipo,
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
  return rows[0];
};

const deleteVehicle = async (id, empresa_id) => {
  await pool.query("DELETE FROM veiculos WHERE id = $1 AND empresa_id = $2", [id, empresa_id]);
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
