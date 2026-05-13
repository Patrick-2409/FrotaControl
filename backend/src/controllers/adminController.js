const bcrypt = require("bcryptjs");
const { z } = require("zod");
const {
  createCompany,
  deleteCompany,
  listCompanies,
  updateCompany,
} = require("../models/companyModel");
const { pool } = require("../db");
const {
  createUser,
  deleteUser,
  listUsersByCompany,
  updateUser,
  updateUserPassword,
} = require("../models/userModel");
const {
  createVehicle,
  deleteVehicle,
  listVehicles,
  updateVehicle,
  getVehicleById,
} = require("../models/vehicleModel");
const { logAudit } = require("../services/auditService");

const hasFullName = (value) => {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  const parts = normalized.split(" ").filter(Boolean);
  return parts.length >= 2;
};

const companySchema = z.object({
  nome: z.string().trim().min(2),
  logo_url: z.string().optional(),
});

const companyCreateSchema = companySchema.extend({
  admin_nome: z.string().trim().min(3).optional(),
  admin_email: z.string().email().optional(),
  admin_senha: z
    .string()
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
      "Senha do admin deve ter ao menos 8 caracteres, maiúscula, minúscula e número"
    )
    .optional(),
}).superRefine((val, ctx) => {
  if (val.admin_nome && !hasFullName(val.admin_nome)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["admin_nome"],
      message: "Informe o nome completo do administrador (nome e sobrenome).",
    });
  }
});

const userSchema = z.object({
  nome: z.string().trim().min(3),
  email: z.string().email().optional(),
  cpf_id: z.string().trim().min(3),
  senha: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
          "Senha deve ter ao menos 8 caracteres, maiúscula, minúscula e número"
        ),
    ])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  role: z.enum(["MOTORISTA", "ADMIN_EMPRESA", "APONTADOR", "SUPER_ADMIN"]).default("MOTORISTA"),
  veiculo_id: z.coerce.number().int().positive().nullable().optional(),
}).superRefine((val, ctx) => {
  if (!hasFullName(val.nome)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nome"],
      message: "Informe o nome completo (nome e sobrenome).",
    });
  }
  if (val.role !== "MOTORISTA" && !String(val.email || "").trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: "E-mail é obrigatório para administrador, apontador e super administrador.",
    });
  }
});

const { vehicleBodySchema, toVehicleWritePayload } = require("../validators/vehicleWriteSchema");
const vehicleSchema = vehicleBodySchema;

const getCompanyId = (req) => {
  if (req.user.role === "SUPER_ADMIN") {
    const empresaId = Number(req.query.empresa_id || req.body?.empresa_id);
    if (!empresaId) {
      return null;
    }
    return empresaId;
  }
  return Number(req.user.empresa_id);
};
const getPagination = (req) => ({
  page: Number(req.query.page || 1),
  limit: Number(req.query.limit || 10),
  search: String(req.query.search || ""),
});

const normalizeCpfId = (value) => {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 11 ? digits : raw;
};

const normalizeUserPayload = (payload) => ({
  ...payload,
  nome: String(payload?.nome || "").trim().replace(/\s+/g, " "),
  email: payload?.email ? String(payload.email).trim().toLowerCase() : null,
  cpf_id: normalizeCpfId(payload?.cpf_id),
});

