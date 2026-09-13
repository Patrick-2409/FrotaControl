"use strict";

/**
 * Testes de integração HTTP do endpoint administrativo de distribuição
 * (Bloco 9, Seção 41/42) — sobe o `app` real (mesma pilha de middlewares:
 * authMiddleware/requireAccountActive/requireRole) numa porta efêmera, mesma
 * disciplina de telegramWebhookHttp.test.js/telegramWebhookApprovalRouting.test.js.
 * Nenhum e-mail real é enviado — o endpoint usa os clients de PRODUÇÃO
 * (`storage/productionClients.js`), mas sem `AUTOMATION_EMAIL_FROM`/SMTP
 * configurados de verdade, qualquer tentativa de enviar de fato falharia
 * antes de tocar a rede (mesma disciplina de zero-integração-real do módulo
 * inteiro) — os testes aqui verificam roteamento/autorização, não o envio
 * em si (isso já está coberto com fakes em documentDistributionService.test.js).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const bcrypt = require("bcryptjs");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { app } = require("../src/app");
const { pool } = require("../src/db");
const { buildToken } = require("../src/services/authService");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");

const RUN_TAG = `distexecroutes-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdEmpresaIds = [];

let server;
let baseUrl;

test.before(async () => {
  await initAutomationsSchema(pool);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (createdEmpresaIds.length) {
    await pool.query(`DELETE FROM empresas WHERE id = ANY($1::int[])`, [createdEmpresaIds]);
  }
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function createEmpresa(nome) {
  const { rows } = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [`${RUN_TAG}-${nome}`]);
  createdEmpresaIds.push(rows[0].id);
  return rows[0].id;
}

let cpfSeq = 1;
async function createUsuario({ empresaId, role, nome = "Usuário Teste" }) {
  const hash = await bcrypt.hash("SenhaTesteForte123!", 4);
  const cpf = String(90000000000 + cpfSeq++);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (empresa_id, nome, email, cpf_id, senha_hash, role, status_operacional, conta_status)
     VALUES ($1,$2,$3,$4,$5,$6,'ativo','ativo') RETURNING *`,
    [empresaId, nome, `${RUN_TAG}-${role}-${cpfSeq}@example.invalid`, cpf, hash, role]
  );
  return rows[0];
}

async function createConfigWithExecucao(empresaId) {
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  const { rows: configRows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, ativo, timezone, usa_ia)
     VALUES ($1,$2,'cfg http',true,'America/Sao_Paulo',true) RETURNING *`,
    [empresaId, cat.rows[0].id]
  );
  const { rows: execRows } = await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia, status)
     VALUES ($1,$2,'2026-09-07','APPROVED') RETURNING *`,
    [configRows[0].id, empresaId]
  );
  return { config: configRows[0], execucao: execRows[0] };
}

test("endpoint de distribuição exige JWT — sem Authorization retorna 401", async () => {
  const empresaId = await createEmpresa("semjwt");
  const { execucao } = await createConfigWithExecucao(empresaId);
  const response = await fetch(`${baseUrl}/api/automations/executions/${execucao.id}/distribute`, { method: "POST" });
  assert.equal(response.status, 401);
});

test("MOTORISTA recebe 403 no endpoint de distribuição", async () => {
  const empresaId = await createEmpresa("motorista403");
  const { execucao } = await createConfigWithExecucao(empresaId);
  const motorista = await createUsuario({ empresaId, role: "MOTORISTA" });
  const token = buildToken(motorista);

  const response = await fetch(`${baseUrl}/api/automations/executions/${execucao.id}/distribute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 403);
});

test("APONTADOR recebe 403 no endpoint de distribuição", async () => {
  const empresaId = await createEmpresa("apontador403");
  const { execucao } = await createConfigWithExecucao(empresaId);
  const apontador = await createUsuario({ empresaId, role: "APONTADOR" });
  const token = buildToken(apontador);

  const response = await fetch(`${baseUrl}/api/automations/executions/${execucao.id}/distribute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 403);
});

test("ADMIN_EMPRESA de outra empresa recebe 404 (nunca acessa execução de outro tenant) — endpoint nunca burla a aprovação", async () => {
  const empresaA = await createEmpresa("adminA");
  const empresaB = await createEmpresa("adminB");
  const { execucao: execucaoB } = await createConfigWithExecucao(empresaB);
  const adminA = await createUsuario({ empresaId: empresaA, role: "ADMIN_EMPRESA" });
  const token = buildToken(adminA);

  const response = await fetch(`${baseUrl}/api/automations/executions/${execucaoB.id}/distribute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 404, "admin de outra empresa nunca deveria conseguir sequer tentar distribuir a execução de outra empresa");
});

test("ADMIN_EMPRESA da PRÓPRIA empresa consegue chamar o endpoint — mas o service ainda exige aprovação de verdade (Seção 42: admin não é override)", async () => {
  const empresaId = await createEmpresa("adminproprio");
  const { execucao } = await createConfigWithExecucao(empresaId);
  const admin = await createUsuario({ empresaId, role: "ADMIN_EMPRESA" });
  const token = buildToken(admin);

  // A execução está com status='APPROVED' só por INSERT direto (sem nenhuma
  // linha em automacao_aprovacoes) — exatamente o cenário que prova que o
  // endpoint administrativo NUNCA contorna a checagem de aprovação real.
  const response = await fetch(`${baseUrl}/api/automations/executions/${execucao.id}/distribute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200, "o endpoint em si deveria responder normalmente (a REJEIÇÃO vem do resultado do service, não de um erro HTTP)");
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.outcome, "NOT_APPROVED", "mesmo um ADMIN_EMPRESA chamando o próprio tenant nunca deveria conseguir enviar sem aprovação real");
  assert.equal(body.data.code, "DISTRIBUTION_DOCUMENT_NOT_APPROVED");
});

test("SUPER_ADMIN consegue consultar o status de distribuição de qualquer empresa (escopo padrão já validado em tenantContext)", async () => {
  const empresaId = await createEmpresa("superadminstatus");
  const { execucao } = await createConfigWithExecucao(empresaId);
  const superAdmin = await createUsuario({ empresaId: null, role: "SUPER_ADMIN" });
  const token = buildToken(superAdmin);

  const response = await fetch(`${baseUrl}/api/automations/executions/${execucao.id}/distribution-status?empresa_id=${empresaId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.execution_status, "APPROVED");
});

test("GET distribution-status exige JWT e é tenant-scoped (404 para execução de outra empresa)", async () => {
  const empresaA = await createEmpresa("statusA");
  const empresaB = await createEmpresa("statusB");
  const { execucao: execucaoB } = await createConfigWithExecucao(empresaB);
  const adminA = await createUsuario({ empresaId: empresaA, role: "ADMIN_EMPRESA" });
  const token = buildToken(adminA);

  const unauth = await fetch(`${baseUrl}/api/automations/executions/${execucaoB.id}/distribution-status`, { method: "GET" });
  assert.equal(unauth.status, 401);

  const crossTenant = await fetch(`${baseUrl}/api/automations/executions/${execucaoB.id}/distribution-status`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(crossTenant.status, 404);
});
