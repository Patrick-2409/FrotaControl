const { z } = require("zod");
const {
  createVehicle,
  listVehicles,
  updateVehicle,
  deleteVehicle,
} = require("../models/vehicleModel");

const schema = z.object({
  nome: z.string().trim().min(2),
  placa: z.string().trim().min(4),
  marca: z.string().trim().optional(),
  modelo: z.string().trim().optional(),
  capacidade_ton: z.coerce.number().positive().optional().nullable(),
});

const create = async (req, res) => {
  const parsed = schema.parse(req.body);
  const data = {
    ...parsed,
    marca: parsed.marca || null,
    modelo: parsed.modelo || null,
    capacidade_ton: parsed.capacidade_ton ?? null,
  };
  const vehicle = await createVehicle({
    ...data,
    empresa_id: req.user.empresa_id,
  });
  return res.status(201).json(vehicle);
};

const list = async (req, res) => {
  const empresaId = req.user?.empresa_id || Number(req.query.empresa_id);
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
  const result = await listVehicles(empresaId, { page, limit, search });
  if (!req.user) {
    return res.json(result.items);
  }
  return res.json({
    success: true,
    ...result,
    page,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};

const update = async (req, res) => {
  const parsed = schema.parse(req.body);
  const data = {
    nome: parsed.nome,
    placa: parsed.placa,
    marca: parsed.marca || null,
    modelo: parsed.modelo || null,
  };
  if (Object.prototype.hasOwnProperty.call(req.body, "capacidade_ton")) {
    data.capacidade_ton =
      parsed.capacidade_ton === null || parsed.capacidade_ton === undefined ? null : parsed.capacidade_ton;
  }
  const vehicle = await updateVehicle(Number(req.params.id), req.user.empresa_id, data);
  return res.json(vehicle);
};

const remove = async (req, res) => {
  await deleteVehicle(Number(req.params.id), req.user.empresa_id);
  return res.status(204).send();
};

module.exports = {
  create,
  list,
  update,
  remove,
};