const checkRoleScopedUniqueness = async ({ role, email, cpf_id, excludeUserId = null }) => {
  if (role === "MOTORISTA") {
    const params = [cpf_id];
    const andExclude = excludeUserId ? "AND id <> $2" : "";
    if (excludeUserId) params.push(excludeUserId);
    const motoristaExists = await pool.query(
      `SELECT id
       FROM usuarios
       WHERE role = 'MOTORISTA'
         AND cpf_id = $1
         ${andExclude}
       LIMIT 1`,
      params
    );
    if (motoristaExists.rowCount > 0) {
      return "Já existe outro motorista com este CPF.";
    }
    return null;
  }

  if (!email) {
    return "Este perfil deve informar e-mail válido.";
  }

  const adminEmailParams = [email];
  const adminEmailExclude = excludeUserId ? "AND id <> $2" : "";
  if (excludeUserId) adminEmailParams.push(excludeUserId);
  const adminEmailExists = await pool.query(
    `SELECT id
     FROM usuarios
     WHERE role IN ('ADMIN_EMPRESA', 'SUPER_ADMIN', 'APONTADOR')
       AND LOWER(COALESCE(email, '')) = LOWER($1)
       ${adminEmailExclude}
     LIMIT 1`,
    adminEmailParams
  );
  if (adminEmailExists.rowCount > 0) {
    return "Já existe outro utilizador com este e-mail.";
  }

  const adminCpfParams = [cpf_id];
  const adminCpfExclude = excludeUserId ? "AND id <> $2" : "";
  if (excludeUserId) adminCpfParams.push(excludeUserId);
  const adminCpfExists = await pool.query(
    `SELECT id
     FROM usuarios
     WHERE role IN ('ADMIN_EMPRESA', 'SUPER_ADMIN', 'APONTADOR')
       AND cpf_id = $1
       ${adminCpfExclude}
     LIMIT 1`,
    adminCpfParams
  );
  if (adminCpfExists.rowCount > 0) {
    return "Já existe outro utilizador com este CPF.";
  }

  return null;
};

const createCompanyCtrl = async (req, res) => {
  const payload = companyCreateSchema.parse(req.body);
  const adminEmailNormalized = String(payload.admin_email || "").trim().toLowerCase();
  if (!payload.admin_nome || !hasFullName(payload.admin_nome)) {
    return res.status(400).json({
      success: false,
      error: "Informe o nome completo do administrador da empresa.",
      message: "Informe o nome completo do administrador da empresa.",
    });
  }
  if (!payload.admin_email || !payload.admin_senha) {
    return res.status(400).json({
      success: false,
      error: "Para criar empresa, informe o e-mail e a senha do administrador da empresa.",
      message: "Para criar empresa, informe o e-mail e a senha do administrador da empresa.",
    });
  }

  const client = await pool.connect();
  let row = null;
  let adminUser = null;
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id
       FROM usuarios
       WHERE role IN ('ADMIN_EMPRESA', 'SUPER_ADMIN', 'APONTADOR')
         AND LOWER(COALESCE(email, '')) = LOWER($1)
       LIMIT 1`,
      [adminEmailNormalized]
    );
    if (existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        error: "Este e-mail já está em uso por outro usuário.",
        message: "Este e-mail já está em uso por outro usuário.",
      });
    }

    row = await createCompany(payload, client);
    const senha_hash = await bcrypt.hash(payload.admin_senha, 10);
    adminUser = await createUser({
      empresa_id: row.id,
      nome: payload.admin_nome.trim().replace(/\s+/g, " "),
      email: adminEmailNormalized,
      cpf_id: adminEmailNormalized,
      senha_hash,
      role: "ADMIN_EMPRESA",
      veiculo_id: null,
    }, client);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await logAudit({
    usuario_id: req.user?.sub,
    acao: "criou",
    tabela: "empresas",
    registro_id: row.id,
  });
  await logAudit({
    usuario_id: req.user?.sub,
    acao: "criou",
    tabela: "usuarios",
    registro_id: adminUser.id,
  });

  return res.status(201).json({
    ...row,
    admin_empresa_email: adminUser?.email || null,
  });
};

const listCompaniesCtrl = async (req, res) => {
  const { page, limit, search } = getPagination(req);
  if (req.user.role === "SUPER_ADMIN") {
    const offset = (page - 1) * limit;
    const where = search ? "WHERE e.nome ILIKE $1" : "";
    const values = search ? [`%${search}%`, limit, offset] : [limit, offset];
    const qLimit = search ? "$2" : "$1";
    const qOffset = search ? "$3" : "$2";
    const countValues = search ? [`%${search}%`] : [];
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM empresas e ${where}`, countValues);
    const { rows } = await pool.query(
      `
      SELECT
        e.id,
        e.nome,
        e.logo_url,
        e.created_at,
        COUNT(DISTINCT u.id)::int AS usuarios_count,
        COUNT(DISTINCT v.id)::int AS veiculos_count
      FROM empresas e
      LEFT JOIN usuarios u ON u.empresa_id = e.id AND u.role IN ('ADMIN_EMPRESA','MOTORISTA','APONTADOR')
      LEFT JOIN veiculos v ON v.empresa_id = e.id
      ${where}
      GROUP BY e.id
      ORDER BY e.created_at DESC
      LIMIT ${qLimit} OFFSET ${qOffset}
      `,
      values
    );
    return res.json({
      items: rows,
      total: count.rows[0].total,
      page,
      totalPages: Math.max(1, Math.ceil(count.rows[0].total / limit)),
    });
  }
  const result = await listCompanies({ page, limit, search });
  return res.json({
    ...result,
    page,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};

const updateCompanyCtrl = async (req, res) => {
  const payload = companySchema.parse(req.body);
  const row = await updateCompany(Number(req.params.id), payload);
  await logAudit({
    usuario_id: req.user?.sub,
    acao: "editou",
    tabela: "empresas",
    registro_id: row.id,
  });
  return res.json(row);
};

const deleteCompanyCtrl = async (req, res) => {
  const id = Number(req.params.id);
  await deleteCompany(Number(req.params.id));
  await logAudit({
    usuario_id: req.user?.sub,
    acao: "excluiu",
    tabela: "empresas",
    registro_id: id,
  });
  return res.status(204).send();
};

const createUserCtrl = async (req, res) => {
  const payload = normalizeUserPayload(userSchema.parse(req.body));
  const empresa_id = payload.role === "SUPER_ADMIN" ? null : getCompanyId(req);
  if (req.user.role === "ADMIN_EMPRESA" && payload.role === "SUPER_ADMIN") {
    return res.status(403).json({
      success: false,
      error: "Administrador da empresa não pode criar SUPER_ADMIN.",
      message: "Administrador da empresa não pode criar SUPER_ADMIN.",
    });
  }
  if (payload.role !== "SUPER_ADMIN" && !empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório para este perfil.",
      message: "empresa_id é obrigatório para este perfil.",
    });
  }
  if (payload.role === "MOTORISTA" && !payload.veiculo_id) {
    return res.status(400).json({
      success: false,
      error: "Motorista deve ter veículo vinculado",
      message: "Motorista deve ter veículo vinculado",
    });
  }
  if (!payload.senha) {
    return res.status(400).json({
      success: false,
      error: "Senha é obrigatória para criar usuário.",
      message: "Senha é obrigatória para criar usuário.",
    });
  }
  const identityError = await checkRoleScopedUniqueness({
    role: payload.role,
    email: payload.email,
    cpf_id: payload.cpf_id,
  });
  if (identityError) {
    return res.status(409).json({
      success: false,
      error: identityError,
      message: identityError,
    });
  }
  const senha_hash = await bcrypt.hash(payload.senha, 10);
  const row = await createUser({
    ...payload,
    empresa_id,
    veiculo_id: payload.role === "SUPER_ADMIN" || payload.role === "APONTADOR" ? null : payload.veiculo_id,
    senha_hash,
  });
  await logAudit({
    usuario_id: req.user?.sub,
    acao: "criou",
    tabela: "usuarios",
    registro_id: row.id,
  });
  return res.status(201).json(row);
};

