const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { analisarOperacao } = require("../controllers/intelligenceController");

const router = express.Router();

router.post("/analisar", asyncHandler(analisarOperacao));

module.exports = router;
