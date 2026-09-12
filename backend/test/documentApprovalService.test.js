"use strict";

/**
 * Testes de integração do envio ao aprovador + aprovação humana via Telegram
 * (Bloco 8) — Postgres local real (advisory lock, claim atômico, concorrência,
 * UNIQUE de solicitação por documento não se provam com mocks). Os clients de
 * Telegram e Google Drive são SEMPRE fakes injetados — nenhuma chamada de
 * rede real em nenhum teste, nenhum e-mail é enviado em nenhum teste (o
 * módulo nunca implementa isso — Bloco 9).
 *
 * Usa o pipeline REAL dos Blocos 3-7B (webhook -> fechamento -> IA ->
 * documento) para chegar a uma execução DOCUMENT_READY com snapshot,
 * inteligência e documento de verdade — exatamente a pré-condição que o
 * Bloco 8 assume.
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
const {
  sendDocumentForApproval,
  handleApprovalCallback,
  regenerateAndResendForApproval,
  getApprovalStatusForEmpresa,
} = require("../src/modules/automations/approval/documentApprovalService");
const { buildApprovalCallbackData } = require("../src/modules/automations/approval/approvalCallbackParser");

const RUN_TAG = `apprsvc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

const DEFAULT_DOCUMENTO_CONFIG = {
  referenciaContratual: "Contrato 01/2026",
  local: "Canteiro Central",
  clienteRazaoSocial: "Cliente Teste LTDA",
  clienteEndereco: "Rua Exemplo, 100",
};

async function createConfig(empresaId, overrides = {}) {
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  const chatId = overrides.chatId ?? -(5_000_000 + chatSeq++);
  const documentoConfig = overrides.documentoConfig === undefined ? DEFAULT_DOCUMENTO_CONFIG : overrides.documentoConfig;
  const configuracao = documentoConfig ? { documento: documentoConfig } : {};
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, projeto_nome, telegram_chat_id, ativo, timezone, horario_fechamento, google_drive_pasta_raiz_id, usa_ia, configuracao)
     VALUES ($1,$2,'cfg',$3,$4,true,'America/Sao_Paulo','18:00:00',$5,true,$6::jsonb) RETURNING *`,
    [empresaId, cat.rows[0].id, overrides.projetoNome ?? "Obra Teste", chatId, overrides.raizId === undefined ? "root-fake-1" : overrides.raizId, JSON.stringify(configuracao)]
  );
  return rows[0];
}

async function createApprover(config, { telegramUserId, nome = "Aprovador", ativo = true }) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_aprovadores (empresa_id, automacao_config_id, nome, telegram_user_id, ativo) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [config.empresa_id, config.id, nome, telegramUserId, ativo]
  );
  return rows[0];
}

async function captureText({ config, dataReferencia = "2026-09-07", messageId, text = "texto" }) {
  const dateUnix = Math.floor(new Date(`${dataReferencia}T11:00:00Z`).getTime() / 1000);
  const update = fixtures.textUpdate({ chatId: config.telegram_chat_id, messageId, date: dateUnix, text });
  return processTelegramUpdate(update);
}

async function getExecucao(configId, dataReferencia = "2026-09-07") {
  const { rows } = await pool.query(`SELECT * FROM automacao_execucoes WHERE automacao_config_id = $1 AND data_referencia = $2`, [configId, dataReferencia]);
  return rows[0] || null;
}

function createFakeAiClient({ sourceRef } = {}) {
  return {
    model: "fake-model-v1",
    analyzePhotoBatch: async () => ({ observations: [], usage: { inputTokens: 0, outputTokens: 0 } }),
    consolidateDailyIntelligence: async () => ({
      structuredOutput: {
        schemaVersion: 1,
        summary: { text: "Dia com atividades registradas.", sourceRefs: sourceRef ? [sourceRef] : [] },
        facts: [{ id: "f1", category: "ACTIVITY", statement: "Atividade concluída conforme planejado.", sourceRefs: [sourceRef], evidenceType: "TEXT_EXPLICIT" }],
        photoObservations: [],
        conflicts: [],
        missingInformation: [],
        warnings: [],
      },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    }),
  };
}

function createFakeGoogleDriveClient({ preExisting = [] } = {}) {
  let counter = 0;
  const uploaded = [];
  const store = [...preExisting];
  function matches(file, appProperties) {
    return Object.entries(appProperties || {}).every(([k, v]) => file.appProperties?.[k] === v);
  }
  return {
    calls: { uploadFile: uploaded },
    ensureFolder: async ({ name }) => {
      counter += 1;
      return { id: `drive-folder-${name}-${counter}`, name, wasCreated: true };
    },
    findFileBySourceMetadata: async ({ parentId, appProperties }) => store.find((f) => f.parentId === parentId && matches(f, appProperties)) || null,
    uploadFile: async ({ parentId, name, mimeType, buffer, appProperties }) => {
      counter += 1;
      const file = { id: `uploaded-${counter}`, name, parentId, mimeType, size: String(buffer.length), appProperties };
      store.push(file);
      uploaded.push({ name, appProperties, size: buffer.length });
      return file;
    },
    downloadFileContent: async () => Buffer.from([1, 2, 3, 4]),
  };
}

/** Fake do bot Telegram — registra todas as chamadas para asserção; nunca bate na internet. */
function createFakeTelegramBotClient() {
  let counter = 0;
  const calls = { sendMessage: [], sendDocument: [], answerCallbackQuery: [], editMessageReplyMarkup: [], editMessageText: [] };
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
    answerCallbackQuery: async (args) => {
      calls.answerCallbackQuery.push(args);
    },
    editMessageReplyMarkup: async (args) => {
      calls.editMessageReplyMarkup.push(args);
    },
    editMessageText: async (args) => {
      calls.editMessageText.push(args);
    },
  };
}

