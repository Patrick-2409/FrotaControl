"use strict";

const test = require("node:test");
const assert = require("node:assert");

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
};

test("sanitizeUser remove senha_hash do objeto", () => {
  const { sanitizeUser } = require("../src/models/userModel");
  const safe = sanitizeUser({
    id: 1,
    nome: "João Silva",
    email: "joao@empresa.com",
    senha_hash: "$2b$10$hash",
  });
  assert.strictEqual("senha_hash" in safe, false);
  assert.strictEqual(safe.id, 1);
});

test("GET /api/auth/me não retorna senha_hash", async () => {
  const pathDb = require.resolve("../src/db");
  const pathCtrl = require.resolve("../src/controllers/authController");
  delete require.cache[pathCtrl];
  const db = require("../src/db");
  const originalQuery = db.pool.query;

  db.pool.query = async () => ({
    rowCount: 1,
    rows: [
      {
        id: 11,
        empresa_id: 7,
        nome: "Maria Admin",
        email: "maria@empresa.com",
        cpf_id: "12345678901",
        role: "ADMIN_EMPRESA",
        conta_status: "ativo",
        profile_image_url: null,
        senha_hash: "$2b$10$hash-que-nao-pode-vazar",
      },
    ],
  });

  try {
    const { me } = require("../src/controllers/authController");
    const req = { user: { sub: 11, empresa_id: 7 } };
    const res = createRes();

    await me(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual("senha_hash" in res.body, false);
    assert.ok(res.body.user_login_id, "esperado user_login_id no payload");
  } finally {
    db.pool.query = originalQuery;
    delete require.cache[pathCtrl];
    delete require.cache[pathDb];
  }
});

test("GET /api/auth/me usa perfil basico quando vinculos ainda estao em migracao", async () => {
  const pathDb = require.resolve("../src/db");
  const pathModel = require.resolve("../src/models/userModel");
  const pathCtrl = require.resolve("../src/controllers/authController");
  delete require.cache[pathModel];
  delete require.cache[pathCtrl];
  const db = require("../src/db");
  const originalQuery = db.pool.query;
  let calls = 0;

  db.pool.query = async () => {
    calls += 1;
    if (calls === 1) {
      const err = new Error('relation "motorista_veiculos" does not exist');
      err.code = "42P01";
      throw err;
    }
    return {
      rowCount: 1,
      rows: [
        {
          id: 11,
          empresa_id: 7,
          nome: "Maria Admin",
          email: "maria@empresa.com",
          cpf_id: "12345678901",
          role: "ADMIN_EMPRESA",
          conta_status: "ativo",
          profile_image_url: null,
        },
      ],
    };
  };

  try {
    const { me } = require("../src/controllers/authController");
    const req = { user: { sub: 11, empresa_id: 7 } };
    const res = createRes();

    await me(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.nome, "Maria Admin");
    assert.strictEqual(calls, 2);
  } finally {
    db.pool.query = originalQuery;
    delete require.cache[pathModel];
    delete require.cache[pathCtrl];
    delete require.cache[pathDb];
  }
});

test("GET /api/users/me não retorna senha_hash", async () => {
  const pathDb = require.resolve("../src/db");
  const pathModel = require.resolve("../src/models/userModel");
  const pathCtrl = require.resolve("../src/controllers/userProfileController");
  delete require.cache[pathModel];
  delete require.cache[pathCtrl];
  const db = require("../src/db");
  const originalQuery = db.pool.query;

  db.pool.query = async () => ({
    rowCount: 1,
    rows: [
      {
        id: 21,
        empresa_id: 9,
        nome: "Carlos Motorista",
        email: "carlos@empresa.com",
        cpf_id: "99999999999",
        role: "MOTORISTA",
        conta_status: "ativo",
        profile_image_url: null,
        senha_hash: "$2b$10$outro-hash-que-nao-pode-vazar",
      },
    ],
  });

  try {
    const { getMyProfile } = require("../src/controllers/userProfileController");
    const req = { user: { sub: 21, empresa_id: 9 } };
    const res = createRes();

    await getMyProfile(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual("senha_hash" in res.body, false);
  } finally {
    db.pool.query = originalQuery;
    delete require.cache[pathCtrl];
    delete require.cache[pathModel];
    delete require.cache[pathDb];
  }
});

test("listagem de usuários SUPER_ADMIN não inclui senha_hash", async () => {
  const pathDb = require.resolve("../src/db");
  const pathCtrl = require.resolve("../src/controllers/adminController");
  delete require.cache[pathCtrl];
  const db = require("../src/db");
  const originalQuery = db.pool.query;

  db.pool.query = async (sql) => {
    const text = String(sql);
    if (text.includes("COUNT(*)")) {
      return { rowCount: 1, rows: [{ total: 1 }] };
    }
    return {
      rowCount: 1,
      rows: [
        {
          id: 31,
          nome: "Usuário Listado",
          role: "MOTORISTA",
          empresa_id: 3,
          senha_hash: "$2b$10$hash-lista",
        },
      ],
    };
  };

  try {
    const { listUsersCtrl } = require("../src/controllers/adminController");
    const req = {
      user: { role: "SUPER_ADMIN", sub: 1 },
      query: { page: 1, limit: 10 },
    };
    const res = createRes();

    await listUsersCtrl(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.body?.items), "items deve ser array");
    assert.strictEqual("senha_hash" in res.body.items[0], false);
  } finally {
    db.pool.query = originalQuery;
    delete require.cache[pathCtrl];
    delete require.cache[pathDb];
  }
});
