const { pool } = require("../db");

const createUser = async ({
  empresa_id,
  nome,
  email = null,
  cpf_id,
  senha_hash,
  role = "MOTORISTA",
  veiculo_id = null,
}, db = pool) => {
  const { rows } = await db.query(
    `INSERT INTO usuarios (empresa_id, nome, email, cpf_id, senha_hash, role, veiculo_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, empresa_id, nome, email, cpf_id, role, veiculo_id, profile_image_url, created_at`,
    [empresa_id, nome, email, cpf_id, senha_hash, role, veiculo_id]
  );
  return rows[0];
};

const getMotoristaByLogin = async (login) => {
  const { rows } = await pool.query(
    `SELECT u.*, e.nome AS empresa_nome, e.logo_url, v.nome AS veiculo_nome, v.placa, v.marca AS veiculo_marca, v.modelo AS veiculo_modelo
     FROM usuarios u
     JOIN empresas e ON e.id = u.empresa_id
     LEFT JOIN veiculos v ON v.id = u.veiculo_id
     WHERE u.role = 'MOTORISTA'
       AND u.cpf_id = $1`,
    [login]
  );
  return rows;
};

const getAdminsEmpresaByEmail = async (email) => {
  const { rows } = await pool.query(
    `SELECT u.*, e.nome AS empresa_nome, e.logo_url, v.nome AS veiculo_nome, v.placa, v.marca AS veiculo_marca, v.modelo AS veiculo_modelo
     FROM usuarios u
     JOIN empresas e ON e.id = u.empresa_id
     LEFT JOIN veiculos v ON v.id = u.veiculo_id
     WHERE LOWER(COALESCE(u.email, '')) = LOWER($1)
      AND u.role = 'ADMIN_EMPRESA'
     ORDER BY u.created_at DESC, u.id DESC`,
    [email]
  );
  return rows;
};

/** Mesma forma que getAdminsEmpresaByEmail, filtrando papel APONTADOR (várias linhas se duplicidade). */
const getApontadorByEmail = async (email) => {
  const { rows } = await pool.query(
    `SELECT u.*, e.nome AS empresa_nome, e.logo_url, v.nome AS veiculo_nome, v.placa, v.marca AS veiculo_marca, v.modelo AS veiculo_modelo
     FROM usuarios u
     JOIN empresas e ON e.id = u.empresa_id
     LEFT JOIN veiculos v ON v.id = u.veiculo_id
     WHERE LOWER(COALESCE(u.email, '')) = LOWER($1)
       AND u.role = 'APONTADOR'
     ORDER BY u.created_at DESC, u.id DESC`,
    [email]
  );
  return rows;
};

const getSuperAdminsByEmail = async (email) => {
  const { rows } = await pool.query(
    `SELECT u.*, NULL::text AS empresa_nome, NULL::text AS logo_url, NULL::text AS veiculo_nome, NULL::text AS placa
     FROM usuarios u
     WHERE LOWER(COALESCE(u.email, '')) = LOWER($1)
      AND u.role = 'SUPER_ADMIN'
     ORDER BY u.created_at DESC, u.id DESC`,
    [email]
  );
  return rows;
};

const getAdminEmpresaByEmail = async (email) => {
  const rows = await getAdminsEmpresaByEmail(email);
  return rows[0];
};

const getSuperAdminByEmail = async (email) => {
  const rows = await getSuperAdminsByEmail(email);
  return rows[0];
};

