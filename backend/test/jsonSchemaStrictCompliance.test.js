"use strict";

/**
 * Bloco 11 — reproduz exatamente a causa raiz do HTTP 400 real de produção
 * ("In context=('properties', 'schemaVersion'), schema must have a 'type'
 * key") e prova que o checker capturaria isso (e os demais nós sem 'type'
 * introduzidos pelo mesmo bug) ANTES de qualquer chamada real à OpenAI.
 * 100% local — nenhuma rede, nenhum crédito consumido.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { findStrictSchemaViolations, assertStrictSchemaCompliant } = require("../src/modules/automations/ai/jsonSchemaStrictCompliance");

test("schema totalmente compatível não produz nenhuma violação", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      nome: { type: "string" },
      idades: { type: "array", items: { type: "integer" } },
    },
    required: ["nome", "idades"],
  };
  assert.deepEqual(findStrictSchemaViolations(schema), []);
  assert.doesNotThrow(() => assertStrictSchemaCompliant(schema));
});

test("reproduz o bug real: schemaVersion com 'const' mas sem 'type' é rejeitado", () => {
  // Exatamente a forma que estava em produção antes da correção.
  const schemaAntigo = {
    type: "object",
    additionalProperties: false,
    properties: {
      schemaVersion: { const: 1 },
      summary: { type: "string" },
    },
    required: ["schemaVersion", "summary"],
  };
  const violations = findStrictSchemaViolations(schemaAntigo);
  assert.ok(
    violations.some((v) => v.includes("properties.schemaVersion") && v.includes("'type'")),
    `esperava violação citando properties.schemaVersion sem type, recebeu: ${JSON.stringify(violations)}`
  );
});

test("reproduz o bug real: items de array como {type:'object'} sem properties é rejeitado", () => {
  // A mesma forma que 'facts'/'conflicts'/'missingInformation' tinham antes da correção.
  const schemaAntigo = {
    type: "object",
    additionalProperties: false,
    properties: {
      facts: { type: "array", items: { type: "object" } },
    },
    required: ["facts"],
  };
  const violations = findStrictSchemaViolations(schemaAntigo);
  assert.ok(
    violations.some((v) => v.includes("properties.facts.items") && v.includes("properties")),
    `esperava violação citando properties.facts.items sem properties, recebeu: ${JSON.stringify(violations)}`
  );
});

test("required incompleto (falta uma propriedade) é rejeitado — modo strict exige todas", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { a: { type: "string" }, b: { type: "string" } },
    required: ["a"],
  };
  const violations = findStrictSchemaViolations(schema);
  assert.ok(violations.some((v) => v.includes("ausentes de 'required'") && v.includes("b")));
});

test("additionalProperties ausente/true num object é rejeitado", () => {
  const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
  const violations = findStrictSchemaViolations(schema);
  assert.ok(violations.some((v) => v.includes("additionalProperties:false")));
});

test("array sem 'items' é rejeitado", () => {
  const schema = { type: "object", additionalProperties: false, properties: { lista: { type: "array" } }, required: ["lista"] };
  const violations = findStrictSchemaViolations(schema);
  assert.ok(violations.some((v) => v.includes("properties.lista") && v.includes("items")));
});

test("assertStrictSchemaCompliant lança com TODAS as violações juntas, nunca só a primeira", () => {
  const schemaComDoisProblemas = {
    type: "object",
    additionalProperties: false,
    properties: {
      a: { const: 1 },
      b: { type: "array" },
    },
    required: ["a", "b"],
  };
  assert.throws(() => assertStrictSchemaCompliant(schemaComDoisProblemas, "meu_schema"), (err) => {
    assert.match(err.message, /meu_schema/);
    assert.match(err.message, /properties\.a/);
    assert.match(err.message, /properties\.b/);
    return true;
  });
});
