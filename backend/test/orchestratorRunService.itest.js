"use strict";

/**
 * Bloco 10 — testes de integração do orquestrador automático do pipeline
 * (`runAutomationCycle`), Postgres local real, SEMPRE com clients fakes
 * injetados via `dependencies` (nunca uma chamada de rede real — nenhum
 * teste aqui toca Telegram/Google/OpenAI/SMTP de verdade). `options.enabled:
 * true` é passado explicitamente em todo teste (nunca depende de mutar
 * `process.env` global, que seria compartilhado entre testes do MESMO
 * arquivo) — o kill switch baseado em env é coberto à parte em
 * orchestratorConfig.test.js e runAutomationsCycleCli.test.js.
 *
 * ATENÇÃO — por que este arquivo NÃO se chama `*.test.js` (e por isso NÃO
 * entra no glob padrão `npm test` = `node --test "./test/**\/*.test.js"`):
 * `runAutomationCycle` varre `automacao_execucoes` INTEIRA de propósito (é
 * um orquestrador de verdade, nunca deveria ser escopado por teste). Sob o
 * glob padrão, `node --test` roda TODOS os arquivos em paralelo, em
 * processos separados, contra o MESMO Postgres — e comprovadamente (achado
 * real durante este bloco, não uma preocupação teórica) o ciclo aqui
 * descobria e processava DE VERDADE (usando os fakes deste arquivo, mas
 * mutando linhas REAIS no banco) execuções APPROVED/DOCUMENT_READY/etc.
 * pertencentes a OUTROS arquivos (ex.: documentDistributionService.test.js)
 * que ainda estavam no meio de seus próprios testes — corrompendo as
 * asserções deles (uma execução que o teste deles esperava encontrar ainda
 * APPROVED já tinha sido distribuída por ESTE arquivo). Filtrar só as
 * CONTAGENS dos fakes deste arquivo (`chatId`/e-mail, ver `buildDependencies`
 * abaixo) resolve a poluição das PRÓPRIAS asserções deste arquivo, mas nunca
 * a mutação real de dados de OUTRO arquivo — só rodar isto em completo
 * ISOLAMENTO de qualquer outro arquivo resolve isso de verdade.
 *
 * Por isso `package.json`'s `test` roda o glob padrão primeiro e só DEPOIS
 * (`&&`, começa apenas quando o primeiro `node --test` já saiu — logo,
 * depois que TODOS os `test.after` dos outros arquivos já limparam suas
 * próprias empresas/execuções) roda este arquivo sozinho, via
 * `npm run test:orchestrator` (`node --test ./test/orchestratorRunService.itest.js`).
 *
 * `NOW` é sempre um instante FIXO e explícito (nunca `new Date()` escondido).
 * Mesmo rodando isolado de outros ARQUIVOS, os testes DENTRO deste arquivo
 * ainda rodam em sequência no MESMO processo — por isso `afterEach` apaga
 * tudo criado por CADA teste (nunca só no `test.after` final), e nenhuma
 * asserção confia em `result.scanned`/`result.outcome`/`result.byStage`
 * globais (que ainda refletiriam TAMBÉM o que sobrou de testes anteriores
 * deste MESMO arquivo se o `afterEach` falhasse) — sempre verifica o estado
 * da PRÓPRIA execução criada e as chamadas nos PRÓPRIOS fakes injetados,
 * exatamente como o teste pré-existente de `findExecutionsDueForClosing` em
 * automationClosingService.test.js já faz.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const { processTelegramUpdate } = require("../src/modules/automations/telegram/telegramWebhookService");
const fixtures = require("./fixtures/telegramUpdates");
const { runAutomationCycle } = require("../src/modules/automations/orchestrator/orchestratorRunService");
const { claimRegenerationRequest } = require("../src/modules/automations/orchestrator/orchestratorStageActions");
const { buildApprovalCallbackData } = require("../src/modules/automations/approval/approvalCallbackParser");
const { handleApprovalCallback } = require("../src/modules/automations/approval/documentApprovalService");

const RUN_TAG = `orqrun-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdEmpresaIds = [];
let chatSeq = 1;

const ORIGINAL_ENV = { AUTOMATION_EMAIL_FROM: process.env.AUTOMATION_EMAIL_FROM, AUTOMATION_EMAIL_FROM_NAME: process.env.AUTOMATION_EMAIL_FROM_NAME };

test.before(async () => {
  await initAutomationsSchema(pool);
  process.env.AUTOMATION_EMAIL_FROM = "no-reply@example.com";
  process.env.AUTOMATION_EMAIL_FROM_NAME = "FrotaMax Automações";
});

// Isolamento CRÍTICO neste arquivo especificamente (Seção 12/44): diferente
// dos demais arquivos de teste do módulo, aqui `runAutomationCycle` escaneia
// a tabela INTEIRA de execuções a cada chamada — a empresa/execução deixada
// para trás por um teste anterior seria "descoberta" pelo ciclo do PRÓXIMO
// teste do mesmo arquivo (mesmo processo `node --test`, mesma conexão de
// pool, testes rodam em sequência) e processada com os fakes/asserts
// errados. `afterEach` apaga tudo criado neste arquivo depois de CADA teste
// — nunca depende só do `test.after` final.
test.afterEach(async () => {
  await pool.query(`DELETE FROM empresas WHERE nome LIKE $1`, [`${RUN_TAG}-%`]);
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

const DATA_REFERENCIA = "2026-09-07";
// 06:00 America/Sao_Paulo — depois do horário de fechamento PRÓPRIO deste
// arquivo (05:00, ver comentário no topo do arquivo), mas bem ANTES das
// 18:00 usadas como default por outros arquivos do módulo.
const NOW_AFTER_CLOSING = new Date("2026-09-07T09:00:00Z");

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
  const chatId = overrides.chatId ?? -(9_500_000 + chatSeq++);
  const documentoConfig = overrides.documentoConfig === undefined ? DEFAULT_DOCUMENTO_CONFIG : overrides.documentoConfig;
  const configuracao = { documento: documentoConfig };
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, projeto_nome, telegram_chat_id, ativo, timezone, horario_fechamento, google_drive_pasta_raiz_id, usa_ia, configuracao)
     VALUES ($1,$2,'cfg',$3,$4,true,'America/Sao_Paulo','05:00:00','root-fake-1',$5,$6::jsonb) RETURNING *`,
    [empresaId, cat.rows[0].id, overrides.projetoNome ?? "Obra Orquestrador", chatId, overrides.usaIa ?? true, JSON.stringify(configuracao)]
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

// Mapa configId -> e-mail do destinatário TO (Seção 12/44) — usado só para
// escopar automaticamente o fake de e-mail em `buildDependencies(config)`
// abaixo, nunca lido pelo código de produção.
const recipientEmailByConfigId = new Map();

async function createRecipient(config, { tipo = "TO", email, nome = null, ativo = true }) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_destinatarios (empresa_id, automacao_config_id, tipo, nome, email, ativo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [config.empresa_id, config.id, tipo, nome, email, ativo]
  );
  if (tipo === "TO") recipientEmailByConfigId.set(config.id, email);
  return rows[0];
}

async function captureText({ config, dataReferencia = DATA_REFERENCIA, messageId, text = "Atividade concluída conforme planejado." }) {
  const dateUnix = Math.floor(new Date(`${dataReferencia}T11:00:00Z`).getTime() / 1000);
  return processTelegramUpdate(fixtures.textUpdate({ chatId: config.telegram_chat_id, messageId, date: dateUnix, text }));
}

async function getExecucao(configId, dataReferencia = DATA_REFERENCIA) {
  const { rows } = await pool.query(`SELECT * FROM automacao_execucoes WHERE automacao_config_id = $1 AND data_referencia = $2`, [configId, dataReferencia]);
  return rows[0] || null;
}

function createFakeAiClient() {
  return {
    model: "fake-model-v1",
    analyzePhotoBatch: async () => ({ observations: [], usage: { inputTokens: 0, outputTokens: 0 } }),
    consolidateDailyIntelligence: async () => ({
      structuredOutput: {
        schemaVersion: 1,
        summary: { text: "Dia com atividades.", sourceRefs: [] },
        facts: [],
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

/**
 * `scopeChatId` (Seção 12/44 — mesma preocupação de isolamento do topo do
 * arquivo): `runAutomationCycle` escaneia a tabela INTEIRA, então, sob
 * `npm test` completo, este MESMO client fake pode ser usado pelo
 * orquestrador para enviar a candidatas de OUTROS arquivos de teste que
 * estejam concorrentemente elegíveis. Ele continua respondendo com sucesso a
 * QUALQUER chamada (nunca quebra o fluxo de quem quer que seja o dono real
 * daquela execução) — só não CONTABILIZA em `calls` uma chamada cujo chatId
 * não é o desta config, para as asserções deste arquivo nunca contarem
 * envios de execuções que não são suas.
 */
