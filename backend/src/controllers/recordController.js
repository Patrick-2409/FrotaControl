const { z } = require("zod");
const { pool } = require("../db");
const { logAudit } = require("../services/auditService");
const { logInfo } = require("../services/loggerService");
const {
  upsertRomaneio,
  upsertCombustivel,
  upsertParteDiaria,
  listMotoristaRecords,
} = require("../models/recordModel");

const normalizeClientPayload = (value) => {
  const clientId = value?.client_id || value?.source_id;
  return {
    ...value,
    client_id: clientId,
    source_id: clientId,
  };
};

const sourceConflictMessage = "Registro ja existe para outro perfil.";
const sendSourceConflict = (res) =>
  res.status(409).json({
    success: false,
    error: sourceConflictMessage,
    message: sourceConflictMessage,
  });

const invalidVehicleMessage = "Veiculo invalido para esta empresa.";

const vehicleBelongsToCompany = async (empresa_id, veiculo_id) => {
  if (veiculo_id == null) return true;
  const vehicleId = Number(veiculo_id);
  const companyId = Number(empresa_id);
  if (!Number.isFinite(vehicleId) || vehicleId <= 0 || !Number.isFinite(companyId) || companyId <= 0) {
    return false;
  }
  const { rows } = await pool.query("SELECT 1 FROM veiculos WHERE id = $1 AND empresa_id = $2", [
    vehicleId,
    companyId,
  ]);
  return rows.length > 0;
};

const ensurePayloadVehicleBelongsToCompany = async (empresa_id, payload, res) => {
  if (await vehicleBelongsToCompany(empresa_id, payload?.veiculo_id)) return true;
  res.status(400).json({
    success: false,
    error: invalidVehicleMessage,
    message: invalidVehicleMessage,
  });
  return false;
};

/** Aceita string pt-BR (ex.: 1.234,56) ou número. */
const preprocessDecimal = (val) => {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (val === null || val === undefined || val === "") return val;
  const s = String(val).trim();
  if (!s) return val;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : val;
};

/** Horímetro/hodômetro opcionais: vazio, null ou inválido → omitido (evita NaN no Zod). */
const preprocessOptionalNumber = (val) => {
  if (val === null || val === undefined || val === "") return undefined;
  if (typeof val === "number") return Number.isFinite(val) ? val : undefined;
  const n = Number(preprocessDecimal(val));
  return Number.isFinite(n) ? n : undefined;
};

const romaneioSchema = z
  .object({
    source_id: z.string().min(8).optional(),
    client_id: z.string().min(8).optional(),
    version_of: z.string().min(8).optional(),
    data: z.string(),
    recorded_at_client: z.string().optional(),
    veiculo_id: z.coerce.number().int().positive().optional(),
    tipo_transporte: z.enum(["Estéril", "Rocha (amarração)", "Rocha (pulmão)"]),
    destino: z.string().min(2),
    observacao: z.string().optional(),
  })
  .refine((v) => Boolean(v.source_id || v.client_id), {
    message: "client_id é obrigatório",
    path: ["client_id"],
  })
  .transform(normalizeClientPayload);

const combustivelSchema = z
  .object({
    source_id: z.string().min(8).optional(),
    client_id: z.string().min(8).optional(),
    version_of: z.string().min(8).optional(),
    data: z.string(),
    recorded_at_client: z.string().optional(),
    veiculo_id: z.coerce.number().int().positive().optional(),
    litros: z.preprocess(
      preprocessDecimal,
      z.coerce.number().positive({ message: "litros deve ser maior que zero." })
    ),
    valor_total: z.preprocess(
      preprocessDecimal,
      z.coerce.number().positive({ message: "valor_total deve ser maior que zero." })
    ),
    tipo_combustivel: z.string().min(2),
    horimetro: z.preprocess(preprocessOptionalNumber, z.number().optional()),
    hodometro: z.preprocess(preprocessOptionalNumber, z.number().optional()),
  })
  .refine((v) => Boolean(v.source_id || v.client_id), {
    message: "client_id é obrigatório",
    path: ["client_id"],
  })
  .transform(normalizeClientPayload);