/** Fake que sempre falha o sendMessage — simula indisponibilidade transitória do Telegram. */
function createFailingTelegramBotClient(failOn = "sendMessage") {
  const calls = { sendMessage: [], sendDocument: [] };
  return {
    calls,
    sendMessage: async (args) => {
      calls.sendMessage.push(args);
      if (failOn === "sendMessage") throw new Error("Falha simulada de rede do Telegram.");
      return { messageId: 1, chatId: args.chatId };
    },
    sendDocument: async (args) => {
      calls.sendDocument.push(args);
      if (failOn === "sendDocument") throw new Error("Falha simulada de rede do Telegram.");
      return { messageId: 2, chatId: args.chatId };
    },
    answerCallbackQuery: async () => {},
    editMessageReplyMarkup: async () => {},
    editMessageText: async () => {},
  };
}

function buildCallbackQuery({ id = `cb-${Math.floor(Math.random() * 1e9)}`, fromId, data }) {
  return { id, data, from: { id: String(fromId) } };
}

async function runToDocumentReady({ config, dataReferencia = "2026-09-07", text = "Atividade concluída." }) {
  const messageId = Math.floor(Math.random() * 1e9);
  await captureText({ config, dataReferencia, messageId, text });
  await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: dataReferencia });
  let execucao = await getExecucao(config.id, dataReferencia);
  const { rows: msgRows } = await pool.query(`SELECT message_id FROM telegram_mensagens WHERE automacao_execucao_id = $1`, [execucao.id]);
  const sourceRef = String(msgRows[0].message_id);
  const aiResult = await processExecutionIntelligence({ pool, automacaoExecucaoId: execucao.id, aiClient: createFakeAiClient({ sourceRef }), driveClient: createFakeGoogleDriveClient() });
  assert.equal(aiResult.outcome, "READY", "pré-condição: IA precisa completar");
  const docResult = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient: createFakeGoogleDriveClient() });
  assert.equal(docResult.outcome, "READY", "pré-condição do Bloco 8: documento precisa estar pronto (DOCUMENT_READY)");
  return getExecucao(config.id, dataReferencia);
}

// -------------------------------------------------------------- pré-condições

test("sendDocumentForApproval: documento não pronto (ainda READY_FOR_DOCUMENT) retorna DOCUMENT_NOT_READY", async () => {
  const empresaId = await createEmpresa("naopronto");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1 });
  const execucao = await getExecucao(config.id);

  const telegramClient = createFakeTelegramBotClient();
  const result = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "DOCUMENT_NOT_READY");
  assert.equal(telegramClient.calls.sendMessage.length, 0);
});