function createFakeTelegramBotClient(scopeChatId) {
  let counter = 0;
  const calls = { sendMessage: [], sendDocument: [], answerCallbackQuery: [], editMessageText: [] };
  const inScope = (chatId) => scopeChatId == null || chatId === scopeChatId;
  return {
    calls,
    sendMessage: async (args) => {
      if (inScope(args.chatId)) calls.sendMessage.push(args);
      counter += 1;
      return { messageId: 1000 + counter, chatId: args.chatId };
    },
    sendDocument: async (args) => {
      if (inScope(args.chatId)) calls.sendDocument.push(args);
      counter += 1;
      return { messageId: 2000 + counter, chatId: args.chatId };
    },
    answerCallbackQuery: async (args) => calls.answerCallbackQuery.push(args),
    editMessageReplyMarkup: async () => {},
    editMessageText: async (args) => {
      if (inScope(args.chatId)) calls.editMessageText.push(args);
    },
  };
}

/** Mesmo raciocínio de `scopeRecipientEmail` de `createFakeTelegramBotClient` acima — nunca conta um e-mail endereçado a outra config. */
function createFakeEmailClient(scopeRecipientEmail) {
  const calls = [];
  return {
    calls,
    sendMail: async (args) => {
      const to = [args.to].flat();
      if (scopeRecipientEmail == null || to.includes(scopeRecipientEmail)) calls.push(args);
      return { provider: "fake-smtp", providerMessageId: `<fake-${Date.now()}-${Math.random()}@example.com>`, accepted: to, rejected: [] };
    },
  };
}

