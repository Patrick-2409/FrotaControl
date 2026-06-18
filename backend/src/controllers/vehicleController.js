const {
  vehicleBodySchema: schema,
  toVehicleWritePayload,
} = require("../validators/vehicleWriteSchema");
const { createVehicle, listVehicles, updateVehicle, deleteVehicle } = require("../models/vehicleModel");

const create = async (req, res) => {
  const parsed = schema.parse(req.body);
  const data = toVehicleWritePayload(parsed);
  const vehicle = await createVehicle({
    ...data,
    empresa_id: req.user.empresa_id,
  });
  return res.status(201).json(vehicle);
};

const list = async (req, res) => {
  const empresaId = Number(req.user?.empresa_id);
  if (!empresaId) {
    return res.status(400).json({
      success: false,
      error: "empresa_id é obrigatório",
      message: "empresa_id é obrigatório",
    });
  }
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 50);
  const search = req.query.search || "";
  const status_operacional = String(req.query.status_operacional || "").trim();
  const tipo = String(req.query.tipo || "").trim();
  const result = await listVehicles(empresaId, { page, limit, search, status_operacional, tipo });
  return res.json({
    success: true,
    ...result,
    page,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};

const update = async (req, res) => {
  const parsed = schema.parse(req.body);
  const data = toVehicleWritePayload(parsed);
  const vehicle = await updateVehicle(Number(req.params.id), req.user.empresa_id, data);
  if (!vehicle) {
    return res.status(404).json({
      success: false,
      error: "Veículo não encontrado.",
      message: "Veículo não encontrado.",
    });
  }
  return res.json(vehicle);
};

const remove = async (req, res) => {
  const deleted = await deleteVehicle(Number(req.params.id), req.user.empresa_id);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: "Veículo não encontrado.",
      message: "Veículo não encontrado.",
    });
  }
  return res.status(204).send();
};

module.exports = {
  create,
  list,
  update,
  remove,
};
