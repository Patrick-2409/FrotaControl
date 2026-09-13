"use strict";

/**
 * Validação Zod dos dados de distribuição por e-mail de uma config (Bloco 9,
 * Seção 31) — vivem em `automacao_configs.configuracao.email` (JSONB já
 * existente desde o Bloco 1, nenhuma coluna nova, mesmo padrão de
 * `documents/documentConfigSchema.js` do Bloco 7B). Backend é sempre a fonte
 * de verdade — nunca confiar só na validação do frontend (Seção 31).
 *
 * Nunca aceita credencial/remetente técnico aqui (Seção 13) — isso é
 * SOMENTE variável de ambiente, nunca gravado em `automacao_configs`.
 */

const { z } = require("zod");
const { findUnknownPlaceholders, ALLOWED_PLACEHOLDERS } = require("./distributionTemplating");

const placeholderRefinement = (value, ctx) => {
  const unknown = findUnknownPlaceholders(value);
  if (unknown.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Placeholder não suportado: ${unknown.map((p) => `{${p}}`).join(", ")}. Permitidos: ${ALLOWED_PLACEHOLDERS.map((p) => `{${p}}`).join(", ")}.`,
    });
  }
};

const EmailConfigSchema = z
  .object({
    assunto: z.string().trim().min(1).max(200).superRefine(placeholderRefinement).optional(),
    corpo: z.string().trim().min(1).max(5000).superRefine(placeholderRefinement).optional(),
  })
  .partial();

module.exports = { EmailConfigSchema };