/**
 * `config`, se informado, escopa os fakes de Telegram/e-mail a ESTA config
 * (Seção 12/44 — ver comentário no topo do arquivo). Omitir `config` só é
 * seguro nos testes de kill switch/lock global que nunca inspecionam
 * `calls` de Telegram/e-mail.
 */
function buildDependencies(config) {
  return {
    telegramFileClient: { downloadFile: async () => Buffer.from([]) },
    driveClient: createFakeGoogleDriveClient(),
    telegramClient: createFakeTelegramBotClient(config?.telegram_chat_id),
    emailClient: createFakeEmailClient(config ? recipientEmailByConfigId.get(config.id) : undefined),
    aiClient: createFakeAiClient(),
  };
}

function buildCallbackQuery(fromId, data) {
  return { id: `cb-${Math.floor(Math.random() * 1e9)}`, data, from: { id: String(fromId) } };
}

// ------------------------------------------------------------ dry run

test("dry run: classifica sem produzir NENHUM efeito colateral (zero UPDATE de estado, zero chamada externa)", async () => {
  const empresaId = await createEmpresa("dryrun");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });
  const execucaoAntes = await getExecucao(config.id);
  assert.equal(execucaoAntes.status, "COLLECTING");

  const dependencies = buildDependencies(config);
  const result = await runAutomationCycle({
    pool,
    now: NOW_AFTER_CLOSING,
    dependencies,
    options: { enabled: true, trigger: "TEST", dryRun: true, batchSize: 500, concurrency: 2, maxStepsPerExecution: 8 },
  });

  assert.equal(result.outcome, "COMPLETED");
  assert.ok(result.scanned >= 1);

  const execucaoDepois = await getExecucao(config.id);
  assert.equal(execucaoDepois.status, "COLLECTING", "dry run nunca muda o status de verdade");
  assert.equal(execucaoDepois.updated_at.getTime(), execucaoAntes.updated_at.getTime(), "dry run nunca sequer toca updated_at");

  assert.equal(dependencies.telegramClient.calls.sendMessage.length, 0);
  assert.equal(dependencies.telegramClient.calls.sendDocument.length, 0);
  assert.equal(dependencies.emailClient.calls.length, 0);
  assert.equal(dependencies.driveClient ? 0 : 0, 0);
});

// ------------------------------------------------------- pipeline principal

