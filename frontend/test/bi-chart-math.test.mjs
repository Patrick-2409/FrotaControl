import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  buildSvgPathLine,
  growthPercent,
  maxWithFloor,
  projectLinePoints,
  sliceSeries,
  yScaleRange,
} from "../src/modules/company/bi/utils/chartMath.js";
import {
  clearAllEditRecordCache,
  getEditRecordScopeFromUser,
  getEditRecordStorageKey,
  readScopedEditRecord,
  writeScopedEditRecord,
} from "../src/services/editRecordStorage.js";
import {
  clearSensitiveLocalCaches,
  clearTemporarySessionStateCaches,
  clearValidatedSessionRole,
  isValidatedSessionRole,
  setValidatedSessionRole,
} from "../src/services/sessionSecurity.js";
import { normalizeOfflineTipo } from "../src/services/offlineViagensTipo.js";

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

describe("editRecordStorage", () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;

  const createStorageMock = () => {
    const store = new Map();
    return {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(String(key), String(value));
      },
      removeItem(key) {
        store.delete(String(key));
      },
      clear() {
        store.clear();
      },
      key(index) {
        return Array.from(store.keys())[index] ?? null;
      },
      get length() {
        return store.size;
      },
    };
  };

  beforeEach(() => {
    globalThis.localStorage = createStorageMock();
    globalThis.sessionStorage = createStorageMock();
  });

  afterEach(() => {
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
    if (originalSessionStorage === undefined) {
      delete globalThis.sessionStorage;
    } else {
      globalThis.sessionStorage = originalSessionStorage;
    }
  });

  it("logout remove caches sensíveis", () => {
    localStorage.setItem("fc_token", "token");
    localStorage.setItem("fc_user", JSON.stringify({ id: 10, role: "MOTORISTA" }));
    localStorage.setItem("fc_edit_record", JSON.stringify({ source_id: "legacy" }));
    localStorage.setItem("fc_edit_record:4:10", JSON.stringify({ source_id: "scoped" }));
    localStorage.setItem("fc_draft_parte_4_10", JSON.stringify({ source_id: "draft" }));
    localStorage.setItem("fc_apontador_veiculo_id:4:10", "77");
    localStorage.setItem("fc_field_extreme_mode", "1");
    sessionStorage.setItem("fc_session_validated_role", "MOTORISTA");
    sessionStorage.setItem("outro_session_cache", "ok");

    clearSensitiveLocalCaches();

    assert.equal(localStorage.getItem("fc_token"), null);
    assert.equal(localStorage.getItem("fc_user"), null);
    assert.equal(localStorage.getItem("fc_edit_record"), null);
    assert.equal(localStorage.getItem("fc_edit_record:4:10"), null);
    assert.equal(localStorage.getItem("fc_draft_parte_4_10"), null);
    assert.equal(localStorage.getItem("fc_apontador_veiculo_id:4:10"), null);
    assert.equal(localStorage.getItem("fc_field_extreme_mode"), "1");
    assert.equal(sessionStorage.getItem("fc_session_validated_role"), null);
    assert.equal(sessionStorage.getItem("outro_session_cache"), null);
  });

  it("escreve e lê registro de edição no escopo do usuário/empresa", () => {
    const scope = getEditRecordScopeFromUser({ id: 9, empresa_id: 4 });
    writeScopedEditRecord(scope, { module: "parteDiaria", source_id: "abc" });
    const key = getEditRecordStorageKey(scope);
    assert.equal(key, "fc_edit_record:4:9");
    assert.deepEqual(readScopedEditRecord(scope), { module: "parteDiaria", source_id: "abc" });
  });

  it("usuário B não recebe fc_edit_record do usuário A", () => {
    const scopeA = getEditRecordScopeFromUser({ id: 9, empresa_id: 4 });
    const scopeB = getEditRecordScopeFromUser({ id: 10, empresa_id: 4 });
    writeScopedEditRecord(scopeA, { module: "parteDiaria", source_id: "A-1" });
    assert.equal(readScopedEditRecord(scopeB), null);
  });

  it("empresa B não recebe fc_edit_record da empresa A", () => {
    const scopeEmpresaA = getEditRecordScopeFromUser({ id: 9, empresa_id: 4 });
    const scopeEmpresaB = getEditRecordScopeFromUser({ id: 9, empresa_id: 6 });
    writeScopedEditRecord(scopeEmpresaA, { module: "parteDiaria", source_id: "A-empresa" });
    assert.equal(readScopedEditRecord(scopeEmpresaB), null);
  });

  it("migra chave legada para chave escopada sem manter resíduo", () => {
    const scope = getEditRecordScopeFromUser({ id: 11, empresa_id: 2 });
    localStorage.setItem("fc_edit_record", JSON.stringify({ module: "romaneios", source_id: "legacy-1" }));
    const record = readScopedEditRecord(scope);
    assert.deepEqual(record, { module: "romaneios", source_id: "legacy-1" });
    assert.equal(localStorage.getItem("fc_edit_record"), null);
    assert.equal(localStorage.getItem("fc_edit_record:2:11"), JSON.stringify(record));
  });

  it("limpa todas as variações de fc_edit_record no logout", () => {
    localStorage.setItem("fc_edit_record", JSON.stringify({ source_id: "legacy" }));
    localStorage.setItem("fc_edit_record:1:10", JSON.stringify({ source_id: "a" }));
    localStorage.setItem("fc_edit_record:2:20", JSON.stringify({ source_id: "b" }));
    localStorage.setItem("outro_cache", "ok");
    clearAllEditRecordCache();
    assert.equal(localStorage.getItem("fc_edit_record"), null);
    assert.equal(localStorage.getItem("fc_edit_record:1:10"), null);
    assert.equal(localStorage.getItem("fc_edit_record:2:20"), null);
    assert.equal(localStorage.getItem("outro_cache"), "ok");
  });

  it("fc_user não concede sessão sensível sem validação do backend", () => {
    localStorage.setItem("fc_user", JSON.stringify({ id: 5, empresa_id: 4, role: "MOTORISTA" }));
    clearValidatedSessionRole();
    assert.equal(isValidatedSessionRole("MOTORISTA"), false);

    setValidatedSessionRole("MOTORISTA");
    assert.equal(isValidatedSessionRole("MOTORISTA"), true);

    // Simula falha de refresh/backend: sessão validada removida.
    clearValidatedSessionRole();
    assert.equal(isValidatedSessionRole("MOTORISTA"), false);
  });

  it("troca de empresa limpa estado temporário incorreto", () => {
    localStorage.setItem("fc_edit_record", JSON.stringify({ source_id: "legacy" }));
    localStorage.setItem("fc_edit_record:4:9", JSON.stringify({ source_id: "scoped" }));
    localStorage.setItem("fc_draft_parte_4_9", JSON.stringify({ source_id: "draft-empresa-a" }));
    localStorage.setItem("fc_apontador_veiculo_id:4:9", "101");
    localStorage.setItem("fc_field_extreme_mode", "1");

    clearTemporarySessionStateCaches();

    assert.equal(localStorage.getItem("fc_edit_record"), null);
    assert.equal(localStorage.getItem("fc_edit_record:4:9"), null);
    assert.equal(localStorage.getItem("fc_draft_parte_4_9"), null);
    assert.equal(localStorage.getItem("fc_apontador_veiculo_id:4:9"), null);
    assert.equal(localStorage.getItem("fc_field_extreme_mode"), "1");
  });
});

describe("offlineViagens", () => {
  it("normaliza tipos de rocha para envio offline", () => {
    assert.equal(normalizeOfflineTipo("rocha_pulmao"), "rocha_pulmao");
    assert.equal(normalizeOfflineTipo("rocha_armacao"), "rocha_armacao");
    assert.equal(normalizeOfflineTipo("rocha_amarracao"), "rocha_armacao");
    assert.equal(normalizeOfflineTipo("  ROCHA-AMARRACAO  "), "rocha_armacao");
    assert.equal(normalizeOfflineTipo("esteril"), "esteril");
    assert.equal(normalizeOfflineTipo("invalido"), null);
  });
});
