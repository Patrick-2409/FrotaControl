const { pool } = require("../db");

const normalizeCapacidade = (usaParaTransporte, capacidade_ton) => {
  if (!usaParaTransporte) return null;
  if (capacidade_ton === null || capacidade_ton === undefined || capacidade_ton === "") return null;
  const n = Number(capacidade_ton);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const createVehicle = async ({
  empresa_id,
  nome,
  placa,
  marca = null,
  modelo = null,
  capacidade_ton = null,
  usa_para_transporte = false,
}) => {
  const usa = Boolean(usa_para_transporte);
  const cap = normalizeCapacidade(usa, capacidade_ton);
  const { rows } = await pool.query(
    `INSERT INTO veiculos (empresa_id, nome, placa, marca, modelo, capacidade_ton, usa_para_transporte)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [empresa_id, nome, placa, marca, modelo, cap, usa]
  );
  return rows[0];
};

const listVehicles = async (
  empresa_id,
  { page = 1, limit = 10, search = "", filtrar_transporte = false, exige_capacidade = false } = {}
) => {
  const offset = (page - 1) * limit;
  const transportClause = filtrar_transporte ? "AND COALESCE(v.usa_para_transporte, false) = true" : "";
  const capacidadeClause = exige_capacidade
    ? "AND v.capacidade_ton IS NOT NULL AND v.capacidade_ton > 0"
    : "";
  const whereSearch = search
    ? `AND (v.nome ILIKE $2 OR v.placa ILIKE $2 OR COALESCE(v.marca, '') ILIKE $2 OR COALESCE(v.modelo, '') ILIKE $2 OR u.nome ILIKE $2)`
    : "";
  const countValues = search ? [empresa_id, `%${search}%`] : [empresa_id];
  const rowsValues = search
    ? [empresa_id, `%${search}%`, limit, offset]
    : [empresa_id, limit, offset];
  const qLimit = search ? "$3" : "$2";
  const qOffset = search ? "$4" : "$3";
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
  const marca = Object.prototype.hasOwnProperty.call(data, "marca") ? data.marca ?? null : existing.marca ?? null;
  const modelo = Object.prototype.hasOwnProperty.call(data, "modelo") ? data.modelo ?? null : existing.modelo ?? null;

  const { rows } = await pool.query(
    `UPDATE veiculos
     SET nome = $3,
         placa = $4,
         marca = $5,
         modelo = $6,
         capacidade_ton = $7,
         usa_para_transporte = $8
     WHERE id = $1 AND empresa_id = $2
     RETURNING *`,
    [id, empresa_id, nome, placa, marca, modelo, capacidade_ton, usa]
  );
  return rows[0];
};

const deleteVehicle = async (id, empresa_id) => {
  await pool.query("DELETE FROM veiculos WHERE id = $1 AND empresa_id = $2", [id, empresa_id]);
};

const getVehicleById = async (id, empresa_id) => {
  const { rows } = await pool.query(
    "SELECT * FROM veiculos WHERE id = $1 AND empresa_id = $2",
    [id, empresa_id]
  );
  return rows[0];
};

module.exports = {
  createVehicle,
  listVehicles,
  updateVehicle,
  deleteVehicle,
  getVehicleById,
};