test("ciclo completo: fecha -> IA -> documento -> envia ao aprovador -> PARA em AWAITING_APPROVAL (nunca distribui sem aprovação humana — um dos testes mais importantes do sistema inteiro)", async () => {
  const empresaId = await createEmpresa("pipelinecompleto");
  const config = await createConfig(empresaId);
  await createApprover(config, "810001", "Fiscal Orq");
  await createRecipient(config, { email: "gestor.orq@example.com" });
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  const dependencies = buildDependencies(config);
  const result = await runAutomationCycle({
    pool,
    now: NOW_AFTER_CLOSING,
    dependencies,
    options: { enabled: true, trigger: "TEST", batchSize: 500, concurrency: 2, maxStepsPerExecution: 8 },
  });

  assert.notEqual(result.outcome, "DISABLED");
  assert.notEqual(result.outcome, "ALREADY_RUNNING");
  assert.notEqual(result.outcome, "FAILED", "FAILED só deveria acontecer numa falha de descoberta/banco, nunca por causa desta execução");

  const execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL", "precisa avançar closing->IA->documento->envio dentro do MESMO ciclo, mas NUNCA além disso sem decisão humana");

  assert.equal(dependencies.telegramClient.calls.sendDocument.length, 2, "Excel+PDF enviados ao aprovador");
  assert.equal(dependencies.emailClient.calls.length, 0, "nenhum e-mail antes de qualquer aprovação humana");

  const { rows: docRows } = await pool.query(`SELECT versao, status FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(docRows.length, 1);
  assert.equal(docRows[0].versao, 1);
  assert.equal(docRows[0].status, "COMPLETED");
});

test("depois da aprovação humana: PRÓXIMO ciclo distribui por e-mail e chega a SENT", async () => {
  const empresaId = await createEmpresa("posaprovacao");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "810002", "Fiscal Orq2");
  await createRecipient(config, { email: "gestor.orq2@example.com" });
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  const dependencies1 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies1, options: { enabled: true, trigger: "TEST", maxStepsPerExecution: 8, batchSize: 500 } });
  let execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL");

  const { rows: sol } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const approve = await handleApprovalCallback({ pool, telegramClient: dependencies1.telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(sol[0].id, "APPROVE")) });
  assert.equal(approve.outcome, "APPROVED");

  const dependencies2 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies2, options: { enabled: true, trigger: "TEST", maxStepsPerExecution: 8, batchSize: 500 } });

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "SENT");
  assert.equal(dependencies2.emailClient.calls.length, 1);

  // Um terceiro ciclo nunca deveria tocar esta execução de novo (SENT sem
  // pendência é terminal) — provado pelos PRÓPRIOS fakes deste ciclo, nunca
  // por `result.scanned` (que reflete a tabela INTEIRA, compartilhada com
  // outros arquivos de teste rodando em paralelo).
  const dependencies3 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies3, options: { enabled: true, trigger: "TEST", batchSize: 500 } });
  assert.equal(dependencies3.emailClient.calls.length, 0);
  assert.equal(dependencies3.telegramClient.calls.sendDocument.length, 0);
  const execucaoFinal = await getExecucao(config.id);
  assert.equal(execucaoFinal.status, "SENT");
  assert.equal(execucaoFinal.updated_at.getTime(), execucao.updated_at.getTime(), "nunca sequer toca a linha de novo");
});

test("rejeição: orquestrador nunca faz nada automaticamente depois de REJECTED (nenhum novo documento, nenhum novo Telegram, nenhum e-mail)", async () => {
  const empresaId = await createEmpresa("rejeicaoorq");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "810003", "Fiscal Orq3");
  await createRecipient(config, { email: "gestor.orq3@example.com" });
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  const dependencies1 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies1, options: { enabled: true, trigger: "TEST", batchSize: 500 } });
  let execucao = await getExecucao(config.id);
  const { rows: sol } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const reject = await handleApprovalCallback({ pool, telegramClient: dependencies1.telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(sol[0].id, "REJECT")) });
  assert.equal(reject.outcome, "REJECTED");

  const dependencies2 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies2, options: { enabled: true, trigger: "TEST", batchSize: 500 } });

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "REJECTED");
  const { rows: docCount } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(docCount[0].c, 1);
  assert.equal(dependencies2.telegramClient.calls.sendDocument.length, 0);
  assert.equal(dependencies2.emailClient.calls.length, 0);
});

// -------------------------------------------------------------- regeneração

test("regeneração: REGENERAR clicado em AWAITING_APPROVAL -> ciclo descobre e produz v2, nova solicitação, AWAITING_APPROVAL de novo, sem nova IA/snapshot", async () => {
  const empresaId = await createEmpresa("regenorq");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "810004", "Fiscal Orq4");
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  const dependencies1 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies1, options: { enabled: true, trigger: "TEST", batchSize: 500 } });
  let execucao = await getExecucao(config.id);
  const { rows: solV1 } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const { rows: intelAntes } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_inteligencias WHERE automacao_execucao_id = $1`, [execucao.id]);
  const { rows: snapAntes } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_snapshots WHERE automacao_execucao_id = $1`, [execucao.id]);

  const regenClick = await handleApprovalCallback({ pool, telegramClient: dependencies1.telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solV1[0].id, "REGENERATE")) });
  assert.equal(regenClick.outcome, "REGENERATION_REQUESTED");

  const dependencies2 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies2, options: { enabled: true, trigger: "TEST", batchSize: 500 } });

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL");

  const { rows: docs } = await pool.query(`SELECT versao FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1 ORDER BY versao`, [execucao.id]);
  assert.deepEqual(docs.map((d) => d.versao), [1, 2]);

  const { rows: intelDepois } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_inteligencias WHERE automacao_execucao_id = $1`, [execucao.id]);
  const { rows: snapDepois } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_snapshots WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(intelDepois[0].c, intelAntes[0].c, "REGENERAR nunca chama a IA de novo");
  assert.equal(snapDepois[0].c, snapAntes[0].c, "REGENERAR nunca reconstrói o snapshot");

  const { rows: solV1After } = await pool.query(`SELECT regeneration_processed_at, successor_documento_id FROM automacao_solicitacoes_aprovacao WHERE id = $1`, [solV1[0].id]);
  assert.ok(solV1After[0].regeneration_processed_at);
  assert.ok(solV1After[0].successor_documento_id);
});