test("sendDocumentForApproval: config sem aprovador ativo retorna NO_APPROVER sem enviar nada", async () => {
  const empresaId = await createEmpresa("semaprovador");
  const config = await createConfig(empresaId);
  const execucao = await runToDocumentReady({ config });

  const telegramClient = createFakeTelegramBotClient();
  const result = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NO_APPROVER");
  assert.equal(telegramClient.calls.sendMessage.length, 0);
});

test("sendDocumentForApproval: aprovador INATIVO não conta — ainda retorna NO_APPROVER", async () => {
  const empresaId = await createEmpresa("aprovadorinativo");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "111", ativo: false });
  const execucao = await runToDocumentReady({ config });

  const telegramClient = createFakeTelegramBotClient();
  const result = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NO_APPROVER");
});

// --------------------------------------------------------------- caminho feliz

test("sendDocumentForApproval: caminho feliz cria a solicitação, envia resumo+Excel+PDF+botões e move a execução para AWAITING_APPROVAL", async () => {
  const empresaId = await createEmpresa("caminhofeliz");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "222" });
  const execucao = await runToDocumentReady({ config });

  const telegramClient = createFakeTelegramBotClient();
  const result = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });

  assert.equal(result.outcome, "SENT");
  assert.equal(telegramClient.calls.sendMessage.length, 2, "resumo + mensagem final com botões");
  assert.equal(telegramClient.calls.sendDocument.length, 2, "Excel + PDF");
  assert.deepEqual(
    telegramClient.calls.sendDocument.map((c) => c.filename).sort(),
    ["DO_v1.pdf", "DO_v1.xlsx"]
  );
  const finalMsg = telegramClient.calls.sendMessage[1];
  assert.ok(finalMsg.replyMarkup?.inline_keyboard?.[0]?.length === 3, "mensagem final precisa ter os 3 botões");

  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "AWAITING_APPROVAL");

  const { rows } = await pool.query(`SELECT * FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "SENT");
  assert.equal(rows[0].versao_documento, 1);
  assert.ok(rows[0].telegram_message_id);
});

test("resumo enviado nunca contém segredo/hash/id interno/e-mail", async () => {
  const empresaId = await createEmpresa("resumoseguro");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "223" });
  const execucao = await runToDocumentReady({ config });

  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });

  const resumo = telegramClient.calls.sendMessage[0].text;
  assert.ok(resumo.includes("Obra Teste"));
  assert.ok(!/[0-9a-f]{32,}/i.test(resumo));
  assert.ok(!resumo.includes("@"));
});

test("eventos de auditoria obrigatórios são registrados no envio bem-sucedido", async () => {
  const empresaId = await createEmpresa("eventosenvio");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "224" });
  const execucao = await runToDocumentReady({ config });

  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient: createFakeTelegramBotClient(), driveClient: createFakeGoogleDriveClient() });

  const { rows } = await pool.query(`SELECT tipo_evento FROM automacao_eventos WHERE automacao_execucao_id = $1 ORDER BY id`, [execucao.id]);
  const eventos = rows.map((r) => r.tipo_evento);
  assert.ok(eventos.includes("APPROVAL_REQUEST_CREATED"));
  assert.ok(eventos.includes("APPROVAL_TELEGRAM_SENT"));
});

// -------------------------------------------------------------- idempotência

test("sendDocumentForApproval: chamada repetida enquanto SENT retorna ALREADY_SENT, nunca reenvia", async () => {
  const empresaId = await createEmpresa("idempotenteenvio");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "225" });
  const execucao = await runToDocumentReady({ config });

  const telegramClient = createFakeTelegramBotClient();
  const first = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const second = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });

  assert.equal(first.outcome, "SENT");
  assert.equal(second.outcome, "ALREADY_SENT");
  assert.equal(telegramClient.calls.sendMessage.length, 2, "a segunda chamada nunca deveria reenviar");
});

test("falha do Telegram (rede) mantém a solicitação recuperável — retry bem-sucedido reaproveita a MESMA linha", async () => {
  const empresaId = await createEmpresa("retrytelegram");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "226" });
  const execucao = await runToDocumentReady({ config });

  const failing = createFailingTelegramBotClient("sendMessage");
  const first = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient: failing, driveClient: createFakeGoogleDriveClient() });
  assert.equal(first.outcome, "ERROR_RECOVERABLE");
  assert.equal(first.code, "APPROVAL_TELEGRAM_SEND_FAILED");

  const { rows: afterFail } = await pool.query(`SELECT status, attempts FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(afterFail[0].status, "ERROR");
  assert.equal(afterFail[0].attempts, 1);

  const working = createFakeTelegramBotClient();
  const second = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient: working, driveClient: createFakeGoogleDriveClient() });
  assert.equal(second.outcome, "SENT");

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(rows[0].count, 1, "retry bem-sucedido reaproveita a MESMA linha, nunca duplica");
});

