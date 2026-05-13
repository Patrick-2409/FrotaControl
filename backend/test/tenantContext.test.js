"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  resolveEmpresaScope,
  resolveEmpresaScopeWrite,
} = require("../src/domain/tenantContext");

test("utilizador normal ignora empresa_id na query", () => {
  const req = {
    user: { role: "ADMIN", empresa_id: 5 },
    query: { empresa_id: "99" },
  };
  assert.strictEqual(resolveEmpresaScope(req), 5);
});

test("SUPER_ADMIN sem empresa_id na query => null (todas as empresas / aguardar filtro)", () => {
  const req = { user: { role: "SUPER_ADMIN", empresa_id: 1 }, query: {} };
  assert.strictEqual(resolveEmpresaScope(req), null);
});

test("SUPER_ADMIN com empresa_id válido na query", () => {
  const req = { user: { role: "SUPER_ADMIN" }, query: { empresa_id: "12" } };
  assert.strictEqual(resolveEmpresaScope(req), 12);
});

test("resolveEmpresaScopeWrite: SUPER_ADMIN lê empresa_id do body", () => {
  const req = {
    user: { role: "SUPER_ADMIN" },
    body: { empresa_id: 7 },
    query: {},
  };
  assert.strictEqual(resolveEmpresaScopeWrite(req), 7);
});

test("resolveEmpresaScopeWrite: não-admin usa apenas JWT", () => {
  const req = {
    user: { role: "MOTORISTA", empresa_id: 3 },
    body: { empresa_id: 999 },
    query: {},
  };
  assert.strictEqual(resolveEmpresaScopeWrite(req), 3);
});
