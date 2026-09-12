"use strict";

/**
 * Validador pós-IA (Bloco 6, Seção 32) — a saída da IA NUNCA chega a
 * READY_FOR_DOCUMENT sem passar por aqui. Ordem de checagem:
 *   1. Schema Zod (dailyIntelligenceSchema.js) — forma estrutural.
 *   2. Toda sourceRef citada (facts/summary/photoObservations/conflicts/
 *      missingInformation) precisa existir no conjunto de IDs válidos DESTE
 *      snapshot (Seção 16) — nunca um ID inventado.
 *   3. Proteção contra números (Seção 30): um fato com evidenceType
 *      IMAGE_VISIBLE nunca pode conter um número; um fato textual só pode
 *      conter um número que apareça LITERALMENTE no texto/legenda da(s)
 *      mensagem(ns) citada(s) como fonte — "dado determinístico > IA"
 *      (Seção 31) aplicado à letra: o texto de origem é a única fonte de
 *      verdade para um número, a IA nunca introduz um novo.
 *   4. O summary não pode citar uma sourceRef que não apareça em NENHUM
 *      fact (Seção 44) — nunca introduz evidência à parte da estrutura.
 *
 * Resultado inválido nunca é "consertado" (Seção 33: nada de heurística
 * frágil tipo "pegue o maior bloco entre chaves") — só rejeitado, com o
 * motivo completo para auditoria (`erro_mensagem`).
 */

const { DailyIntelligenceSchemaV1 } = require("./dailyIntelligenceSchema");

function extractNumbers(text) {
  return String(text || "").match(/\d+(?:[.,]\d+)?/g) || [];
}

function collectSourceText(sourceRefs, textByRef) {
  return sourceRefs.map((ref) => textByRef.get(ref) || "").join(" \n ");
}

function validateDailyIntelligence(rawOutput, { validSourceRefs, textByRef }) {
  const parseResult = DailyIntelligenceSchemaV1.safeParse(rawOutput);
  if (!parseResult.success) {
    return {
      valid: false,
      code: "AI_INVALID_OUTPUT",
      errors: parseResult.error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`),
    };
  }

  const data = parseResult.data;
  const referenceErrors = [];
  const contentErrors = [];
  const allFactSourceRefs = new Set();

  const checkRefs = (refs, context) => {
    for (const ref of refs) {
      if (!validSourceRefs.has(ref)) {
        referenceErrors.push(`${context}: sourceRef "${ref}" não existe neste snapshot`);
      }
    }
  };

  for (const fact of data.facts) {
    checkRefs(fact.sourceRefs, `facts[${fact.id}]`);
    fact.sourceRefs.forEach((ref) => allFactSourceRefs.add(ref));

    const numbers = extractNumbers(fact.statement);
    if (numbers.length > 0) {
      if (fact.evidenceType === "IMAGE_VISIBLE") {
        contentErrors.push(`facts[${fact.id}]: número (${numbers.join(", ")}) não pode vir de evidência somente visual`);
      } else {
        const sourceText = collectSourceText(fact.sourceRefs, textByRef);
        for (const number of numbers) {
          if (!sourceText.includes(number)) {
            contentErrors.push(`facts[${fact.id}]: número "${number}" não aparece literalmente no texto de origem citado`);
          }
        }
      }
    }
  }

  for (const observation of data.photoObservations) {
    checkRefs([observation.sourceRef], "photoObservations");
  }
  for (const conflict of data.conflicts) {
    checkRefs(conflict.sourceRefs, "conflicts");
  }
  for (const missing of data.missingInformation) {
    checkRefs(missing.relatedSourceRefs, "missingInformation");
  }
  checkRefs(data.summary.sourceRefs, "summary");

  for (const ref of data.summary.sourceRefs) {
    if (!allFactSourceRefs.has(ref)) {
      contentErrors.push(`summary cita sourceRef "${ref}" que não aparece em nenhum fact — resumo não pode introduzir evidência própria`);
    }
  }

  if (referenceErrors.length > 0) {
    return { valid: false, code: "AI_SOURCE_REFERENCE_INVALID", errors: [...referenceErrors, ...contentErrors] };
  }
  if (contentErrors.length > 0) {
    return { valid: false, code: "AI_INVALID_OUTPUT", errors: contentErrors };
  }

  return { valid: true, data };
}

module.exports = { validateDailyIntelligence, extractNumbers };
