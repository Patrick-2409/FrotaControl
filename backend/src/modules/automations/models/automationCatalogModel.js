/**
 * Catálogo de TIPOS de automação (tabela `automacoes`) — dado estrutural da
 * plataforma, igual para todas as empresas (não é escopado por empresa_id).
 */

const { pool } = require("../../../db");

const listActiveCatalog = async () => {
  const { rows } = await pool.query(
    `SELECT id, codigo, nome, descricao
     FROM automacoes
     WHERE ativo = true
     ORDER BY nome`
  );
  return rows;
};

const getCatalogById = async (id) => {
  const { rows } = await pool.query(`SELECT * FROM automacoes WHERE id = $1`, [id]);
  return rows[0] || null;
};

module.exports = { listActiveCatalog, getCatalogById };
