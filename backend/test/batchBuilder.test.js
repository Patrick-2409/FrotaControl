"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPhotoBatches } = require("../src/modules/automations/ai/batchBuilder");

test("buildPhotoBatches: 25 fotos com limite 10 produz lotes 10/10/5", () => {
  const photos = Array.from({ length: 25 }, (_, i) => ({ sourceRef: `f${i}` }));
  const batches = buildPhotoBatches(photos, 10);
  assert.equal(batches.length, 3);
  assert.equal(batches[0].length, 10);
  assert.equal(batches[1].length, 10);
  assert.equal(batches[2].length, 5);
});

test("buildPhotoBatches: lote vazio produz zero lotes", () => {
  assert.deepEqual(buildPhotoBatches([], 10), []);
});

test("buildPhotoBatches: lote menor que o limite produz um único lote", () => {
  const photos = [{ sourceRef: "a" }, { sourceRef: "b" }];
  const batches = buildPhotoBatches(photos, 10);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
});

test("buildPhotoBatches: preserva a ordem determinística dos itens dentro e entre lotes", () => {
  const photos = Array.from({ length: 5 }, (_, i) => ({ sourceRef: `f${i}` }));
  const batches = buildPhotoBatches(photos, 2);
  assert.deepEqual(batches.map((b) => b.map((p) => p.sourceRef)), [["f0", "f1"], ["f2", "f3"], ["f4"]]);
});

test("buildPhotoBatches: batchSize inválido (0/negativo) nunca causa loop infinito, usa 1", () => {
  const photos = [{ sourceRef: "a" }, { sourceRef: "b" }];
  const batches = buildPhotoBatches(photos, 0);
  assert.equal(batches.length, 2);
});
