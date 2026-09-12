"use strict";

/**
 * Testes de integração da distribuição por e-mail do Diário de Obra
 * APROVADO (Bloco 9) — Postgres local real (claim atômico, concorrência,
 * UNIQUE de distribuição por documento não se provam com mocks). Os clients
 * de Telegram/Drive/E-mail são SEMPRE fakes injetados — nenhuma chamada de
 * rede real em nenhum teste, nenhum e-mail real é enviado.
 *
 * Usa o pipeline REAL dos Blocos 3-8 (webhook -> fechamento -> IA ->
 * documento -> envio Telegram -> aprovação) para chegar a uma execução
 * APPROVED com aprovação de verdade — exatamente a pré-condição que o
 * Bloco 9 assume.
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
const { generateExecutionDocument } = require("../src/modules/automations/documents/documentGenerationService");
const { sendDocumentForApproval, handleApprovalCallback, regenerateAndResendForApproval } = require("../src/modules/automations/approval/documentApprovalService");
const { buildApprovalCallbackData } = require("../src/modules/automations/approval/approvalCallbackParser");
const { distributeApprovedDocument, getDistributionStatusForEmpresa } = require("../src/modules/automations/distribution/documentDistributionService");

const RUN_TAG = `distsvc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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
  const chatId = overrides.chatId ?? -(7_000_000 + chatSeq++);
  const documentoConfig = overrides.documentoConfig === undefined ? DEFAULT_DOCUMENTO_CONFIG : overrides.documentoConfig;
  const configuracao = {};
  if (documentoConfig) configuracao.documento = documentoConfig;
  if (overrides.emailConfig) configuracao.email = overrides.emailConfig;
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, projeto_nome, telegram_chat_id, ativo, timezone, horario_fechamento, google_drive_pasta_raiz_id, usa_ia, configuracao)
     VALUES ($1,$2,'cfg',$3,$4,true,'America/Sao_Paulo','18:00:00','root-fake-1',true,$5::jsonb) RETURNING *`,
    [empresaId, cat.rows[0].id, overrides.projetoNome ?? "Obra Teste", chatId, JSON.stringify(configuracao)]
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

function createFakeGoogleDriveClient({ downloadSizeBytes = 4 } = {}) {
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
    downloadFileContent: async ({ maxBytes } = {}) => {
      const size = downloadSizeBytes;
      if (maxBytes != null && size > maxBytes) {
        const err = new Error("Download excede o limite configurado.");
        err.code = "ARQUIVO_MUITO_GRANDE";
        throw err;
      }
      return Buffer.alloc(size, 7);
    },
  };
}

function createFakeTelegramBotClient() {
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

function buildCallbackQuery(fromId, data) {
  return { id: `cb-${Math.floor(Math.random() * 1e9)}`, data, from: { id: String(fromId) } };
}

/** Fake determinístico do e-mail (Seção 52) — captura from/to/cc/subject/body/attachments/messageId, nunca bate na rede. */
function createFakeEmailClient({ onSendMail } = {}) {
  const calls = [];
  return {
    calls,
    sendMail: async (args) => {
      calls.push(args);
      if (onSendMail) return onSendMail(args);
      return { provider: "fake-smtp", providerMessageId: `<fake-${calls.length}@example.com>`, accepted: [args.to].flat(), rejected: [] };
    },
  };
}

function createFailingEmailClient(message = "Falha simulada de rede SMTP.") {
  const calls = [];
  return {
    calls,
    sendMail: async (args) => {
      calls.push(args);
      throw new Error(message);
    },
  };
}

async function runToDocumentReady(config, { dataReferencia = "2026-09-07", text = "Atividade concluída." } = {}) {
  const messageId = Math.floor(Math.random() * 1e9);
  await captureText({ config, dataReferencia, messageId, text });
  await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: dataReferencia });
  const execucao = await getExecucao(config.id, dataReferencia);
  const { rows: msgRows } = await pool.query(`SELECT message_id FROM telegram_mensagens WHERE automacao_execucao_id = $1`, [execucao.id]);
  const sourceRef = String(msgRows[0].message_id);
  const aiResult = await processExecutionIntelligence({ pool, automacaoExecucaoId: execucao.id, aiClient: createFakeAiClient(sourceRef), driveClient: createFakeGoogleDriveClient() });
  assert.equal(aiResult.outcome, "READY");
  const docResult = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient: createFakeGoogleDriveClient() });
  assert.equal(docResult.outcome, "READY");
  return getExecucao(config.id, dataReferencia);
}