const getUserById = async (id, empresa_id) => {
  const values = [id];
  const companyFilter =
    empresa_id == null ? "AND u.empresa_id IS NULL" : "AND u.empresa_id = $2";
  if (empresa_id != null) {
    values.push(empresa_id);
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.empresa_id, u.nome, u.email, u.cpf_id, u.role, u.veiculo_id, u.profile_image_url,
            e.nome AS empresa_nome, e.logo_url, v.nome AS veiculo_nome, v.placa, v.marca AS veiculo_marca, v.modelo AS veiculo_modelo
     FROM usuarios u
     LEFT JOIN empresas e ON e.id = u.empresa_id
     LEFT JOIN veiculos v ON v.id = u.veiculo_id
     WHERE u.id = $1 ${companyFilter}`,
    values
  );
  return rows[0];
};

const listUsersByCompany = async (empresa_id, { page = 1, limit = 10, search = "" } = {}) => {
  const offset = (page - 1) * limit;
  const whereSearch = search
    ? "AND (u.nome ILIKE $2 OR u.email ILIKE $2 OR u.cpf_id ILIKE $2)"
    : "";
  const countValues = search ? [empresa_id, `%${search}%`] : [empresa_id];
  const rowsValues = search
    ? [empresa_id, `%${search}%`, limit, offset]
    : [empresa_id, limit, offset];
  const qLimit = search ? "$3" : "$2";
  const qOffset = search ? "$4" : "$3";

  const count = await pool.query(
    `SELECT COUNT(*)::int AS total FROM usuarios u WHERE u.empresa_id = $1 ${whereSearch}`,
    countValues
  );
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.email, u.cpf_id, u.role, u.empresa_id, u.veiculo_id, u.profile_image_url,
            v.nome AS veiculo_nome, v.placa, v.marca AS veiculo_marca, v.modelo AS veiculo_modelo
     FROM usuarios u
     LEFT JOIN veiculos v ON v.id = u.veiculo_id
     WHERE u.empresa_id = $1
     ${whereSearch}
     ORDER BY u.created_at DESC
     LIMIT ${qLimit} OFFSET ${qOffset}`,
    rowsValues
  );
  return { items: rows, total: count.rows[0].total };
};

const updateUser = async (id, empresa_id, data) => {
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET nome = $3,
         email = $4,
         cpf_id = $5,
         veiculo_id = $6,
         role = $7
     WHERE id = $1 AND empresa_id = $2
     RETURNING id, nome, email, cpf_id, role, empresa_id, veiculo_id, profile_image_url`,
    [id, empresa_id, data.nome, data.email || null, data.cpf_id, data.veiculo_id, data.role]
  );
  return rows[0];
};

const updateUserPassword = async (id, empresa_id, senha_hash) => {
  await pool.query(
    `UPDATE usuarios
     SET senha_hash = $3
     WHERE id = $1 AND empresa_id = $2`,
    [id, empresa_id, senha_hash]
  );
};

const deleteUser = async (id, empresa_id) => {
  await pool.query("DELETE FROM usuarios WHERE id = $1 AND empresa_id = $2", [id, empresa_id]);
};

const updateOwnUserPassword = async (id, senha_hash) => {
  await pool.query(
    `UPDATE usuarios
     SET senha_hash = $2
     WHERE id = $1`,
    [id, senha_hash]
  );
};

const updateOwnProfileImage = async (id, profileImageUrl) => {
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET profile_image_url = $2
     WHERE id = $1
     RETURNING id, profile_image_url`,
    [id, profileImageUrl]
  );
  return rows[0];
};

const updateOwnProfileData = async (id, data) => {
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET nome = COALESCE($2, nome)
     WHERE id = $1
     RETURNING id, nome, email, cpf_id, role, empresa_id, veiculo_id, profile_image_url`,
    [id, data?.nome || null]
  );
  return rows[0];
};

module.exports = {
  createUser,
  getMotoristaByLogin,
  getAdminsEmpresaByEmail,
  getApontadorByEmail,
  getSuperAdminsByEmail,
  getAdminEmpresaByEmail,
  getSuperAdminByEmail,
  getUserById,
  listUsersByCompany,
  updateUser,
  updateUserPassword,
  deleteUser,
  updateOwnUserPassword,
  updateOwnProfileImage,
  updateOwnProfileData,
};
