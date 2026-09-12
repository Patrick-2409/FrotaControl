"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { DailyIntelligenceSchemaV1 } = require("../src/modules/automations/ai/dailyIntelligenceSchema");

function baseDoc(overrides = {}) {
  return {
    schemaVersion: 1,
    summary: { text: "Resumo", sourceRefs: [] },
    facts: [],
    photoObservations: [],
    conflicts: [],
    missingInformation: [],
    warnings: [],
    ...overrides,
  };
}

test("schema Zod aceita um documento mínimo válido", () => {
  const result = DailyIntelligenceSchemaV1.safeParse(baseDoc());
  assert.equal(result.success, true);
});

test("schema Zod aceita um fact completo com todas as categorias válidas", () => {
  const categories = ["ACTIVITY", "LOCATION", "EQUIPMENT", "PERSONNEL", "QUANTITY", "WEATHER", "ENVIRONMENT", "SAFETY", "OCCURRENCE", "MATERIAL", "OTHER"];
  for (const category of categories) {
    const doc = baseDoc({
      facts: [{ id: "f1", category, statement: "algo", sourceRefs: ["100"], evidenceType: "TEXT_EXPLICIT" }],
    });
    const result = DailyIntelligenceSchemaV1.safeParse(doc);
    assert.equal(result.success, true, `categoria ${category} deveria ser aceita`);
  }
});

test("schema Zod rejeita categoria fora do enum", () => {
  const doc = baseDoc({ facts: [{ id: "f1", category: "INVENTADA", statement: "x", sourceRefs: ["1"], evidenceType: "TEXT_EXPLICIT" }] });
  const result = DailyIntelligenceSchemaV1.safeParse(doc);
  assert.equal(result.success, false);
});

test("schema Zod rejeita fact sem sourceRefs (array vazio)", () => {
  const doc = baseDoc({ facts: [{ id: "f1", category: "ACTIVITY", statement: "x", sourceRefs: [], evidenceType: "TEXT_EXPLICIT" }] });
  const result = DailyIntelligenceSchemaV1.safeParse(doc);
  assert.equal(result.success, false);
});

test("schema Zod rejeita campo obrigatório ausente (statement)", () => {
  const doc = baseDoc({ facts: [{ id: "f1", category: "ACTIVITY", sourceRefs: ["1"], evidenceType: "TEXT_EXPLICIT" }] });
  const result = DailyIntelligenceSchemaV1.safeParse(doc);
  assert.equal(result.success, false);
});

test("schema Zod rejeita evidenceType inválido", () => {
  const doc = baseDoc({ facts: [{ id: "f1", category: "ACTIVITY", statement: "x", sourceRefs: ["1"], evidenceType: "ACHISMO" }] });
  const result = DailyIntelligenceSchemaV1.safeParse(doc);
  assert.equal(result.success, false);
});

test("schema Zod rejeita schemaVersion diferente de 1", () => {
  const result = DailyIntelligenceSchemaV1.safeParse(baseDoc({ schemaVersion: 2 }));
  assert.equal(result.success, false);
});

test("schema Zod rejeita conflict com menos de duas sourceRefs", () => {
  const doc = baseDoc({ conflicts: [{ description: "conflito", sourceRefs: ["1"] }] });
  const result = DailyIntelligenceSchemaV1.safeParse(doc);
  assert.equal(result.success, false);
});

test("schema Zod aceita conflict com duas sourceRefs", () => {
  const doc = baseDoc({ conflicts: [{ description: "conflito", sourceRefs: ["1", "2"] }] });
  const result = DailyIntelligenceSchemaV1.safeParse(doc);
  assert.equal(result.success, true);
});

test("schema Zod aceita missingInformation e preenche relatedSourceRefs default", () => {
  const doc = baseDoc({ missingInformation: [{ description: "faltou localização" }] });
  const result = DailyIntelligenceSchemaV1.safeParse(doc);
  assert.equal(result.success, true);
  assert.deepEqual(result.data.missingInformation[0].relatedSourceRefs, []);
});

test("schema Zod aceita photoObservation e preenche visibleElements/limitations default", () => {
  const doc = baseDoc({ photoObservations: [{ sourceRef: "drive-1", description: "algo visível" }] });
  const result = DailyIntelligenceSchemaV1.safeParse(doc);
  assert.equal(result.success, true);
  assert.deepEqual(result.data.photoObservations[0].visibleElements, []);
  assert.deepEqual(result.data.photoObservations[0].limitations, []);
});

test("schema Zod arrays vazios são válidos em todas as coleções (nunca obrigatório inventar conteúdo)", () => {
  const result = DailyIntelligenceSchemaV1.safeParse(baseDoc());
  assert.equal(result.success, true);
  assert.deepEqual(result.data.facts, []);
  assert.deepEqual(result.data.conflicts, []);
  assert.deepEqual(result.data.missingInformation, []);
});
