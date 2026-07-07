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
    const req = { user: { sub: 11, empresa_id: 7, role: "ADMIN_EMPRESA", nome: "Maria Admin" } };
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
    const req = { user: { sub: 11, empresa_id: 7, role: "ADMIN_EMPRESA", nome: "Maria Admin" } };
    const res = createRes();

    await me(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.nome, "Maria Admin");
    assert.strictEqual(calls, 1);
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

test("getMotoristaByLogin usa fallback quando query moderna de vínculos fica ambígua", async () => {
  const pathDb = require.resolve("../src/db");
  const pathModel = require.resolve("../src/models/userModel");
  delete require.cache[pathModel];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const originalQuery = db.pool.query;
  const calls = [];

  db.pool.query = async (sql, vals) => {
    const text = String(sql);
    calls.push({ sql: text, vals: vals ? [...vals] : [] });
    if (text.includes("LEFT JOIN LATERAL")) {
      const err = new Error('column reference "tipo_operacao" is ambiguous');
      err.code = "42702";
      throw err;
    }
    if (text.includes("information_schema.columns")) {
      const tableName = String(vals?.[0] || "");
      if (tableName === "usuarios") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "nome" },
            { column_name: "email" },
            { column_name: "cpf_id" },
            { column_name: "senha_hash" },
            { column_name: "role" },
            { column_name: "veiculo_id" },
            { column_name: "conta_status" },
            { column_name: "created_at" },
          ],
        };
      }
      if (tableName === "veiculos") {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "empresa_id" },
            { column_name: "nome" },
            { column_name: "placa" },
          ],
        };
      }
      return { rows: [] };
    }
    return {
      rowCount: 1,
      rows: [
        {
          id: 21,
          empresa_id: 9,
          nome: "Carlos Motorista",
          email: "carlos@empresa.com",
          cpf_id: "99999999999",
          senha_hash: "$2b$10$hash",
          role: "MOTORISTA",
          veiculo_id: 4,
          conta_status: "ativo",
          empresa_nome: "Empresa Teste",
          logo_url: null,
          veiculo_nome: "Scania P360",
          placa: "SGC2J38",
        },
      ],
    };
  };

  try {
    const { getMotoristaByLogin } = require("../src/models/userModel");
    const rows = await getMotoristaByLogin({ cpf: "99999999999" });

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].nome, "Carlos Motorista");
    assert.strictEqual(rows[0].veiculo_nome, "Scania P360");
    const modernCall = calls.find((c) => c.sql.includes("LEFT JOIN LATERAL"));
    assert.ok(modernCall, "esperada tentativa de query moderna");
    assert.ok(!/vv\.\*/.test(modernCall.sql));
    const fallbackCall = calls.find(
      (c) => c.sql.includes("AS veiculo_nome") && c.sql.includes("'[]'::json AS veiculos_vinculados")
    );
    assert.ok(fallbackCall, "esperada query essencial de fallback");
    assert.ok(!/LEFT JOIN LATERAL/.test(fallbackCall.sql));
    assert.ok(!/motorista_veiculos/.test(fallbackCall.sql));
    assert.ok(!/e\.logo_url/.test(fallbackCall.sql));
  } finally {
    db.pool.query = originalQuery;
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