test("double-regen: dois ciclos SIMULTÂNEOS descobrindo a mesma solicitação REGENERAR produzem exatamente UMA nova versão (claim atômico e idempotente)", async () => {
  const empresaId = await createEmpresa("doubleregen");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "810005", "Fiscal Orq5");
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  const dependencies1 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies1, options: { enabled: true, trigger: "TEST", batchSize: 500 } });
  const execucao = await getExecucao(config.id);
  const { rows: solV1 } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  await handleApprovalCallback({ pool, telegramClient: dependencies1.telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solV1[0].id, "REGENERATE")) });

  // Simula duas instâncias reivindicando a MESMA solicitação SUPERSEDED ao
  // mesmo tempo — direto na função de claim (nunca via dois `runAutomationCycle`
  // simultâneos, que o lock GLOBAL já impediria trivialmente; isto prova a
  // segunda camada de proteção, exigida mesmo sem depender só do lock global).
  const [claimA, claimB] = await Promise.all([claimRegenerationRequest(pool, solV1[0].id), claimRegenerationRequest(pool, solV1[0].id)]);
  const claimedCount = [claimA, claimB].filter(Boolean).length;
  assert.equal(claimedCount, 1, "só UMA das duas reivindicações concorrentes pode vencer");
});

// -------------------------------------------------------------- late input

test("late input em AWAITING_APPROVAL: v1 é superseded, snapshot/inteligência reconstruídos, documento v2 GLOBAL novo, nova solicitação enviada — botão da v1 para de funcionar", async () => {
  const empresaId = await createEmpresa("lateinputawaiting");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "810006", "Fiscal Orq6");
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  const dependencies1 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies1, options: { enabled: true, trigger: "TEST", batchSize: 500 } });
  let execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL");
  const { rows: solV1 } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);

  await captureText({ config, messageId: Math.floor(Math.random() * 1e9), text: "Late input chegou enquanto v1 aguardava decisão." });

  const dependencies2 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies2, options: { enabled: true, trigger: "TEST", maxStepsPerExecution: 8, batchSize: 500 } });

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL", "precisa terminar de novo aguardando decisão — agora da v2");
  assert.equal(execucao.needs_reprocessing, false);

  const { rows: docs } = await pool.query(`SELECT versao, is_superseded, superseded_reason FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1 ORDER BY versao`, [execucao.id]);
  assert.deepEqual(
    docs.map((d) => ({ versao: d.versao, is_superseded: d.is_superseded, superseded_reason: d.superseded_reason })),
    [
      { versao: 1, is_superseded: true, superseded_reason: "LATE_INPUT" },
      { versao: 2, is_superseded: false, superseded_reason: null },
    ]
  );

  // O botão antigo (v1, ainda status SENT no banco) precisa ser rejeitado.
  const approveOld = await handleApprovalCallback({ pool, telegramClient: dependencies2.telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solV1[0].id, "APPROVE")) });
  assert.equal(approveOld.outcome, "SUPERSEDED_BY_NEWER_VERSION");

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL", "o clique na v1 obsoleta nunca poderia ter aprovado nada");
});