test("concorrência: duas chamadas SIMULTÂNEAS de envio geram apenas UMA solicitação enviada", async () => {
  const empresaId = await createEmpresa("concorrenciaenvio");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "227" });
  const execucao = await runToDocumentReady({ config });

  const telegramClient = createFakeTelegramBotClient();
  const [a, b] = await Promise.all([
    sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() }),
    sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() }),
  ]);
  const outcomes = [a.outcome, b.outcome].sort();
  assert.deepEqual(outcomes, ["ALREADY_SENT", "SENT"]);

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(rows[0].count, 1);
});

// -------------------------------------------------------------------- arquivos

test("arquivo de OUTRA empresa nunca é enviado — resolução é sempre tenant-safe", async () => {
  const empresaA = await createEmpresa("tenantAfile");
  const empresaB = await createEmpresa("tenantBfile");
  const configA = await createConfig(empresaA);
  const configB = await createConfig(empresaB);
  await createApprover(configB, { telegramUserId: "228" });
  const execucaoB = await runToDocumentReady({ config: configB });

  // Simula um documento "vazado": um arquivo pertencente à empresa A é
  // referenciado por engano (nunca deveria acontecer via código normal —
  // este teste prova que, MESMO que aconteça, o resolvedor tenant-safe
  // rejeita o arquivo por não bater empresa_id/execução).
  const execucaoA = await runToDocumentReady({ config: configA });
  const { rows: docBRows } = await pool.query(`SELECT * FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucaoB.id]);
  const { rows: arquivoARows } = await pool.query(`SELECT id FROM automacao_arquivos WHERE automacao_execucao_id = $1 AND tipo = 'EXCEL'`, [execucaoA.id]);
  await pool.query(`UPDATE automacao_execucao_documentos SET excel_arquivo_id = $1 WHERE id = $2`, [arquivoARows[0].id, docBRows[0].id]);

  const telegramClient = createFakeTelegramBotClient();
  const result = await sendDocumentForApproval({ pool, automacaoExecucaoId: execucaoB.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "ERROR");
  assert.equal(result.code, "APPROVAL_FILE_NOT_FOUND");
  assert.equal(telegramClient.calls.sendMessage.length, 0, "nunca deveria sequer começar a enviar com um arquivo cross-tenant");
});

// -------------------------------------------------------------- multiempresa

test("multiempresa: sendDocumentForApproval com empresaId de outra empresa retorna NOT_FOUND", async () => {
  const empresaA = await createEmpresa("tenantA1appr");
  const empresaB = await createEmpresa("tenantB1appr");
  const configB = await createConfig(empresaB);
  await createApprover(configB, { telegramUserId: "229" });
  const execucaoB = await runToDocumentReady({ config: configB });

  const telegramClient = createFakeTelegramBotClient();
  const result = await sendDocumentForApproval({ pool, empresaId: empresaA, automacaoExecucaoId: execucaoB.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NOT_FOUND");
  assert.equal(telegramClient.calls.sendMessage.length, 0);
});

// ------------------------------------------------------------------ callbacks

test("callback APPROVE válido: aprovador ativo aprova, execução vai a APPROVED, botões removidos, nenhum e-mail", async () => {
  const empresaId = await createEmpresa("callbackapprove");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "300", nome: "Ana Aprovadora" });
  const execucao = await runToDocumentReady({ config });

  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const solicitacaoId = rows[0].id;

  const callback = buildCallbackQuery({ fromId: "300", data: buildApprovalCallbackData(solicitacaoId, "APPROVE") });
  const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery: callback });

  assert.equal(result.outcome, "APPROVED");
  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "APPROVED");
  assert.equal(telegramClient.calls.editMessageText.length, 1);
  assert.deepEqual(telegramClient.calls.editMessageText[0].replyMarkup, null);
  assert.ok(telegramClient.calls.editMessageText[0].text.includes("Ana Aprovadora"));
  assert.equal(telegramClient.calls.answerCallbackQuery.length, 1);

  const { rows: aprovacoes } = await pool.query(`SELECT decisao, versao_documento FROM automacao_aprovacoes WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(aprovacoes.length, 1);
  assert.equal(aprovacoes[0].decisao, "APROVADO");
  assert.equal(aprovacoes[0].versao_documento, 1);
});

test("callback REJECT válido: rejeita, execução vai a REJECTED, documentos/snapshot/inteligência preservados", async () => {
  const empresaId = await createEmpresa("callbackreject");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "301" });
  const execucao = await runToDocumentReady({ config });

  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const solicitacaoId = rows[0].id;

  const callback = buildCallbackQuery({ fromId: "301", data: buildApprovalCallbackData(solicitacaoId, "REJECT") });
  const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery: callback });

  assert.equal(result.outcome, "REJECTED");
  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "REJECTED");

  const { rows: docRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(docRows[0].c, 1, "documento nunca é apagado");
  const { rows: snapRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_snapshots WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(snapRows[0].c, 1, "snapshot nunca é apagado");
  const { rows: intelRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_inteligencias WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(intelRows[0].c, 1, "inteligência nunca é apagada");
});

test("callback com formato inválido é rejeitado com segurança (nunca lança, nunca altera estado)", async () => {
  const telegramClient = createFakeTelegramBotClient();
  const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "1", data: "lixo-invalido" }) });
  assert.equal(result.outcome, "INVALID_CALLBACK");
  assert.equal(telegramClient.calls.answerCallbackQuery.length, 1);
});

