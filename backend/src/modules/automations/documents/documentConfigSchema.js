"use strict";

/**
 * Validação Zod dos dados documentais de uma config (Bloco 7B, Seção 50) —
 * vivem em `automacao_configs.configuracao.documento` (JSONB já existente
 * desde o Bloco 1, nenhuma coluna nova). Backend é sempre a fonte de
 * verdade — nunca confiar só na validação do frontend (painel, Bloco 7B
 * Seção 47).
 *
 * Todos os campos são opcionais aqui (o formulário pode ser salvo
 * incompleto) — a OBRIGATORIEDADE para efetivamente gerar um documento é
 * responsabilidade de `validateDocumentGenerationPrerequisites`
 * (documentPrerequisites.js), não deste schema.
 */

const { z } = require("zod");

const optionalTrimmedString = (max) => z.string().trim().min(1).max(max).optional();

const horaSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário deve estar no formato HH:MM (24h).")
  .optional();

// Bloco 12 — campos do template v2, sempre opcionais (fallback genérico
// resolvido em diarioObraDocumentModel.js quando ausentes). Nunca um nome
// de cliente/projeto vive no código — só aqui, como dado de configuração.
const RodapeInstitucionalSchema = z
  .object({
    assinanteEsquerda: optionalTrimmedString(190),
    razaoSocialCompleta: optionalTrimmedString(255),
    endereco: optionalTrimmedString(255),
  })
  .partial();

const DocumentConfigSchema = z
  .object({
    referenciaContratual: optionalTrimmedString(190),
    local: optionalTrimmedString(190),
    clienteRazaoSocial: optionalTrimmedString(190),
    clienteEndereco: optionalTrimmedString(255),
    responsavelTecnico: optionalTrimmedString(190),
    expedienteInicio: horaSchema,
    expedienteFim: horaSchema,
    tituloRdf: optionalTrimmedString(190),
    rodapeInstitucional: RodapeInstitucionalSchema.optional(),
  })
  .partial();

module.exports = { DocumentConfigSchema, RodapeInstitucionalSchema };