const checklistItemSchema = z.enum(["ok", "ajuste", "não_funcional"]);
const numericOptionalSchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().optional()
);
const textOptionalSchema = z.preprocess(
  (value) => (value === null || value === undefined ? undefined : String(value).trim()),
  z.string().optional()
);

const parteSchema = z
  .object({
    source_id: z.string().min(8).optional(),
    client_id: z.string().min(8).optional(),
    version_of: z.string().min(8).optional(),
    data: z.string(),
    recorded_at_client: z.string().optional(),
    veiculo_id: z.coerce.number().int().positive().optional(),
    contratado: z.string().min(2),
    operador: z.string().min(2),
    equipamento: z.string().min(2),
    marca_modelo: z.string().min(2),
    local: z.string().min(2),
    expediente: textOptionalSchema,
    periodo: z.enum(["manhã", "tarde", "noite"]),
    clima: z.enum(["bom", "chuva"]),
    horimetro_inicio: z.coerce.number(),
    horimetro_fim: z.coerce.number(),
    hodometro_inicio: numericOptionalSchema,
    hodometro_fim: numericOptionalSchema,
    checklist: z.object({
      motor: checklistItemSchema,
      hidráulico: checklistItemSchema,
      freios: checklistItemSchema,
      pneus: checklistItemSchema,
      iluminação: checklistItemSchema,
      óleo: checklistItemSchema,
      combustível: checklistItemSchema,
      outros: checklistItemSchema.optional(),
    }),
    outros_descricao: textOptionalSchema,
    tempo_parado: z.string().optional(),
    observacoes: z.string().optional(),
    producao: z.string().optional(),
  })
  .refine((v) => Boolean(v.source_id || v.client_id), {
    message: "client_id é obrigatório",
    path: ["client_id"],
  })
  .transform(normalizeClientPayload)
  .transform((val) => ({
    ...val,
    total_horas: Number((val.horimetro_fim - val.horimetro_inicio).toFixed(2)),
    total_km:
      typeof val.hodometro_inicio === "number" && typeof val.hodometro_fim === "number"
        ? Number((val.hodometro_fim - val.hodometro_inicio).toFixed(2))
        : null,
  }));

const createRomaneio = async (req, res) => {
  logInfo("record:create-romaneio", { user_id: req.user?.sub, empresa_id: req.user?.empresa_id });
  if (req.user.empresa_id == null) {
    return res.status(400).json({
      success: false,
      error: "Usuário sem empresa vinculada. Contacte o administrador.",
      message: "Usuário sem empresa vinculada. Contacte o administrador.",
    });
  }
  const payload = romaneioSchema.parse(req.body);
  if (!(await ensurePayloadVehicleBelongsToCompany(req.user.empresa_id, payload, res))) return;
  const before = await pool.query(
    "SELECT id FROM romaneios WHERE empresa_id = $1 AND source_id = $2",
    [req.user.empresa_id, payload.source_id]
  );
  const row = await upsertRomaneio(req.user.empresa_id, req.user.sub, payload);
  if (!row) {
    return sendSourceConflict(res);
  }
  await logAudit({
    usuario_id: req.user.sub,
    acao: before.rowCount ? "editou" : "criou",
    tabela: "romaneios",
    registro_id: row.id,
  });
  return res.status(201).json({ success: true, data: row });
};

const createCombustivel = async (req, res) => {
  logInfo("record:create-combustivel", { user_id: req.user?.sub, empresa_id: req.user?.empresa_id });
  if (req.user.empresa_id == null) {
    return res.status(400).json({
      success: false,
      error: "Usuário sem empresa vinculada. Não é possível registar abastecimento.",
      message: "Usuário sem empresa vinculada. Não é possível registar abastecimento.",
    });
  }
  const payload = combustivelSchema.parse(req.body);
  if (!(await ensurePayloadVehicleBelongsToCompany(req.user.empresa_id, payload, res))) return;
  const before = await pool.query(
    "SELECT id FROM combustiveis WHERE empresa_id = $1 AND source_id = $2",
    [req.user.empresa_id, payload.source_id]
  );
  const row = await upsertCombustivel(req.user.empresa_id, req.user.sub, payload);
  if (!row) {
    return sendSourceConflict(res);
  }
  await logAudit({
    usuario_id: req.user.sub,
    acao: before.rowCount ? "editou" : "criou",
    tabela: "combustiveis",
    registro_id: row.id,
  });
  return res.status(201).json({ success: true, data: row });
};

