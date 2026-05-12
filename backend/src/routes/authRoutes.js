const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  motoristaLogin,
  adminEmpresaLogin,
  apontadorLogin,
  superAdminLogin,
  me,
  alterarSenha,
} = require("../controllers/authController");
const { authMiddleware } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/motorista-login", asyncHandler(motoristaLogin));
router.post("/login", asyncHandler(motoristaLogin));
router.post("/admin-empresa-login", asyncHandler(adminEmpresaLogin));
router.post("/apontador-login", asyncHandler(apontadorLogin));
router.post("/super-admin-login", asyncHandler(superAdminLogin));
router.get("/me", authMiddleware, asyncHandler(me));
router.put("/alterar-senha", authMiddleware, asyncHandler(alterarSenha));

module.exports = router;
