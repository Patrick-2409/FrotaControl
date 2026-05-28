const express = require("express");
const rateLimit = require("express-rate-limit");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  analisarOperacao,
  exportarHtmlInteligencia,
  exportarPdfInteligencia,
  getIntelligenceOverview,
  debugPdfInteligencia,
} = require("../controllers/intelligenceController");

const router = express.Router();

const overviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Muitas consultas de inteligência. Aguarde instantes." },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Limite de geração atingido. Tente novamente em instantes." },
});

router.post("/analisar", aiLimiter, asyncHandler(analisarOperacao));
router.post("/gerar", aiLimiter, asyncHandler(analisarOperacao));
router.get("/overview", overviewLimiter, asyncHandler(getIntelligenceOverview));
router.get("/html", aiLimiter, asyncHandler(exportarHtmlInteligencia));
router.post("/pdf", aiLimiter, asyncHandler(exportarPdfInteligencia));
router.get("/pdf", aiLimiter, asyncHandler(exportarPdfInteligencia));
router.get("/debug/pdf", aiLimiter, asyncHandler(debugPdfInteligencia));

module.exports = router;
