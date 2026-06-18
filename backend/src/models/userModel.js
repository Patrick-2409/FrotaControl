const { pool } = require("../db");
const { queryTimed } = require("../utils/queryTimed");

const STATUS_PESSOA = new Set(["ativo", "afastado", "suspenso"]);

const trimOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const normalizeCnhDate = (v) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
};

const normalizeTreinamentos = (v) => {
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (v == null) return [];
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 40)
    .map((t) => ({
      titulo: trimOrNull(t?.titulo) || "Treino",
      validade: t?.validade ? normalizeCnhDate(t.validade) : null,
    }))
    .filter((t) => t.titulo);
};

const normalizeStatusPessoa = (v) => {
  const s = trimOrNull(v) || "ativo";
  return STATUS_PESSOA.has(s) ? s : "ativo";
};

/** Conta de acesso: ativo (pode autenticar) | inativo (bloqueado). */
const normalizeContaStatus = (v) => {
  const s = trimOrNull(v);
  if (s === "inativo") return "inativo";
  return "ativo";
};

const mergeUserRow = (existing, data) => {
  const treinamentos =
    data.treinamentos !== undefined ? normalizeTreinamentos(data.treinamentos) : normalizeTreinamentos(existing.treinamentos);
  return {
    nome: data.nome ?? existing.nome,
    email: data.email !== undefined ? data.email || null : existing.email,
    cpf_id: data.cpf_id ?? existing.cpf_id,
    veiculo_id: Object.prototype.hasOwnProperty.call(data, "veiculo_id") ? data.veiculo_id : existing.veiculo_id,
    role: data.role ?? existing.role,
    profile_image_url: Object.prototype.hasOwnProperty.call(data, "profile_image_url")
      ? trimOrNull(data.profile_image_url)
      : existing.profile_image_url,
    funcao: data.funcao !== undefined ? trimOrNull(data.funcao) : existing.funcao,
    cnh_categoria: data.cnh_categoria !== undefined ? trimOrNull(data.cnh_categoria) : existing.cnh_categoria,
    cnh_numero: data.cnh_numero !== undefined ? trimOrNull(data.cnh_numero) : existing.cnh_numero,
    cnh_validade:
      data.cnh_validade !== undefined ? normalizeCnhDate(data.cnh_validade) : normalizeCnhDate(existing.cnh_validade),
    observacoes: data.observacoes !== undefined ? trimOrNull(data.observacoes) : existing.observacoes,
    equipamento_vinculo:
      data.equipamento_vinculo !== undefined ? trimOrNull(data.equipamento_vinculo) : existing.equipamento_vinculo,
    operacao_escopo: data.operacao_escopo !== undefined ? trimOrNull(data.operacao_escopo) : existing.operacao_escopo,
    status_operacional:
      data.status_operacional !== undefined
        ? normalizeStatusPessoa(data.status_operacional)
        : normalizeStatusPessoa(existing.status_operacional),
    conta_status:
      data.conta_status !== undefined
        ? normalizeContaStatus(data.conta_status)
        : normalizeContaStatus(existing.conta_status),
    treinamentos,
  };
};

