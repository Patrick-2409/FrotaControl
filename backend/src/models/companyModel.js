const { pool } = require("../db");

const normalizeStoredLogoUrl = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const normalized = raw.replace(/\\/g, "/");
  const uploadsIdx = normalized.toLowerCase().indexOf("/uploads/");
  if (uploadsIdx >= 0) {
    return normalized.slice(uploadsIdx);
  }
  if (normalized.toLowerCase().startsWith("uploads/")) {
    return `/${normalized}`;
  }
  if (normalized.startsWith("/")) {
    return normalized;
  }
  return `/${normalized}`;
};

const createCompany = async ({ nome, logo_url }, db = pool) => {
  const existing = await db.query(
    `SELECT id FROM empresas WHERE LOWER(TRIM(nome)) = LOWER(TRIM($1)) LIMIT 1`,
    [nome]
  );
  if (existing.rowCount > 0) {
    const err = new Error("Já existe uma empresa com este nome.");
    err.status = 409;
    throw err;
  }
  const { rows } = await db.query(
    "INSERT INTO empresas (nome, logo_url) VALUES ($1, $2) RETURNING *",
    [nome, normalizeStoredLogoUrl(logo_url)]
  );
  return rows[0];
};

const getCompanyById = async (id) => {
  const { rows } = await pool.query("SELECT * FROM empresas WHERE id = $1", [id]);
  return rows[0];
};

const listCompanies = async ({ page = 1, limit = 10, search = "" } = {}) => {
  const offset = (page - 1) * limit;
  const where = search ? "WHERE nome ILIKE $1" : "";
  const values = search ? [`%${search}%`, limit, offset] : [limit, offset];
  const qLimit = search ? "$2" : "$1";
  const qOffset = search ? "$3" : "$2";
  const qCount = await pool.query(
    `SELECT COUNT(*)::int AS total FROM empresas ${where}`,
    search ? [`%${search}%`] : []
  );
  const { rows } = await pool.query(
    `SELECT * FROM empresas ${where} ORDER BY created_at DESC LIMIT ${qLimit} OFFSET ${qOffset}`,
    values
  );
  return { items: rows, total: qCount.rows[0].total };
};

const updateCompany = async (id, data) => {
  const existing = await pool.query(
    `SELECT id FROM empresas WHERE LOWER(TRIM(nome)) = LOWER(TRIM($1)) AND id <> $2 LIMIT 1`,
    [data.nome, id]
  );
  if (existing.rowCount > 0) {
    const err = new Error("Já existe uma empresa com este nome.");
    err.status = 409;
    throw err;
  }
  const { rows } = await pool.query(
    `UPDATE empresas
     SET nome = $2,
         logo_url = COALESCE($3, logo_url)
     WHERE id = $1
     RETURNING *`,
    [id, data.nome, normalizeStoredLogoUrl(data.logo_url)]
  );
  return rows[0];
};

const deleteCompany = async (id) => {
  await pool.query("DELETE FROM empresas WHERE id = $1", [id]);
};

module.exports = {
  createCompany,
  getCompanyById,
  listCompanies,
  updateCompany,
  deleteCompany,
};
