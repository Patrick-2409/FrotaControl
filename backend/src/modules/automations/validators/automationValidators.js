/**
 * Validação Zod do módulo de Automações (Bloco 2).
 *
 * Nunca aceita campos de segredo (token Telegram, credencial Google, chave
 * OpenAI, senha SMTP) — Telegram Chat ID e Telegram User ID NÃO são segredos
 * (são identificadores públicos de chat/usuário) e por isso são aceitos aqui.
 */

const { z } = require("zod");
const { DocumentConfigSchema } = require("../documents/documentConfigSchema");

// Mesma técnica usada para validar timezone sem adicionar dependência nova:
// `Intl.supportedValuesOf` é nativo do Node (disponível desde a v18, o projeto
// roda em Node 22) e devolve a lista oficial de timezones IANA reconhecidos
// pela ICU embutida — não hardcoda nenhuma lista nem restringe ao Brasil.
const IANA_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone é obrigatório.")
  .refine((value) => IANA_TIMEZONES.has(value), "Timezone deve ser um identificador IANA válido (ex.: America/Sao_Paulo).");

const horarioFechamentoSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário deve estar no formato HH:MM (24h).")
  .optional()
  .nullable();

// Telegram usa inteiros de 64 bits (chat_id de supergrupo pode ser negativo e
// grande) — a coluna é BIGINT; aceitamos number ou string numérica e sempre
// tratamos como string ao persistir, evitando qualquer perda de precisão de
// ponto flutuante em IDs muito grandes.
const telegramIdSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value === "" || /^-?\d{1,20}$/.test(value), "Identificador do Telegram deve ser numérico.")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const nonEmptyString = (max) => z.string().trim().min(1).max(max);
const optionalString = (max) => z.string().trim().max(max).optional().nullable();

const automationConfigCreateSchema = z.object({
  automacao_id: z.coerce.number().int().positive("Selecione um tipo de automação válido."),
  automacao_template_id: z.coerce.number().int().positive().optional().nullable(),
  nome: nonEmptyString(150),
  label: optionalString(150),
  projeto_nome: optionalString(150),
  ativo: z.boolean().optional().default(true),
  timezone: timezoneSchema.optional().default("America/Sao_Paulo"),
  horario_fechamento: horarioFechamentoSchema,
  telegram_chat_id: telegramIdSchema,
  google_drive_pasta_raiz_id: optionalString(190),
  usa_ia: z.boolean().optional().default(true),
  // Bloco 7B (Seção 47/50) — dados documentais do Diário de Obra, gravados em
  // `configuracao.documento` (JSONB já existente, nenhuma coluna nova).
  // Opcional: uma config pode ser criada/editada sem esses dados; só a
  // GERAÇÃO do documento exige que estejam completos (ver
  // documentPrerequisites.js).
  configuracao_documento: DocumentConfigSchema.optional(),
  // SUPER_ADMIN pode informar a empresa alvo; ADMIN_EMPRESA nunca precisa (e se
  // informar, tenantContext.resolveEmpresaScopeWrite já rejeita valor diferente
  // da própria empresa antes deste schema ser avaliado).
  empresa_id: z.coerce.number().int().positive().optional(),
});

const automationConfigUpdateSchema = automationConfigCreateSchema
  .omit({ empresa_id: true })
  .partial()
  .extend({
    // nome continua obrigatório mesmo em update parcial: nunca aceitamos config sem nome.
    nome: nonEmptyString(150),
  });

const automationConfigStatusSchema = z.object({
  ativo: z.boolean(),
});

const automationApproverSchema = z.object({
  nome: optionalString(150),
  telegram_user_id: telegramIdSchema.refine((value) => value != null, "Telegram User ID é obrigatório."),
  ativo: z.boolean().optional().default(true),
});

const automationApproverUpdateSchema = z.object({
  nome: optionalString(150),
  telegram_user_id: telegramIdSchema,
  ativo: z.boolean().optional(),
});

const automationRecipientSchema = z.object({
  nome: optionalString(150),
  email: z.string().trim().email("E-mail inválido."),
  tipo: z.enum(["TO", "CC"]).optional().default("TO"),
  ativo: z.boolean().optional().default(true),
});

const automationRecipientUpdateSchema = z.object({
  nome: optionalString(150),
  email: z.string().trim().email("E-mail inválido.").optional(),
  tipo: z.enum(["TO", "CC"]).optional(),
  ativo: z.boolean().optional(),
});

module.exports = {
  IANA_TIMEZONES,
  automationConfigCreateSchema,
  automationConfigUpdateSchema,
  automationConfigStatusSchema,
  automationApproverSchema,
  automationApproverUpdateSchema,
  automationRecipientSchema,
  automationRecipientUpdateSchema,
};
