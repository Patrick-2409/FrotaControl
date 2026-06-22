const { listVehicles } = require("../models/vehicleModel");
const {
  insertViagem,
  countViagensHojeApontadorSaoPaulo,
  listRecentViagensHojeApontadorSaoPaulo,
  deleteViagemApontadorMatch,
  deleteViagensApontadorDiaAtualSaoPaulo,
} = require("../models/viagemModel");
const { pool } = require("../db");
const { z } = require("zod");
const { logAudit } = require("../services/auditService");
const { logInfo } = require("../services/loggerService");

const viagemCreateSchema = z.object({
  veiculo_id: z.coerce.number().int().positive(),
  motorista_id: z.coerce.number().int().positive(),
  tipo: z.enum(["esteril", "rocha"]),
  timestamp: z.union([z.coerce.number(), z.string().trim().min(1)]),
});

const viagemUndoSchema = z.object({
  veiculo_id: z.coerce.number().int().positive(),
  motorista_id: z.coerce.number().int().positive(),
  tipo: z.enum(["esteril", "rocha"]),
  timestamp: z.union([z.coerce.number(), z.string().trim().min(1)]),
  viagem_id: z.coerce.number().int().positive().optional().nullable(),
});

const parseMarcacao = (timestamp) => {
  if (typeof timestamp === "number") {
    const d = new Date(timestamp);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? null : d;
};

const assertVeiculoMotoristaTransporte = async (empresaId, veiculo_id, motorista_id) => {
  const { rows: validRows } = await pool.query(
    `SELECT COALESCE(v.usa_para_transporte, false) AS usa_para_transporte
     FROM veiculos v
     INNER JOIN usuarios u ON u.id = $3
       AND u.empresa_id = v.empresa_id
       AND u.role = 'MOTORISTA'
       AND u.veiculo_id = v.id
     WHERE v.id = $2
       AND v.empresa_id = $1
     LIMIT 1`,
    [empresaId, veiculo_id, motorista_id]
  );

  if (!validRows.length) {
    return {
      ok: false,
      status: 400,
      message: "Veículo ou motorista inválido para esta empresa.",
    };
  }

  if (!validRows[0].usa_para_transporte) {
    return {
      ok: false,
      status: 400,
      message: "Veículo não autorizado para transporte",
    };
  }

  return { ok: true };
};

/** Lista veículos aptos ao apontamento: usa_para_transporte e capacidade_ton > 0. */
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
  const result = await listVehicles(empresaId, {
    page,
    limit,
    search,
    filtrar_transporte: true,
    exige_capacidade: true,
  });
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
  const apontadorId = req.user?.sub;
  if (!empresaId) {
    return res.status(403).json({
      success: false,
      error: "Empresa não associada ao usuário.",
      message: "Empresa não associada ao usuário.",
    });
  }
  if (!apontadorId) {
    return res.status(403).json({
      success: false,
      error: "Apontador inválido.",
      message: "Apontador inválido.",
    });
  }
  const counts = await countViagensHojeApontadorSaoPaulo(empresaId, apontadorId);
  const recentes = await listRecentViagensHojeApontadorSaoPaulo(empresaId, apontadorId, 5);
  return res.json({
    success: true,
    hoje: {
      esteril: counts.esteril,
      rocha: counts.rocha,
      ton_esteril: counts.ton_esteril,
      ton_rocha: counts.ton_rocha,
      ton_total: counts.ton_total,
    },
    ultimos_lancamentos: (recentes || []).map((item) => ({
      id: item.id,
      tipo: item.tipo,
      timestamp: item.marcacao instanceof Date ? item.marcacao.getTime() : new Date(item.marcacao).getTime(),
    })),
  });
};