test("callback com namespace/ação desconhecida é ignorado com segurança (Seção 18 — não quebra callbacks de outro recurso)", async () => {
  const telegramClient = createFakeTelegramBotClient();
  const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "1", data: "outro_recurso:99:x" }) });
  assert.equal(result.outcome, "INVALID_CALLBACK");
});

test("callback para solicitação inexistente retorna NOT_FOUND com segurança", async () => {
  const telegramClient = createFakeTelegramBotClient();
  const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "1", data: buildApprovalCallbackData(999999999, "APPROVE") }) });
  assert.equal(result.outcome, "NOT_FOUND");
});

// -------------------------------------------------------- autorização (Seção 17)

test("usuário Telegram NÃO cadastrado como aprovador: não altera estado, não cria decisão, resposta segura", async () => {
  const empresaId = await createEmpresa("naoaprovador");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "400" });
  const execucao = await runToDocumentReady({ config });

  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const solicitacaoId = rows[0].id;

  const callback = buildCallbackQuery({ fromId: "999999", data: buildApprovalCallbackData(solicitacaoId, "APPROVE") });
  const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery: callback });

  assert.equal(result.outcome, "UNAUTHORIZED");
  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "AWAITING_APPROVAL", "estado nunca deveria mudar por uma tentativa não autorizada");
  const { rows: aprovacoes } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_aprovacoes WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(aprovacoes[0].c, 0);

  const { rows: eventos } = await pool.query(`SELECT tipo_evento FROM automacao_eventos WHERE automacao_execucao_id = $1 AND tipo_evento = 'APPROVAL_UNAUTHORIZED_ATTEMPT'`, [execucao.id]);
  assert.equal(eventos.length, 1);
});

test("aprovador ATIVO de OUTRA config nunca decide um documento que não é da sua config", async () => {
  const empresaId = await createEmpresa("aprovadoroutraconfig");
  const configA = await createConfig(empresaId);
  const configB = await createConfig(empresaId);
  await createApprover(configA, { telegramUserId: "401" }); // aprovador só de A
  await createApprover(configB, { telegramUserId: "402" }); // aprovador de B (config diferente)
  const execucaoA = await runToDocumentReady({ config: configA });

  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucaoA.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucaoA.id]);
  const solicitacaoId = rows[0].id;

  // "402" é aprovador ativo, mas da config B — nunca deveria conseguir decidir um documento da config A.
  const callback = buildCallbackQuery({ fromId: "402", data: buildApprovalCallbackData(solicitacaoId, "APPROVE") });
  const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery: callback });
  assert.equal(result.outcome, "UNAUTHORIZED");
});