const createUser = async (
  {
    empresa_id,
    nome,
    email = null,
    cpf_id,
    senha_hash,
    role = "MOTORISTA",
    veiculo_id = null,
    profile_image_url = null,
    funcao = null,
    cnh_categoria = null,
    cnh_numero = null,
    cnh_validade = null,
    treinamentos = [],
    observacoes = null,
    equipamento_vinculo = null,
    operacao_escopo = null,
    status_operacional = "ativo",
    conta_status = "ativo",
  },
  db = pool
) => {
  const tr = JSON.stringify(normalizeTreinamentos(treinamentos));
  const st = normalizeStatusPessoa(status_operacional);
  const cs = normalizeContaStatus(conta_status);
  const { rows } = await db.query(
    `INSERT INTO usuarios (
       empresa_id, nome, email, cpf_id, senha_hash, role, veiculo_id, profile_image_url,
       funcao, cnh_categoria, cnh_numero, cnh_validade, treinamentos, observacoes,
       equipamento_vinculo, operacao_escopo, status_operacional, conta_status
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      empresa_id,
      nome,
      email,
      cpf_id,
      senha_hash,
      role,
      veiculo_id,
      trimOrNull(profile_image_url),
      trimOrNull(funcao),
      trimOrNull(cnh_categoria),
      trimOrNull(cnh_numero),
      normalizeCnhDate(cnh_validade),
      tr,
      trimOrNull(observacoes),
      trimOrNull(equipamento_vinculo),
      trimOrNull(operacao_escopo),
      st,
      cs,
    ]
  );
  return rows[0];
};

const normalizeMotoristaLoginInput = (loginInput) => {
  if (typeof loginInput === "object" && loginInput !== null) {
    return {
      cpf: trimOrNull(loginInput.cpf),
      email: trimOrNull(loginInput.email),
      user_id: Number.isInteger(loginInput.user_id) && loginInput.user_id > 0 ? loginInput.user_id : null,
    };
  }
  return {
    cpf: trimOrNull(loginInput),
    email: null,
    user_id: null,
  };
};

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const normalizeUserLoginInput = (loginInput) => {
  if (typeof loginInput === "object" && loginInput !== null) {
    return {
      cpf: trimOrNull(loginInput.cpf),
      email: trimOrNull(loginInput.email),
      user_id: Number.isInteger(loginInput.user_id) && loginInput.user_id > 0 ? loginInput.user_id : null,
    };
  }

  const raw = trimOrNull(loginInput);
  if (!raw) {
    return { cpf: null, email: null, user_id: null };
  }

  if (isEmail(raw)) {
    return { cpf: null, email: raw.toLowerCase(), user_id: null };
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 11) {
    return { cpf: digits, email: null, user_id: null };
  }

  if (/^USR-\d+$/i.test(raw) || /^\d+$/.test(raw)) {
    const userId = Number(raw.replace(/\D/g, ""));
    return { cpf: null, email: null, user_id: Number.isInteger(userId) && userId > 0 ? userId : null };
  }

  return { cpf: null, email: null, user_id: null };
};

const getMotoristaByLogin = async (loginInput) => {
  const login = normalizeMotoristaLoginInput(loginInput);
  const whereClauses = [];
  const params = [];
  let idx = 1;

  if (login.cpf) {
    whereClauses.push(`u.cpf_id = $${idx}`);
    params.push(login.cpf);
    idx += 1;
  }
  if (login.email) {
    whereClauses.push(`LOWER(COALESCE(u.email, '')) = LOWER($${idx})`);
    params.push(login.email);
    idx += 1;
  }
  if (login.user_id) {
    whereClauses.push(`u.id = $${idx}`);
    params.push(login.user_id);
    idx += 1;
  }

  if (!whereClauses.length) return [];

  const { rows } = await pool.query(
    `SELECT u.*, e.nome AS empresa_nome, e.logo_url,
            v.nome AS veiculo_nome, v.placa, v.marca AS veiculo_marca, v.modelo AS veiculo_modelo,
            COALESCE(NULLIF(TRIM(v.tipo_operacao), ''), CASE WHEN COALESCE(v.usa_para_transporte, false) THEN 'transporte' ELSE 'apoio' END) AS veiculo_tipo_operacao,
            COALESCE(v.usa_para_transporte, false) AS veiculo_usa_para_transporte
     FROM usuarios u
     JOIN empresas e ON e.id = u.empresa_id
     LEFT JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
     WHERE u.role = 'MOTORISTA'
       AND (${whereClauses.join(" OR ")})
       AND COALESCE(u.conta_status, 'ativo') = 'ativo'`,
    params
  );
  return rows;
};

const getUsersByRoleLogin = async (role, loginInput) => {
  const login = normalizeUserLoginInput(loginInput);
  const whereClauses = [];
  const params = [role];
  let idx = 2;

  if (login.cpf) {
    whereClauses.push(`u.cpf_id = $${idx}`);
    params.push(login.cpf);
    idx += 1;
  }
  if (login.email) {
    whereClauses.push(`LOWER(COALESCE(u.email, '')) = LOWER($${idx})`);
    params.push(login.email);
    idx += 1;
  }
  if (login.user_id) {
    whereClauses.push(`u.id = $${idx}`);
    params.push(login.user_id);
    idx += 1;
  }

  if (!whereClauses.length) return [];

  const { rows } = await pool.query(
    `SELECT u.*, e.nome AS empresa_nome, e.logo_url,
            v.nome AS veiculo_nome, v.placa, v.marca AS veiculo_marca, v.modelo AS veiculo_modelo,
            COALESCE(NULLIF(TRIM(v.tipo_operacao), ''), CASE WHEN COALESCE(v.usa_para_transporte, false) THEN 'transporte' ELSE 'apoio' END) AS veiculo_tipo_operacao,
            COALESCE(v.usa_para_transporte, false) AS veiculo_usa_para_transporte
     FROM usuarios u
     LEFT JOIN empresas e ON e.id = u.empresa_id
     LEFT JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
     WHERE u.role = $1
       AND (${whereClauses.join(" OR ")})
       AND COALESCE(u.conta_status, 'ativo') = 'ativo'
     ORDER BY u.created_at DESC, u.id DESC`,
    params
  );
  return rows;
};

const getAdminsEmpresaByLogin = async (loginInput) => getUsersByRoleLogin("ADMIN_EMPRESA", loginInput);

const getApontadorByLogin = async (loginInput) => getUsersByRoleLogin("APONTADOR", loginInput);

const getSuperAdminsByLogin = async (loginInput) => getUsersByRoleLogin("SUPER_ADMIN", loginInput);

const getAdminsEmpresaByEmail = async (email) => getAdminsEmpresaByLogin({ email });

const getApontadorByEmail = async (email) => getApontadorByLogin({ email });

const getSuperAdminsByEmail = async (email) => getSuperAdminsByLogin({ email });

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
    `SELECT u.*,
            e.nome AS empresa_nome, e.logo_url,
            v.nome AS veiculo_nome, v.placa, v.marca AS veiculo_marca, v.modelo AS veiculo_modelo,
            COALESCE(NULLIF(TRIM(v.tipo_operacao), ''), CASE WHEN COALESCE(v.usa_para_transporte, false) THEN 'transporte' ELSE 'apoio' END) AS veiculo_tipo_operacao,
            COALESCE(v.usa_para_transporte, false) AS veiculo_usa_para_transporte
     FROM usuarios u
     LEFT JOIN empresas e ON e.id = u.empresa_id
     LEFT JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
     WHERE u.id = $1 ${companyFilter}`,
    values
  );
  return rows[0];
};

const listUsersByCompany = async (
  empresa_id,
  { page = 1, limit = 10, search = "", role = "", status_operacional = "", escopo_operacional = "" } = {}
) => {
  const clauses = ["u.empresa_id = $1"];
  const params = [empresa_id];
  let idx = 2;

  if (search) {
    clauses.push(
      `(u.nome ILIKE $${idx} OR u.email ILIKE $${idx} OR u.cpf_id ILIKE $${idx} OR COALESCE(u.funcao, '') ILIKE $${idx})`
    );
    params.push(`%${search}%`);
    idx += 1;
  }
  if (role && role !== "ALL" && ["MOTORISTA", "APONTADOR", "ADMIN_EMPRESA"].includes(role)) {
    clauses.push(`u.role = $${idx}`);
    params.push(role);
    idx += 1;
  }
  if (escopo_operacional === "1" || escopo_operacional === "true") {
    clauses.push(`u.role IN ('MOTORISTA', 'APONTADOR')`);
  }
  if (status_operacional && STATUS_PESSOA.has(status_operacional)) {
    clauses.push(`u.status_operacional = $${idx}`);
    params.push(status_operacional);
    idx += 1;
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Math.min(500, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const whereSql = clauses.join(" AND ");
  const countParams = [...params];
  const limitPlaceholder = `$${idx}`;
  const offsetPlaceholder = `$${idx + 1}`;
  params.push(limitNum, offset);

  const count = await queryTimed(
    `SELECT COUNT(*)::int AS total FROM usuarios u WHERE ${whereSql}`,
    countParams,
    { label: "usuarios-count" }
  );
  const { rows } = await queryTimed(
    `SELECT u.id, u.empresa_id, u.nome, u.email, u.cpf_id, u.role, u.veiculo_id, u.profile_image_url,
            u.funcao, u.cnh_categoria, u.cnh_numero, u.cnh_validade, u.treinamentos, u.observacoes,
            u.equipamento_vinculo, u.operacao_escopo, u.status_operacional, u.conta_status, u.created_at,
            v.nome AS veiculo_nome, v.placa, v.marca AS veiculo_marca, v.modelo AS veiculo_modelo
     FROM usuarios u
     LEFT JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
     WHERE ${whereSql}
     ORDER BY u.created_at DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    params,
    { label: "usuarios-list" }
  );
  return { items: rows, total: count.rows[0].total };
};