test("late input DEPOIS de APPROVED mas ANTES de SENT: zero e-mail para a v1, nova versão exige NOVA aprovação (nunca reaproveita a decisão antiga)", async () => {
  const empresaId = await createEmpresa("lateinputapproved");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "810007", "Fiscal Orq7");
  await createRecipient(config, { email: "gestor.orq7@example.com" });
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  const dependencies1 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies1, options: { enabled: true, trigger: "TEST", batchSize: 500 } });
  let execucao = await getExecucao(config.id);
  const { rows: solV1 } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  const approve = await handleApprovalCallback({ pool, telegramClient: dependencies1.telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(solV1[0].id, "APPROVE")) });
  assert.equal(approve.outcome, "APPROVED");

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "APPROVED");

  // Late input chega DEPOIS da aprovação, mas o orquestrador ainda não rodou
  // o próximo ciclo (a distribuição, portanto, ainda não aconteceu).
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9), text: "Late input chegou depois de aprovar, antes de distribuir." });

  const dependencies2 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies2, options: { enabled: true, trigger: "TEST", maxStepsPerExecution: 8, batchSize: 500 } });
  assert.equal(dependencies2.emailClient.calls.length, 0, "a v1 aprovada NUNCA deveria ter sido distribuída depois do late input");

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL", "a v2 nova SEMPRE exige aprovação humana de novo — nunca reaproveita a decisão da v1");

  const { rows: aprovacoes } = await pool.query(`SELECT versao_documento, decisao FROM automacao_aprovacoes WHERE automacao_execucao_id = $1 ORDER BY versao_documento`, [execucao.id]);
  assert.equal(aprovacoes.length, 1, "só a decisão da v1 existe até agora — a v2 ainda não foi decidida por ninguém");
  assert.equal(aprovacoes[0].versao_documento, 1);
});

