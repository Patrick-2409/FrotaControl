const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  createRomaneio,
  createCombustivel,
  updateCombustivelBySourceId,
  createParteDiaria,
  deleteRecord,
  listAppVehicles,
  listMyHistory,
} = require("../controllers/recordController");

const router = express.Router();

router.get("/veiculos", asyncHandler(listAppVehicles));
router.get("/historico", asyncHandler(listMyHistory));
router.post("/romaneio", asyncHandler(createRomaneio));
router.post("/combustivel", asyncHandler(createCombustivel));
router.post("/abastecimentos", asyncHandler(createCombustivel));
router.put("/abastecimentos/:id", asyncHandler(updateCombustivelBySourceId));
router.post("/parte-diaria", asyncHandler(createParteDiaria));
router.delete("/:modulo/:source_id", asyncHandler(deleteRecord));

module.exports = router;
