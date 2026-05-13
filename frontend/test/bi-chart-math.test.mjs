import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSvgPathLine,
  growthPercent,
  maxWithFloor,
  projectLinePoints,
  sliceSeries,
  yScaleRange,
} from "../src/modules/company/bi/utils/chartMath.js";

describe("chartMath", () => {
  it("yScaleRange inclui margem superior", () => {
    const r = yScaleRange(100);
    assert.equal(r.min, 0);
    assert.ok(r.max >= 100);
  });

  it("maxWithFloor respeita piso", () => {
    assert.equal(maxWithFloor([], 3), 3);
    assert.equal(maxWithFloor([2, 8], 0), 8);
  });

  it("sliceSeries devolve subconjunto ordenado por índices", () => {
    const s = [{ v: 1 }, { v: 2 }, { v: 3 }];
    assert.deepEqual(sliceSeries(s, 0, 1), [{ v: 1 }, { v: 2 }]);
    assert.deepEqual(sliceSeries(s, 1, 2), [{ v: 2 }, { v: 3 }]);
  });

  it("growthPercent trata divisão por zero", () => {
    assert.equal(growthPercent(110, 100), 10);
    assert.equal(growthPercent(1, 0), null);
    assert.equal(growthPercent(NaN, 1), null);
  });

  it("projectLinePoints gera path fechável", () => {
    const { points } = projectLinePoints([0, 10, 5], 200, 100, { l: 0, r: 0, t: 0, b: 0 });
    assert.equal(points.length, 3);
    const d = buildSvgPathLine(points);
    assert.match(d, /^M /);
    assert.match(d, / L /);
  });
});
