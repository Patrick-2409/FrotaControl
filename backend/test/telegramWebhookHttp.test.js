"use strict";

/**
 * Testes de integração HTTP do Bloco 3 — únicos deste tipo no projeto
 * (todos os demais testes chamam controllers diretamente com req/res
 * mockados, ver userResponseSecurity.test.js). Necessário aqui porque o que
 * precisa ser provado é justamente o COMPORTAMENTO DA PIPELINE de app.js:
 * "o webhook não exige JWT" e "as rotas administrativas continuam exigindo"
 * só podem ser verdadeiramente testados batendo na pilha real de
 * middlewares (helmet/limiter/express.raw/express.json/authMiddleware/
 * requireRole), não chamando um controller isoladamente.
 *
 * Sobe `app` (o mesmo objeto Express de produção) numa porta efêmera local
 * e usa `fetch` nativo do Node — nenhuma chamada a telegram.org.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { app } = require("../src/app");
const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");

const RUN_TAG = `tghttp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const TEST_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
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

function textUpdatePayload({ chatId, messageId = 1, updateId = 1, text = "oi" }) {
  return JSON.stringify({
    update_id: updateId,
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "supergroup" },
      from: { id: 1, first_name: "T" },
      text,
    },
  });
}

test("TELEGRAM_WEBHOOK_SECRET está configurado no ambiente de teste (pré-condição)", () => {
  assert.ok(TEST_SECRET, "defina TELEGRAM_WEBHOOK_SECRET no .env local para rodar estes testes");
});

// -------------------------------------------------------- 1, 2: secret

test("secret correto no header aceita o webhook (200)", async () => {
  const response = await fetch(`${baseUrl}/api/integrations/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": TEST_SECRET },
    body: textUpdatePayload({ chatId: -1, messageId: 1001, updateId: 1 }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
});

test("secret incorreto rejeita o webhook (401), sem revelar o valor esperado", async () => {
  const response = await fetch(`${baseUrl}/api/integrations/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "valor-errado" },
    body: textUpdatePayload({ chatId: -2, messageId: 1002, updateId: 2 }),
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.ok(!JSON.stringify(body).includes(TEST_SECRET));
});

test("secret ausente rejeita o webhook (401)", async () => {
  const response = await fetch(`${baseUrl}/api/integrations/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: textUpdatePayload({ chatId: -3, messageId: 1003, updateId: 3 }),
  });
  assert.equal(response.status, 401);
});

// ------------------------------------------------------- 3, 4: isolamento

test("webhook Telegram não exige JWT (nenhum header Authorization enviado)", async () => {
  const response = await fetch(`${baseUrl}/api/integrations/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": TEST_SECRET },
    body: textUpdatePayload({ chatId: -4, messageId: 1004, updateId: 4 }),
  });
  assert.notEqual(response.status, 401, "não deveria pedir autenticação JWT");
  assert.equal(response.status, 200);
});

test("rotas administrativas /api/automations continuam exigindo JWT mesmo após montar o webhook público", async () => {
  const response = await fetch(`${baseUrl}/api/automations/configs`, { method: "GET" });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.success, false);
});

test("rotas administrativas /api/automations rejeitam o secret do Telegram como se fosse credencial", async () => {
  // O secret do Telegram nunca deve funcionar como um substituto de JWT.
  const response = await fetch(`${baseUrl}/api/automations/configs`, {
    method: "GET",
    headers: { "X-Telegram-Bot-Api-Secret-Token": TEST_SECRET },
  });
  assert.equal(response.status, 401);
});

// --------------------------------------------------- IDs grandes via HTTP real

test("chat_id grande sobrevive ao round-trip HTTP completo sem perder precisão", async () => {
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  const empresa = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [`${RUN_TAG}-http-bigint`]);
  createdEmpresaIds.push(empresa.rows[0].id);
  const chatId = "-1009999999999999";
  await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, telegram_chat_id) VALUES ($1,$2,'cfg',$3)`,
    [empresa.rows[0].id, cat.rows[0].id, chatId]
  );

  const raw = `{"update_id":9,"message":{"message_id":1005,"date":${Math.floor(
    Date.now() / 1000
  )},"chat":{"id":${chatId}},"from":{"id":1,"first_name":"T"},"text":"oi via http"}}`;

  const response = await fetch(`${baseUrl}/api/integrations/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": TEST_SECRET },
    body: raw,
  });
  assert.equal(response.status, 200);

  const { rows } = await pool.query(`SELECT chat_id FROM telegram_mensagens WHERE empresa_id = $1`, [
    empresa.rows[0].id,
  ]);
  assert.equal(rows[0].chat_id, chatId);
});
