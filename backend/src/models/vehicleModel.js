const { pool } = require("../db");

const createVehicle = async ({ empresa_id, nome, placa, marca = null, modelo = null, capacidade_ton = null }) => {
  const { rows } = await pool.query(
    `INSERT INTO veiculos (empresa_id, nome, placa, marca, modelo, capacidade_ton)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [empresa_id, nome, placa, marca, modelo, capacidade_ton]
  );
  return rows[0];
};

const listVehicles = async (empresa_id, { page = 1, limit = 10, search = "" } = {}) => {
  const offset = (page - 1) * limit;
  const whereSearch = search
    ? "AND (v.nome ILIKE $2 OR v.placa ILIKE $2 OR COALESCE(v.marca, '') ILIKE $2 OR COALESCE(v.modelo, '') ILIKE $2 OR u.nome ILIKE $2)"
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
     WHERE v.empresa_id = $1 ${whereSearch}`,
    countValues
  );
  const { rows } = await pool.query(
    `SELECT v.*, u.id AS motorista_id, u.nome AS motorista_nome
     FROM veiculos v
     LEFT JOIN usuarios u ON u.veiculo_id = v.id AND u.empresa_id = v.empresa_id
     WHERE v.empresa_id = $1
     ${whereSearch}
     ORDER BY v.created_at DESC
     LIMIT ${qLimit} OFFSET ${qOffset}`,
    rowsValues
  );
  return { items: rows, total: count.rows[0].total };
};

const updateVehicle = async (id, empresa_id, data) => {
  const values = [id, empresa_id, data.nome, data.placa, data.marca || null, data.modelo || null];
  let sql = `UPDATE veiculos
     SET nome = $3, placa = $4, marca = $5, modelo = $6`;
  if (Object.prototype.hasOwnProperty.call(data, "capacidade_ton")) {
    values.push(data.capacidade_ton);
    sql += `, capacidade_ton = $${values.length}`;
  }
  sql += ` WHERE id = $1 AND empresa_id = $2 RETURNING *`;
  const { rows } = await pool.query(sql, values);
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
