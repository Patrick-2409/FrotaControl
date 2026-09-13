"use strict";

/**
 * Bloco 10, Seção 1-3 — VERSÃO DOCUMENTAL GLOBAL POR EXECUÇÃO.
 *
 * Prova, com Postgres real e o pipeline real dos Blocos 3-9 (webhook ->
 * fechamento -> IA -> documento -> aprovação Telegram -> distribuição por
 * e-mail), que `automacao_execucao_documentos.versao` é monotônica e ÚNICA
 * por EXECUÇÃO inteira — nunca reinicia quando um late input dispara um
 * snapshot/inteligência novos (comportamento do Bloco 9, corrigido aqui) — e
 * que o número correto se propaga sem nenhuma mudança adicional em nome de
 * arquivo, mensagem do Telegram, `automacao_aprovacoes`, distribuição por
 * e-mail e nas queries de consulta.
 *
 * Sequência exigida pela autorização: documento v1 -> REGENERAR (v2) ->
 * late input -> rebuild (snapshot novo) -> IA nova -> documento v3 ->
 * REGENERAR de novo (v4) -> envio/aprovação/distribuição todos com v4.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const { processTelegramUpdate } = require("../src/modules/automations/telegram/telegramWebhookService");
const fixtures = require("./fixtures/telegramUpdates");
const { closeDailyExecution, rebuildDailySnapshot } = require("../src/modules/automations/closing/automationClosingService");
const { processExecutionIntelligence } = require("../src/modules/automations/ai/automationAiService");
const { generateExecutionDocument, documentFileName, listDocumentVersionsForEmpresa } = require("../src/modules/automations/documents/documentGenerationService");
const { sendDocumentForApproval, handleApprovalCallback, regenerateAndResendForApproval } = require("../src/modules/automations/approval/documentApprovalService");
const { buildApprovalCallbackData } = require("../src/modules/automations/approval/approvalCallbackParser");
const { distributeApprovedDocument } = require("../src/modules/automations/distribution/documentDistributionService");

const RUN_TAG = `globalversao-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdEmpresaIds = [];
let chatSeq = 1;

const ORIGINAL_ENV = {
  AUTOMATION_EMAIL_FROM: process.env.AUTOMATION_EMAIL_FROM,
  AUTOMATION_EMAIL_FROM_NAME: process.env.AUTOMATION_EMAIL_FROM_NAME,
};

test.before(async () => {
  await initAutomationsSchema(pool);
  process.env.AUTOMATION_EMAIL_FROM = "no-reply@example.com";
  process.env.AUTOMATION_EMAIL_FROM_NAME = "FrotaMax Automações";
});

test.after(async () => {
  if (createdEmpresaIds.length) {
    await pool.query(`DELETE FROM empresas WHERE id = ANY($1::int[])`, [createdEmpresaIds]);
  }
  if (ORIGINAL_ENV.AUTOMATION_EMAIL_FROM === undefined) delete process.env.AUTOMATION_EMAIL_FROM;
  else process.env.AUTOMATION_EMAIL_FROM = ORIGINAL_ENV.AUTOMATION_EMAIL_FROM;
  if (ORIGINAL_ENV.AUTOMATION_EMAIL_FROM_NAME === undefined) delete process.env.AUTOMATION_EMAIL_FROM_NAME;
  else process.env.AUTOMATION_EMAIL_FROM_NAME = ORIGINAL_ENV.AUTOMATION_EMAIL_FROM_NAME;
  await pool.end();
});

async function createEmpresa(nome) {
  const { rows } = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [`${RUN_TAG}-${nome}`]);
  createdEmpresaIds.push(rows[0].id);
  return rows[0].id;
}

const DEFAULT_DOCUMENTO_CONFIG = {
  referenciaContratual: "Contrato 01/2026",
  local: "Canteiro Central",
  clienteRazaoSocial: "Cliente Teste LTDA",
  clienteEndereco: "Rua Exemplo, 100",
};

async function createConfig(empresaId, overrides = {}) {
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  const chatId = overrides.chatId ?? -(8_000_000 + chatSeq++);
  const documentoConfig = overrides.documentoConfig === undefined ? DEFAULT_DOCUMENTO_CONFIG : overrides.documentoConfig;
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, projeto_nome, telegram_chat_id, ativo, timezone, horario_fechamento, google_drive_pasta_raiz_id, usa_ia, configuracao)
     VALUES ($1,$2,'cfg',$3,$4,true,'America/Sao_Paulo','18:00:00','root-fake-1',true,$5::jsonb) RETURNING *`,
    [empresaId, cat.rows[0].id, overrides.projetoNome ?? "Obra Versionamento Global", chatId, JSON.stringify({ documento: documentoConfig })]
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

async function createRecipient(config, { tipo = "TO", email, nome = null, ativo = true }) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_destinatarios (empresa_id, automacao_config_id, tipo, nome, email, ativo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [config.empresa_id, config.id, tipo, nome, email, ativo]
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

function createFakeEmailClient() {
  const calls = [];
  return {
    calls,
    sendMail: async (args) => {
      calls.push(args);
      return { provider: "fake-smtp", providerMessageId: `<fake-${calls.length}@example.com>`, accepted: [args.to].flat(), rejected: [] };
    },
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

function alterDocumentoConfigLocal(configId, novoLocal) {
  return pool.query(
    `UPDATE automacao_configs SET configuracao = jsonb_set(configuracao, '{documento}', (configuracao->'documento') || $2::jsonb) WHERE id = $1`,
    [configId, JSON.stringify({ local: novoLocal })]
  );
}

test("versionamento documental GLOBAL: v1 -> REGENERAR v2 -> late input/rebuild v3 -> REGENERAR v4 — nunca reinicia, nunca duplica, propaga corretamente para nome de arquivo/Telegram/aprovação/distribuição", async () => {
  const empresaId = await createEmpresa("sequenciaglobal");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "77001", "Fiscal Global");
  await createRecipient(config, { email: "gestor.global@example.com" });

  // ---- v1: documento inicial ----
  let execucao = await runToDocumentReady(config);
  assert.equal(execucao.status, "DOCUMENT_READY");
  const { rows: v1Rows } = await pool.query(`SELECT versao FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(v1Rows.length, 1);
  assert.equal(v1Rows[0].versao, 1);

  const telegramClient1 = createFakeTelegramBotClient();
  const sendV1 = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient: telegramClient1, driveClient: createFakeGoogleDriveClient() });
  assert.equal(sendV1.outcome, "SENT");
  assert.equal(sendV1.versao, 1);

  // ---- REGENERAR -> v2 (mesmo snapshot/inteligência, config mudou) ----
  await alterDocumentoConfigLocal(config.id, "Canteiro Central — ajuste 1");
  const { rows: solV1 } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1 AND versao_documento = 1`, [execucao.id]);
  const regenClick1 = await handleApprovalCallback({ pool, telegramClient: telegramClient1, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solV1[0].id, "REGENERATE")) });
  assert.equal(regenClick1.outcome, "REGENERATION_REQUESTED");

  const regenerated1 = await regenerateAndResendForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient: telegramClient1, driveClient: createFakeGoogleDriveClient() });
  assert.equal(regenerated1.outcome, "REGENERATED");
  assert.equal(regenerated1.novaVersao, 2, "regeneração normal (sem late input) precisa continuar a numeração global, nunca reiniciar");
  assert.equal(regenerated1.sendResult.outcome, "SENT");

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL");

  // ---- LATE INPUT enquanto v2 aguarda aprovação -> rebuild -> snapshot NOVO ----
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9), text: "Late input chegou depois do reenvio da v2." });
  const rebuildResult = await rebuildDailySnapshot({ pool, automacaoExecucaoId: execucao.id });
  assert.equal(rebuildResult.outcome, "READY", "rebuild precisa suplantar AWAITING_APPROVAL (Seção 4/37 do Bloco 9)");

  const { rows: msgRows } = await pool.query(`SELECT message_id FROM telegram_mensagens WHERE automacao_execucao_id = $1 ORDER BY message_id DESC LIMIT 1`, [execucao.id]);
  const aiResult2 = await processExecutionIntelligence({ pool, automacaoExecucaoId: execucao.id, aiClient: createFakeAiClient(String(msgRows[0].message_id)), driveClient: createFakeGoogleDriveClient() });
  assert.equal(aiResult2.outcome, "READY");

  // ---- v3: novo snapshot + nova inteligência -> documento novo, GLOBALMENTE v3 (nunca reinicia em 1) ----
  const docV3 = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient: createFakeGoogleDriveClient() });
  assert.equal(docV3.outcome, "READY");
  assert.equal(docV3.versao, 3, "novo snapshot/inteligência do rebuild NUNCA reinicia a numeração — continua a contagem global da execução");

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "DOCUMENT_READY");

  // ---- REGENERAR de novo (force direto, config muda outra vez) -> v4 ----
  await alterDocumentoConfigLocal(config.id, "Canteiro Central — ajuste 2");
  const docV4 = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient: createFakeGoogleDriveClient(), force: true });
  assert.equal(docV4.outcome, "READY");
  assert.equal(docV4.versao, 4);

  // ---- Nome de arquivo reflete v4 ----
  assert.match(
    documentFileName({ dataReferencia: "2026-09-07", extension: "xlsx", versao: docV4.versao }),
    /_v4\.xlsx$/
  );

  // ---- Obsolescência EXPLÍCITA (Seção 32): v1/v2/v3 marcadas superseded com o motivo correto; v4 é a única corrente ----
  const { rows: obsolescencia } = await pool.query(
    `SELECT versao, is_superseded, superseded_reason FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1 ORDER BY versao`,
    [execucao.id]
  );
  assert.deepEqual(
    obsolescencia.map((r) => ({ versao: r.versao, is_superseded: r.is_superseded, superseded_reason: r.superseded_reason })),
    [
      { versao: 1, is_superseded: true, superseded_reason: "REGENERATION" }, // v1 -> v2: mesma snapshot, config mudou
      { versao: 2, is_superseded: true, superseded_reason: "LATE_INPUT" }, // v2 -> v3: snapshot NOVA do rebuild
      { versao: 3, is_superseded: true, superseded_reason: "REGENERATION" }, // v3 -> v4: mesma snapshot do rebuild, config mudou de novo
      { versao: 4, is_superseded: false, superseded_reason: null }, // v4 é a corrente
    ]
  );

  // ---- Envio ao Telegram (v4) reflete a versão correta na mensagem/nome dos arquivos ----
  const telegramClient2 = createFakeTelegramBotClient();
  const sendV4 = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient: telegramClient2, driveClient: createFakeGoogleDriveClient() });
  assert.equal(sendV4.outcome, "SENT");
  assert.equal(sendV4.versao, 4);
  assert.ok(telegramClient2.calls.sendMessage.some((m) => /vers[aã]o:\s*4/i.test(m.text)), "resumo enviado ao aprovador precisa citar a v4");
  assert.equal(telegramClient2.calls.sendDocument.length, 2);
  assert.ok(telegramClient2.calls.sendDocument.every((d) => /_v4\./.test(d.filename)), "arquivos enviados ao Telegram precisam ter o nome com _v4");

  const { rows: solV4 } = await pool.query(`SELECT * FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1 AND versao_documento = 4`, [execucao.id]);
  assert.equal(solV4.length, 1);
  assert.equal(solV4[0].status, "SENT");

  // ---- Aprovação registra a versão correta (v4) ----
  const approveV4 = await handleApprovalCallback({ pool, telegramClient: telegramClient2, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solV4[0].id, "APPROVE")) });
  assert.equal(approveV4.outcome, "APPROVED");
  assert.equal(approveV4.versao, 4);

  const { rows: aprovacaoV4 } = await pool.query(`SELECT versao_documento, decisao FROM automacao_aprovacoes WHERE automacao_solicitacao_id = $1`, [solV4[0].id]);
  assert.equal(aprovacaoV4[0].versao_documento, 4);
  assert.equal(aprovacaoV4[0].decisao, "APROVADO");

  // ---- Distribuição por e-mail também aponta para v4 ----
  const emailClient = createFakeEmailClient();
  const distResult = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(distResult.outcome, "SENT");
  assert.equal(distResult.versao, 4);

  const { rows: distRow } = await pool.query(`SELECT versao_documento, subject_snapshot FROM automacao_distribuicoes WHERE id = $1`, [distResult.distribuicaoId]);
  assert.equal(distRow[0].versao_documento, 4);

  // ---- Histórico completo: 4 versões distintas, estritamente monotônicas, nunca repetidas ----
  const historico = await listDocumentVersionsForEmpresa(pool, { empresaId, automacaoExecucaoId: execucao.id });
  const versoes = historico.map((h) => h.versao).sort((a, b) => a - b);
  assert.deepEqual(versoes, [1, 2, 3, 4], "as 4 gerações desta execução precisam ter versões distintas, sequenciais e nunca repetidas");

  // ---- A UNIQUE(automacao_execucao_id, versao) do Bloco 10 é a rede de segurança final ----
  await assert.rejects(
    pool.query(
      `INSERT INTO automacao_execucao_documentos
         (empresa_id, automacao_execucao_id, snapshot_id, intelligence_id, automacao_template_id, generator_id, versao, status, input_hash)
       SELECT empresa_id, automacao_execucao_id, snapshot_id, intelligence_id, automacao_template_id, generator_id, 4, 'PROCESSING', 'hash-forjado-duplicata'
       FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1 AND versao = 4`,
      [execucao.id]
    ),
    (err) => {
      assert.equal(err.code, "23505", "violação da UNIQUE(automacao_execucao_id, versao) precisa ser rejeitada pelo Postgres");
      return true;
    }
  );
});
