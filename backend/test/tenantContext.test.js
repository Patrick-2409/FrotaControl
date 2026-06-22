"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  resolveEmpresaScope,
  resolveEmpresaScopeWrite,
  resolveSensitiveTenantScope,
} = require("../src/domain/tenantContext");

test("utilizador normal não pode informar empresa_id de outra empresa na query", () => {
  const req = {
    user: { role: "ADMIN_EMPRESA", empresa_id: 5 },
    query: { empresa_id: "99" },
  };
  assert.throws(
    () => resolveEmpresaScope(req),
    /Não é permitido informar empresa_id diferente da empresa autenticada/i
  );
});

test("utilizador normal pode repetir o próprio empresa_id na query", () => {
  const req = {
    user: { role: "ADMIN_EMPRESA", empresa_id: 5 },
    query: { empresa_id: "5" },
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
  assert.throws(
    () => resolveEmpresaScopeWrite(req),
    /Não é permitido informar empresa_id diferente da empresa autenticada/i
  );
});

test("resolveSensitiveTenantScope: SUPER_ADMIN exige empresa_id ou scope=all quando explícito", () => {
  const req = {
    user: { role: "SUPER_ADMIN", empresa_id: null },
    query: {},
    body: {},
  };
  const scope = resolveSensitiveTenantScope(req, {
    allowSuperAdminGlobal: true,
    requireSuperAdminExplicitScope: true,
  });
  assert.strictEqual(scope.ok, false);
  assert.strictEqual(scope.statusCode, 400);
});

test("resolveSensitiveTenantScope: SUPER_ADMIN com scope=all habilita escopo global explícito", () => {
  const req = {
    user: { role: "SUPER_ADMIN", empresa_id: null },
    query: { scope: "all" },
    body: {},
  };
  const scope = resolveSensitiveTenantScope(req, {
    allowSuperAdminGlobal: true,
    requireSuperAdminExplicitScope: true,
  });
  assert.strictEqual(scope.ok, true);
  assert.strictEqual(scope.is_global, true);
  assert.strictEqual(scope.empresa_id, null);
});
