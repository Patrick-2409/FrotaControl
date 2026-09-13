"use strict";

/**
 * Verificação determinística — NÃO é uma implementação da especificação
 * JSON Schema — de que um schema usado em `response_format.json_schema.schema`
 * (Structured Outputs da OpenAI, `strict: true`) respeita o subconjunto de
 * regras que a própria OpenAI exige nesse modo:
 *
 *   - todo nó precisa de `type` explícito (mesmo ao lado de `const`/`enum`);
 *   - todo `type: "object"` precisa de `properties` (objeto) e
 *     `additionalProperties: false`;
 *   - `required` precisa conter EXATAMENTE as mesmas chaves de `properties`
 *     (o modo strict da OpenAI sempre inclui todo campo no resultado —
 *     "opcional" só existe via tipo anulável, nunca por omissão de `required`);
 *   - todo `type: "array"` precisa de `items` (recursivo).
 *
 * Existe para nunca mais deixar passar despercebido o que já aconteceu em
 * produção (Bloco 11: `schemaVersion: { const: 1 }` sem `type`, e
 * `facts`/`conflicts`/`missingInformation` com `items: { type: "object" }`
 * sem `properties` nenhuma — a OpenAI rejeita isso com HTTP 400 antes de
 * gerar qualquer coisa). Escopo deliberadamente pequeno: cobre só as formas
 * que os schemas deste módulo realmente usam (object/array/string/integer/
 * number/boolean + enum/const) — nunca tenta validar $ref, oneOf/anyOf ou
 * qualquer outra parte da especificação completa que este módulo não usa.
 */

const PRIMITIVE_TYPES = new Set(["string", "integer", "number", "boolean", "null"]);

/** Retorna um array de strings descrevendo cada violação encontrada — vazio significa "compatível". Nunca para na primeira. */
function findStrictSchemaViolations(node, path = "$") {
  const violations = [];
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    violations.push(`${path}: nó de schema precisa ser um objeto (recebido ${Array.isArray(node) ? "array" : typeof node}).`);
    return violations;
  }

  if (typeof node.type !== "string") {
    violations.push(`${path}: schema precisa ter uma chave 'type' explícita (recebido ${JSON.stringify(node.type)}).`);
    return violations;
  }

  if (node.type === "object") {
    if (typeof node.properties !== "object" || node.properties === null || Array.isArray(node.properties)) {
      violations.push(`${path}: type=object precisa de 'properties' (objeto).`);
      return violations;
    }
    if (node.additionalProperties !== false) {
      violations.push(`${path}: type=object precisa de additionalProperties:false no modo strict.`);
    }
    const propertyKeys = Object.keys(node.properties);
    const required = Array.isArray(node.required) ? node.required : [];
    const missingFromRequired = propertyKeys.filter((key) => !required.includes(key));
    const extraInRequired = required.filter((key) => !propertyKeys.includes(key));
    if (missingFromRequired.length) {
      violations.push(`${path}: propriedades ausentes de 'required' (modo strict exige todas): ${missingFromRequired.join(", ")}.`);
    }
    if (extraInRequired.length) {
      violations.push(`${path}: 'required' cita chave(s) que não existe(m) em properties: ${extraInRequired.join(", ")}.`);
    }
    for (const key of propertyKeys) {
      violations.push(...findStrictSchemaViolations(node.properties[key], `${path}.properties.${key}`));
    }
    return violations;
  }

  if (node.type === "array") {
    if (typeof node.items !== "object" || node.items === null) {
      violations.push(`${path}: type=array precisa de 'items' (schema único — tuplas não são suportadas aqui).`);
      return violations;
    }
    violations.push(...findStrictSchemaViolations(node.items, `${path}.items`));
    return violations;
  }

  if (!PRIMITIVE_TYPES.has(node.type)) {
    violations.push(`${path}: type '${node.type}' não é um dos tipos primitivos suportados (${[...PRIMITIVE_TYPES].join(", ")}).`);
  }
  return violations;
}

/** Lança com todas as violações listadas de uma vez — nunca só a primeira. */
function assertStrictSchemaCompliant(schema, label = "schema") {
  const violations = findStrictSchemaViolations(schema);
  if (violations.length) {
    throw new Error(`${label} incompatível com OpenAI Structured Outputs (strict):\n- ${violations.join("\n- ")}`);
  }
}

module.exports = { findStrictSchemaViolations, assertStrictSchemaCompliant };