test("aprovador desativado DEPOIS do envio não consegue mais decidir", async () => {
  const empresaId = await createEmpresa("aprovadordesativado");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, { telegramUserId: "403" });
  const execucao = await runToDocumentReady({ config });

  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  await pool.query(`UPDATE automacao_aprovadores SET ativo = false WHERE id = $1`, [approver.id]);

  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const callback = buildCallbackQuery({ fromId: "403", data: buildApprovalCallbackData(rows[0].id, "APPROVE") });
  const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery: callback });
  assert.equal(result.outcome, "UNAUTHORIZED");
});

// --------------------------------------------------------- primeira decisão vence

test("APROVAR duas vezes tem apenas um efeito (segunda chamada: já decidido)", async () => {
  const empresaId = await createEmpresa("duploaprove");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "500" });
  const execucao = await runToDocumentReady({ config });
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const solicitacaoId = rows[0].id;

  const cb = () => buildCallbackQuery({ fromId: "500", data: buildApprovalCallbackData(solicitacaoId, "APPROVE") });
  const first = await handleApprovalCallback({ pool, telegramClient, callbackQuery: cb() });
  const second = await handleApprovalCallback({ pool, telegramClient, callbackQuery: cb() });
  assert.equal(first.outcome, "APPROVED");
  assert.equal(second.outcome, "ALREADY_DECIDED");

  const { rows: aprovacoes } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_aprovacoes WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(aprovacoes[0].c, 1, "um único registro de decisão, nunca duplicado");
});

test("REJEITAR duas vezes tem apenas um efeito", async () => {
  const empresaId = await createEmpresa("duploreject");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "501" });
  const execucao = await runToDocumentReady({ config });
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const solicitacaoId = rows[0].id;

  const cb = () => buildCallbackQuery({ fromId: "501", data: buildApprovalCallbackData(solicitacaoId, "REJECT") });
  const first = await handleApprovalCallback({ pool, telegramClient, callbackQuery: cb() });
  const second = await handleApprovalCallback({ pool, telegramClient, callbackQuery: cb() });
  assert.equal(first.outcome, "REJECTED");
  assert.equal(second.outcome, "ALREADY_DECIDED");
});

test("concorrência: APROVAR e REJEITAR simultâneos na mesma versão — só uma decisão vence", async () => {
  const empresaId = await createEmpresa("concorrenciadecisao");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "600", nome: "A" });
  await createApprover(config, { telegramUserId: "601", nome: "B" });
  const execucao = await runToDocumentReady({ config });
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const solicitacaoId = rows[0].id;

  const [a, b] = await Promise.all([
    handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "600", data: buildApprovalCallbackData(solicitacaoId, "APPROVE") }) }),
    handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "601", data: buildApprovalCallbackData(solicitacaoId, "REJECT") }) }),
  ]);

  // Exatamente uma das duas decisões venceu (APPROVED ou REJECTED, tanto faz
  // qual — a ordem de chegada não é determinística), a outra encontra
  // ALREADY_DECIDED. Nunca as duas vencem, nunca as duas perdem.
  const winners = [a, b].filter((r) => r.outcome === "APPROVED" || r.outcome === "REJECTED");
  const losers = [a, b].filter((r) => r.outcome === "ALREADY_DECIDED");
  assert.equal(winners.length, 1, "exatamente uma decisão deveria vencer a corrida");
  assert.equal(losers.length, 1, "a outra deveria encontrar 'já decidido'");

  const { rows: aprovacoes } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_aprovacoes WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(aprovacoes[0].c, 1);

  const fresh = await getExecucao(config.id);
  assert.ok(fresh.status === "APPROVED" || fresh.status === "REJECTED");
});

// ------------------------------------------------------------------- regenerar

