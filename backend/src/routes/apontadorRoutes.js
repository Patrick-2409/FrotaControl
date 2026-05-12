const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  listVehiclesApontador,
  getContagemHojeApontador,
  createViagemApontador,
} = require("../controllers/apontadorController");

const router = express.Router();

router.get("/veiculos", asyncHandler(listVehiclesApontador));
router.get("/viagens/contagem-hoje", asyncHandler(getContagemHojeApontador));
router.post("/viagens", asyncHandler(createViagemApontador));

module.exports = router;