/** Encadeia até APPROVED — requer que um aprovador `telegramUserId` já exista na config. */
async function runToApproved(config, { telegramUserId = "999", dataReferencia = "2026-09-07" } = {}) {
  const execucao = await runToDocumentReady(config, { dataReferencia });
  const telegramClient = createFakeTelegramBotClient();
  const sendResult = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(sendResult.outcome, "SENT");
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1 ORDER BY versao_documento DESC LIMIT 1`, [execucao.id]);
  const approveResult = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery(telegramUserId, buildApprovalCallbackData(rows[0].id, "APPROVE")) });
  assert.equal(approveResult.outcome, "APPROVED");
  return getExecucao(config.id, dataReferencia);
}

// -------------------------------------------------------------- pré-condições de estado (itens 1-6)

test("distributeApprovedDocument: DOCUMENT_READY não permite distribuição", async () => {
  const empresaId = await createEmpresa("statusdocready");
  const config = await createConfig(empresaId);
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToDocumentReady(config);
  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NOT_APPROVED");
  assert.equal(result.currentStatus, "DOCUMENT_READY");
  assert.equal(emailClient.calls.length, 0);
});

test("distributeApprovedDocument: AWAITING_APPROVAL não permite distribuição", async () => {
  const empresaId = await createEmpresa("statusawaiting");
  const config = await createConfig(empresaId);
  await createApprover(config, "111");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToDocumentReady(config);
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient: createFakeTelegramBotClient(), driveClient: createFakeGoogleDriveClient() });
  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "AWAITING_APPROVAL");

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: fresh.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NOT_APPROVED");
  assert.equal(result.currentStatus, "AWAITING_APPROVAL");
  assert.equal(emailClient.calls.length, 0, "TESTE NEGATIVO (Seção 48): zero chamadas ao emailClient");
});

test("distributeApprovedDocument: REJECTED não permite distribuição — documento/snapshot/inteligência preservados", async () => {
  const empresaId = await createEmpresa("statusrejected");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "112");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToDocumentReady(config);
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(rows[0].id, "REJECT")) });

  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "REJECTED");
  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: fresh.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NOT_APPROVED");
  assert.equal(emailClient.calls.length, 0, "TESTE NEGATIVO (Seção 49): zero chamadas ao emailClient — mesmo chamando o service diretamente");
});

test("distributeApprovedDocument: READY_FOR_DOCUMENT/READY_FOR_GENERATION/DOCUMENT_PROCESSING/ERROR (de outro subsistema) nunca permitem", async () => {
  const empresaId = await createEmpresa("statusdiversos");
  const config = await createConfig(empresaId);
  for (const status of ["READY_FOR_DOCUMENT", "READY_FOR_GENERATION", "DOCUMENT_PROCESSING"]) {
    const { rows } = await pool.query(
      `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia, status) VALUES ($1,$2,$3,$4) RETURNING id`,
      [config.id, empresaId, `2026-01-${status.length}`, status]
    );
    const emailClient = createFakeEmailClient();
    const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: rows[0].id, emailClient, driveClient: createFakeGoogleDriveClient() });
    assert.equal(result.outcome, "NOT_APPROVED", `status ${status} deveria bloquear`);
    assert.equal(emailClient.calls.length, 0);
  }
});

test("distributeApprovedDocument: status APPROVED SEM registro de aprovação (automacao_aprovacoes) não permite (Seção 33)", async () => {
  const empresaId = await createEmpresa("approvedsemaprovacao");
  const config = await createConfig(empresaId);
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToDocumentReady(config);
  // Força a execução para APPROVED sem NUNCA ter passado pela aprovação de verdade.
  await pool.query(`UPDATE automacao_execucoes SET status = 'APPROVED' WHERE id = $1`, [execucao.id]);

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NOT_APPROVED");
  assert.equal(result.code, "DISTRIBUTION_DOCUMENT_NOT_APPROVED");
  assert.equal(emailClient.calls.length, 0, "execution.status=APPROVED isolado nunca é suficiente");
});

test("distributeApprovedDocument: aprovação de OUTRO documento (não o vinculado à execução) não permite", async () => {
  const empresaId = await createEmpresa("aprovacaooutrodoc");
  const configA = await createConfig(empresaId);
  const configB = await createConfig(empresaId);
  await createApprover(configA, "113");
  await createRecipient(configA, { email: "gestor@example.com" });
  const execucaoA = await runToApproved(configA, { telegramUserId: "113" });

  const execucaoB = await runToDocumentReady(configB);
  const { rows: docBRows } = await pool.query(`SELECT id FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucaoB.id]);
  // Simula uma linha de aprovação "vazada" apontando para um documento de OUTRA execução.
  await pool.query(
    `INSERT INTO automacao_aprovacoes (empresa_id, automacao_execucao_id, automacao_config_id, automacao_documento_id, decisao, versao_documento)
     VALUES ($1,$2,$3,$4,'APROVADO',1)`,
    [empresaId, execucaoA.id, configA.id, docBRows[0].id]
  );

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucaoA.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NOT_APPROVED");
  assert.equal(emailClient.calls.length, 0);
});

