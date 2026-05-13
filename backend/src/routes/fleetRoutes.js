const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  getSummary,
  getMaintenance,
  postMaintenance,
  removeMaintenance,
  exportVehiclesCsv,
} = require("../controllers/fleetController");

const router = express.Router();

router.get("/summary", asyncHandler(getSummary));
router.get("/export/vehicles.csv", asyncHandler(exportVehiclesCsv));
router.get("/vehicles/:veiculoId/maintenance", asyncHandler(getMaintenance));
router.post("/vehicles/:veiculoId/maintenance", asyncHandler(postMaintenance));
router.delete("/maintenance/:id", asyncHandler(removeMaintenance));

module.exports = router;
