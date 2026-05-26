const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { analisarOperacao, exportarPdfInteligencia } = require("../controllers/intelligenceController");

const router = express.Router();

router.post("/analisar", asyncHandler(analisarOperacao));
router.post("/pdf", asyncHandler(exportarPdfInteligencia));
router.get("/pdf", asyncHandler(exportarPdfInteligencia));

module.exports = router;
