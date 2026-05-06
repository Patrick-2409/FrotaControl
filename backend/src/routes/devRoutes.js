const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { createMotoristaDev } = require("../controllers/devController");

const router = express.Router();

router.post("/create-motorista", asyncHandler(createMotoristaDev));

module.exports = router;
