"use strict";

/**
 * Schema Zod da saída estruturada da IA (Bloco 6, Seção 13) — versionado
 * (`V1` no nome, `schemaVersion: 1` no próprio payload). Nunca confiar em
 * JSON só porque deu parse: TODA resposta da IA passa por este schema antes
 * de qualquer outra validação de domínio (referências de origem, números,
 * etc. — ver dailyIntelligenceValidator.js).
 *
 * Este schema é PROPOSITALMENTE mais estruturado que o exemplo da Seção 14 —
 * inclui `evidenceType` em cada fato (necessário para a proteção contra
 * números da Seção 30: só evidência textual explícita pode sustentar um
 * número) e `sourceRefs` como array de strings simples (IDs de
 * telegramMessageId OU driveFileId) em vez de objetos tipados — mais simples
 * de validar e suficiente, já que o validador resolve cada string contra o
 * conjunto de IDs conhecidos do snapshot.
 */

const { z } = require("zod");
const { AUTOMATION_AI_FACT_CATEGORIES, AUTOMATION_AI_EVIDENCE_TYPES } = require("../constants/automationEnums");

const SourceRefSchema = z.string().min(1);

const FactSchema = z.object({
  id: z.string().min(1),
  category: z.enum(AUTOMATION_AI_FACT_CATEGORIES),
  statement: z.string().min(1),
  sourceRefs: z.array(SourceRefSchema).min(1, "todo fato precisa de ao menos uma referência de origem"),
  evidenceType: z.enum(AUTOMATION_AI_EVIDENCE_TYPES),
});

const PhotoObservationSchema = z.object({
  sourceRef: SourceRefSchema,
  description: z.string().min(1),
  visibleElements: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});

const ConflictSchema = z.object({
  description: z.string().min(1),
  sourceRefs: z.array(SourceRefSchema).min(2, "um conflito precisa referenciar pelo menos duas evidências"),
});

const MissingInformationSchema = z.object({
  description: z.string().min(1),
  relatedSourceRefs: z.array(SourceRefSchema).default([]),
});

const DailyIntelligenceSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  summary: z.object({
    text: z.string().min(1),
    sourceRefs: z.array(SourceRefSchema).default([]),
  }),
  facts: z.array(FactSchema).default([]),
  photoObservations: z.array(PhotoObservationSchema).default([]),
  conflicts: z.array(ConflictSchema).default([]),
  missingInformation: z.array(MissingInformationSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

module.exports = {
  DailyIntelligenceSchemaV1,
  FactSchema,
  PhotoObservationSchema,
  ConflictSchema,
  MissingInformationSchema,
};
