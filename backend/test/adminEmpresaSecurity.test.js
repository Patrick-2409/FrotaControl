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

test("createUserCtrl permite motorista sem veiculo e sem CNH", async () => {
  const pathDb = require.resolve("../src/db");
  const pathUserModel = require.resolve("../src/models/userModel");
  const pathAudit = require.resolve("../src/services/auditService");
  const pathCtrl = require.resolve("../src/controllers/adminController");
  delete require.cache[pathCtrl];
  delete require.cache[pathUserModel];
  delete require.cache[pathAudit];
  const db = require("../src/db");
  const userModel = require("../src/models/userModel");
  const auditService = require("../src/services/auditService");
  const orig = db.pool.query;
  const origCreateUser = userModel.createUser;
  const origLogAudit = auditService.logAudit;
  const calls = [];
  let createdPayload = null;
  db.pool.query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    if (/FROM usuarios/.test(String(sql))) {
      return { rows: [], rowCount: 0 };
    }
    if (/INSERT INTO audit_logs/.test(String(sql))) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`consulta inesperada: ${sql}`);
  };
  auditService.logAudit = async () => {};
  userModel.createUser = async (payload) => {
    createdPayload = payload;
    return {
      id: 55,
      empresa_id: payload.empresa_id,
      nome: payload.nome,
      email: payload.email,
      cpf_id: payload.cpf_id,
      role: payload.role,
      veiculo_id: payload.veiculo_id ?? null,
      cnh_numero: payload.cnh_numero ?? null,
      cnh_categoria: payload.cnh_categoria ?? null,
      cnh_validade: payload.cnh_validade ?? null,
    };
  };
  try {
    const { createUserCtrl } = require("../src/controllers/adminController");
    const res = createRes();
    await createUserCtrl(
      {
        user: { role: "ADMIN_EMPRESA", empresa_id: 7, sub: 11 },
        query: {},
        body: {
          nome: "Joao",
          cpf_id: "12345678901",
          role: "MOTORISTA",
          email: "",
        },
      },
      res
    );

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body?.role, "MOTORISTA");
    assert.strictEqual(res.body?.veiculo_id, null);
    assert.strictEqual(createdPayload?.email, null);
    assert.ok(createdPayload?.cnh_numero == null);
    assert.match(res.body?.temporary_password || "", /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/);
    assert.notStrictEqual(res.body?.temporary_password, "NovaSenha123");
    assert.strictEqual(await require("bcryptjs").compare(res.body.temporary_password, createdPayload.senha_hash), true);
    assert.ok(!calls.some((c) => /FROM veiculos WHERE id = \$1 AND empresa_id = \$2/.test(c.sql)));
  } finally {
    db.pool.query = orig;
    userModel.createUser = origCreateUser;
    auditService.logAudit = origLogAudit;
    delete require.cache[pathCtrl];
    delete require.cache[pathUserModel];
    delete require.cache[pathAudit];
    delete require.cache[pathDb];
  }
});

