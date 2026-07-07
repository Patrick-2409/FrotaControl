const bcrypt = require("bcryptjs");
const { z } = require("zod");
const {
  getMotoristaByLogin,
  getAdminsEmpresaByLogin,
  getApontadorByLogin,
  getSuperAdminsByLogin,
  updateOwnUserPassword,
} = require("../models/userModel");
const { buildToken } = require("../services/authService");
const { pool } = require("../db");
const { logInfo, logWarn } = require("../services/loggerService");

const logAuthDebug = (tipo, payload) => {
  if (process.env.NODE_ENV !== "production") {
    logInfo(`auth:${tipo}`, payload);
  }
};

const motoristaLoginSchema = z
  .object({
    login: z.string().trim().min(3).optional(),
    email: z.string().trim().min(3).optional(),
    cpf_id: z.string().trim().min(3).optional(),
    senha: z.string().min(6),
  })
  .transform((v) => ({
    login: v.login || v.email || v.cpf_id,
    senha: v.senha,
  }))
  .refine((v) => Boolean(v.login), {
    message: "Informe CPF, e-mail ou ID do usuário.",
    path: ["login"],
  })
  .refine((v) => Boolean(v.senha), {
    message: "Informe a senha.",
    path: ["senha"],
  });

const roleLoginSchema = z
  .object({
    login: z.string().trim().min(3).optional(),
    email: z.string().trim().min(3).optional(),
    cpf_id: z.string().trim().min(3).optional(),
    senha: z.string().min(6),
  })
  .transform((v) => ({
    login: v.login || v.email || v.cpf_id,
    senha: v.senha,
  }))
  .refine((v) => Boolean(v.login), {
    message: "Informe CPF, e-mail ou ID do usuário.",
    path: ["login"],
  });

const adminEmpresaLoginSchema = roleLoginSchema;
const superAdminLoginSchema = roleLoginSchema;
const apontadorLoginSchema = roleLoginSchema;

const alterarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(6),
    novaSenha: z
      .string()
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
        "Nova senha deve ter ao menos 8 caracteres, maiúscula, minúscula e número"
      ),
  })
  .refine((v) => v.senhaAtual !== v.novaSenha, {
    message: "A nova senha deve ser diferente da atual",
    path: ["novaSenha"],
  });

const isBcryptHashValido = (hash) => typeof hash === "string" && /^\$2[aby]\$/.test(hash);
const formatUserLoginId = (id) => `USR-${String(Number(id) || 0).padStart(6, "0")}`;

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const parseMotoristaLogin = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (isEmail(raw)) {
    return { email: raw.toLowerCase(), tipo: "email" };
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 11) {
    return { cpf: digits, tipo: "cpf" };
  }
  if (/^USR-\d{1,}$/i.test(raw)) {
    return { user_id: Number(raw.replace(/\D/g, "")), tipo: "id" };
  }
  if (/^\d+$/.test(raw)) {
    return { user_id: Number(raw), tipo: "id" };
  }
  return null;
};

const compararSenhaComHash = async (senha, hash) => {
  if (!isBcryptHashValido(hash)) {
    return { ok: false, erroHashInvalido: true };
  }
  logInfo("auth:password-compare", { ok: true });
  const ok = await bcrypt.compare(senha, hash);
  return { ok, erroHashInvalido: false };
};

const buildUserResponse = (user) => ({
  id: user.id,
  user_login_id: formatUserLoginId(user.id),
  nome: user.nome,
  email: user.email,
  cpf_id: user.cpf_id,
  role: user.role,
  empresa_id: user.empresa_id,
  empresa_nome: user.empresa_nome,
  logo_url: user.logo_url,
  profile_image_url: user.profile_image_url,
  veiculo_id: user.veiculo_id,
  veiculo_nome: user.veiculo_nome,
  placa: user.placa,
  veiculo_marca: user.veiculo_marca,
  veiculo_modelo: user.veiculo_modelo,
});

const buildSessionFallbackUser = (sessionUser = {}) => ({
  id: sessionUser.id ?? sessionUser.sub,
  nome: sessionUser.nome,
  email: sessionUser.email,
  cpf_id: sessionUser.cpf_id,
  role: sessionUser.role,
  empresa_id: sessionUser.empresa_id,
  empresa_nome: sessionUser.empresa_nome,
  logo_url: sessionUser.logo_url,
  profile_image_url: sessionUser.profile_image_url,
  veiculo_id: sessionUser.veiculo_id,
  veiculo_nome: sessionUser.veiculo_nome,
  placa: sessionUser.placa,
  conta_status: sessionUser.conta_status || "ativo",
});

