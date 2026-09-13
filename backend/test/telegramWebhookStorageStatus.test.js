"use strict";

/**
 * Verifica a única mudança de comportamento do Bloco 3 feita pelo Bloco 4:
 * mensagens PHOTO capturadas pelo webhook agora nascem com
 * storage_status = 'PENDING' (TEXT/DOCUMENT continuam NULL). Também prova
 * que o webhook nunca ficou acoplado ao pipeline de armazenamento — a
 * separação exigida pela especificação ("upload nunca dentro da transação
 * do webhook") é verificada aqui de forma ESTÁTICA (nenhum require cruzado),
 * não só por comportamento em runtime.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const { processTelegramUpdate } = require("../src/modules/automations/telegram/telegramWebhookService");
const fixtures = require("./fixtures/telegramUpdates");

const RUN_TAG = `webhookstorage-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdEmpresaIds = [];

test.before(async () => {
  await initAutomationsSchema(pool);
});

test.after(async () => {
  if (createdEmpresaIds.length) {
    await pool.query(`DELETE FROM empresas WHERE id = ANY($1::int[])`, [createdEmpresaIds]);
  }
  await pool.end();
});

async function createEmpresaComConfig(chatId) {
  const { rows: empresaRows } = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [
    `${RUN_TAG}-${chatId}`,
  ]);
  const empresaId = empresaRows[0].id;
  createdEmpresaIds.push(empresaId);
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, telegram_chat_id, ativo) VALUES ($1,$2,'cfg',$3,true)`,
    [empresaId, cat.rows[0].id, chatId]
  );
  return empresaId;
}

test("mensagem PHOTO capturada pelo webhook nasce com storage_status = 'PENDING'", async () => {
  const chatId = -900001;
  await createEmpresaComConfig(chatId);
  const update = fixtures.photoUpdate({ chatId });

  await processTelegramUpdate(update);

  const { rows } = await pool.query(`SELECT storage_status, storage_attempts FROM telegram_mensagens WHERE chat_id = $1`, [chatId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].storage_status, "PENDING");
  assert.equal(rows[0].storage_attempts, 0);
});

test("mensagem TEXT capturada pelo webhook mantém storage_status NULL (não aplicável)", async () => {
  const chatId = -900002;
  await createEmpresaComConfig(chatId);
  const update = fixtures.textUpdate({ chatId });

  await processTelegramUpdate(update);

  const { rows } = await pool.query(`SELECT storage_status FROM telegram_mensagens WHERE chat_id = $1`, [chatId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].storage_status, null);
});

test("mensagem DOCUMENT capturada pelo webhook mantém storage_status NULL", async () => {
  const chatId = -900003;
  await createEmpresaComConfig(chatId);
  const update = fixtures.documentUpdate({ chatId });

  await processTelegramUpdate(update);

  const { rows } = await pool.query(`SELECT storage_status FROM telegram_mensagens WHERE chat_id = $1`, [chatId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].storage_status, null);
});

test("retransmissão da mesma foto (duplicata) não cria uma segunda linha nem reseta storage_status", async () => {
  const chatId = -900004;
  await createEmpresaComConfig(chatId);
  const update = fixtures.photoUpdate({ chatId, messageId: 5001 });

  await processTelegramUpdate(update);
  const { rows: primeira } = await pool.query(
    `SELECT id, storage_status FROM telegram_mensagens WHERE chat_id = $1`,
    [chatId]
  );
  await pool.query(`UPDATE telegram_mensagens SET storage_status = 'COMPLETED' WHERE id = $1`, [primeira[0].id]);

  const resultado = await processTelegramUpdate(update);
  assert.equal(resultado.results[0].status, "duplicate");

  const { rows: depois } = await pool.query(`SELECT storage_status FROM telegram_mensagens WHERE chat_id = $1`, [chatId]);
  assert.equal(depois.length, 1);
  assert.equal(depois[0].storage_status, "COMPLETED", "retransmissão nunca deve reverter o progresso de armazenamento já feito");
});

test("o webhook do Bloco 3 nunca importa (require) nada do pipeline de armazenamento do Bloco 4 — acoplamento estático zero", () => {
  const filesToCheck = [
    "../src/modules/automations/telegram/telegramWebhookService.js",
    "../src/modules/automations/telegram/telegramWebhookController.js",
    "../src/modules/automations/telegram/telegramWebhookRoutes.js",
    "../src/app.js",
  ];
  const forbiddenTokens = ["photoStorageService", "googleDriveClient", "telegramFileClient", "folderProvisioningService", "productionClients"];

  for (const relativePath of filesToCheck) {
    const fullPath = path.resolve(__dirname, relativePath);
    const source = fs.readFileSync(fullPath, "utf8");
    for (const token of forbiddenTokens) {
      assert.ok(!source.includes(token), `${relativePath} não deveria referenciar ${token} — upload/download é sempre pós-commit, sob demanda`);
    }
  }
});