test("createUserCtrl atualiza motorista existente quando CPF ja pertence a empresa", async () => {
  const pathDb = require.resolve("../src/db");
  const pathUserModel = require.resolve("../src/models/userModel");
  const pathAudit = require.resolve("../src/services/auditService");
  const pathCtrl = require.resolve("../src/controllers/adminController");
  delete require.cache[pathCtrl];
  delete require.cache[pathUserModel];
  delete require.cache[pathAudit];
  const db = require("../src/db");
  const userModel = require("../src/models/userModel");
  const auditService = require("../src/services/auditService");
  const orig = db.pool.query;
  const origUpdateUser = userModel.updateUser;
  const origUpdateUserPassword = userModel.updateUserPassword;
  const origLogAudit = auditService.logAudit;
  const calls = [];
  let updatedPayload = null;
  let updatedPassword = null;
  db.pool.query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    if (/FROM usuarios/.test(String(sql))) {
      return {
        rows: [
          {
            id: 77,
            empresa_id: 7,
            nome: "Joao Cadastrado",
            email: null,
            cpf_id: "12345678901",
            role: "MOTORISTA",
            veiculo_id: null,
            cnh_numero: null,
            cnh_categoria: null,
            cnh_validade: null,
            conta_status: "ativo",
          },
        ],
        rowCount: 1,
      };
    }
    throw new Error(`consulta inesperada: ${sql}`);
  };
  userModel.updateUser = async (id, empresa_id, payload) => {
    updatedPayload = { id, empresa_id, payload };
    return {
      id,
      empresa_id,
      nome: payload.nome,
      email: payload.email,
      cpf_id: payload.cpf_id,
      role: payload.role,
      veiculo_id: payload.veiculo_id ?? null,
    };
  };
  userModel.updateUserPassword = async (id, empresa_id, senha_hash) => {
    updatedPassword = { id, empresa_id, senha_hash };
  };
  auditService.logAudit = async () => {};
  try {
    const { createUserCtrl } = require("../src/controllers/adminController");
    const res = createRes();
    await createUserCtrl(
      {
        user: { role: "ADMIN_EMPRESA", empresa_id: 7, sub: 11 },
        query: {},
        body: {
          nome: "Joao",
          cpf_id: "12345678901",
          role: "MOTORISTA",
          email: "",
        },
      },
      res
    );

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body?.upserted_existing, true);
    assert.strictEqual(res.body?.id, 77);
    assert.match(res.body?.temporary_password || "", /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/);
    assert.strictEqual(updatedPayload?.id, 77);
    assert.strictEqual(updatedPayload?.empresa_id, 7);
    assert.strictEqual(updatedPayload?.payload?.nome, "Joao");
    assert.strictEqual(updatedPassword?.id, 77);
    assert.ok(!calls.some((c) => /INSERT INTO usuarios/.test(c.sql)));
  } finally {
    db.pool.query = orig;
    userModel.updateUser = origUpdateUser;
    userModel.updateUserPassword = origUpdateUserPassword;
    auditService.logAudit = origLogAudit;
    delete require.cache[pathCtrl];
    delete require.cache[pathUserModel];
    delete require.cache[pathAudit];
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
    const text = String(sql);
    calls.push({ sql: text, vals: vals ? [...vals] : [] });
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
            { column_name: "role" },
            { column_name: "veiculo_id" },
            { column_name: "profile_image_url" },
            { column_name: "funcao" },
            { column_name: "cnh_categoria" },
            { column_name: "cnh_numero" },
            { column_name: "cnh_validade" },
            { column_name: "treinamentos" },
            { column_name: "observacoes" },
            { column_name: "equipamento_vinculo" },
            { column_name: "operacao_escopo" },
            { column_name: "status_operacional" },
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
            { column_name: "marca" },
            { column_name: "modelo" },
            { column_name: "tipo_operacao" },
            { column_name: "usa_para_transporte" },
          ],
        };
      }
      if (tableName === "motorista_veiculos") {
        return {
          rows: [
            { column_name: "empresa_id" },
            { column_name: "motorista_id" },
            { column_name: "veiculo_id" },
            { column_name: "is_principal" },
          ],
        };
      }
      return { rows: [] };
    }
    if (text.includes("COUNT(*)")) {
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

test("listUsersCtrl registra erro detalhado no servidor e responde erro genérico no frontend", async () => {
  const pathDb = require.resolve("../src/db");
  const pathCtrl = require.resolve("../src/controllers/adminController");
  const pathUm = require.resolve("../src/models/userModel");
  delete require.cache[pathCtrl];
  delete require.cache[pathUm];
  delete require.cache[pathDb];

  const db = require("../src/db");
  const userModel = require("../src/models/userModel");
  const origPoolQuery = db.pool.query;
  const origListUsersByCompany = userModel.listUsersByCompany;
  const origConsoleError = console.error;
  const logs = [];

  db.pool.query = async () => ({ rows: [], rowCount: 0 });
  userModel.listUsersByCompany = async () => {
    const err = new Error("column profile_image_url does not exist");
    err.code = "42703";
    err.sql = "SELECT u.profile_image_url FROM usuarios u";
    throw err;
  };
  console.error = (...args) => {
    logs.push(args);
  };

  try {
    const { listUsersCtrl } = require("../src/controllers/adminController");
    const res = createRes();
    await listUsersCtrl(
      {
        user: { role: "ADMIN_EMPRESA", empresa_id: 7, sub: 11, nome: "Admin Operacao" },
        query: { page: 1, limit: 20, search: "maria" },
      },
      res
    );

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body?.error, "Erro interno no servidor");
    assert.strictEqual(res.body?.message, "Erro interno no servidor");
    assert.strictEqual(/SELECT/.test(JSON.stringify(res.body || {})), false);
    assert.strictEqual(/stack/i.test(JSON.stringify(res.body || {})), false);

    const errorLog = logs.find((entry) => String(entry?.[0] || "").includes("GET /dashboard/manage/users"));
    assert.ok(errorLog, "esperado log de erro da rota no console.error");
    const payload = errorLog[1] || {};
    assert.strictEqual(payload.route, "GET /dashboard/manage/users");
    assert.strictEqual(payload.filtro_empresa_id, 7);
    assert.strictEqual(payload.error_code, "42703");
    assert.match(String(payload.error_message || ""), /profile_image_url/i);
    assert.match(String(payload.error_sql || payload.error_query || ""), /SELECT u\.profile_image_url/i);
    assert.match(String(payload.error_stack || ""), /Error/);
    assert.strictEqual(payload.authenticated_user?.sub, 11);
    assert.strictEqual(payload.authenticated_user?.role, "ADMIN_EMPRESA");
  } finally {
    db.pool.query = origPoolQuery;
    userModel.listUsersByCompany = origListUsersByCompany;
    console.error = origConsoleError;
    delete require.cache[pathCtrl];
    delete require.cache[pathUm];
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
    const listQuery = vehicleQueries.find((c) => /LEFT JOIN LATERAL/.test(c.sql));
    assert.ok(listQuery, "esperada selecao lateral do motorista vinculado");
    assert.match(listQuery.sql, /LEFT JOIN motorista_veiculos mv ON mv\.motorista_id = u\.id/);
    assert.match(listQuery.sql, /mv\.empresa_id = u\.empresa_id/);
    assert.match(listQuery.sql, /u\.empresa_id = v\.empresa_id/);
    assert.match(listQuery.sql, /u\.role = 'MOTORISTA'/);
  } finally {
    db.pool.query = orig;
    delete require.cache[pathCtrl];
    delete require.cache[pathDb];
  }
});
