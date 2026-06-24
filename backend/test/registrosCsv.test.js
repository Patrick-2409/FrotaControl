"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { buildRegistrosCsvContent, csvEscape } = require("../src/utils/registrosCsv");

test("csvEscape trata aspas e vírgulas", () => {
  assert.strictEqual(csvEscape("ok"), "ok");
  assert.strictEqual(csvEscape('a"b'), '"a""b"');
  assert.strictEqual(csvEscape("a,b"), '"a,b"');
});

test("buildRegistrosCsvContent inclui BOM e cabeçalho corporativo", () => {
  const csv = buildRegistrosCsvContent(
    [{ tipo: "romaneio", id: 1, motorista: "João", data: "2026-01-02" }],
    "ACME"
  );
  assert.ok(csv.startsWith("\ufeff"));
  assert.match(csv, /# FrotaMax \| Empresa: ACME/);
  assert.match(csv, /^tipo,id,source_id/m);
});
