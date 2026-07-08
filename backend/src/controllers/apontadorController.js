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
const {
  MATERIAL_ALLOWED_SQL,
  MATERIAL_CAPACITY_SQL,
} = require("../utils/transportMaterialSql");

const viagemCreateSchema = z.object({
  veiculo_id: z.coerce.number().int().positive(),
  motorista_id: z.coerce.number().int().positive(),
  tipo: z.enum(["esteril", "rocha", "rocha_pulmao", "rocha_armacao"]),
  timestamp: z.union([z.coerce.number(), z.string().trim().min(1)]),
});

const viagemUndoSchema = z
  .object({
    veiculo_id: z.coerce.number().int().positive().optional(),
    motorista_id: z.coerce.number().int().positive().optional(),
    tipo: z.enum(["esteril", "rocha", "rocha_pulmao", "rocha_armacao"]).optional(),
    timestamp: z.union([z.coerce.number(), z.string().trim().min(1)]).optional(),
    viagem_id: z.coerce.number().int().positive().optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.viagem_id) return;
    for (const key of ["veiculo_id", "motorista_id", "tipo", "timestamp"]) {
      if (v[key] == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "Campo obrigatorio para desfazer sem ID da viagem.",
        });
      }
    }
  });

const parseMarcacao = (timestamp) => {
  if (typeof timestamp === "number") {
    const d = new Date(timestamp);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? null : d;
};

const assertVeiculoMotoristaTransporte = async (empresaId, veiculo_id, motorista_id, tipo = null) => {
  const { rows: validRows } = await pool.query(
    `SELECT COALESCE(v.usa_para_transporte, false) AS usa_para_transporte,
            (${MATERIAL_ALLOWED_SQL.esteril}) AS transporta_esteril,
            (${MATERIAL_ALLOWED_SQL.rocha}) AS transporta_rocha,
            (${MATERIAL_ALLOWED_SQL.rocha_pulmao}) AS transporta_rocha_pulmao,
            (${MATERIAL_ALLOWED_SQL.rocha_armacao}) AS transporta_rocha_armacao,
            (${MATERIAL_CAPACITY_SQL.esteril})::double precision AS capacidade_esteril_ton,
            (${MATERIAL_CAPACITY_SQL.rocha})::double precision AS capacidade_rocha_ton,
            (${MATERIAL_CAPACITY_SQL.rocha_pulmao})::double precision AS capacidade_rocha_pulmao_ton,
            (${MATERIAL_CAPACITY_SQL.rocha_armacao})::double precision AS capacidade_rocha_armacao_ton
     FROM veiculos v
     INNER JOIN usuarios u ON u.id = $3
       AND u.empresa_id = v.empresa_id
       AND u.role = 'MOTORISTA'
       AND (
         u.veiculo_id = v.id
         OR EXISTS (
           SELECT 1
           FROM motorista_veiculos mv
           WHERE mv.empresa_id = v.empresa_id
             AND mv.motorista_id = u.id
             AND mv.veiculo_id = v.id
         )
       )
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

  if (tipo === "esteril" && (!validRows[0].transporta_esteril || Number(validRows[0].capacidade_esteril_ton) <= 0)) {
    return {
      ok: false,
      status: 400,
      message: "Veiculo sem capacidade de esteril configurada.",
    };
  }

  if (
    tipo === "rocha_pulmao" &&
    (!validRows[0].transporta_rocha_pulmao || Number(validRows[0].capacidade_rocha_pulmao_ton) <= 0)
  ) {
    return {
      ok: false,
      status: 400,
      message: "Veiculo sem capacidade de rocha pulmão configurada.",
    };
  }

  if (
    (tipo === "rocha_armacao" || tipo === "rocha") &&
    (!validRows[0].transporta_rocha_armacao || Number(validRows[0].capacidade_rocha_armacao_ton) <= 0)
  ) {
    return {
      ok: false,
      status: 400,
      message: "Veiculo sem capacidade de rocha amarração configurada.",
    };
  }

  return { ok: true };
};

/** Lista veiculos aptos ao apontamento: transporte com capacidade de estéril, rocha pulmão ou rocha amarração. */
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
  const offset = (Math.max(1, page) - 1) * limit;
  const values = [empresaId];
  let idx = 2;
  let searchSql = "";
  if (search.trim()) {
    searchSql = `AND (
      v.nome ILIKE $${idx}
      OR v.placa ILIKE $${idx}
      OR u.nome ILIKE $${idx}
      OR CONCAT('#', LPAD(COALESCE(v.codigo_operacional, 0)::text, 2, '0')) ILIKE $${idx}
      OR LPAD(COALESCE(v.codigo_operacional, 0)::text, 2, '0') ILIKE $${idx}
    )`;
    values.push(`%${search.trim()}%`);
    idx += 1;
  }
  const { rows } = await pool.query(
    `WITH codigos AS (
       SELECT
         id,
         COALESCE(
           codigo_operacional,
           ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC)::int
         ) AS codigo_apontador
       FROM veiculos
       WHERE empresa_id = $1
         AND COALESCE(usa_para_transporte, false) = true
     ),
     vinculos AS (
       SELECT DISTINCT ON (v.id, u.id)
         c.codigo_apontador,
         v.id,
         v.empresa_id,
         v.codigo_operacional,
         v.nome,
         v.placa,
         v.marca,
         v.modelo,
         v.tipo,
         v.categoria,
         v.ano,
         v.renavam,
         v.chassi,
         v.combustivel_principal,
         v.capacidade_litros,
         v.capacidade_ton,
         (${MATERIAL_ALLOWED_SQL.esteril}) AS transporta_esteril,
         (${MATERIAL_ALLOWED_SQL.rocha}) AS transporta_rocha,
         (${MATERIAL_ALLOWED_SQL.rocha_pulmao}) AS transporta_rocha_pulmao,
         (${MATERIAL_ALLOWED_SQL.rocha_armacao}) AS transporta_rocha_armacao,
         (${MATERIAL_CAPACITY_SQL.esteril})::double precision AS capacidade_esteril_ton,
         (${MATERIAL_CAPACITY_SQL.rocha})::double precision AS capacidade_rocha_ton,
         (${MATERIAL_CAPACITY_SQL.rocha_pulmao})::double precision AS capacidade_rocha_pulmao_ton,
         (${MATERIAL_CAPACITY_SQL.rocha_armacao})::double precision AS capacidade_rocha_armacao_ton,
         v.horimetro_atual,
         v.hodometro_atual,
         v.usa_para_transporte,
         v.tipo_operacao,
         v.status_operacional,
         v.created_at,
         u.id AS motorista_id,
         u.nome AS motorista_nome,
         (u.veiculo_id = v.id OR COALESCE(mv.is_principal, false)) AS motorista_principal
       FROM veiculos v
       INNER JOIN codigos c ON c.id = v.id
       INNER JOIN usuarios u ON u.empresa_id = v.empresa_id
        AND u.role = 'MOTORISTA'
        AND COALESCE(u.conta_status, 'ativo') = 'ativo'
       LEFT JOIN motorista_veiculos mv ON mv.empresa_id = v.empresa_id
        AND mv.motorista_id = u.id
        AND mv.veiculo_id = v.id
       WHERE v.empresa_id = $1
         AND COALESCE(v.usa_para_transporte, false) = true
         AND (
           ${MATERIAL_CAPACITY_SQL.esteril} > 0
          OR ${MATERIAL_CAPACITY_SQL.rocha_pulmao} > 0
          OR ${MATERIAL_CAPACITY_SQL.rocha_armacao} > 0
         )
         AND (u.veiculo_id = v.id OR mv.veiculo_id = v.id)
         ${searchSql}
       ORDER BY v.id, u.id, (u.veiculo_id = v.id OR COALESCE(mv.is_principal, false)) DESC
     )
     SELECT *, COUNT(*) OVER()::int AS total_count
     FROM vinculos
     ORDER BY codigo_apontador ASC, motorista_principal DESC, motorista_nome
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset]
  );
  const total = Number(rows[0]?.total_count || 0);
  const items = rows.map(({ total_count: _totalCount, ...row }) => row);
  return res.json({
    success: true,
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
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
      rocha_pulmao: counts.rocha_pulmao ?? 0,
      rocha_armacao: counts.rocha_armacao ?? 0,
      rocha: counts.rocha,
      ton_esteril: counts.ton_esteril,
      ton_rocha_pulmao: counts.ton_rocha_pulmao ?? 0,
      ton_rocha_armacao: counts.ton_rocha_armacao ?? 0,
      ton_rocha: counts.ton_rocha,
      ton_total: counts.ton_total,
    },
    ultimos_lancamentos: (recentes || []).map((item) => ({
      id: item.id,
      veiculo_id: item.veiculo_id,
      motorista_id: item.motorista_id,
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

  const gate = await assertVeiculoMotoristaTransporte(empresaId, body.veiculo_id, body.motorista_id, body.tipo);
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
  if (!body.viagem_id) {
    const gate = await assertVeiculoMotoristaTransporte(empresaId, body.veiculo_id, body.motorista_id);
    if (!gate.ok) {
      return res.status(gate.status).json({
        success: false,
        error: gate.message,
        message: gate.message,
      });
    }
  }

  const tsMs =
    body.timestamp == null
      ? null
      : typeof body.timestamp === "number"
        ? body.timestamp
        : new Date(body.timestamp).getTime();
  if (!body.viagem_id && !Number.isFinite(tsMs)) {
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