const updateCombustivelBySourceId = async (req, res) => {
  logInfo("record:update-combustivel", {
    user_id: req.user?.sub,
    empresa_id: req.user?.empresa_id,
    source_id: req.params?.id,
  });
  if (req.user.empresa_id == null) {
    return res.status(400).json({
      success: false,
      error: "Usuário sem empresa vinculada. Não é possível atualizar abastecimento.",
      message: "Usuário sem empresa vinculada. Não é possível atualizar abastecimento.",
    });
  }
  const params = z
    .object({
      id: z.string().trim().min(8),
    })
    .parse(req.params);

  const body = {
    ...req.body,
    source_id: params.id,
    client_id: params.id,
  };
  const payload = combustivelSchema.parse(body);
  if (!(await ensurePayloadVehicleBelongsToCompany(req.user.empresa_id, payload, res))) return;
  const before = await pool.query(
    "SELECT id, usuario_id FROM combustiveis WHERE empresa_id = $1 AND source_id = $2",
    [req.user.empresa_id, payload.source_id]
  );
  if (!before.rowCount) {
    return res.status(404).json({
      success: false,
      error: "Abastecimento não encontrado",
      message: "Abastecimento não encontrado",
    });
  }
  if (Number(before.rows[0]?.usuario_id) !== Number(req.user.sub)) {
    return res.status(404).json({
      success: false,
      error: "Abastecimento não encontrado",
      message: "Abastecimento não encontrado",
    });
  }
  const row = await upsertCombustivel(req.user.empresa_id, req.user.sub, payload);
  if (!row) {
    return res.status(404).json({
      success: false,
      error: "Abastecimento não encontrado",
      message: "Abastecimento não encontrado",
    });
  }
  await logAudit({
    usuario_id: req.user.sub,
    acao: "editou",
    tabela: "combustiveis",
    registro_id: row.id,
  });
  return res.json({ success: true, data: row });
};

const createParteDiaria = async (req, res) => {
  logInfo("record:create-parte-diaria", { user_id: req.user?.sub, empresa_id: req.user?.empresa_id });
  if (req.user.empresa_id == null) {
    return res.status(400).json({
      success: false,
      error: "Usuário sem empresa vinculada. Contacte o administrador.",
      message: "Usuário sem empresa vinculada. Contacte o administrador.",
    });
  }
  const payload = parteSchema.parse(req.body);
  if (!(await ensurePayloadVehicleBelongsToCompany(req.user.empresa_id, payload, res))) return;
  const before = await pool.query(
    "SELECT id FROM parte_diaria WHERE empresa_id = $1 AND source_id = $2",
    [req.user.empresa_id, payload.source_id]
  );
  const row = await upsertParteDiaria(req.user.empresa_id, req.user.sub, payload);
  if (!row) {
    return sendSourceConflict(res);
  }
  await logAudit({
    usuario_id: req.user.sub,
    acao: before.rowCount ? "editou" : "criou",
    tabela: "parte_diaria",
    registro_id: row.id,
  });
  return res.status(201).json({ success: true, data: row });
};

const syncSchema = z.object({
  romaneios: z.array(romaneioSchema).optional(),
  combustiveis: z.array(combustivelSchema).optional(),
  parteDiaria: z.array(parteSchema).optional(),
});

