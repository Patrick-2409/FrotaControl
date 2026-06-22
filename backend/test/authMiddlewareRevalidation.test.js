"use strict";

const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const { pool } = require("../src/db");
const { authMiddleware, requireRole } = require("../src/middleware/authMiddleware");

const createRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const runMiddleware = async (middleware, req, res) => {
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return nextCalled;
};

test("authMiddleware usa role atualizada do banco após mudança de perfil", async () => {
  const originalVerify = jwt.verify;
  const originalQuery = pool.query;
  let calls = 0;

  jwt.verify = () => ({ sub: 99, role: "ADMIN_EMPRESA", empresa_id: 7, nome: "Token Antigo" });
  pool.query = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        rowCount: 1,
        rows: [{ id: 99, empresa_id: 7, role: "ADMIN_EMPRESA", nome: "Usuário Real", conta_status: "ativo" }],
      };
    }
    return {
      rowCount: 1,
      rows: [{ id: 99, empresa_id: 7, role: "MOTORISTA", nome: "Usuário Real", conta_status: "ativo" }],
    };
  };

  try {
    const reqAntes = { headers: { authorization: "Bearer token-valido" } };
    const resAntes = createRes();
    const nextAntes = await runMiddleware(authMiddleware, reqAntes, resAntes);
    assert.strictEqual(nextAntes, true);
    assert.strictEqual(reqAntes.user.role, "ADMIN_EMPRESA");

    const resRoleAntes = createRes();
    const nextRoleAntes = await runMiddleware(requireRole("ADMIN_EMPRESA"), reqAntes, resRoleAntes);
    assert.strictEqual(nextRoleAntes, true);

    const reqDepois = { headers: { authorization: "Bearer token-valido" } };
    const resDepois = createRes();
    const nextDepois = await runMiddleware(authMiddleware, reqDepois, resDepois);
    assert.strictEqual(nextDepois, true);
    assert.strictEqual(reqDepois.user.role, "MOTORISTA");

    const resRoleDepois = createRes();
    const nextRoleDepois = await runMiddleware(requireRole("ADMIN_EMPRESA"), reqDepois, resRoleDepois);
    assert.strictEqual(nextRoleDepois, false);
    assert.strictEqual(resRoleDepois.statusCode, 403);
  } finally {
    jwt.verify = originalVerify;
    pool.query = originalQuery;
  }
});

test("authMiddleware bloqueia usuário inativo mesmo com JWT válido", async () => {
  const originalVerify = jwt.verify;
  const originalQuery = pool.query;

  jwt.verify = () => ({ sub: 101, role: "MOTORISTA", empresa_id: 5, nome: "Conta Antiga" });
  pool.query = async () => ({
    rowCount: 1,
    rows: [{ id: 101, empresa_id: 5, role: "MOTORISTA", nome: "Conta Antiga", conta_status: "inativo" }],
  });

  try {
    const req = { headers: { authorization: "Bearer token-valido" } };
    const res = createRes();
    const nextCalled = await runMiddleware(authMiddleware, req, res);
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.match(String(res.body?.message || ""), /desativad/i);
  } finally {
    jwt.verify = originalVerify;
    pool.query = originalQuery;
  }
});
