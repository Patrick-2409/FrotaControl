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
    send(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
  return res;
};

const dispatchRouter = (router, req) =>
  new Promise((resolve, reject) => {
    const res = createRes();
    res.json = (body) => {
      res.body = body;
      resolve(res);
      return res;
    };
    res.send = (body) => {
      res.body = body;
      resolve(res);
      return res;
    };
    res.end = () => {
      resolve(res);
      return res;
    };
    router.handle(
      {
        headers: {},
        originalUrl: req.url,
        ...req,
      },
      res,
      (err) => {
        if (err) reject(err);
        else resolve(res);
      }
    );
  });

test("rotas globais do adminRoutes negam ADMIN_EMPRESA quando montadas em dashboard/manage", async () => {
  const router = require("../src/routes/adminRoutes");

  const res = await dispatchRouter(router, {
    method: "GET",
    url: "/overview",
    user: { role: "ADMIN_EMPRESA", empresa_id: 7, sub: 11 },
  });

  assert.strictEqual(res.statusCode, 403);
  assert.match(res.body?.message || "", /super administrador/i);
});

test("createUserCtrl rejeita motorista com veiculo de outra empresa", async () => {
  const pathDb = require.resolve("../src/db");
  const pathCtrl = require.resolve("../src/controllers/adminController");
  delete require.cache[pathCtrl];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    return { rows: [], rowCount: 0 };
  };
  try {
    const { createUserCtrl } = require("../src/controllers/adminController");
    const res = createRes();
    await createUserCtrl(
      {
        user: { role: "ADMIN_EMPRESA", empresa_id: 7, sub: 11 },
        query: {},
        body: {
          nome: "Joao Silva",
          cpf_id: "12345678901",
          senha: "Senha123",
          role: "MOTORISTA",
          veiculo_id: 99,
          cnh_numero: "123456",
          cnh_categoria: "D",
          cnh_validade: "2027-01-10",
        },
      },
      res
    );

    assert.strictEqual(res.statusCode, 400);
    assert.match(res.body?.message || "", /nao pertence a empresa/i);
    assert.ok(calls.some((c) => /FROM veiculos WHERE id = \$1 AND empresa_id = \$2/.test(c.sql)));
  } finally {
    db.pool.query = orig;
    delete require.cache[pathCtrl];
    delete require.cache[pathDb];
  }
});

test("updateUserCtrl nao consulta veiculo quando usuario nao pertence a empresa", async () => {
  const pathDb = require.resolve("../src/db");
  const pathCtrl = require.resolve("../src/controllers/adminController");
  delete require.cache[pathCtrl];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    if (/SELECT 1 FROM usuarios WHERE id = \$1 AND empresa_id = \$2/.test(String(sql))) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`consulta inesperada: ${sql}`);
  };
  try {
    const { updateUserCtrl } = require("../src/controllers/adminController");
    const res = createRes();
    await updateUserCtrl(
      {
        params: { id: 99 },
        user: { role: "ADMIN_EMPRESA", empresa_id: 7, sub: 11 },
        query: {},
        body: {
          nome: "Joao Silva",
          cpf_id: "12345678901",
          role: "MOTORISTA",
          veiculo_id: 123,
          cnh_numero: "123456",
          cnh_categoria: "D",
          cnh_validade: "2027-01-10",
        },
      },
      res
    );

    assert.strictEqual(res.statusCode, 404);
    assert.match(res.body?.message || "", /nao encontrado|não encontrado/i);
    assert.ok(!calls.some((c) => /FROM veiculos WHERE id = \$1 AND empresa_id = \$2/.test(c.sql)));
  } finally {
    db.pool.query = orig;
    delete require.cache[pathCtrl];
    delete require.cache[pathDb];
  }
});

test("listUsersByCompany junta veiculo somente quando pertence a mesma empresa", async () => {
  const pathDb = require.resolve("../src/db");
  const pathUm = require.resolve("../src/models/userModel");
  const pathQt = require.resolve("../src/utils/queryTimed");
  delete require.cache[pathUm];
  delete require.cache[pathQt];
  delete require.cache[pathDb];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, vals) => {
    calls.push({ sql: String(sql), vals: vals ? [...vals] : [] });
    if (String(sql).includes("COUNT(*)")) {
      return { rows: [{ total: 0 }] };
    }
    return { rows: [] };
  };
  try {
    const { listUsersByCompany } = require("../src/models/userModel");
    await listUsersByCompany(7, { page: 1, limit: 20 });
    const selectCall = calls.find((c) => String(c.sql).includes("ORDER BY u.created_at"));
    assert.ok(selectCall, "esperado SELECT de usuarios");
    assert.match(selectCall.sql, /LEFT JOIN veiculos v ON v\.id = u\.veiculo_id AND v\.empresa_id = u\.empresa_id/);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathUm];
    delete require.cache[pathQt];
    delete require.cache[pathDb];
  }
});

test("listVehiclesCtrl junta motorista somente quando pertence a mesma empresa do veiculo", async () => {
  const pathDb = require.resolve("../src/db");
  const pathCtrl = require.resolve("../src/controllers/adminController");
  delete require.cache[pathCtrl];
  const db = require("../src/db");
  const orig = db.pool.query;
  const calls = [];
  db.pool.query = async (sql, vals) => {
    calls.push({ sql: String(sql), vals: vals ? [...vals] : [] });
    if (String(sql).includes("COUNT(*)")) {
      return { rows: [{ total: 0 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  try {
    const { listVehiclesCtrl } = require("../src/controllers/adminController");
    const res = createRes();
    await listVehiclesCtrl(
      {
        user: { role: "SUPER_ADMIN", sub: 1 },
        query: { page: 1, limit: 20 },
      },
      res
    );

    const vehicleQueries = calls.filter((c) => /FROM veiculos v/.test(c.sql));
    assert.ok(vehicleQueries.length >= 2, "esperadas queries de veículos");
    assert.ok(
      vehicleQueries.every((c) =>
        /LEFT JOIN usuarios u ON u\.veiculo_id = v\.id AND u\.empresa_id = v\.empresa_id AND u\.role = 'MOTORISTA'/.test(c.sql)
      ),
      "joins de veículos devem limitar motorista pela empresa do veículo"
    );
  } finally {
    db.pool.query = orig;
    delete require.cache[pathCtrl];
    delete require.cache[pathDb];
  }
});