const updateUser = async (id, empresa_id, data) => {
  const exRows = await pool.query(`SELECT * FROM usuarios WHERE id = $1 AND empresa_id = $2`, [id, empresa_id]);
  const existing = exRows.rows[0];
  if (!existing) return null;
  const m = mergeUserRow(existing, data);
  if (m.role === "APONTADOR") {
    m.veiculo_id = null;
  }
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET nome = $3,
         email = $4,
         cpf_id = $5,
         veiculo_id = $6,
         role = $7,
         profile_image_url = $8,
         funcao = $9,
         cnh_categoria = $10,
         cnh_numero = $11,
         cnh_validade = $12,
         treinamentos = $13::jsonb,
         observacoes = $14,
         equipamento_vinculo = $15,
         operacao_escopo = $16,
         status_operacional = $17,
         conta_status = $18
     WHERE id = $1 AND empresa_id = $2
     RETURNING *`,
    [
      id,
      empresa_id,
      m.nome,
      m.email,
      m.cpf_id,
      m.veiculo_id,
      m.role,
      m.profile_image_url,
      m.funcao,
      m.cnh_categoria,
      m.cnh_numero,
      m.cnh_validade,
      JSON.stringify(m.treinamentos),
      m.observacoes,
      m.equipamento_vinculo,
      m.operacao_escopo,
      m.status_operacional,
      m.conta_status,
    ]
  );
  return rows[0];
};

/** Atualização por SUPER_ADMIN (sem filtro empresa na linha; validação de papel no controller). */
const updateUserAsSuperAdmin = async (id, data) => {
  const exRows = await pool.query(
    `SELECT * FROM usuarios WHERE id = $1 AND role IN ('MOTORISTA', 'ADMIN_EMPRESA', 'APONTADOR', 'SUPER_ADMIN')`,
    [id]
  );
  const existing = exRows.rows[0];
  if (!existing) return null;
  const m = mergeUserRow(existing, data);
  if (m.role === "SUPER_ADMIN" || m.role === "APONTADOR") {
    m.veiculo_id = null;
  }
  const empresa_id = data.empresa_id !== undefined ? data.empresa_id : existing.empresa_id;
  const { rows } = await pool.query(
    `UPDATE usuarios
     SET nome = $2,
         email = $3,
         cpf_id = $4,
         veiculo_id = $5,
         role = $6,
         empresa_id = $7,
         profile_image_url = $8,
         funcao = $9,
         cnh_categoria = $10,
         cnh_numero = $11,
         cnh_validade = $12,
         treinamentos = $13::jsonb,
         observacoes = $14,
         equipamento_vinculo = $15,
         operacao_escopo = $16,
         status_operacional = $17,
         conta_status = $18
     WHERE id = $1 AND role IN ('MOTORISTA', 'ADMIN_EMPRESA', 'APONTADOR', 'SUPER_ADMIN')
     RETURNING *`,
    [
      id,
      m.nome,
      m.email,
      m.cpf_id,
      m.role === "SUPER_ADMIN" || m.role === "APONTADOR" ? null : m.veiculo_id,
      m.role,
      m.role === "SUPER_ADMIN" ? null : empresa_id,
      m.profile_image_url,
      m.funcao,
      m.cnh_categoria,
      m.cnh_numero,
      m.cnh_validade,
      JSON.stringify(m.treinamentos),
      m.observacoes,
      m.equipamento_vinculo,
      m.operacao_escopo,
      m.status_operacional,
      m.conta_status,
    ]
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

/** Uma linha de utilizador para SUPER_ADMIN (mesmo formato base que a listagem). */
const getUserByIdForSuperAdmin = async (id) => {
  const { rows } = await pool.query(
    `SELECT u.*,
        e.nome AS empresa_nome,
        v.nome AS veiculo_nome, v.placa
     FROM usuarios u
     LEFT JOIN empresas e ON e.id = u.empresa_id
     LEFT JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
     WHERE u.id = $1 AND u.role IN ('MOTORISTA', 'ADMIN_EMPRESA', 'APONTADOR', 'SUPER_ADMIN')`,
    [id]
  );
  return rows[0] || null;
};

module.exports = {
  createUser,
  getMotoristaByLogin,
  getAdminsEmpresaByLogin,
  getApontadorByLogin,
  getSuperAdminsByLogin,
  getAdminsEmpresaByEmail,
  getApontadorByEmail,
  getSuperAdminsByEmail,
  getAdminEmpresaByEmail,
  getSuperAdminByEmail,
  getUserById,
  getUserByIdForSuperAdmin,
  listUsersByCompany,
  updateUser,
  updateUserAsSuperAdmin,
  updateUserPassword,
  updateOwnUserPassword,
  updateOwnProfileImage,
  updateOwnProfileData,
};