const syncPending = async (req, res) => {
  logInfo("record:sync-pending", { user_id: req.user?.sub, empresa_id: req.user?.empresa_id });
  if (req.user.empresa_id == null) {
    return res.status(400).json({
      success: false,
      error: "Usuario sem empresa vinculada.",
      message: "Usuario sem empresa vinculada.",
    });
  }
  const data = syncSchema.parse(req.body);
  const result = {
    romaneios: [],
    combustiveis: [],
    parteDiaria: [],
  };

  for (const item of [
    ...(data.romaneios || []),
    ...(data.combustiveis || []),
    ...(data.parteDiaria || []),
  ]) {
    if (!(await ensurePayloadVehicleBelongsToCompany(req.user.empresa_id, item, res))) return;
  }

  for (const item of data.romaneios || []) {
    const row = await upsertRomaneio(req.user.empresa_id, req.user.sub, item);
    if (!row) {
      return sendSourceConflict(res);
    }
    result.romaneios.push(row);
    await logAudit({
      usuario_id: req.user.sub,
      acao: "editou",
      tabela: "romaneios",
      registro_id: row.id,
    });
  }
  for (const item of data.combustiveis || []) {
    const row = await upsertCombustivel(req.user.empresa_id, req.user.sub, item);
    if (!row) {
      return sendSourceConflict(res);
    }
    result.combustiveis.push(row);
    await logAudit({
      usuario_id: req.user.sub,
      acao: "editou",
      tabela: "combustiveis",
      registro_id: row.id,
    });
  }
  for (const item of data.parteDiaria || []) {
    const row = await upsertParteDiaria(req.user.empresa_id, req.user.sub, item);
    if (!row) {
      return sendSourceConflict(res);
    }
    result.parteDiaria.push(row);
    await logAudit({
      usuario_id: req.user.sub,
      acao: "editou",
      tabela: "parte_diaria",
      registro_id: row.id,
    });
  }

  return res.json({ success: true, message: "Sincronização concluída", result });
};

const deleteRecord = async (req, res) => {
  const params = z
    .object({
      modulo: z.enum(["romaneios", "combustiveis", "parte_diaria"]),
      source_id: z.string().min(8),
    })
    .parse(req.params);

  const companyAndSourceWhere = `empresa_id = $1 AND source_id = $2`;
  const roleWhere =
    req.user.role === "MOTORISTA"
      ? `${companyAndSourceWhere} AND usuario_id = $3`
      : companyAndSourceWhere;
  const values =
    req.user.role === "MOTORISTA"
      ? [req.user.empresa_id, params.source_id, req.user.sub]
      : [req.user.empresa_id, params.source_id];

  await pool.query(
    `DELETE FROM ${params.modulo}
     WHERE ${roleWhere}`,
    values
  );
  await logAudit({
    usuario_id: req.user.sub,
    acao: "excluiu",
    tabela: params.modulo,
    registro_id: params.source_id,
  });

  return res.status(204).send();
};

const listAppVehicles = async (req, res) => {
  const search = String(req.query.search || "").trim();
  const paraRomaneioRaw = String(req.query.para_romaneio ?? req.query.romaneio ?? "").trim().toLowerCase();
  const apenasTransporte =
    paraRomaneioRaw === "1" || paraRomaneioRaw === "true" || paraRomaneioRaw === "sim";
  const values = [req.user.empresa_id];
  let whereSql = "WHERE empresa_id = $1";

  if (apenasTransporte) {
    whereSql += " AND COALESCE(usa_para_transporte, false) = true";
  }

  if (search) {
    values.push(`%${search}%`);
    whereSql += ` AND (nome ILIKE $2 OR placa ILIKE $2 OR COALESCE(marca, '') ILIKE $2 OR COALESCE(modelo, '') ILIKE $2)`;
  }

  const { rows } = await pool.query(
    `SELECT id, nome, placa, marca, modelo, capacidade_ton, capacidade_esteril_ton, capacidade_rocha_ton, usa_para_transporte
     FROM veiculos
     ${whereSql}
     ORDER BY nome ASC, placa ASC`,
    values
  );

  return res.json({ items: rows });
};

const listMyHistory = async (req, res) => {
  const items = await listMotoristaRecords({
    empresa_id: req.user.empresa_id,
    usuario_id: req.user.sub,
  });
  return res.json({ success: true, items });
};

module.exports = {
  createRomaneio,
  createCombustivel,
  updateCombustivelBySourceId,
  createParteDiaria,
  syncPending,
  deleteRecord,
  listAppVehicles,
  listMyHistory,
};