const listUsersCtrl = async (req, res) => {
  if (req.user.role === "SUPER_ADMIN") {
    const { page, limit, search } = getPagination(req);
    const offset = (page - 1) * limit;
    const role = String(req.query.role || "ALL");
    const companyId = Number(req.query.empresa_id || 0);
    const status = String(req.query.status || "ALL");

    const values = [];
    let idx = 1;
    const clauses = ["u.role IN ('MOTORISTA', 'ADMIN_EMPRESA', 'APONTADOR', 'SUPER_ADMIN')"];
    if (search) {
      clauses.push(`(u.nome ILIKE $${idx} OR u.email ILIKE $${idx} OR u.cpf_id ILIKE $${idx} OR e.nome ILIKE $${idx} OR v.nome ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx += 1;
    }
    if (role !== "ALL") {
      clauses.push(`u.role = $${idx}`);
      values.push(role);
      idx += 1;
    }
    if (companyId) {
      clauses.push(`u.empresa_id = $${idx}`);
      values.push(companyId);
      idx += 1;
    }
    if (status === "COM_VEICULO") {
      clauses.push("u.veiculo_id IS NOT NULL");
    } else if (status === "SEM_VEICULO") {
      clauses.push("u.veiculo_id IS NULL");
    }
    const where = `WHERE ${clauses.join(" AND ")}`;

    const count = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM usuarios u
      LEFT JOIN empresas e ON e.id = u.empresa_id
      LEFT JOIN veiculos v ON v.id = u.veiculo_id
      ${where}
      `,
      values
    );
    const rows = await pool.query(
      `
      SELECT
        u.id, u.nome, u.email, u.cpf_id, u.role, u.empresa_id, u.veiculo_id, u.profile_image_url, u.created_at,
        e.nome AS empresa_nome,
        v.nome AS veiculo_nome, v.placa
      FROM usuarios u
      LEFT JOIN empresas e ON e.id = u.empresa_id
      LEFT JOIN veiculos v ON v.id = u.veiculo_id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...values, limit, offset]
    );
    return res.json({
      items: rows.rows,
      total: count.rows[0].total,
      page,
      totalPages: Math.max(1, Math.ceil(count.rows[0].total / limit)),
    });
  }

  const empresa_id = getCompanyId(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório",
      message: "empresa_id é obrigatório",
    });
  }
  const { page, limit, search } = getPagination(req);
  const result = await listUsersByCompany(empresa_id, { page, limit, search });
  return res.json({
    ...result,
    page,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};

const updateUserCtrl = async (req, res) => {
  const payload = normalizeUserPayload(userSchema.parse(req.body));
  const rawEmpresaId =
    req.user.role === "SUPER_ADMIN" ? req.body.empresa_id ?? req.query.empresa_id : getCompanyId(req);
  const empresa_id =
    payload.role === "SUPER_ADMIN"
      ? null
      : (rawEmpresaId == null || rawEmpresaId === "" ? null : Number(rawEmpresaId));
  if (req.user.role === "ADMIN_EMPRESA" && payload.role === "SUPER_ADMIN") {
    return res.status(403).json({
      success: false,
      error: "Administrador da empresa não pode promover para SUPER_ADMIN.",
      message: "Administrador da empresa não pode promover para SUPER_ADMIN.",
    });
  }
  if (payload.role !== "SUPER_ADMIN" && !empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório",
      message: "empresa_id é obrigatório",
    });
  }
  if (payload.role === "MOTORISTA" && !payload.veiculo_id) {
    return res.status(400).json({
      success: false,
      error: "Motorista deve ter veículo vinculado",
      message: "Motorista deve ter veículo vinculado",
    });
  }
  const identityError = await checkRoleScopedUniqueness({
    role: payload.role,
    email: payload.email,
    cpf_id: payload.cpf_id,
    excludeUserId: Number(req.params.id),
  });
  if (identityError) {
    return res.status(409).json({
      success: false,
      error: identityError,
      message: identityError,
    });
  }
  let row;
  if (req.user.role === "SUPER_ADMIN") {
    const result = await pool.query(
      `UPDATE usuarios
       SET nome = $2,
           email = $3,
           cpf_id = $4,
           veiculo_id = $5,
           role = $6,
           empresa_id = $7
       WHERE id = $1 AND role IN ('MOTORISTA', 'ADMIN_EMPRESA', 'APONTADOR', 'SUPER_ADMIN')
       RETURNING id, nome, email, cpf_id, role, empresa_id, veiculo_id, profile_image_url`,
      [
        Number(req.params.id),
        payload.nome,
        payload.email || null,
        payload.cpf_id,
        payload.role === "SUPER_ADMIN" || payload.role === "APONTADOR" ? null : payload.veiculo_id || null,
        payload.role,
        empresa_id,
      ]
    );
    row = result.rows[0];
  } else {
    row = await updateUser(Number(req.params.id), empresa_id, payload);
  }
  if (payload.senha) {
    const senha_hash = await bcrypt.hash(payload.senha, 10);
    if (req.user.role === "SUPER_ADMIN") {
      await pool.query(
        `UPDATE usuarios SET senha_hash = $2 WHERE id = $1 AND role IN ('MOTORISTA', 'ADMIN_EMPRESA', 'APONTADOR', 'SUPER_ADMIN')`,
        [Number(req.params.id), senha_hash]
      );
    } else {
      await updateUserPassword(Number(req.params.id), empresa_id, senha_hash);
    }
  }
  await logAudit({
    usuario_id: req.user?.sub,
    acao: "editou",
    tabela: "usuarios",
    registro_id: row.id,
  });
  return res.json(row);
};

const deleteUserCtrl = async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === "SUPER_ADMIN") {
    if (id === Number(req.user?.sub)) {
      return res.status(400).json({
        success: false,
        error: "Você não pode excluir seu próprio usuário.",
        message: "Você não pode excluir seu próprio usuário.",
      });
    }
    await pool.query("DELETE FROM usuarios WHERE id = $1 AND role IN ('MOTORISTA','ADMIN_EMPRESA','APONTADOR','SUPER_ADMIN')", [id]);
    await logAudit({
      usuario_id: req.user?.sub,
      acao: "excluiu",
      tabela: "usuarios",
      registro_id: id,
    });
    return res.status(204).send();
  }
  const empresa_id = getCompanyId(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório",
      message: "empresa_id é obrigatório",
    });
  }
  await deleteUser(id, empresa_id);
  await logAudit({
    usuario_id: req.user?.sub,
    acao: "excluiu",
    tabela: "usuarios",
    registro_id: id,
  });
  return res.status(204).send();
};

const createVehicleCtrl = async (req, res) => {
  const payload = toVehicleWritePayload(vehicleSchema.parse(req.body));
  const empresa_id = getCompanyId(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório",
      message: "empresa_id é obrigatório",
    });
  }
  const row = await createVehicle({ ...payload, empresa_id });
  await logAudit({
    usuario_id: req.user?.sub,
    acao: "criou",
    tabela: "veiculos",
    registro_id: row.id,
  });
  return res.status(201).json(row);
};

const listVehiclesCtrl = async (req, res) => {
  if (req.user.role === "SUPER_ADMIN") {
    const { page, limit, search } = getPagination(req);
    const offset = (page - 1) * limit;
    const companyId = Number(req.query.empresa_id || 0);
    const values = [];
    let idx = 1;
    const clauses = [];
    if (search) {
      clauses.push(`(v.nome ILIKE $${idx} OR v.placa ILIKE $${idx} OR e.nome ILIKE $${idx} OR u.nome ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx += 1;
    }
    if (companyId) {
      clauses.push(`v.empresa_id = $${idx}`);
      values.push(companyId);
      idx += 1;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const count = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM veiculos v
      LEFT JOIN empresas e ON e.id = v.empresa_id
      LEFT JOIN usuarios u ON u.veiculo_id = v.id AND u.role = 'MOTORISTA'
      ${where}
      `,
      values
    );
    const rows = await pool.query(
      `
      SELECT
        v.*,
        e.nome AS empresa_nome,
        u.id AS motorista_id, u.nome AS motorista_nome
      FROM veiculos v
      LEFT JOIN empresas e ON e.id = v.empresa_id
      LEFT JOIN usuarios u ON u.veiculo_id = v.id AND u.role = 'MOTORISTA'
      ${where}
      ORDER BY v.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...values, limit, offset]
    );
    return res.json({
      items: rows.rows,
      total: count.rows[0].total,
      page,
      totalPages: Math.max(1, Math.ceil(count.rows[0].total / limit)),
    });
  }

  const empresa_id = getCompanyId(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório",
      message: "empresa_id é obrigatório",
    });
  }
  const { page, limit, search } = getPagination(req);
  const status_operacional = String(req.query.status_operacional || "").trim();
  const tipo = String(req.query.tipo || "").trim();
  const result = await listVehicles(empresa_id, {
    page,
    limit,
    search,
    status_operacional,
    tipo,
  });
  return res.json({
    ...result,
    page,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};

const updateVehicleCtrl = async (req, res) => {
  const payload = toVehicleWritePayload(vehicleSchema.parse(req.body));
  if (req.user.role === "SUPER_ADMIN") {
    const empresa_alvo = Number(req.body.empresa_id || req.query.empresa_id);
    if (!empresa_alvo) {
      return res.status(400).json({
        success: false,
        error: "empresa_id é obrigatório",
        message: "empresa_id é obrigatório",
      });
    }
    const vehicleId = Number(req.params.id);
    const { rows: existRows } = await pool.query("SELECT empresa_id FROM veiculos WHERE id = $1", [vehicleId]);
    const empresa_atual = existRows[0]?.empresa_id;
    if (empresa_atual == null) {
      return res.status(404).json({
        success: false,
        error: "Veículo não encontrado.",
        message: "Veículo não encontrado.",
      });
    }
    let row = await updateVehicle(vehicleId, empresa_atual, payload);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: "Veículo não encontrado.",
        message: "Veículo não encontrado.",
      });
    }
    if (empresa_alvo !== empresa_atual) {
      await pool.query("UPDATE veiculos SET empresa_id = $1 WHERE id = $2", [empresa_alvo, vehicleId]);
      row = await getVehicleById(vehicleId, empresa_alvo);
    }
    await logAudit({
      usuario_id: req.user?.sub,
      acao: "editou",
      tabela: "veiculos",
      registro_id: row.id,
    });
    return res.json(row);
  }
  const empresa_id = getCompanyId(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório",
      message: "empresa_id é obrigatório",
    });
  }
  const row = await updateVehicle(Number(req.params.id), empresa_id, payload);
  await logAudit({
    usuario_id: req.user?.sub,
    acao: "editou",
    tabela: "veiculos",
    registro_id: row.id,
  });
  return res.json(row);
};