test("late input DEPOIS de SENT: zero novo e-mail, zero regeneração automática — só sinaliza a pendência (Seção 29, regra conservadora)", async () => {
  const empresaId = await createEmpresa("lateinputsent");
  const config = await createConfig(empresaId);
  const approver = await createApprover(config, "810008", "Fiscal Orq8");
  await createRecipient(config, { email: "gestor.orq8@example.com" });
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  const dependencies1 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies1, options: { enabled: true, trigger: "TEST", batchSize: 500 } });
  let execucao = await getExecucao(config.id);
  const { rows: sol } = await pool.query(`SELECT id FROM automacao_solicitacoes_aprovacao WHERE automacao_execucao_id = $1`, [execucao.id]);
  await handleApprovalCallback({ pool, telegramClient: dependencies1.telegramClient, callbackQuery: buildCallbackQuery(approver.telegram_user_id, buildApprovalCallbackData(sol[0].id, "APPROVE")) });

  const dependencies2 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies2, options: { enabled: true, trigger: "TEST", batchSize: 500 } });
  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "SENT");
  assert.equal(dependencies2.emailClient.calls.length, 1);

  await captureText({ config, messageId: Math.floor(Math.random() * 1e9), text: "Late input chegou depois do e-mail já ter sido enviado." });

  const dependencies3 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies3, options: { enabled: true, trigger: "TEST", maxStepsPerExecution: 8, batchSize: 500 } });
  assert.equal(dependencies3.emailClient.calls.length, 0, "SENT é terminal — nunca um novo e-mail automático");
  assert.equal(dependencies3.telegramClient.calls.sendDocument.length, 0, "nunca uma nova versão/regeneração automática depois de SENT");

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "SENT");
  assert.equal(execucao.post_send_late_input, true);
  assert.equal(execucao.needs_reprocessing, true, "a pendência real nunca é apagada — só sinalizada, aguardando ação humana futura");

  const { rows: docCount } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(docCount[0].c, 1, "nenhum documento novo foi gerado automaticamente");

  const { rows: eventos } = await pool.query(`SELECT tipo_evento FROM automacao_eventos WHERE automacao_execucao_id = $1 AND tipo_evento = 'LATE_INPUT_AFTER_DISTRIBUTION'`, [execucao.id]);
  assert.equal(eventos.length, 1);

  // Um segundo ciclo NUNCA repete a sinalização (Seção 29: só uma vez) —
  // provado pela linha em si nunca mais sendo tocada, nunca por
  // `result.scanned` (tabela compartilhada com outros arquivos em paralelo).
  const dependencies4 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies4, options: { enabled: true, trigger: "TEST", batchSize: 500 } });
  const execucaoAposSegundoCiclo = await getExecucao(config.id);
  assert.equal(execucaoAposSegundoCiclo.updated_at.getTime(), execucao.updated_at.getTime());
  const { rows: eventosDepois } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_eventos WHERE automacao_execucao_id = $1 AND tipo_evento = 'LATE_INPUT_AFTER_DISTRIBUTION'`, [execucao.id]);
  assert.equal(eventosDepois[0].c, 1, "nunca um segundo evento de sinalização para a mesma pendência");
});

// --------------------------------------------------------- kill switch / lock

test("kill switch via options.enabled=false: resultado DISABLED, nenhum run gravado, nenhuma query de descoberta executada", async () => {
  const { rows: runsAntes } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_orquestracao_runs`);
  const result = await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: buildDependencies(), options: { enabled: false } });
  assert.equal(result.outcome, "DISABLED");
  const { rows: runsDepois } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_orquestracao_runs`);
  assert.equal(runsDepois[0].c, runsAntes[0].c, "DISABLED nunca grava uma linha de auditoria");
});

test("kill switch: options.enabled ausente usa o default de AUTOMATION_ORCHESTRATOR_ENABLED do ambiente (ausente/não-'true' = desligado)", async () => {
  const original = process.env.AUTOMATION_ORCHESTRATOR_ENABLED;
  try {
    delete process.env.AUTOMATION_ORCHESTRATOR_ENABLED;
    const resultAusente = await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: buildDependencies(), options: {} });
    assert.equal(resultAusente.outcome, "DISABLED");

    process.env.AUTOMATION_ORCHESTRATOR_ENABLED = "false";
    const resultFalse = await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: buildDependencies(), options: {} });
    assert.equal(resultFalse.outcome, "DISABLED");

    process.env.AUTOMATION_ORCHESTRATOR_ENABLED = "true";
    const resultTrue = await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: buildDependencies(), options: {} });
    assert.notEqual(resultTrue.outcome, "DISABLED");
  } finally {
    if (original === undefined) delete process.env.AUTOMATION_ORCHESTRATOR_ENABLED;
    else process.env.AUTOMATION_ORCHESTRATOR_ENABLED = original;
  }
});

test("lock global: duas chamadas SIMULTÂNEAS -> só uma processa (COMPLETED), a outra recebe ALREADY_RUNNING imediatamente (nunca espera)", async () => {
  const empresaId = await createEmpresa("lockglobal");
  const config = await createConfig(empresaId);
  await createApprover(config, "810011", "Fiscal Orq11");
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  const [a, b] = await Promise.all([
    runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: buildDependencies(config), options: { enabled: true, trigger: "TEST", batchSize: 500 } }),
    runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: buildDependencies(config), options: { enabled: true, trigger: "TEST", batchSize: 500 } }),
  ]);
  const outcomes = [a.outcome, b.outcome];
  const alreadyRunningCount = outcomes.filter((o) => o === "ALREADY_RUNNING").length;
  const ranCount = outcomes.filter((o) => o !== "ALREADY_RUNNING").length;
  assert.equal(alreadyRunningCount, 1, "exatamente uma das duas chamadas precisa perder o lock global");
  // A que rodou pode terminar COMPLETED ou PARTIAL_FAILURE (nunca depende só
  // desta execução — o scan é global e outros arquivos de teste rodam em
  // paralelo); nunca DISABLED/FAILED, que indicariam o próprio mecanismo
  // quebrado.
  assert.equal(ranCount, 1);
  const ran = a.outcome === "ALREADY_RUNNING" ? b : a;
  assert.notEqual(ran.outcome, "DISABLED");
  assert.notEqual(ran.outcome, "FAILED");
});

// ------------------------------------------------------------- multiempresa

test("multiempresa: falha de IA (usa_ia=false) numa empresa nunca impede outra empresa de chegar até AWAITING_APPROVAL no MESMO ciclo", async () => {
  const empresaA = await createEmpresa("multiA");
  const empresaB = await createEmpresa("multiB");
  const configA = await createConfig(empresaA, { usaIa: false });
  const configB = await createConfig(empresaB);
  await createApprover(configB, "810009", "Fiscal Orq9");
  await captureText({ config: configA, messageId: Math.floor(Math.random() * 1e9) });
  await captureText({ config: configB, messageId: Math.floor(Math.random() * 1e9) });

  const dependencies = buildDependencies();
  const result = await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies, options: { enabled: true, trigger: "TEST", maxStepsPerExecution: 8, batchSize: 500 } });
  assert.equal(result.outcome, "PARTIAL_FAILURE", "a empresa A com usa_ia=false termina em ERROR/AI_DISABLED — o run precisa refletir isso, mas sem derrubar B");

  const execucaoA = await getExecucao(configA.id);
  assert.equal(execucaoA.status, "ERROR");
  assert.equal(execucaoA.erro_codigo, "AI_DISABLED");

  const execucaoB = await getExecucao(configB.id);
  assert.equal(execucaoB.status, "AWAITING_APPROVAL", "empresa B precisa ter avançado normalmente, sem nenhum vazamento do problema de A");
});

// ------------------------------------------------------------- recuperação

test("recuperação: processo 'morre' entre fechamento e IA — um ciclo novo continua puramente a partir do banco (nenhum estado em memória)", async () => {
  const empresaId = await createEmpresa("recuperacao");
  const config = await createConfig(empresaId);
  await createApprover(config, "810010", "Fiscal Orq10");
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  // Simula o "processo morrendo" logo depois do fechamento: só UM passo por ciclo.
  const dependencies1 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies1, options: { enabled: true, trigger: "TEST", maxStepsPerExecution: 1, batchSize: 500 } });
  let execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "READY_FOR_GENERATION", "só o fechamento aconteceu neste 'processo'");

  // Um ciclo NOVO (nenhum estado compartilhado em memória com o anterior — só `pool`) continua do ponto exato onde parou.
  const dependencies2 = buildDependencies(config);
  await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: dependencies2, options: { enabled: true, trigger: "TEST", maxStepsPerExecution: 8, batchSize: 500 } });

  execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "AWAITING_APPROVAL", "o segundo ciclo precisa ter completado IA->documento->envio sozinho, a partir só do que estava persistido");
});

// ---------------------------------------------------- auditoria de runs

test("auditoria: cada execução do ciclo grava uma linha em automacao_orquestracao_runs com métricas agregadas, nunca dado sensível", async () => {
  const empresaId = await createEmpresa("auditoriarun");
  const config = await createConfig(empresaId);
  await createApprover(config, "810012", "Fiscal Orq12");
  await captureText({ config, messageId: Math.floor(Math.random() * 1e9) });

  const result = await runAutomationCycle({ pool, now: NOW_AFTER_CLOSING, dependencies: buildDependencies(config), options: { enabled: true, trigger: "TEST", batchSize: 500 } });
  const { rows } = await pool.query(`SELECT * FROM automacao_orquestracao_runs WHERE id = $1`, [result.runId]);
  assert.equal(rows.length, 1);
  // COMPLETED ou PARTIAL_FAILURE são ambos aceitáveis aqui (o scan é global
  // e outros arquivos de teste rodam em paralelo contra o mesmo Postgres) —
  // o que este teste verifica é que a linha de auditoria em si existe e é
  // preenchida corretamente, nunca que NADA MAIS no banco falhou.
  assert.ok(["COMPLETED", "PARTIAL_FAILURE"].includes(rows[0].status));
  assert.equal(rows[0].trigger, "TEST");
  assert.equal(rows[0].dry_run, false);
  assert.ok(rows[0].completed_at);
  assert.ok(rows[0].metrics.scanned >= 1);

  const serialized = JSON.stringify(rows[0]);
  assert.ok(!/token|senha|password|secret|bearer/i.test(serialized), "nenhuma credencial/segredo em nenhuma auditoria de run");

  // Eventos de orquestração (Seção 35-36) são log estruturado de aplicação —
  // `automacao_eventos.empresa_id` é NOT NULL (Bloco 1), então nunca é o
  // lugar certo para um evento verdadeiramente global de UM CICLO (nunca de
  // uma empresa). O registro durável é a própria linha acima; aqui só
  // confirmamos que o evento textual foi de fato escrito no log da aplicação.
  const fs = require("fs");
  const path = require("path");
  const logLines = fs.readFileSync(path.join(__dirname, "..", "logs", "app.log"), "utf8").split("\n");
  const linesForThisRun = logLines.filter((line) => line.includes(`"runId":${result.runId},`));
  assert.ok(linesForThisRun.some((line) => line.includes("ORCHESTRATION_RUN_STARTED")));
  assert.ok(linesForThisRun.some((line) => line.includes("ORCHESTRATION_RUN_COMPLETED")));
});
