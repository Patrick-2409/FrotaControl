"use strict";

/**
 * Testes do CRUD administrativo de Automações (Bloco 2).
 *
 * Segue o padrão dominante do projeto (ver userResponseSecurity.test.js,
 * tenantScopeHardening.test.js): chama os CONTROLLERS diretamente com req/res
 * mockados manualmente — não usa supertest nem sobe o servidor HTTP. Diferente
 * da maioria dos controllers existentes (que mockam `db.pool.query`), aqui o
 * banco real (Postgres local, mesmo do Bloco 1) é usado para inserir os dados
 * de setup: as queries deste módulo têm isolamento multiempresa via SQL
 * (`empresa_id = $1 OR $1 IS NULL`) e soft delete, que seriam reimplementados
 * de forma frágil em mocks — testar contra o banco real é mais fiel e mais
 * simples. Dados isolados por RUN_TAG único, limpos via CASCADE no teardown.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const { requireRole } = require("../src/middleware/authMiddleware");
const ctrl = require("../src/modules/automations/controllers/automationConfigController");

const RUN_TAG = `admtest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdEmpresaIds = [];

function createRes() {
  return {
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
  };
}

async function createEmpresa(nome) {
  const { rows } = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [
    `${RUN_TAG}-${nome}`,
  ]);
  createdEmpresaIds.push(rows[0].id);
  return rows[0].id;
}

let diarioObraId;

function adminReq(empresaId, overrides = {}) {
  return {
    user: { role: "ADMIN_EMPRESA", empresa_id: empresaId, sub: 1 },
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

async function createConfigDirect(empresaId, nome, extra = {}) {
  const req = adminReq(empresaId, {
    body: { automacao_id: diarioObraId, nome, ...extra },
  });
  const res = createRes();
  await ctrl.createConfig(req, res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  return res.body.data;
}

test.before(async () => {
  await initAutomationsSchema(pool);
  const { rows } = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  diarioObraId = rows[0].id;
});

test.after(async () => {
  if (createdEmpresaIds.length) {
    await pool.query(`DELETE FROM empresas WHERE id = ANY($1::int[])`, [createdEmpresaIds]);
  }
  await pool.end();
});

// ------------------------------------------------------- 1, 2: listagem

test("lista apenas as configs da própria empresa", async () => {
  const empresaA = await createEmpresa("list-a");
  const empresaB = await createEmpresa("list-b");
  await createConfigDirect(empresaA, "Diário de Obra — Config A");
  await createConfigDirect(empresaB, "Diário de Obra — Config B");

  const req = adminReq(empresaA);
  const res = createRes();
  await ctrl.listConfigs(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.data.every((c) => c.empresa_id === empresaA));
  assert.ok(!res.body.data.some((c) => c.empresa_id === empresaB));
});

// ------------------------------------------------------------- 3: criar

test("cria uma configuração com os campos principais", async () => {
  const empresaId = await createEmpresa("create");
  const config = await createConfigDirect(empresaId, "Diário de Obra — PPFlora", {
    projeto_nome: "PPFlora",
    timezone: "America/Sao_Paulo",
    horario_fechamento: "18:00",
    telegram_chat_id: "-1001234567890",
    usa_ia: true,
  });

  assert.equal(config.nome, "Diário de Obra — PPFlora");
  assert.equal(config.projeto_nome, "PPFlora");
  assert.equal(config.timezone, "America/Sao_Paulo");
  assert.equal(config.horario_fechamento?.slice(0, 5), "18:00");
  assert.equal(config.telegram_chat_id, "-1001234567890");
  assert.equal(config.ativo, true);
  assert.equal(config.automacao_codigo, "diario_obra");
});

test("rejeita criação sem nome (Zod)", async () => {
  const empresaId = await createEmpresa("create-invalid");
  const req = adminReq(empresaId, { body: { automacao_id: diarioObraId } });
  const res = createRes();
  await assert.rejects(() => ctrl.createConfig(req, res));
});

test("rejeita timezone que não é IANA válido", async () => {
  const empresaId = await createEmpresa("create-tz-invalid");
  const req = adminReq(empresaId, {
    body: { automacao_id: diarioObraId, nome: "X", timezone: "Brasil/Fake" },
  });
  const res = createRes();
  await assert.rejects(() => ctrl.createConfig(req, res));
});

// -------------------------------------------- 4: múltiplas obras/empresa

test("permite múltiplas configs da mesma automação na mesma empresa (Obra A/B/C)", async () => {
  const empresaId = await createEmpresa("multi-obra");
  const a = await createConfigDirect(empresaId, "Diário de Obra — Obra A", { projeto_nome: "Obra A" });
  const b = await createConfigDirect(empresaId, "Diário de Obra — Obra B", { projeto_nome: "Obra B" });
  const c = await createConfigDirect(empresaId, "Diário de Obra — Obra C", { projeto_nome: "Obra C" });

  assert.notEqual(a.id, b.id);
  assert.notEqual(b.id, c.id);

  const req = adminReq(empresaId);
  const res = createRes();
  await ctrl.listConfigs(req, res);
  const projetos = res.body.data.map((cfg) => cfg.projeto_nome).sort();
  assert.deepEqual(projetos, ["Obra A", "Obra B", "Obra C"]);
});

// ---------------------------------------------------------- 5, 6: editar

test("edita a própria configuração", async () => {
  const empresaId = await createEmpresa("edit");
  const config = await createConfigDirect(empresaId, "Original");

  const req = adminReq(empresaId, {
    params: { id: String(config.id) },
    body: { automacao_id: diarioObraId, nome: "Atualizado", projeto_nome: "Novo Projeto" },
  });
  const res = createRes();
  await ctrl.updateConfig(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.nome, "Atualizado");
  assert.equal(res.body.data.projeto_nome, "Novo Projeto");
});

test("ADMIN_EMPRESA de uma empresa não consegue editar config de outra empresa", async () => {
  const empresaA = await createEmpresa("edit-cross-a");
  const empresaB = await createEmpresa("edit-cross-b");
  const configB = await createConfigDirect(empresaB, "Config da empresa B");

  const req = adminReq(empresaA, {
    params: { id: String(configB.id) },
    body: { automacao_id: diarioObraId, nome: "Tentativa de invasão" },
  });
  const res = createRes();
  await ctrl.updateConfig(req, res);

  assert.equal(res.statusCode, 404);

  // Confirma que nada mudou de fato.
  const check = await pool.query(`SELECT nome FROM automacao_configs WHERE id = $1`, [configB.id]);
  assert.equal(check.rows[0].nome, "Config da empresa B");
});

// ------------------------------------------------------ 7: ativar/desativar

test("ativa e desativa a configuração", async () => {
  const empresaId = await createEmpresa("status");
  const config = await createConfigDirect(empresaId, "Status");
  assert.equal(config.ativo, true);

  const reqOff = adminReq(empresaId, { params: { id: String(config.id) }, body: { ativo: false } });
  const resOff = createRes();
  await ctrl.updateConfigStatus(reqOff, resOff);
  assert.equal(resOff.statusCode, 200);
  assert.equal(resOff.body.data.ativo, false);

  const reqOn = adminReq(empresaId, { params: { id: String(config.id) }, body: { ativo: true } });
  const resOn = createRes();
  await ctrl.updateConfigStatus(reqOn, resOn);
  assert.equal(resOn.body.data.ativo, true);
});

// -------------------------------------------------------- 8, 9: aprovadores

test("cadastra aprovador válido", async () => {
  const empresaId = await createEmpresa("approver-ok");
  const config = await createConfigDirect(empresaId, "Aprovadores");

  const req = adminReq(empresaId, {
    params: { id: String(config.id) },
    body: { nome: "Fiscal da Obra", telegram_user_id: "555666777" },
  });
  const res = createRes();
  await ctrl.createApprover(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.nome, "Fiscal da Obra");
  assert.equal(res.body.data.telegram_user_id, "555666777");
  assert.equal(res.body.data.ativo, true);
});

test("rejeita aprovador duplicado (mesmo telegram_user_id na mesma config)", async () => {
  const empresaId = await createEmpresa("approver-dup");
  const config = await createConfigDirect(empresaId, "Aprovadores Dup");

  const req1 = adminReq(empresaId, {
    params: { id: String(config.id) },
    body: { nome: "Fiscal", telegram_user_id: "111222333" },
  });
  await ctrl.createApprover(req1, createRes());

  const req2 = adminReq(empresaId, {
    params: { id: String(config.id) },
    body: { nome: "Fiscal Duplicado", telegram_user_id: "111222333" },
  });
  await assert.rejects(() => ctrl.createApprover(req2, createRes()));
});

// ------------------------------------------------ 10, 11, 12: destinatários

test("cadastra destinatário TO", async () => {
  const empresaId = await createEmpresa("recipient-to");
  const config = await createConfigDirect(empresaId, "Destinatarios TO");

  const req = adminReq(empresaId, {
    params: { id: String(config.id) },
    body: { nome: "Gestor Principal", email: "gestor.to@example.com", tipo: "TO" },
  });
  const res = createRes();
  await ctrl.createRecipient(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.tipo, "TO");
  assert.equal(res.body.data.email, "gestor.to@example.com");
});

test("cadastra destinatário CC", async () => {
  const empresaId = await createEmpresa("recipient-cc");
  const config = await createConfigDirect(empresaId, "Destinatarios CC");

  const req = adminReq(empresaId, {
    params: { id: String(config.id) },
    body: { nome: "Gestor em cópia", email: "gestor.cc@example.com", tipo: "CC" },
  });
  const res = createRes();
  await ctrl.createRecipient(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.tipo, "CC");
});

test("rejeita e-mail inválido no destinatário", async () => {
  const empresaId = await createEmpresa("recipient-invalid-email");
  const config = await createConfigDirect(empresaId, "Destinatarios invalido");

  const req = adminReq(empresaId, {
    params: { id: String(config.id) },
    body: { nome: "Gestor", email: "nao-e-um-email", tipo: "TO" },
  });
  await assert.rejects(() => ctrl.createRecipient(req, createRes()));
});

// ------------------------------------------------- 13, 14: RBAC (roles)

test("MOTORISTA não tem acesso ao módulo administrativo de automações", () => {
  const guard = requireRole("ADMIN_EMPRESA", "SUPER_ADMIN");
  const req = { user: { role: "MOTORISTA", empresa_id: 1 } };
  const res = createRes();
  let nextCalled = false;
  guard(req, res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("APONTADOR não tem acesso ao módulo administrativo de automações", () => {
  const guard = requireRole("ADMIN_EMPRESA", "SUPER_ADMIN");
  const req = { user: { role: "APONTADOR", empresa_id: 1 } };
  const res = createRes();
  let nextCalled = false;
  guard(req, res, () => {
    nextCalled = true;
  });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("ADMIN_EMPRESA e SUPER_ADMIN passam pelo guard de acesso ao módulo", () => {
  const guard = requireRole("ADMIN_EMPRESA", "SUPER_ADMIN");
  for (const role of ["ADMIN_EMPRESA", "SUPER_ADMIN"]) {
    const req = { user: { role, empresa_id: 1 } };
    const res = createRes();
    let nextCalled = false;
    guard(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true, `esperado next() chamado para ${role}`);
  }
});

// --------------------------------------------------- 15: exclusão (soft delete)

test("exclusão é soft delete: registro sai da listagem mas não é apagado fisicamente", async () => {
  const empresaId = await createEmpresa("delete");
  const config = await createConfigDirect(empresaId, "Para excluir");

  const req = adminReq(empresaId, { params: { id: String(config.id) } });
  const res = createRes();
  await ctrl.deleteConfig(req, res);
  assert.equal(res.statusCode, 204);

  // Não aparece mais via API (filtra deleted_at IS NULL).
  const getReq = adminReq(empresaId, { params: { id: String(config.id) } });
  const getRes = createRes();
  await ctrl.getConfig(getReq, getRes);
  assert.equal(getRes.statusCode, 404);

  // Mas continua fisicamente no banco, com deleted_at preenchido — nunca DELETE físico.
  const raw = await pool.query(`SELECT deleted_at, ativo FROM automacao_configs WHERE id = $1`, [config.id]);
  assert.equal(raw.rows.length, 1, "linha deve continuar existindo fisicamente");
  assert.ok(raw.rows[0].deleted_at, "deleted_at deve estar preenchido");
  assert.equal(raw.rows[0].ativo, false);
});

test("ADMIN_EMPRESA de uma empresa não consegue excluir/ativar/adicionar aprovador ou destinatário de config de outra empresa", async () => {
  const empresaA = await createEmpresa("cross-actions-a");
  const empresaB = await createEmpresa("cross-actions-b");
  const configB = await createConfigDirect(empresaB, "Config protegida B");

  const asA = (overrides = {}) => adminReq(empresaA, { params: { id: String(configB.id) }, ...overrides });

  const resGet = createRes();
  await ctrl.getConfig(asA(), resGet);
  assert.equal(resGet.statusCode, 404);

  const resStatus = createRes();
  await ctrl.updateConfigStatus(asA({ body: { ativo: false } }), resStatus);
  assert.equal(resStatus.statusCode, 404);

  const resDelete = createRes();
  await ctrl.deleteConfig(asA(), resDelete);
  assert.equal(resDelete.statusCode, 404);

  const resApprover = createRes();
  await ctrl.createApprover(asA({ body: { nome: "Invasor", telegram_user_id: "999" } }), resApprover);
  assert.equal(resApprover.statusCode, 404);

  const resRecipient = createRes();
  await ctrl.createRecipient(asA({ body: { email: "invasor@example.com" } }), resRecipient);
  assert.equal(resRecipient.statusCode, 404);

  const resList = createRes();
  await ctrl.listApprovers(asA(), resList);
  assert.equal(resList.statusCode, 404);

  // Confere que config B permanece intacta (ativa, sem aprovador/destinatário do invasor).
  const check = await pool.query(
    `SELECT ativo, deleted_at FROM automacao_configs WHERE id = $1`,
    [configB.id]
  );
  assert.equal(check.rows[0].ativo, true);
  assert.equal(check.rows[0].deleted_at, null);
  const approvers = await pool.query(
    `SELECT COUNT(*)::int AS c FROM automacao_aprovadores WHERE automacao_config_id = $1`,
    [configB.id]
  );
  assert.equal(approvers.rows[0].c, 0);
});
