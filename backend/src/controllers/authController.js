const bcrypt = require("bcryptjs");
const { z } = require("zod");
const {
  getUserById,
  getMotoristaByLogin,
  getAdminsEmpresaByEmail,
  getApontadorByEmail,
  getSuperAdminsByEmail,
  updateOwnUserPassword,
} = require("../models/userModel");
const { buildToken } = require("../services/authService");
const { pool } = require("../db");
const { logInfo } = require("../services/loggerService");

const logAuthDebug = (tipo, payload) => {
  if (process.env.NODE_ENV !== "production") {
    logInfo(`auth:${tipo}`, payload);
  }
};

const motoristaLoginSchema = z
  .object({
    login: z.string().trim().min(3).optional(),
    cpf_id: z.string().trim().min(3).optional(),
    senha: z.string().min(6),
  })
  .transform((v) => ({
    login: v.login || v.cpf_id,
    senha: v.senha,
  }))
  .refine((v) => Boolean(v.login), {
    message: "Informe CPF ou e-mail.",
    path: ["login"],
  })
  .refine((v) => Boolean(v.senha), {
    message: "Informe a senha.",
    path: ["senha"],
  });

const adminEmpresaLoginSchema = z
  .object({
    email: z.string().trim().email(),
    senha: z.string().min(6),
  })
  .transform((v) => ({
    email: v.email.toLowerCase(),
    senha: v.senha,
  }));

const superAdminLoginSchema = z
  .object({
    email: z.string().trim().email(),
    senha: z.string().min(6),
  })
  .transform((v) => ({
    email: v.email.toLowerCase(),
    senha: v.senha,
  }));

/** Mesmo payload que admin empresa (e-mail + senha). */
const apontadorLoginSchema = adminEmpresaLoginSchema;

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

const motoristaLogin = async (req, res) => {
  const data = motoristaLoginSchema.parse(req.body);
  const loginOriginal = String(data.login || data.cpf_id || "").trim();
  const loginLimpo = loginOriginal.replace(/\D/g, "");
  if (loginLimpo.length < 11) {
    return res.status(400).json({
      success: false,
      error: "CPF inválido. Informe apenas o CPF do motorista.",
      message: "CPF inválido. Informe apenas o CPF do motorista.",
    });
  }
  const loginBusca = loginLimpo;

  logAuthDebug("MOTORISTA", { login: loginBusca });
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

  const token = buildToken(user);
  return res.json({ token, user: buildUserResponse(user) });
};

const adminEmpresaLogin = async (req, res) => {
  const data = adminEmpresaLoginSchema.parse(req.body);
  logAuthDebug("ADMIN_EMPRESA", { email: data.email });
  const rows = await getAdminsEmpresaByEmail(data.email);
  logAuthDebug("ADMIN_EMPRESA_RESULTADO", {
    encontrados: rows.length,
    usuarios: rows.map((u) => ({ id: u.id, role: u.role, email: u.email })),
  });
  if (!rows.length) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }
  if (rows.length > 1) {
    logInfo("auth:admin-empresa-duplicado", { email: data.email, ids: rows.map((u) => u.id) });
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

  const token = buildToken(user);
  return res.json({
    token,
    user: buildUserResponse(user),
  });
};

const apontadorLogin = async (req, res) => {
  const data = apontadorLoginSchema.parse(req.body);
  logAuthDebug("APONTADOR", { email: data.email });
  const rows = await getApontadorByEmail(data.email);
  logAuthDebug("APONTADOR_RESULTADO", {
    encontrados: rows.length,
    usuarios: rows.map((u) => ({ id: u.id, role: u.role, email: u.email })),
  });
  if (!rows.length) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }
  if (rows.length > 1) {
    logInfo("auth:apontador-duplicado", { email: data.email, ids: rows.map((u) => u.id) });
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

  const token = buildToken(user);
  return res.json({
    token,
    user: buildUserResponse(user),
  });
};

const superAdminLogin = async (req, res) => {
  const data = superAdminLoginSchema.parse(req.body);
  logAuthDebug("SUPER_ADMIN", { email: data.email });
  const rows = await getSuperAdminsByEmail(data.email);
  logAuthDebug("SUPER_ADMIN_RESULTADO", {
    encontrados: rows.length,
    usuarios: rows.map((u) => ({ id: u.id, role: u.role, email: u.email })),
  });
  if (!rows.length) {
    return res.status(401).json({ success: false, error: "Credenciais inválidas", message: "Credenciais inválidas" });
  }
  if (rows.length > 1) {
    logInfo("auth:super-admin-duplicado", { email: data.email, ids: rows.map((u) => u.id) });
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
  const token = buildToken(user);
  return res.json({
    token,
    user: buildUserResponse(user),
  });
};

const me = async (req, res) => {
  const user = await getUserById(req.user.sub, req.user.empresa_id);
  if (!user) {
    return res.status(404).json({ success: false, error: "Usuário não encontrado", message: "Usuário não encontrado" });
  }
  return res.json(user);
};

const alterarSenha = async (req, res) => {
  const data = alterarSenhaSchema.parse(req.body);
  const result = await pool.query(
    "SELECT id, senha_hash FROM usuarios WHERE id = $1",
    [req.user.sub]
  );
  if (!result.rowCount) {
    return res.status(404).json({ success: false, error: "Usuário não encontrado", message: "Usuário não encontrado" });
  }
  const user = result.rows[0];

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
