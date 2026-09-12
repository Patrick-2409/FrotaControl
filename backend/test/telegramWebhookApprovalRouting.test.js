"use strict";

/**
 * Teste de integração HTTP do roteamento de callback_query de aprovação
 * (Bloco 8, Seção 19) — prova que a decisão chega pelo MESMO webhook
 * autenticado do Bloco 3 (nenhum endpoint público paralelo), que o secret
 * continua sendo exigido para um callback_query exatamente como para uma
 * mensagem comum, e que nenhum JWT é necessário nesse caminho. Sobe o `app`
 * real (mesma pilha de middlewares) numa porta efêmera — mesma disciplina de
 * telegramWebhookHttp.test.js.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { app } = require("../src/app");
const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const { processTelegramUpdate } = require("../src/modules/automations/telegram/telegramWebhookService");
const fixtures = require("./fixtures/telegramUpdates");
const { closeDailyExecution } = require("../src/modules/automations/closing/automationClosingService");
const { processExecutionIntelligence } = require("../src/modules/automations/ai/automationAiService");
const { generateExecutionDocument } = require("../src/modules/automations/documents/documentGenerationService");
const { sendDocumentForApproval } = require("../src/modules/automations/approval/documentApprovalService");
const { buildApprovalCallbackData } = require("../src/modules/automations/approval/approvalCallbackParser");

const RUN_TAG = `tgapprhttp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

async function createEmpresa(nome) {
  const { rows } = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [`${RUN_TAG}-${nome}`]);
  createdEmpresaIds.push(rows[0].id);
  return rows[0].id;
}

async function createConfig(empresaId, chatId) {
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  const documentoConfig = { referenciaContratual: "Contrato 01/2026", local: "Canteiro Central", clienteRazaoSocial: "Cliente Teste LTDA", clienteEndereco: "Rua Exemplo, 100" };
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, projeto_nome, telegram_chat_id, ativo, timezone, horario_fechamento, google_drive_pasta_raiz_id, usa_ia, configuracao)
     VALUES ($1,$2,'cfg',$3,$4,true,'America/Sao_Paulo','18:00:00','root-fake-1',true,$5::jsonb) RETURNING *`,
    [empresaId, cat.rows[0].id, "Obra HTTP", chatId, JSON.stringify({ documento: documentoConfig })]
  );
  return rows[0];
}

async function createApprover(config, telegramUserId) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_aprovadores (empresa_id, automacao_config_id, nome, telegram_user_id, ativo) VALUES ($1,$2,'Aprovador HTTP',$3,true) RETURNING *`,
    [config.empresa_id, config.id, telegramUserId]
  );
  return rows[0];
}

function createFakeAiClient(sourceRef) {
  return {
    model: "fake-model-v1",
    analyzePhotoBatch: async () => ({ observations: [], usage: { inputTokens: 0, outputTokens: 0 } }),
    consolidateDailyIntelligence: async () => ({
      structuredOutput: {
        schemaVersion: 1,
        summary: { text: "Dia com atividades.", sourceRefs: sourceRef ? [sourceRef] : [] },
        facts: [{ id: "f1", category: "ACTIVITY", statement: "Atividade concluída.", sourceRefs: [sourceRef], evidenceType: "TEXT_EXPLICIT" }],
        photoObservations: [],
        conflicts: [],
        missingInformation: [],
        warnings: [],
      },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    }),
  };
}

function createFakeGoogleDriveClient() {
  let counter = 0;
  return {
    ensureFolder: async ({ name }) => {
      counter += 1;
      return { id: `drive-folder-${name}-${counter}`, name, wasCreated: true };
    },
    findFileBySourceMetadata: async () => null,
    uploadFile: async ({ name, buffer, appProperties }) => {
      counter += 1;
      return { id: `uploaded-${counter}`, name, size: String(buffer.length), appProperties };
    },
    downloadFileContent: async () => Buffer.from([1, 2, 3, 4]),
  };
}

function createFakeTelegramBotClientForSend() {
  let counter = 0;
  return {
    sendMessage: async (args) => {
      counter += 1;
      return { messageId: 1000 + counter, chatId: args.chatId };
    },
    sendDocument: async (args) => {
      counter += 1;
      return { messageId: 2000 + counter, chatId: args.chatId };
    },
    answerCallbackQuery: async () => {},
    editMessageReplyMarkup: async () => {},
    editMessageText: async () => {},
  };
}

async function setUpAwaitingApproval(chatId) {
  const empresaId = await createEmpresa(`e${chatId}`);
  const config = await createConfig(empresaId, chatId);
  const approver = await createApprover(config, "77777");

  const dateUnix = Math.floor(new Date("2026-09-07T11:00:00Z").getTime() / 1000);
  await processTelegramUpdate(fixtures.textUpdate({ chatId, messageId: Math.floor(Math.random() * 1e9), date: dateUnix, text: "Atividade concluída." }));
  await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-09-07" });
  const { rows: execRows } = await pool.query(`SELECT * FROM automacao_execucoes WHERE automacao_config_id = $1 AND data_referencia = '2026-09-07'`, [config.id]);
  const execucao = execRows[0];
  const { rows: msgRows } = await pool.query(`SELECT message_id FROM telegram_mensagens WHERE automacao_execucao_id = $1`, [execucao.id]);
  await processExecutionIntelligence({ pool, automacaoExecucaoId: execucao.id, aiClient: createFakeAiClient(String(msgRows[0].message_id)), driveClient: createFakeGoogleDriveClient() });
  await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient: createFakeGoogleDriveClient() });
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient: createFakeTelegramBotClientForSend(), driveClient: createFakeGoogleDriveClient() });

  const { rows: solRows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  return { config, execucao, approver, solicitacaoId: solRows[0].id };
}

function callbackPayload({ updateId, callbackId, telegramUserId, data }) {
  return JSON.stringify({
    update_id: updateId,
    callback_query: {
      id: callbackId,
      from: { id: telegramUserId, first_name: "T" },
      data,
      message: { message_id: 1, chat: { id: -1 } },
    },
  });
}

test("TELEGRAM_WEBHOOK_SECRET está configurado no ambiente de teste (pré-condição)", () => {
  assert.ok(TEST_SECRET, "defina TELEGRAM_WEBHOOK_SECRET no .env local para rodar estes testes");
});

test("callback de aprovação sem secret é rejeitado (401), execução não é alterada", async () => {
  const { execucao, solicitacaoId } = await setUpAwaitingApproval(-9001);
  const response = await fetch(`${baseUrl}/api/integrations/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: callbackPayload({ updateId: 1, callbackId: "cb-1", telegramUserId: "77777", data: buildApprovalCallbackData(solicitacaoId, "APPROVE") }),
  });
  assert.equal(response.status, 401);

  const { rows } = await pool.query(`SELECT status FROM automacao_execucoes WHERE id = $1`, [execucao.id]);
  assert.equal(rows[0].status, "AWAITING_APPROVAL", "sem o secret correto, a decisão nunca deveria ser processada");
});

test("callback de aprovação com secret correto é processado e aprova o documento — sem exigir JWT", async () => {
  const { execucao, solicitacaoId } = await setUpAwaitingApproval(-9002);
  const response = await fetch(`${baseUrl}/api/integrations/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": TEST_SECRET },
    body: callbackPayload({ updateId: 2, callbackId: "cb-2", telegramUserId: "77777", data: buildApprovalCallbackData(solicitacaoId, "APPROVE") }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.handled, true);

  const { rows } = await pool.query(`SELECT status FROM automacao_execucoes WHERE id = $1`, [execucao.id]);
  assert.equal(rows[0].status, "APPROVED");
});

test("callback de recurso desconhecido (fora do namespace appr:) continua tratado como antes — handled:false, sem erro", async () => {
  const response = await fetch(`${baseUrl}/api/integrations/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": TEST_SECRET },
    body: callbackPayload({ updateId: 3, callbackId: "cb-3", telegramUserId: "1", data: "algum_outro_recurso_futuro" }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.handled, false);
});