const getAuthMeProfile = async (sessionUser = {}) => {
  const userId = Number(sessionUser.sub ?? sessionUser.id);
  if (!Number.isInteger(userId) || userId < 1) return null;
  const empresaId = sessionUser.empresa_id == null ? null : Number(sessionUser.empresa_id);
  const values = [userId];
  const companyFilter = empresaId == null ? "AND u.empresa_id IS NULL" : "AND u.empresa_id = $2";
  if (empresaId != null) values.push(empresaId);

  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.empresa_id,
       u.nome,
       u.email,
       u.cpf_id,
       u.role,
       u.veiculo_id,
       e.nome AS empresa_nome,
       e.logo_url,
       v.nome AS veiculo_nome,
       v.placa
     FROM usuarios u
     LEFT JOIN empresas e ON e.id = u.empresa_id
     LEFT JOIN veiculos v ON v.id = u.veiculo_id AND v.empresa_id = u.empresa_id
     WHERE u.id = $1 ${companyFilter}`,
    values
  );
  return rows[0] || null;
};

const motoristaLogin = async (req, res) => {
  const data = motoristaLoginSchema.parse(req.body);
  const loginOriginal = String(data.login || "").trim();
  const loginParsed = parseMotoristaLogin(loginOriginal);
  if (!loginParsed) {
    return res.status(400).json({
      success: false,
      error: "Login inválido. Use CPF, e-mail ou ID do usuário.",
      message: "Login inválido. Use CPF, e-mail ou ID do usuário.",
    });
  }
  const loginBusca = loginParsed;

  logAuthDebug("MOTORISTA", { tipo_login: loginParsed.tipo, login: loginOriginal });
  const resultadoBusca = await getMotoristaByLogin(loginBusca);
  const rows = Array.isArray(resultadoBusca)
    ? resultadoBusca
    : Array.isArray(resultadoBusca?.usuarios)
    ? resultadoBusca.usuarios
    : [];
  logAuthDebug("MOTORISTA_RESULTADO", {
    encontrados: rows.length,
    usuarios: rows.map((u) => ({ id: u.id, role: u.role, email: u.email, cpf_id: u.cpf_id })),
  });
  if (!rows.length) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }
  if (rows.length > 1) {
    return res.status(401).json({
      success: false,
      error: "Credenciais inválidas",
      message: "Credenciais inválidas",
    });
  }

  const user = Array.isArray(resultadoBusca?.usuarios) ? resultadoBusca.usuarios?.[0] : rows?.[0];
  if (!user) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }

  const { ok: senhaValida, erroHashInvalido } = await compararSenhaComHash(data.senha, user.senha_hash);
  if (erroHashInvalido) {
    return res.status(401).json({
      success: false,
      error: "Credenciais inválidas",
      message: "Credenciais inválidas",
    });
  }
  if (!senhaValida) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }

  if (user.conta_status === "inativo") {
    return res.status(403).json({
      success: false,
      error: "Conta desativada",
      message: "Esta conta foi desativada. Contacte o administrador.",
    });
  }

  const token = buildToken(user);
  return res.json({ token, user: buildUserResponse(user) });
};

const adminEmpresaLogin = async (req, res) => {
  const data = adminEmpresaLoginSchema.parse(req.body);
  const loginOriginal = String(data.login || "").trim();
  logAuthDebug("ADMIN_EMPRESA", { login: loginOriginal });
  const rows = await getAdminsEmpresaByLogin(loginOriginal);
  logAuthDebug("ADMIN_EMPRESA_RESULTADO", {
    encontrados: rows.length,
    usuarios: rows.map((u) => ({ id: u.id, role: u.role, email: u.email, cpf_id: u.cpf_id })),
  });
  if (!rows.length) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }
  if (rows.length > 1) {
    logInfo("auth:admin-empresa-duplicado", { login: loginOriginal, ids: rows.map((u) => u.id) });
    return res.status(409).json({
      success: false,
      error: "Conflito de credenciais",
      message: "Conta administrativa duplicada detectada. Contate o suporte.",
    });
  }
  const user = rows[0];
  const { ok: senhaValida, erroHashInvalido } = await compararSenhaComHash(data.senha, user.senha_hash);
  if (erroHashInvalido) {
    return res.status(401).json({
      success: false,
      error: "Credenciais inválidas",
      message: "Credenciais inválidas",
    });
  }
  if (!senhaValida) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }

  if (user.conta_status === "inativo") {
    return res.status(403).json({
      success: false,
      error: "Conta desativada",
      message: "Esta conta foi desativada. Contacte o administrador.",
    });
  }

  const token = buildToken(user);
  return res.json({
    token,
    user: buildUserResponse(user),
  });
};

const apontadorLogin = async (req, res) => {
  const data = apontadorLoginSchema.parse(req.body);
  const loginOriginal = String(data.login || "").trim();
  logAuthDebug("APONTADOR", { login: loginOriginal });
  const rows = await getApontadorByLogin(loginOriginal);
  logAuthDebug("APONTADOR_RESULTADO", {
    encontrados: rows.length,
    usuarios: rows.map((u) => ({ id: u.id, role: u.role, email: u.email, cpf_id: u.cpf_id })),
  });
  if (!rows.length) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }
  if (rows.length > 1) {
    logInfo("auth:apontador-duplicado", { login: loginOriginal, ids: rows.map((u) => u.id) });
    return res.status(409).json({
      success: false,
      error: "Conflito de credenciais",
      message: "Conta de apontador duplicada detectada. Contate o suporte.",
    });
  }
  const user = rows[0];
  const { ok: senhaValida, erroHashInvalido } = await compararSenhaComHash(data.senha, user.senha_hash);
  if (erroHashInvalido) {
    return res.status(401).json({
      success: false,
      error: "Credenciais inválidas",
      message: "Credenciais inválidas",
    });
  }
  if (!senhaValida) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }

  if (user.conta_status === "inativo") {
    return res.status(403).json({
      success: false,
      error: "Conta desativada",
      message: "Esta conta foi desativada. Contacte o administrador.",
    });
  }

  const token = buildToken(user);
  return res.json({
    token,
    user: buildUserResponse(user),
  });
};

const superAdminLogin = async (req, res) => {
  const data = superAdminLoginSchema.parse(req.body);
  const loginOriginal = String(data.login || "").trim();
  logAuthDebug("SUPER_ADMIN", { login: loginOriginal });
  const rows = await getSuperAdminsByLogin(loginOriginal);
  logAuthDebug("SUPER_ADMIN_RESULTADO", {
    encontrados: rows.length,
    usuarios: rows.map((u) => ({ id: u.id, role: u.role, email: u.email, cpf_id: u.cpf_id })),
  });
  if (!rows.length) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }
  if (rows.length > 1) {
    logInfo("auth:super-admin-duplicado", { login: loginOriginal, ids: rows.map((u) => u.id) });
    return res.status(409).json({
      success: false,
      error: "Conflito de credenciais",
      message: "Conta de super administrador duplicada detectada. Contate o suporte.",
    });
  }
  const user = rows[0];
  const { ok: senhaValida, erroHashInvalido } = await compararSenhaComHash(data.senha, user.senha_hash);
  if (erroHashInvalido) {
    return res.status(401).json({
      success: false,
      error: "Credenciais inválidas",
      message: "Credenciais inválidas",
    });
  }
  if (!senhaValida) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }

  if (user.conta_status === "inativo") {
    return res.status(403).json({
      success: false,
      error: "Conta desativada",
      message: "Esta conta foi desativada. Contacte o administrador.",
    });
  }

  const token = buildToken(user);
  return res.json({
    token,
    user: buildUserResponse(user),
  });
};

const me = async (req, res) => {
  let user;
  try {
    user = await getAuthMeProfile(req.user);
  } catch (err) {
    logWarn("auth:me-profile-fallback", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
    });
    user = buildSessionFallbackUser(req.user);
  }
  if (!user) {
    return res.status(404).json({ success: false, error: "Usuário não encontrado", message: "Usuário não encontrado" });
  }
  if (user.conta_status === "inativo") {
    return res.status(403).json({
      success: false,
      error: "Conta desativada",
      message: "Esta conta foi desativada.",
    });
  }
  return res.json({
    ...buildUserResponse(user),
    conta_status: user.conta_status || "ativo",
  });
};

const alterarSenha = async (req, res) => {
  const data = alterarSenhaSchema.parse(req.body);
  const result = await pool.query(
    "SELECT id, senha_hash, COALESCE(conta_status, 'ativo') AS conta_status FROM usuarios WHERE id = $1",
    [req.user.sub]
  );
  if (!result.rowCount) {
    return res.status(404).json({ success: false, error: "Usuário não encontrado", message: "Usuário não encontrado" });
  }
  const user = result.rows[0];
  if (user.conta_status === "inativo") {
    return res.status(403).json({
      success: false,
      error: "Conta desativada",
      message: "Esta conta foi desativada.",
    });
  }

  const resultadoSenhaAtual = await compararSenhaComHash(data.senhaAtual, user.senha_hash);
  if (resultadoSenhaAtual.erroHashInvalido) {
    return res.status(400).json({
      success: false,
      error: "Senha atual inválida",
      message: "Senha atual inválida",
    });
  }
  if (!resultadoSenhaAtual.ok) {
    return res.status(400).json({ success: false, error: "Senha atual inválida", message: "Senha atual inválida" });
  }

  const novoHash = await bcrypt.hash(data.novaSenha, 10);
  await updateOwnUserPassword(req.user.sub, novoHash);
  return res.json({ success: true, message: "Senha alterada com sucesso" });
};

module.exports = {
  motoristaLogin,
  adminEmpresaLogin,
  apontadorLogin,
  superAdminLogin,
  me,
  alterarSenha,
};
