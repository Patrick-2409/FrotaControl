/**
 * Serviço de domínio — frota (veículos por empresa).
 * Preparado para evolução: quotas por empresa, telemetria, manutenção preventiva (ver docs/SAAS_SCALING.md).
 */
const vehicleModel = require("../models/vehicleModel");

module.exports = {
  listVehicles: vehicleModel.listVehicles,
  getVehicleById: vehicleModel.getVehicleById,
  createVehicle: vehicleModel.createVehicle,
  updateVehicle: vehicleModel.updateVehicle,
  deleteVehicle: vehicleModel.deleteVehicle,
};