test("callback REGENERATE: marca a versão atual como superada, registra a decisão, nunca chama Drive/gera nova versão sozinho", async () => {
  const empresaId = await createEmpresa("regenerarcallback");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "700" });
  const execucao = await runToDocumentReady({ config });
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const solicitacaoId = rows[0].id;

  const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "700", data: buildApprovalCallbackData(solicitacaoId, "REGENERATE") }) });
  assert.equal(result.outcome, "REGENERATION_REQUESTED");

  const { rows: solRows } = await pool.query(`SELECT status FROM automacao_solicitacoes_aprovacao WHERE id = $1`, [solicitacaoId]);
  assert.equal(solRows[0].status, "SUPERSEDED");

  const { rows: aprovacoes } = await pool.query(`SELECT decisao FROM automacao_aprovacoes WHERE automacao_solicitacao_id = $1`, [solicitacaoId]);
  assert.equal(aprovacoes[0].decisao, "REGENERAR_SOLICITADO");

  // Ainda não existe v2 — a geração de fato é um passo SEPARADO (Seção 40).
  const { rows: docCount } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(docCount[0].c, 1, "REGENERAR pelo callback não deveria, sozinho, criar a v2 (isso é feito por regenerateAndResendForApproval)");
});

test("regenerateAndResendForApproval: gera v2 (mesmos snapshot/inteligência/config) e reenvia — v1 continua superseded/rejeitada, nunca aprovada", async () => {
  const empresaId = await createEmpresa("regenerarcompleto");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "701" });
  const execucao = await runToDocumentReady({ config });
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const solicitacaoV1Id = rows[0].id;
  await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "701", data: buildApprovalCallbackData(solicitacaoV1Id, "REGENERATE") }) });

  const driveClient = createFakeGoogleDriveClient();
  const regen = await regenerateAndResendForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient });
  assert.equal(regen.outcome, "REGENERATED");
  assert.equal(regen.novaVersao, 2);
  assert.equal(regen.sendResult.outcome, "SENT");

  const { rows: v2Rows } = await pool.query(`SELECT versao_documento, status FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1 ORDER BY versao_documento`, [execucao.id]);
  assert.equal(v2Rows.length, 2);
  assert.equal(v2Rows[0].versao_documento, 1);
  assert.equal(v2Rows[0].status, "SUPERSEDED");
  assert.equal(v2Rows[1].versao_documento, 2);
  assert.equal(v2Rows[1].status, "SENT");

  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "AWAITING_APPROVAL", "após o reenvio da v2, a execução volta a aguardar decisão");

  // Agora aprova a v2 — prova que a decisão de v1 nunca vale para v2.
  const { rows: v2Full } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1 AND versao_documento = 2`, [execucao.id]);
  const approveV2 = await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "701", data: buildApprovalCallbackData(v2Full[0].id, "APPROVE") }) });
  assert.equal(approveV2.outcome, "APPROVED");

  const { rows: allDecisions } = await pool.query(`SELECT versao_documento, decisao FROM automacao_aprovacoes WHERE automacao_execucao_id = $1 ORDER BY versao_documento`, [execucao.id]);
  assert.equal(allDecisions.length, 2);
  assert.equal(allDecisions[0].versao_documento, 1);
  assert.equal(allDecisions[0].decisao, "REGENERAR_SOLICITADO");
  assert.equal(allDecisions[1].versao_documento, 2);
  assert.equal(allDecisions[1].decisao, "APROVADO");
});

test("REGENERAR duas vezes cria apenas UMA nova versão, não duas", async () => {
  const empresaId = await createEmpresa("duploregenerar");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "702" });
  const execucao = await runToDocumentReady({ config });
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const solicitacaoId = rows[0].id;

  // Clicar REGENERAR duas vezes no MESMO botão/mensagem (Seção 26) — a
  // segunda tentativa nunca deveria registrar uma segunda decisão nem
  // marcar a solicitação superada de novo; o claim atômico garante isso.
  const cb = () => buildCallbackQuery({ fromId: "702", data: buildApprovalCallbackData(solicitacaoId, "REGENERATE") });
  const first = await handleApprovalCallback({ pool, telegramClient, callbackQuery: cb() });
  const second = await handleApprovalCallback({ pool, telegramClient, callbackQuery: cb() });
  assert.equal(first.outcome, "REGENERATION_REQUESTED");
  assert.equal(second.outcome, "ALREADY_DECIDED");

  const { rows: decisions } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_aprovacoes WHERE automacao_solicitacao_id = $1 AND decisao = 'REGENERAR_SOLICITADO'`, [solicitacaoId]);
  assert.equal(decisions[0].c, 1, "duplo clique em REGENERAR nunca deveria registrar duas decisões");

  // Só UM pedido de regeneração foi de fato registrado pelo callback acima —
  // por isso só uma chamada a regenerateAndResendForApproval é o
  // equivalente correto aqui; ela cria exatamente a v2 (nunca a v3).
  const driveClient = createFakeGoogleDriveClient();
  await regenerateAndResendForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient });

  const { rows: versions } = await pool.query(`SELECT DISTINCT versao FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(versions.length, 2, "um único pedido de regeneração deveria produzir exatamente a v2");
});

test("regenerateAndResendForApproval nunca chama a IA de novo nem rebuilda o snapshot", async () => {
  const empresaId = await createEmpresa("regeneranaoia");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "703" });
  const execucao = await runToDocumentReady({ config });
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "703", data: buildApprovalCallbackData(rows[0].id, "REGENERATE") }) });

  const { rows: intelBefore } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_inteligencias WHERE automacao_execucao_id = $1`, [execucao.id]);
  const { rows: snapBefore } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_snapshots WHERE automacao_execucao_id = $1`, [execucao.id]);

  await regenerateAndResendForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });

  const { rows: intelAfter } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_inteligencias WHERE automacao_execucao_id = $1`, [execucao.id]);
  const { rows: snapAfter } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_snapshots WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(intelAfter[0].c, intelBefore[0].c, "nenhuma inteligência nova deveria ser criada");
  assert.equal(snapAfter[0].c, snapBefore[0].c, "nenhum snapshot novo deveria ser criado");
});