test("distributeApprovedDocument: approval request inconsistente (solicitação SUPERSEDED para a versão aprovada) não permite (Seção 34/36)", async () => {
  const empresaId = await createEmpresa("requestinconsistente");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "114");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "114" });

  // Corrompe deliberadamente a solicitação já aprovada para SUPERSEDED — cenário que nunca deveria acontecer via fluxo normal, mas o service precisa recusar mesmo assim.
  await pool.query(`UPDATE automacao_solicitacoes_aprovacao SET status = 'SUPERSEDED' WHERE automacao_execucao_id = $1`, [execucao.id]);

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "APPROVAL_INCONSISTENT");
  assert.equal(result.code, "DISTRIBUTION_APPROVAL_INCONSISTENT");
  assert.equal(emailClient.calls.length, 0);
  void approver;
});

// -------------------------------------------------------------------- destinatários

test("sem destinatário TO ativo (só CC, ou nenhum) falha com DISTRIBUTION_NO_PRIMARY_RECIPIENT", async () => {
  const empresaId = await createEmpresa("semTO");
  const config = await createConfig(empresaId);
  await createApprover(config, "200");
  await createRecipient(config, { tipo: "CC", email: "copia@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "200" });

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NO_PRIMARY_RECIPIENT");
  assert.equal(result.code, "DISTRIBUTION_NO_PRIMARY_RECIPIENT");
  assert.equal(emailClient.calls.length, 0);
});

test("TO válido envia; TO+CC envia para ambos; inativo é ignorado; e-mail inválido bloqueia", async () => {
  const empresaId = await createEmpresa("destinatariosvalidos");
  const config = await createConfig(empresaId);
  await createApprover(config, "201");
  await createRecipient(config, { tipo: "TO", email: "gestor1@example.com" });
  await createRecipient(config, { tipo: "CC", email: "gestor2@example.com" });
  await createRecipient(config, { tipo: "TO", email: "inativo@example.com", ativo: false });
  const execucao = await runToApproved(config, { telegramUserId: "201" });

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "SENT");
  assert.equal(emailClient.calls.length, 1);
  assert.deepEqual(emailClient.calls[0].to, ["gestor1@example.com"]);
  assert.deepEqual(emailClient.calls[0].cc, ["gestor2@example.com"]);
});

test("destinatário com e-mail inválido bloqueia toda a distribuição", async () => {
  const empresaId = await createEmpresa("emailinvalido");
  const config = await createConfig(empresaId);
  await createApprover(config, "202");
  await createRecipient(config, { tipo: "TO", email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "202" });
  await pool.query(`UPDATE automacao_destinatarios SET email = 'nao-eh-um-email' WHERE automacao_config_id = $1`, [config.id]);

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "INVALID_RECIPIENT_EMAIL");
  assert.equal(emailClient.calls.length, 0);
});

test("recipients_snapshot é persistido corretamente e mudança POSTERIOR na config nunca altera a distribuição histórica", async () => {
  const empresaId = await createEmpresa("snapshotdestinatarios");
  const config = await createConfig(empresaId);
  await createApprover(config, "203");
  await createRecipient(config, { tipo: "TO", email: "gestor1@example.com", nome: "Gestor Um" });
  const execucao = await runToApproved(config, { telegramUserId: "203" });

  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient: createFakeEmailClient(), driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "SENT");

  const { rows } = await pool.query(`SELECT recipients_snapshot FROM automacao_distribuicoes WHERE id = $1`, [result.distribuicaoId]);
  assert.deepEqual(rows[0].recipients_snapshot, [{ name: "Gestor Um", email: "gestor1@example.com", type: "TO" }]);

  await pool.query(`UPDATE automacao_destinatarios SET email = 'novo-email@example.com', nome = 'Outro Nome' WHERE automacao_config_id = $1`, [config.id]);
  const { rows: after } = await pool.query(`SELECT recipients_snapshot FROM automacao_distribuicoes WHERE id = $1`, [result.distribuicaoId]);
  assert.deepEqual(after[0].recipients_snapshot, [{ name: "Gestor Um", email: "gestor1@example.com", type: "TO" }], "snapshot histórico nunca muda retroativamente");
});

// -------------------------------------------------------------------- assunto/corpo