const createViagemApontador = async (req, res) => {
  const empresaId = req.user?.empresa_id;
  const apontadorId = req.user?.sub;
  if (!empresaId) {
    return res.status(403).json({
      success: false,
      error: "Empresa não associada ao usuário.",
      message: "Empresa não associada ao usuário.",
    });
  }
  if (!apontadorId) {
    return res.status(403).json({
      success: false,
      error: "Apontador inválido.",
      message: "Apontador inválido.",
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

  const gate = await assertVeiculoMotoristaTransporte(empresaId, body.veiculo_id, body.motorista_id);
  if (!gate.ok) {
    return res.status(gate.status).json({
      success: false,
      error: gate.message,
      message: gate.message,
    });
  }

  const row = await insertViagem({
    empresa_id: empresaId,
    apontador_id: apontadorId,
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
      apontador_id: row.apontador_id,
      tipo: row.tipo,
      timestamp: tsMs,
      created_at: row.created_at,
    },
  });
};

/** Desfaz o último registo do apontador (mesmo dia, mesma marcação ou id devolvido no POST). */
const deleteViagemApontadorUndo = async (req, res) => {
  const empresaId = req.user?.empresa_id;
  const apontadorId = req.user?.sub;
  if (!empresaId) {
    return res.status(403).json({
      success: false,
      error: "Empresa não associada ao usuário.",
      message: "Empresa não associada ao usuário.",
    });
  }
  if (!apontadorId) {
    return res.status(403).json({
      success: false,
      error: "Apontador inválido.",
      message: "Apontador inválido.",
    });
  }

  const body = viagemUndoSchema.parse(req.body);
  const gate = await assertVeiculoMotoristaTransporte(empresaId, body.veiculo_id, body.motorista_id);
  if (!gate.ok) {
    return res.status(gate.status).json({
      success: false,
      error: gate.message,
      message: gate.message,
    });
  }

  const tsMs =
    typeof body.timestamp === "number"
      ? body.timestamp
      : new Date(body.timestamp).getTime();
  if (!Number.isFinite(tsMs)) {
    return res.status(400).json({
      success: false,
      error: "Timestamp inválido.",
      message: "Timestamp inválido.",
    });
  }

  const deleted = await deleteViagemApontadorMatch({
    empresa_id: empresaId,
    apontador_id: apontadorId,
    veiculo_id: body.veiculo_id,
    motorista_id: body.motorista_id,
    tipo: body.tipo,
    timestamp_ms: tsMs,
    viagem_id: body.viagem_id ?? null,
  });

  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: "Registo não encontrado.",
      message: "Registo não encontrado ou já não pode ser desfeito.",
    });
  }

  return res.json({
    success: true,
    id: deleted.id,
  });
};

/** Limpa viagens de hoje (fuso São Paulo) para toda a empresa — uso controlado no apontador. */
const resetViagensDiaApontador = async (req, res) => {
  const empresaId = req.user?.empresa_id;
  const apontadorId = req.user?.sub;
  if (!empresaId) {
    return res.status(403).json({
      success: false,
      error: "Empresa não associada ao usuário.",
      message: "Empresa não associada ao usuário.",
    });
  }
  if (!apontadorId) {
    return res.status(403).json({
      success: false,
      error: "Apontador inválido.",
      message: "Apontador inválido.",
    });
  }

  const removidos = await deleteViagensApontadorDiaAtualSaoPaulo({
    empresa_id: empresaId,
    apontador_id: apontadorId,
  });
  const registroId = `e${empresaId}|n${removidos}|t${Date.now()}`;
  await logAudit({
    usuario_id: req.user.sub,
    acao: "reset_viagens_dia",
    tabela: "viagens",
    registro_id: registroId.slice(0, 120),
  });
  logInfo("apontador_reset_viagens_dia", {
    empresa_id: empresaId,
    usuario_id: req.user.sub,
    removidos_servidor: removidos,
  });

  return res.json({
    success: true,
    removidos_servidor: removidos,
  });
};

module.exports = {
  listVehiclesApontador,
  getContagemHojeApontador,
  createViagemApontador,
  deleteViagemApontadorUndo,
  resetViagensDiaApontador,
};
