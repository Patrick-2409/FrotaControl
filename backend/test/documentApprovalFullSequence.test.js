"use strict";

/**
 * Teste de sequência completa do Bloco 8 (Seções 46-48 da autorização) —
 * prova o fluxo ponta a ponta com Postgres real e clients fakes:
 *   DOCUMENT_READY v1 -> sendForApproval -> AWAITING_APPROVAL
 *   -> callback REGENERATE -> v2 criada -> v2 enviada -> callback APPROVE
 *   -> execution APPROVED
 * e, em teste separado, o fluxo de rejeição completo.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const { processTelegramUpdate } = require("../src/modules/automations/telegram/telegramWebhookService");
const fixtures = require("./fixtures/telegramUpdates");
const { closeDailyExecution } = require("../src/modules/automations/closing/automationClosingService");
const { processExecutionIntelligence } = require("../src/modules/automations/ai/automationAiService");
const { generateExecutionDocument } = require("../src/modules/automations/documents/documentGenerationService");
const { sendDocumentForApproval, handleApprovalCallback, regenerateAndResendForApproval } = require("../src/modules/automations/approval/documentApprovalService");
const { buildApprovalCallbackData } = require("../src/modules/automations/approval/approvalCallbackParser");

const RUN_TAG = `apprfull-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdEmpresaIds = [];
let chatSeq = 1;

test.before(async () => {
  await initAutomationsSchema(pool);
});

test.after(async () => {
  if (createdEmpresaIds.length) {
    await pool.query(`DELETE FROM empresas WHERE id = ANY($1::int[])`, [createdEmpresaIds]);
  }
  await pool.end();
});

async function createEmpresa(nome) {
  const { rows } = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [`${RUN_TAG}-${nome}`]);
  createdEmpresaIds.push(rows[0].id);
  return rows[0].id;
}

async function createConfig(empresaId, overrides = {}) {
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  const chatId = overrides.chatId ?? -(6_000_000 + chatSeq++);
  const documentoConfig = { referenciaContratual: "Contrato 01/2026", local: "Canteiro Central", clienteRazaoSocial: "Cliente Teste LTDA", clienteEndereco: "Rua Exemplo, 100" };
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, projeto_nome, telegram_chat_id, ativo, timezone, horario_fechamento, google_drive_pasta_raiz_id, usa_ia, configuracao)
     VALUES ($1,$2,'cfg',$3,$4,true,'America/Sao_Paulo','18:00:00','root-fake-1',true,$5::jsonb) RETURNING *`,
    [empresaId, cat.rows[0].id, overrides.projetoNome ?? "Obra Sequência Completa", chatId, JSON.stringify({ documento: documentoConfig })]
  );
  return rows[0];
}

async function createApprover(config, telegramUserId, nome = "Aprovador") {
  const { rows } = await pool.query(
    `INSERT INTO automacao_aprovadores (empresa_id, automacao_config_id, nome, telegram_user_id, ativo) VALUES ($1,$2,$3,$4,true) RETURNING *`,
    [config.empresa_id, config.id, nome, telegramUserId]
  );
  return rows[0];
}

async function captureText({ config, dataReferencia = "2026-09-07", messageId, text = "texto" }) {
  const dateUnix = Math.floor(new Date(`${dataReferencia}T11:00:00Z`).getTime() / 1000);
  return processTelegramUpdate(fixtures.textUpdate({ chatId: config.telegram_chat_id, messageId, date: dateUnix, text }));
}

async function getExecucao(configId, dataReferencia = "2026-09-07") {
  const { rows } = await pool.query(`SELECT * FROM automacao_execucoes WHERE automacao_config_id = $1 AND data_referencia = $2`, [configId, dataReferencia]);
  return rows[0] || null;
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

function createFakeTelegramBotClient() {
  let counter = 0;
  const calls = { sendMessage: [], sendDocument: [], answerCallbackQuery: [], editMessageText: [] };
  return {
    calls,
    sendMessage: async (args) => {
      calls.sendMessage.push(args);
      counter += 1;
      return { messageId: 1000 + counter, chatId: args.chatId };
    },
    sendDocument: async (args) => {
      calls.sendDocument.push(args);
      counter += 1;
      return { messageId: 2000 + counter, chatId: args.chatId };
    },
    answerCallbackQuery: async (args) => calls.answerCallbackQuery.push(args),
    editMessageReplyMarkup: async () => {},
    editMessageText: async (args) => calls.editMessageText.push(args),
  };
}

function buildCallbackQuery(fromId, data) {
  return { id: `cb-${Math.floor(Math.random() * 1e9)}`, data, from: { id: String(fromId) } };
}

async function runToDocumentReady(config) {
  const messageId = Math.floor(Math.random() * 1e9);
  await captureText({ config, messageId, text: "Atividade concluída conforme planejado." });
  await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-09-07" });
  const execucao = await getExecucao(config.id);
  const { rows: msgRows } = await pool.query(`SELECT message_id FROM telegram_mensagens WHERE automacao_execucao_id = $1`, [execucao.id]);
  const sourceRef = String(msgRows[0].message_id);
  const aiResult = await processExecutionIntelligence({ pool, automacaoExecucaoId: execucao.id, aiClient: createFakeAiClient(sourceRef), driveClient: createFakeGoogleDriveClient() });
  assert.equal(aiResult.outcome, "READY");
  const docResult = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient: createFakeGoogleDriveClient() });
  assert.equal(docResult.outcome, "READY");
  return getExecucao(config.id);
}

test("sequência completa: DOCUMENT_READY v1 -> envio -> AWAITING_APPROVAL -> REGENERAR -> v2 -> reenvio -> APROVAR -> APPROVED (v1 nunca aprovada, nenhum e-mail)", async () => {
  const empresaId = await createEmpresa("sequenciacompleta");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "12345", "Fiscal Ana");
  const telegramClient = createFakeTelegramBotClient();

  let execucao = await runToDocumentReady(config);
  assert.equal(execucao.status, "DOCUMENT_READY");

  const sendV1 = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(sendV1.outcome, "SENT");
  assert.equal(sendV1.versao, 1);

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL");

  const { rows: solV1 } = await pool.query(`SELECT * FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(solV1.length, 1);
  assert.equal(solV1[0].versao_documento, 1);
  assert.equal(solV1[0].status, "SENT");

  const regenerateClick = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solV1[0].id, "REGENERATE")) });
  assert.equal(regenerateClick.outcome, "REGENERATION_REQUESTED");

  const { rows: solV1After } = await pool.query(`SELECT status FROM automacao_solicitacoes_aprovacao WHERE id = $1`, [solV1[0].id]);
  assert.equal(solV1After[0].status, "SUPERSEDED");

  const regenerated = await regenerateAndResendForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(regenerated.outcome, "REGENERATED");
  assert.equal(regenerated.novaVersao, 2);
  assert.equal(regenerated.sendResult.outcome, "SENT");

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL", "após reenvio da v2, volta a aguardar decisão");

  const { rows: solV2 } = await pool.query(`SELECT * FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1 AND versao_documento = 2`, [execucao.id]);
  assert.equal(solV2.length, 1);
  assert.equal(solV2[0].status, "SENT");

  const approveV2 = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solV2[0].id, "APPROVE")) });
  assert.equal(approveV2.outcome, "APPROVED");

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "APPROVED");

  const { rows: decisions } = await pool.query(`SELECT versao_documento, decisao FROM automacao_aprovacoes WHERE automacao_execucao_id = $1 ORDER BY versao_documento`, [execucao.id]);
  assert.equal(decisions.length, 2);
  assert.deepEqual(decisions[0], { versao_documento: 1, decisao: "REGENERAR_SOLICITADO" });
  assert.deepEqual(decisions[1], { versao_documento: 2, decisao: "APROVADO" });

  // v1 nunca foi (e nunca poderia ter sido) aprovada.
  assert.notEqual(decisions[0].decisao, "APROVADO");

  const { rows: eventos } = await pool.query(`SELECT tipo_evento FROM automacao_eventos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.ok(!eventos.some((e) => /email|smtp|mail/i.test(e.tipo_evento)), "nenhum e-mail em nenhum ponto da sequência");
});

test("sequência de rejeição: DOCUMENT_READY -> envio -> REJEITAR -> REJECTED (documentos/snapshot/inteligência preservados, nenhum novo documento, nenhum e-mail)", async () => {
  const empresaId = await createEmpresa("sequenciarejeicao");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "54321", "Fiscal Bruno");
  const telegramClient = createFakeTelegramBotClient();

  let execucao = await runToDocumentReady(config);
  const send = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(send.outcome, "SENT");

  const { rows: sol } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const reject = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(sol[0].id, "REJECT")) });
  assert.equal(reject.outcome, "REJECTED");

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "REJECTED");

  const { rows: docCount } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(docCount[0].c, 1, "nenhum novo documento deveria ter sido criado");

  const { rows: eventoRows } = await pool.query(`SELECT tipo_evento FROM automacao_eventos WHERE automacao_execucao_id = $1`, [execucao.id]);
  const eventos = eventoRows.map((e) => e.tipo_evento);
  assert.ok(!eventos.some((e) => /email|smtp|mail/i.test(e)));
  assert.ok(eventos.includes("APPROVAL_REJECTED"));
});