const deleteVehicleCtrl = async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === "SUPER_ADMIN") {
    await pool.query("DELETE FROM veiculos WHERE id = $1", [id]);
    await logAudit({
      usuario_id: req.user?.sub,
      acao: "excluiu",
      tabela: "veiculos",
      registro_id: id,
    });
    return res.status(204).send();
  }
  const empresa_id = getCompanyId(req);
  if (!empresa_id) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório",
      message: "empresa_id é obrigatório",
    });
  }
  await deleteVehicle(id, empresa_id);
  await logAudit({
    usuario_id: req.user?.sub,
    acao: "excluiu",
    tabela: "veiculos",
    registro_id: id,
  });
  return res.status(204).send();
};

const getOverviewCtrl = async (req, res) => {
  const [companies, users, vehicles, records] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS total FROM empresas"),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE role IN ('MOTORISTA','ADMIN_EMPRESA','APONTADOR'))::int AS total_usuarios,
         COUNT(*) FILTER (WHERE role = 'MOTORISTA')::int AS total_motoristas,
         COUNT(*) FILTER (WHERE role = 'ADMIN_EMPRESA')::int AS total_admins
       FROM usuarios`
    ),
    pool.query("SELECT COUNT(*)::int AS total FROM veiculos"),
    pool.query(
      `SELECT
        ((SELECT COUNT(*) FROM romaneios)
        + (SELECT COUNT(*) FROM combustiveis)
        + (SELECT COUNT(*) FROM parte_diaria))::int AS total`
    ),
  ]);
  return res.json({
    total_empresas: companies.rows[0].total,
    total_usuarios: users.rows[0].total_usuarios,
    total_motoristas: users.rows[0].total_motoristas,
    total_admins: users.rows[0].total_admins,
    total_veiculos: vehicles.rows[0].total,
    total_registros: records.rows[0].total,
  });
};

const companyDetailsCtrl = async (req, res) => {
  const companyId = Number(req.params.id);
  const company = await pool.query(
    `SELECT
      e.*,
      COUNT(DISTINCT u.id) FILTER (WHERE u.role IN ('MOTORISTA','ADMIN_EMPRESA','APONTADOR'))::int AS usuarios_count,
      COUNT(DISTINCT v.id)::int AS veiculos_count
     FROM empresas e
     LEFT JOIN usuarios u ON u.empresa_id = e.id
     LEFT JOIN veiculos v ON v.empresa_id = e.id
     WHERE e.id = $1
     GROUP BY e.id`,
    [companyId]
  );
  if (!company.rowCount) {
    return res.status(404).json({
      success: false,
      error: "Empresa não encontrada",
      message: "Empresa não encontrada",
    });
  }
  const [users, vehicles] = await Promise.all([
    pool.query(
      `SELECT id, nome, email, cpf_id, role, profile_image_url, veiculo_id
       FROM usuarios
       WHERE empresa_id = $1 AND role IN ('MOTORISTA','ADMIN_EMPRESA','APONTADOR')
       ORDER BY role, nome`,
      [companyId]
    ),
    pool.query(
      `SELECT
        v.id, v.nome, v.placa, v.created_at,
        u.id AS motorista_id, u.nome AS motorista_nome
      FROM veiculos v
      LEFT JOIN usuarios u ON u.veiculo_id = v.id AND u.role = 'MOTORISTA'
      WHERE v.empresa_id = $1
      ORDER BY v.nome`,
      [companyId]
    ),
  ]);
  return res.json({
    company: company.rows[0],
    users: users.rows,
    admins: users.rows.filter((u) => u.role === "ADMIN_EMPRESA"),
    apontadores: users.rows.filter((u) => u.role === "APONTADOR"),
    motoristas: users.rows.filter((u) => u.role === "MOTORISTA"),
    vehicles: vehicles.rows,
  });
};

const globalSearchCtrl = async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    return res.json({ companies: [], users: [], vehicles: [] });
  }
  const like = `%${q}%`;
  const [companies, users, vehicles] = await Promise.all([
    pool.query(
      `SELECT id, nome, logo_url, created_at
       FROM empresas
       WHERE nome ILIKE $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [like]
    ),
    pool.query(
      `SELECT u.id, u.nome, u.email, u.cpf_id, u.role, e.nome AS empresa_nome
       FROM usuarios u
       LEFT JOIN empresas e ON e.id = u.empresa_id
       WHERE u.role IN ('MOTORISTA','ADMIN_EMPRESA','APONTADOR')
         AND (u.nome ILIKE $1 OR u.email ILIKE $1 OR u.cpf_id ILIKE $1 OR e.nome ILIKE $1)
       ORDER BY u.created_at DESC
       LIMIT 10`,
      [like]
    ),
    pool.query(
      `SELECT v.id, v.nome, v.placa, e.nome AS empresa_nome
       FROM veiculos v
       LEFT JOIN empresas e ON e.id = v.empresa_id
       WHERE v.nome ILIKE $1 OR v.placa ILIKE $1 OR e.nome ILIKE $1
       ORDER BY v.created_at DESC
       LIMIT 10`,
      [like]
    ),
  ]);
  return res.json({
    companies: companies.rows,
    users: users.rows,
    vehicles: vehicles.rows,
  });
};