// ------------------------------------------------------------ status/consulta

test("getApprovalStatusForEmpresa: reflete o status corrente e nunca vaza dados de outra empresa", async () => {
  const empresaA = await createEmpresa("statusA");
  const empresaB = await createEmpresa("statusB");
  const configB = await createConfig(empresaB);
  await createApprover(configB, { telegramUserId: "800", nome: "Carla" });
  const execucaoB = await runToDocumentReady({ config: configB });
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucaoB.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucaoB.id]);
  await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "800", data: buildApprovalCallbackData(rows[0].id, "APPROVE") }) });

  const statusB = await getApprovalStatusForEmpresa(pool, { empresaId: empresaB, automacaoExecucaoId: execucaoB.id });
  assert.equal(statusB.execution_status, "APPROVED");
  assert.equal(statusB.decisao, "APROVADO");
  assert.equal(statusB.aprovador_nome, "Carla");

  const statusFromA = await getApprovalStatusForEmpresa(pool, { empresaId: empresaA, automacaoExecucaoId: execucaoB.id });
  assert.equal(statusFromA, null, "nunca deveria vazar status de execução de outra empresa");
});

// -------------------------------------------------------------------- segurança

test("nenhum e-mail é enviado em nenhum momento do fluxo de aprovação (Bloco 8 nunca implementa isso)", async () => {
  const empresaId = await createEmpresa("nuncaemail");
  const config = await createConfig(empresaId);
  await createApprover(config, { telegramUserId: "900" });
  const execucao = await runToDocumentReady({ config });
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucao.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "900", data: buildApprovalCallbackData(rows[0].id, "APPROVE") }) });

  const { rows: eventos } = await pool.query(`SELECT tipo_evento FROM automacao_eventos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.ok(!eventos.some((e) => /email|smtp|mail/i.test(e.tipo_evento)), "nenhum evento relacionado a e-mail deveria existir");
});

test("multiempresa: regenerateAndResendForApproval com empresaId de outra empresa retorna NOT_FOUND", async () => {
  const empresaA = await createEmpresa("tenantA2appr");
  const empresaB = await createEmpresa("tenantB2appr");
  const configB = await createConfig(empresaB);
  await createApprover(configB, { telegramUserId: "901" });
  const execucaoB = await runToDocumentReady({ config: configB });
  const telegramClient = createFakeTelegramBotClient();
  await sendDocumentForApproval({ pool, automacaoExecucaoId: execucaoB.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  const { rows } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucaoB.id]);
  await handleApprovalCallback({ pool, telegramClient, callbackQuery: buildCallbackQuery({ fromId: "901", data: buildApprovalCallbackData(rows[0].id, "REGENERATE") }) });

  const result = await regenerateAndResendForApproval({ pool, empresaId: empresaA, automacaoExecucaoId: execucaoB.id, telegramClient, driveClient: createFakeGoogleDriveClient() });
  assert.equal(result.outcome, "NOT_FOUND");
});
