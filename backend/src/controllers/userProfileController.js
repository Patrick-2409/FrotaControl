const bcrypt = require("bcryptjs");
const multer = require("multer");
const { z } = require("zod");
const { pool } = require("../db");
const {
  updateOwnUserPassword,
  updateOwnProfileImage,
  updateOwnProfileData,
  getUserById,
} = require("../models/userModel");
const { logInfo } = require("../services/loggerService");
const { savePersistentImage } = require("../services/uploadStorageService");

const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Upload inválido: envie apenas PNG, JPEG ou WebP"));
    }
    cb(null, true);
  },
});

const passwordSchema = z
  .object({
    current_password: z.string().min(6),
    new_password: z
      .string()
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
        "Senha deve ter ao menos 8 caracteres, maiúscula, minúscula e número"
      ),
  })
  .refine((v) => v.current_password !== v.new_password, {
    message: "A nova senha deve ser diferente da atual",
    path: ["new_password"],
  });

const profileSchema = z.object({
  nome: z.string().trim().min(3),
});

const getMyProfile = async (req, res) => {
  const user = await getUserById(req.user.sub, req.user.empresa_id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: "Usuário não encontrado",
      message: "Usuário não encontrado",
    });
  }
  return res.json(user);
};

const updateMyProfile = async (req, res) => {
  const payload = profileSchema.parse(req.body);
  const nome = payload.nome.replace(/\s+/g, " ");
  const row = await updateOwnProfileData(req.user.sub, { nome });
  if (!row) {
    return res.status(404).json({
      success: false,
      error: "Usuário não encontrado",
      message: "Usuário não encontrado",
    });
  }
  return res.json({ success: true, user: row });
};

const changeMyPassword = async (req, res) => {
  const data = passwordSchema.parse(req.body);
  const result = await pool.query("SELECT senha_hash FROM usuarios WHERE id = $1", [req.user.sub]);
  if (!result.rowCount) {
    return res.status(404).json({
      success: false,
      error: "Usuário não encontrado",
      message: "Usuário não encontrado",
    });
  }

  const senhaHashAtual = result.rows[0].senha_hash;
  if (typeof senhaHashAtual !== "string" || !senhaHashAtual.startsWith("$2b$")) {
    return res.status(400).json({
      success: false,
      error: "Conta com senha inválida no sistema. Solicite redefinição de senha ao administrador.",
      message: "Conta com senha inválida no sistema. Solicite redefinição de senha ao administrador.",
    });
  }
  logInfo("profile:password-compare", { user_id: req.user?.sub });

  const ok = await bcrypt.compare(data.current_password, senhaHashAtual);
  if (!ok) {
    return res.status(400).json({
      success: false,
      error: "Senha atual inválida",
      message: "Senha atual inválida",
    });
  }

  const senha_hash = await bcrypt.hash(data.new_password, 10);
  await updateOwnUserPassword(req.user.sub, senha_hash);
  return res.json({ success: true, message: "Senha alterada com sucesso" });
};

const uploadProfileImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "Envie uma imagem para upload",
      message: "Envie uma imagem para upload",
    });
  }
  const profile_image_url = await savePersistentImage({
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    category: "profile",
    ownerId: req.user?.sub,
  });
  await updateOwnProfileImage(req.user.sub, profile_image_url);
  return res.status(201).json({ success: true, profile_image_url });
};

module.exports = {
  profileImageUpload,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  uploadProfileImage,
};
