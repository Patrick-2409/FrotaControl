const { listVehicles } = require("../models/vehicleModel");
const { insertViagem, countViagensHojeEmpresaSaoPaulo } = require("../models/viagemModel");
const { pool } = require("../db");
const { z } = require("zod");

const viagemCreateSchema = z.object({
  veiculo_id: z.coerce.number().int().positive(),
  motorista_id: z.coerce.number().int().positive(),
  tipo: z.enum(["esteril", "rocha"]),
  timestamp: z.union([z.coerce.number(), z.string().trim().min(1)]),
});

const parseMarcacao = (timestamp) => {
  if (typeof timestamp === "number") {
    const d = new Date(timestamp);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Lista veículos da empresa do JWT (apontador não pode escolher outra empresa). */
const listVehiclesApontador = async (req, res) => {
  const empresaId = req.user?.empresa_id;
  if (!empresaId) {
    return res.status(403).json({
      success: false,
      error: "Empresa não associada ao usuário.",
      message: "Empresa não associada ao usuário.",
    });
  }
  const page = Number(req.query.page || 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);
  const search = String(req.query.search || "");
  const result = await listVehicles(empresaId, { page, limit, search });
  return res.json({
    success: true,
    items: result.items,
    total: result.total,
    page,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};

const getContagemHojeApontador = async (req, res) => {
  const empresaId = req.user?.empresa_id;
  if (!empresaId) {
    return res.status(403).json({
      success: false,
      error: "Empresa não associada ao usuário.",
      message: "Empresa não associada ao usuário.",
    });
  }
  const counts = await countViagensHojeEmpresaSaoPaulo(empresaId);
  return res.json({
    success: true,
    hoje: counts,
  });
};

const createViagemApontador = async (req, res) => {
  const empresaId = req.user?.empresa_id;
  if (!empresaId) {
    return res.status(403).json({
      success: false,
      error: "Empresa não associada ao usuário.",
      message: "Empresa não associada ao usuário.",
    });
  }

  const body = viagemCreateSchema.parse(req.body);
  const marcacao = parseMarcacao(body.timestamp);
  if (!marcacao) {
    return res.status(400).json({
      success: false,
      error: "Timestamp inválido.",
      message: "Timestamp inválido.",
    });
  }

  const check = await pool.query(
    `SELECT 1
     FROM veiculos v
     INNER JOIN usuarios u ON u.id = $3
       AND u.empresa_id = v.empresa_id
       AND u.role = 'MOTORISTA'
       AND u.veiculo_id = v.id
     WHERE v.id = $2
       AND v.empresa_id = $1
     LIMIT 1`,
    [empresaId, body.veiculo_id, body.motorista_id]
  );

  if (!check.rowCount) {
    return res.status(400).json({
      success: false,
      error: "Veículo ou motorista inválido para esta empresa.",
      message: "Veículo ou motorista inválido para esta empresa.",
    });
  }

  const row = await insertViagem({
    empresa_id: empresaId,
    veiculo_id: body.veiculo_id,
    motorista_id: body.motorista_id,
    tipo: body.tipo,
    marcacao,
  });

  const tsMs = row.marcacao instanceof Date ? row.marcacao.getTime() : new Date(row.marcacao).getTime();

  return res.status(201).json({
    success: true,
    viagem: {
      id: row.id,
      empresa_id: row.empresa_id,
      veiculo_id: row.veiculo_id,
      motorista_id: row.motorista_id,
      tipo: row.tipo,
      timestamp: tsMs,
      created_at: row.created_at,
    },
  });
};

module.exports = {
  listVehiclesApontador,
  getContagemHojeApontador,
  createViagemApontador,
};