test("assunto/corpo default são usados quando a config não personaliza, com placeholders substituídos", async () => {
  const empresaId = await createEmpresa("subjectbodydefault");
  const config = await createConfig(empresaId, { projetoNome: "Obra Padrão" });
  await createApprover(config, "204");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "204" });

  const emailClient = createFakeEmailClient();
  await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  const sent = emailClient.calls[0];
  assert.ok(sent.subject.startsWith("Diário de Obra — Obra Padrão — "));
  assert.ok(sent.text.includes("Prezados, boa tarde!"));
  assert.ok(sent.text.includes("Obra Padrão"));
  assert.ok(!sent.subject.includes("{projeto}"), "placeholder deveria ter sido substituído");
});

test("assunto/corpo personalizados da config são usados com placeholders resolvidos", async () => {
  const empresaId = await createEmpresa("subjectbodycustom");
  const config = await createConfig(empresaId, {
    projetoNome: "Obra Customizada",
    emailConfig: { assunto: "D.O. {projeto} v{versao}", corpo: "Segue o relatório de {projeto}, ref. {referenciaContratual}." },
  });
  await createApprover(config, "205");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "205" });

  const emailClient = createFakeEmailClient();
  await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  const sent = emailClient.calls[0];
  assert.equal(sent.subject, "D.O. Obra Customizada v1");
  assert.ok(sent.text.includes("ref. Contrato 01/2026"));
});

// -------------------------------------------------------------------- anexos

test("Excel e PDF corretos são anexados com MIME e nome preservados da versão aprovada", async () => {
  const empresaId = await createEmpresa("anexoscorretos");
  const config = await createConfig(empresaId);
  await createApprover(config, "206");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "206" });

  const { rows: docRows } = await pool.query(`SELECT excel_arquivo_id, pdf_arquivo_id FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  const { rows: arquivoRows } = await pool.query(`SELECT id, tipo, nome_arquivo, mime_type FROM automacao_arquivos WHERE id = ANY($1::int[])`, [[docRows[0].excel_arquivo_id, docRows[0].pdf_arquivo_id]]);
  const excelArquivo = arquivoRows.find((a) => a.tipo === "EXCEL");
  const pdfArquivo = arquivoRows.find((a) => a.tipo === "PDF");

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "SENT");

  const attachments = emailClient.calls[0].attachments;
  assert.equal(attachments.length, 2);
  const sentExcel = attachments.find((a) => a.contentType === excelArquivo.mime_type);
  const sentPdf = attachments.find((a) => a.contentType === pdfArquivo.mime_type);
  assert.equal(sentExcel.filename, excelArquivo.nome_arquivo);
  assert.equal(sentPdf.filename, pdfArquivo.nome_arquivo);
});

test("versão REJEITADA/antiga nunca é anexada — só a versão explicitamente aprovada, mesmo após regenerar (Seção 50)", async () => {
  const empresaId = await createEmpresa("versaonuncaerrada");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "207");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToDocumentReady(config);
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows: solV1 } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solV1[0].id, "REGENERATE")) });
  const regenResult = await regenerateAndResendForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(regenResult.novaVersao, 2);
  const { rows: solV2 } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1 AND versao_documento = 2`, [execucao.id]);
  await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solV2[0].id, "APPROVE")) });

  const { rows: docV2 } = await pool.query(`SELECT excel_arquivo_id FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1 AND versao = 2`, [execucao.id]);
  const { rows: arquivoV2 } = await pool.query(`SELECT nome_arquivo FROM automacao_arquivos WHERE id = $1`, [docV2[0].excel_arquivo_id]);

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "SENT");
  assert.equal(result.versao, 2);
  const excelAttachment = emailClient.calls[0].attachments.find((a) => a.filename.endsWith(".xlsx"));
  assert.equal(excelAttachment.filename, arquivoV2[0].nome_arquivo, "só o Excel da v2 (aprovada) deveria ser anexado, nunca o da v1");
});

