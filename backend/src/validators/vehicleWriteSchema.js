const { z } = require("zod");

const statusEnum = z.enum(["ativo", "manutencao", "indisponivel", "parado", "operacao"]);

const vehicleBodySchema = z.object({
  nome: z.string().trim().min(2),
  placa: z.string().trim().min(4),
  marca: z.string().trim().optional().nullable(),
  modelo: z.string().trim().optional().nullable(),
  capacidade_ton: z.coerce.number().positive().optional().nullable(),
  capacidade_esteril_ton: z.coerce.number().positive().optional().nullable(),
  capacidade_rocha_ton: z.coerce.number().positive().optional().nullable(),
  usa_para_transporte: z.coerce.boolean().optional().default(false),
  tipo_operacao: z.enum(["transporte", "apoio"]).optional(),
  tipo: z.string().trim().max(80).optional().nullable(),
  categoria: z.string().trim().max(80).optional().nullable(),
  ano: z.coerce.number().int().min(1970).max(2100).optional().nullable(),
  renavam: z.string().trim().max(32).optional().nullable(),
  chassi: z.string().trim().max(48).optional().nullable(),
  combustivel_principal: z.string().trim().max(50).optional().nullable(),
  capacidade_litros: z.coerce.number().nonnegative().optional().nullable(),
  horimetro_atual: z.coerce.number().nonnegative().optional().nullable(),
  hodometro_atual: z.coerce.number().nonnegative().optional().nullable(),
  status_operacional: statusEnum.optional(),
  doc_revisao_validade: z.string().trim().optional().nullable(),
  doc_licenciamento_validade: z.string().trim().optional().nullable(),
  doc_seguro_validade: z.string().trim().optional().nullable(),
  doc_inspecao_validade: z.string().trim().optional().nullable(),
  manutencao_agendar_ate: z.string().trim().optional().nullable(),
  fleet_telemetry_meta: z.any().optional(),
});

const trimOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const normalizeDate = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
};

const toVehicleWritePayload = (parsed) => {
  const tipo =
    parsed.tipo_operacao === "transporte" || parsed.tipo_operacao === "apoio"
      ? parsed.tipo_operacao
      : Boolean(parsed.usa_para_transporte)
        ? "transporte"
        : "apoio";
  const usa = tipo === "transporte";
  const hasSpecificCapacity =
    parsed.capacidade_esteril_ton != null || parsed.capacidade_rocha_ton != null;
  const out = {
    nome: parsed.nome,
    placa: parsed.placa,
    usa_para_transporte: usa,
    tipo_operacao: tipo,
    capacidade_ton: usa
      ? parsed.capacidade_ton ?? parsed.capacidade_esteril_ton ?? parsed.capacidade_rocha_ton ?? null
      : null,
    capacidade_esteril_ton: usa
      ? hasSpecificCapacity
        ? parsed.capacidade_esteril_ton ?? null
        : parsed.capacidade_ton ?? null
      : null,
    capacidade_rocha_ton: usa
      ? hasSpecificCapacity
        ? parsed.capacidade_rocha_ton ?? null
        : parsed.capacidade_ton ?? null
      : null,
  };
  if (parsed.marca !== undefined) out.marca = trimOrNull(parsed.marca);
  if (parsed.modelo !== undefined) out.modelo = trimOrNull(parsed.modelo);
  if (parsed.tipo !== undefined) out.tipo = trimOrNull(parsed.tipo);
  if (parsed.categoria !== undefined) out.categoria = trimOrNull(parsed.categoria);
  if (parsed.ano !== undefined) out.ano = parsed.ano;
  if (parsed.renavam !== undefined) out.renavam = trimOrNull(parsed.renavam);
  if (parsed.chassi !== undefined) out.chassi = trimOrNull(parsed.chassi);
  if (parsed.combustivel_principal !== undefined) out.combustivel_principal = trimOrNull(parsed.combustivel_principal);
  if (parsed.capacidade_litros !== undefined) out.capacidade_litros = parsed.capacidade_litros;
  if (parsed.horimetro_atual !== undefined) out.horimetro_atual = parsed.horimetro_atual;
  if (parsed.hodometro_atual !== undefined) out.hodometro_atual = parsed.hodometro_atual;
  if (parsed.status_operacional !== undefined) out.status_operacional = parsed.status_operacional;
  if (parsed.doc_revisao_validade !== undefined) out.doc_revisao_validade = normalizeDate(parsed.doc_revisao_validade);
  if (parsed.doc_licenciamento_validade !== undefined) {
    out.doc_licenciamento_validade = normalizeDate(parsed.doc_licenciamento_validade);
  }
  if (parsed.doc_seguro_validade !== undefined) out.doc_seguro_validade = normalizeDate(parsed.doc_seguro_validade);
  if (parsed.doc_inspecao_validade !== undefined) {
    out.doc_inspecao_validade = normalizeDate(parsed.doc_inspecao_validade);
  }
  if (parsed.manutencao_agendar_ate !== undefined) {
    out.manutencao_agendar_ate = normalizeDate(parsed.manutencao_agendar_ate);
  }
  if (parsed.fleet_telemetry_meta !== undefined) {
    out.fleet_telemetry_meta =
      parsed.fleet_telemetry_meta != null && typeof parsed.fleet_telemetry_meta === "object"
        ? parsed.fleet_telemetry_meta
        : {};
  }
  return out;
};

module.exports = {
  vehicleBodySchema,
  toVehicleWritePayload,
};