const resetUserPasswordCtrl = async (req, res) => {
  const schema = z.object({
    new_password: z
      .string()
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
        "Senha deve ter ao menos 8 caracteres, maiúscula, minúscula e número"
      )
      .optional(),
  });
  const payload = schema.parse(req.body || {});
  const newPassword = payload.new_password || "NovaSenha123";
  const hash = await bcrypt.hash(newPassword, 10);
  const result = await pool.query(
    `UPDATE usuarios
     SET senha_hash = $2
     WHERE id = $1 AND role IN ('MOTORISTA', 'ADMIN_EMPRESA', 'APONTADOR', 'SUPER_ADMIN')
     RETURNING id, nome, email`,
    [Number(req.params.id), hash]
  );
  if (!result.rowCount) {
    return res.status(404).json({
      success: false,
      error: "Usuário não encontrado",
      message: "Usuário não encontrado",
    });
  }
  await logAudit({
    usuario_id: req.user?.sub,
    acao: "editou",
    tabela: "usuarios",
    registro_id: req.params.id,
  });
  return res.json({
    success: true,
    message: "Senha resetada com sucesso",
    user: result.rows[0],
    temporary_password: newPassword,
  });
};

module.exports = {
  createCompanyCtrl,
  listCompaniesCtrl,
  updateCompanyCtrl,
  deleteCompanyCtrl,
  createUserCtrl,
  listUsersCtrl,
  updateUserCtrl,
  deleteUserCtrl,
  createVehicleCtrl,
  listVehiclesCtrl,
  updateVehicleCtrl,
  deleteVehicleCtrl,
  getOverviewCtrl,
  companyDetailsCtrl,
  globalSearchCtrl,
  resetUserPasswordCtrl,
};