test("arquivo de OUTRO tenant nunca é anexado — resolução é sempre tenant-safe (Seção 24)", async () => {
  const empresaA = await createEmpresa("tenantAanexo");
  const empresaB = await createEmpresa("tenantBanexo");
  const configA = await createConfig(empresaA);
  const configB = await createConfig(empresaB);
  await createApprover(configA, "208");
  await createRecipient(configA, { email: "gestor@example.com" });
  const execucaoA = await runToApproved(configA, { telegramUserId: "208" });
  const execucaoB = await runToDocumentReady(configB);

  const { rows: docARows } = await pool.query(`SELECT id FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucaoA.id]);
  const { rows: arquivoBRows } = await pool.query(`SELECT id FROM automacao_arquivos WHERE automacao_execucao_id = $1 AND tipo = 'EXCEL'`, [execucaoB.id]);
  await pool.query(`UPDATE automacao_execucao_documentos SET excel_arquivo_id = $1 WHERE id = $2`, [arquivoBRows[0].id, docARows[0].id]);

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucaoA.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "ERROR");
  assert.equal(result.code, "DISTRIBUTION_FILE_NOT_FOUND");
  assert.equal(emailClient.calls.length, 0);
});

test("limite individual de anexo bloqueia sem enviar parcialmente", async () => {
  const empresaId = await createEmpresa("limiteindividual");
  const config = await createConfig(empresaId);
  await createApprover(config, "209");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "209" });

  const original = process.env.AUTOMATION_EMAIL_MAX_ATTACHMENT_BYTES;
  process.env.AUTOMATION_EMAIL_MAX_ATTACHMENT_BYTES = "2";
  try {
    const emailClient = createFakeEmailClient();
    const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient({ downloadSizeBytes: 4 }) });
    assert.equal(result.outcome, "ERROR_RECOVERABLE");
    assert.equal(result.code, "DISTRIBUTION_ATTACHMENT_TOO_LARGE");
    assert.equal(emailClient.calls.length, 0, "nunca envia parcialmente");
  } finally {
    if (original === undefined) delete process.env.AUTOMATION_EMAIL_MAX_ATTACHMENT_BYTES;
    else process.env.AUTOMATION_EMAIL_MAX_ATTACHMENT_BYTES = original;
  }
});

test("limite total de anexos bloqueia mesmo quando cada arquivo individualmente está dentro do limite", async () => {
  const empresaId = await createEmpresa("limitetotal");
  const config = await createConfig(empresaId);
  await createApprover(config, "210");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "210" });

  const originalIndividual = process.env.AUTOMATION_EMAIL_MAX_ATTACHMENT_BYTES;
  const originalTotal = process.env.AUTOMATION_EMAIL_MAX_TOTAL_ATTACHMENT_BYTES;
  process.env.AUTOMATION_EMAIL_MAX_ATTACHMENT_BYTES = "1000";
  process.env.AUTOMATION_EMAIL_MAX_TOTAL_ATTACHMENT_BYTES = "6";
  try {
    const emailClient = createFakeEmailClient();
    const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient({ downloadSizeBytes: 4 }) });
    assert.equal(result.outcome, "ERROR_RECOVERABLE");
    assert.equal(result.code, "DISTRIBUTION_ATTACHMENT_TOO_LARGE");
    assert.equal(emailClient.calls.length, 0);
  } finally {
    if (originalIndividual === undefined) delete process.env.AUTOMATION_EMAIL_MAX_ATTACHMENT_BYTES;
    else process.env.AUTOMATION_EMAIL_MAX_ATTACHMENT_BYTES = originalIndividual;
    if (originalTotal === undefined) delete process.env.AUTOMATION_EMAIL_MAX_TOTAL_ATTACHMENT_BYTES;
    else process.env.AUTOMATION_EMAIL_MAX_TOTAL_ATTACHMENT_BYTES = originalTotal;
  }
});

// -------------------------------------------------------------- caminho feliz / estados / idempotência

test("caminho feliz: claim APPROVED->SENDING->SENT, provider/messageId persistidos, evento completo", async () => {
  const empresaId = await createEmpresa("caminhofeliz");
  const config = await createConfig(empresaId);
  await createApprover(config, "300");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "300" });

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "SENT");
  assert.ok(result.providerMessageId);

  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "SENT");

  const { rows } = await pool.query(`SELECT * FROM automacao_distribuicoes WHERE id = $1`, [result.distribuicaoId]);
  assert.equal(rows[0].status, "SENT");
  assert.equal(rows[0].provider, "fake-smtp");
  assert.ok(rows[0].provider_message_id);
  assert.ok(rows[0].sent_at);

  const { rows: eventos } = await pool.query(`SELECT tipo_evento FROM automacao_eventos WHERE automacao_execucao_id = $1`, [execucao.id]);
  const tipos = eventos.map((e) => e.tipo_evento);
  assert.ok(tipos.includes("DISTRIBUTION_CREATED"));
  assert.ok(tipos.includes("DISTRIBUTION_SENDING_STARTED"));
  assert.ok(tipos.includes("DISTRIBUTION_EMAIL_SENT"));
});

test("Message-ID é estável/identificável e nunca depende de rede para existir", async () => {
  const empresaId = await createEmpresa("messageid");
  const config = await createConfig(empresaId);
  await createApprover(config, "301");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "301" });

  const emailClient = createFakeEmailClient();
  await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  const sent = emailClient.calls[0];
  assert.match(sent.messageId, /^<automacao-distribuicao-\d+@/);
});

test("chamada repetida depois de SENT retorna ALREADY_SENT, nunca reenvia", async () => {
  const empresaId = await createEmpresa("idempotenteenvio");
  const config = await createConfig(empresaId);
  await createApprover(config, "302");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "302" });

  const emailClient = createFakeEmailClient();
  const first = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  const second = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(first.outcome, "SENT");
  assert.equal(second.outcome, "ALREADY_SENT");
  assert.equal(emailClient.calls.length, 1);
});

test("falha temporária de envio deixa a distribuição recuperável — retry bem-sucedido reaproveita a MESMA linha", async () => {
  const empresaId = await createEmpresa("retrytemporario");
  const config = await createConfig(empresaId);
  await createApprover(config, "303");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "303" });

  const failing = createFailingEmailClient();
  const first = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient: failing, driveClient: createFakeGoogleDriveClient() });
  assert.equal(first.outcome, "ERROR_RECOVERABLE");
  assert.equal(first.code, "DISTRIBUTION_EMAIL_SEND_FAILED");

  const midway = await getExecucao(config.id);
  assert.equal(midway.status, "ERROR");
  assert.equal(midway.erro_codigo, "DISTRIBUTION_EMAIL_SEND_FAILED");

  const working = createFakeEmailClient();
  const second = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient: working, driveClient: createFakeGoogleDriveClient() });
  assert.equal(second.outcome, "SENT");

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_distribuicoes WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(rows[0].c, 1, "retry bem-sucedido reaproveita a MESMA linha, nunca duplica");
});

test("falha definitiva (anexo ausente) nunca entra em loop — max attempts é respeitado", async () => {
  const empresaId = await createEmpresa("maxattempts");
  const config = await createConfig(empresaId);
  await createApprover(config, "304");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "304" });

  const failing = createFailingEmailClient();
  const originalMax = process.env.AUTOMATION_EMAIL_MAX_ATTEMPTS;
  process.env.AUTOMATION_EMAIL_MAX_ATTEMPTS = "2";
  try {
    await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient: failing, driveClient: createFakeGoogleDriveClient() });
    await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient: failing, driveClient: createFakeGoogleDriveClient() });
    const third = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient: failing, driveClient: createFakeGoogleDriveClient() });
    assert.equal(third.outcome, "NOT_ELIGIBLE", "após esgotar as tentativas, o claim para de aceitar retry automático");
    assert.equal(failing.calls.length, 2, "nunca deveria tentar uma terceira vez de verdade");
  } finally {
    if (originalMax === undefined) delete process.env.AUTOMATION_EMAIL_MAX_ATTEMPTS;
    else process.env.AUTOMATION_EMAIL_MAX_ATTEMPTS = originalMax;
  }
});

test("concorrência: duas chamadas SIMULTÂNEAS causam um único envio lógico", async () => {
  const empresaId = await createEmpresa("concorrenciaenvio");
  const config = await createConfig(empresaId);
  await createApprover(config, "305");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "305" });

  const emailClient = createFakeEmailClient();
  const [a, b] = await Promise.all([
    distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() }),
    distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() }),
  ]);
  const outcomes = [a.outcome, b.outcome].sort();
  assert.ok(outcomes.includes("SENT"));
  assert.ok(outcomes.some((o) => o === "IN_PROGRESS" || o === "ALREADY_SENT"));
  assert.equal(emailClient.calls.length, 1, "nunca deveria enviar duas vezes");

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_distribuicoes WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(rows[0].c, 1);
});

test("configuração de remetente ausente bloqueia com DISTRIBUTION_CONFIG_INCOMPLETE, nunca inventa remetente", async () => {
  const empresaId = await createEmpresa("semremetente");
  const config = await createConfig(empresaId);
  await createApprover(config, "306");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "306" });

  const original = process.env.AUTOMATION_EMAIL_FROM;
  delete process.env.AUTOMATION_EMAIL_FROM;
  try {
    const emailClient = createFakeEmailClient();
    const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
    assert.equal(result.outcome, "CONFIG_INCOMPLETE");
    assert.equal(result.code, "DISTRIBUTION_CONFIG_INCOMPLETE");
    assert.equal(emailClient.calls.length, 0);
  } finally {
    process.env.AUTOMATION_EMAIL_FROM = original;
  }
});

// -------------------------------------------------------------- entrada obsoleta (Seção 4/37/51)

test("late input após aprovação BLOQUEIA a distribuição — nenhum e-mail — mesmo teste negativo mais importante (Seção 51)", async () => {
  const empresaId = await createEmpresa("lateinputbloqueia");
  const config = await createConfig(empresaId);
  await createApprover(config, "400");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "400" });

  // Nova mensagem do mesmo dia chega DEPOIS da aprovação.
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9), text: "Mensagem tardia após aprovação." });
  const fresh = await getExecucao(config.id);
  assert.equal(fresh.needs_reprocessing, true, "pré-condição: o late input precisa ter marcado needs_reprocessing");

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: fresh.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "INPUT_STALE");
  assert.equal(result.code, "DISTRIBUTION_INPUT_STALE");
  assert.equal(emailClient.calls.length, 0, "ZERO chamadas ao emailClient");
});

test("needs_reprocessing=true sozinho já bloqueia, mesmo sem checar has_late_inputs", async () => {
  const empresaId = await createEmpresa("needsreprocessing");
  const config = await createConfig(empresaId);
  await createApprover(config, "401");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "401" });
  await pool.query(`UPDATE automacao_execucoes SET needs_reprocessing = true WHERE id = $1`, [execucao.id]);

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "INPUT_STALE");
  assert.equal(emailClient.calls.length, 0);
});

test("snapshot corrente divergente do snapshot do documento aprovado bloqueia (rebuild aconteceu depois)", async () => {
  const empresaId = await createEmpresa("snapshotdivergente");
  const config = await createConfig(empresaId);
  await createApprover(config, "402");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "402" });

  // Simula um rebuild que já limpou needs_reprocessing mas trocou o snapshot corrente.
  const { rows: novoSnapshot } = await pool.query(
    `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason)
     VALUES ($1,$2,99,'{}'::jsonb,'hash-fake-99','REBUILD') RETURNING id`,
    [empresaId, execucao.id]
  );
  await pool.query(`UPDATE automacao_execucoes SET current_snapshot_id = $1, needs_reprocessing = false, has_late_inputs = false WHERE id = $2`, [novoSnapshot[0].id, execucao.id]);

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "INPUT_STALE");
  assert.equal(emailClient.calls.length, 0);
});

test("depois de rebuild -> IA -> novo documento -> nova aprovação, a distribuição PODE ocorrer (novo snapshot, novo documento)", async () => {
  const empresaId = await createEmpresa("posreconstrucao");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "403");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "403" });
  const { rows: docV1Rows } = await pool.query(`SELECT id FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  const documentoV1Id = docV1Rows[0].id;

  await captureText({ config, messageId: Math.floor(Math.random() * 1e9), text: "Late input incorporado via rebuild." });
  const rebuildResult = await rebuildDailySnapshot({ pool, automacaoExecucaoId: execucao.id });
  assert.equal(rebuildResult.outcome, "READY", "o rebuild precisa conseguir suplantar um estágio pós-aprovação (Seção 4/37)");

  const { rows: msgRows } = await pool.query(`SELECT message_id FROM telegram_mensagens WHERE automacao_execucao_id = $1 ORDER BY message_id DESC LIMIT 1`, [execucao.id]);
  const aiResult = await processExecutionIntelligence({ pool, automacaoExecucaoId: execucao.id, aiClient: createFakeAiClient(String(msgRows[0].message_id)), driveClient: createFakeGoogleDriveClient() });
  assert.equal(aiResult.outcome, "READY");
  const docResult = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient: createFakeGoogleDriveClient() });
  assert.equal(docResult.outcome, "READY");
  // Um snapshot NOVO (do rebuild) é uma chave de versionamento nova em
  // documentGenerationService.js — o documento gerado para ele começa em
  // versao=1 dentro dessa chave, nunca reaproveita/continua a numeração do
  // snapshot anterior. A segurança da versão certa nunca depende do NÚMERO
  // — depende do automacao_documento_id exato, verificado abaixo.
  assert.equal(docResult.versao, 1);
  assert.notEqual(docResult.documentoId, documentoV1Id, "precisa ser um automacao_execucao_documentos DISTINTO do da v1 antiga");

  const telegramClient = createFakeTelegramBotClient();
  const sendResult = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(sendResult.outcome, "SENT");
  const { rows: solNovo } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_documento_id = $1`, [docResult.documentoId]);
  const approveResult = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solNovo[0].id, "APPROVE")) });
  assert.equal(approveResult.outcome, "APPROVED");

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "SENT");
  assert.equal(result.distribuicaoId && true, true);
  const { rows: distRows } = await pool.query(`SELECT automacao_documento_id FROM automacao_distribuicoes WHERE id = $1`, [result.distribuicaoId]);
  assert.equal(distRows[0].automacao_documento_id, docResult.documentoId, "a distribuição precisa apontar exatamente para o documento novo, nunca para o antigo (v1)");
});

// -------------------------------------------------------------------- multiempresa

test("multiempresa: distributeApprovedDocument com empresaId de outra empresa retorna NOT_FOUND", async () => {
  const empresaA = await createEmpresa("tenantA1dist");
  const empresaB = await createEmpresa("tenantB1dist");
  const configB = await createConfig(empresaB);
  await createApprover(configB, "500");
  await createRecipient(configB, { email: "gestor@example.com" });
  const execucaoB = await runToApproved(configB, { telegramUserId: "500" });

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, empresaId: empresaA, automacaoExecucaoId: execucaoB.id, emailClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NOT_FOUND");
  assert.equal(emailClient.calls.length, 0);
});

test("multiempresa: getDistributionStatusForEmpresa nunca vaza dados de outra empresa; SUPER_ADMIN (empresaId null-safe pattern) segue escopo normal quando informado", async () => {
  const empresaA = await createEmpresa("tenantA2dist");
  const empresaB = await createEmpresa("tenantB2dist");
  const configB = await createConfig(empresaB);
  await createApprover(configB, "501");
  await createRecipient(configB, { email: "gestor@example.com" });
  const execucaoB = await runToApproved(configB, { telegramUserId: "501" });
  await distributeApprovedDocument({ pool, automacaoExecucaoId: execucaoB.id, emailClient: createFakeEmailClient(), driveClient: createFakeGoogleDriveClient() });

  const statusB = await getDistributionStatusForEmpresa(pool, { empresaId: empresaB, automacaoExecucaoId: execucaoB.id });
  assert.equal(statusB.execution_status, "SENT");
  assert.equal(statusB.distribution_status, "SENT");
  assert.equal(statusB.recipient_count, 1);

  const statusFromA = await getDistributionStatusForEmpresa(pool, { empresaId: empresaA, automacaoExecucaoId: execucaoB.id });
  assert.equal(statusFromA, null);
});

// --------------------------------------------------------------------- segurança

test("nenhum evento de distribuição contém segredo/senha/hash/buffer (Seção 40)", async () => {
  const empresaId = await createEmpresa("eventosseguro");
  const config = await createConfig(empresaId);
  await createApprover(config, "600");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToApproved(config, { telegramUserId: "600" });
  await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient: createFakeEmailClient(), driveClient: createFakeGoogleDriveClient() });

  const { rows } = await pool.query(`SELECT dados FROM automacao_eventos WHERE automacao_execucao_id = $1 AND tipo_evento LIKE 'DISTRIBUTION%'`, [execucao.id]);
  const serialized = JSON.stringify(rows.map((r) => r.dados));
  assert.ok(!/senha|password|smtp_pass|auth_header/i.test(serialized));
  assert.ok(!/[0-9a-f]{200,}/i.test(serialized), "nunca deveria conter algo do tamanho de um buffer serializado");
});

test("aprovar via Telegram nunca chama o emailClient — nenhum e-mail automático (Seção 56/57)", async () => {
  const empresaId = await createEmpresa("aprovarnaoenviaemail");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "601");
  await createRecipient(config, { email: "gestor@example.com" });
  const execucao = await runToDocumentReady(config);
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);

  // handleApprovalCallback nem recebe um emailClient no seu contrato — a
  // prova estrutural já está em approvalEngineGeneric.test.js/documentApprovalService.js;
  // aqui confirmamos o comportamento observável: a execução vai a APPROVED
  // sem que NENHUM emailClient tenha sido construído/chamado neste teste.
  const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(rows[0].id, "APPROVE")) });
  assert.equal(result.outcome, "APPROVED");

  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "APPROVED", "aprovado, mas NUNCA enviado — distribuição é sempre um passo manual/administrativo separado (Seção 45)");
});

// ----------------------------------------------------------- sequência ponta a ponta (Seção 47)

test("sequência ponta a ponta com fakes: captura -> snapshot -> IA -> documento -> aprovação Telegram -> APPROVED -> distribuição -> SENT", async () => {
  const empresaId = await createEmpresa("pontaaponta");
  const config = await createConfig(empresaId, { projetoNome: "Obra Ponta a Ponta" });
  await createApprover(config, "700", "Fiscal Completo");
  await createRecipient(config, { tipo: "TO", email: "gestor1@example.com" });
  await createRecipient(config, { tipo: "CC", email: "gestor2@example.com" });

  const execucao = await runToApproved(config, { telegramUserId: "700" });
  assert.equal(execucao.status, "APPROVED");

  const emailClient = createFakeEmailClient();
  const result = await distributeApprovedDocument({ pool, automacaoExecucaoId: execucao.id, emailClient, driveClient: createFakeGoogleDriveClient() });

  assert.equal(result.outcome, "SENT");
  assert.equal(emailClient.calls.length, 1, "um único envio");
  const sent = emailClient.calls[0];
  assert.equal(sent.attachments.length, 2, "1 Excel + 1 PDF");
  assert.deepEqual(sent.to, ["gestor1@example.com"]);
  assert.deepEqual(sent.cc, ["gestor2@example.com"]);

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_distribuicoes WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(rows[0].c, 1, "uma única distribuição");

  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "SENT");
});
