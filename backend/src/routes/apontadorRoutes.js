const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  listVehiclesApontador,
  getContagemHojeApontador,
  createViagemApontador,
  deleteViagemApontadorUndo,
  resetViagensDiaApontador,
} = require("../controllers/apontadorController");

const router = express.Router();

router.get("/veiculos", asyncHandler(listVehiclesApontador));
router.get("/viagens/contagem-hoje", asyncHandler(getContagemHojeApontador));
router.post("/viagens/reset-dia", asyncHandler(resetViagensDiaApontador));
router.post("/viagens", asyncHandler(createViagemApontador));
router.delete("/viagens", asyncHandler(deleteViagemApontadorUndo));

module.exports = router;
