const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { listVehiclesApontador, createViagemApontador } = require("../controllers/apontadorController");

const router = express.Router();

router.get("/veiculos", asyncHandler(listVehiclesApontador));
router.post("/viagens", asyncHandler(createViagemApontador));

module.exports = router;
