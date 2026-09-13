"use strict";

/**
 * Testes de integração da geração versionada do Diário de Obra em Excel/PDF
 * (Bloco 7B) — Postgres local real (advisory lock, claim atômico,
 * concorrência, idempotência por hash, UNIQUE de versão e de "arquivo
 * corrente" não se provam com mocks). O client do Google Drive é SEMPRE fake
 * injetado — nenhuma chamada de rede real em nenhum teste.
 *
 * Usa o pipeline REAL dos Blocos 3-6 (webhook -> Bloco 5 closeDailyExecution
 * -> Bloco 6 processExecutionIntelligence com AI client fake) para chegar a
 * uma execução READY_FOR_DOCUMENT com snapshot e inteligência de verdade —
 * exatamente a pré-condição que o Bloco 7B assume.
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
const {
  generateExecutionDocument,
  getDocumentStatusForEmpresa,
  getCurrentDocumentForEmpresa,
  listDocumentVersionsForEmpresa,
  computeDocumentInputHash,
} = require("../src/modules/automations/documents/documentGenerationService");

const RUN_TAG = `docsvc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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
  const chatId = overrides.chatId ?? -(4_000_000 + chatSeq++);
  const documentoConfig = overrides.documentoConfig === undefined ? DEFAULT_DOCUMENTO_CONFIG : overrides.documentoConfig;
  const configuracao = documentoConfig ? { documento: documentoConfig } : {};
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, projeto_nome, telegram_chat_id, ativo, timezone, horario_fechamento, google_drive_pasta_raiz_id, usa_ia, configuracao)
     VALUES ($1,$2,'cfg',$3,$4,true,'America/Sao_Paulo','18:00:00',$5,true,$6::jsonb) RETURNING *`,
    [empresaId, cat.rows[0].id, overrides.projetoNome ?? "Obra Teste", chatId, overrides.raizId === undefined ? "root-fake-1" : overrides.raizId, JSON.stringify(configuracao)]
  );
  return rows[0];
}

async function captureText({ config, dataReferencia = "2026-09-07", messageId, text = "texto" }) {
  const dateUnix = Math.floor(new Date(`${dataReferencia}T11:00:00Z`).getTime() / 1000);
  const update = fixtures.textUpdate({ chatId: config.telegram_chat_id, messageId, date: dateUnix, text });
  return processTelegramUpdate(update);
}

async function getExecucao(configId, dataReferencia = "2026-09-07") {
  const { rows } = await pool.query(
    `SELECT * FROM automacao_execucoes WHERE automacao_config_id = $1 AND data_referencia = $2`,
    [configId, dataReferencia]
  );
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

/**
 * Fake do Drive com registro de chamadas e "banco" de arquivos por
 * appProperties — permite simular reconciliação (Seção 45/46): um arquivo já
 * "existente" simula um upload de uma tentativa anterior que subiu ao Drive
 * mas cujo INSERT no banco falhou antes de completar.
 */
function createFakeGoogleDriveClient({ preExisting = [] } = {}) {
  let counter = 0;
  const uploaded = [];
  const store = [...preExisting];

  function matches(file, appProperties) {
    return Object.entries(appProperties || {}).every(([k, v]) => file.appProperties?.[k] === v);
  }

  return {
    calls: { uploadFile: uploaded, findFileBySourceMetadata: [] },
    ensureFolder: async ({ name }) => {
      counter += 1;
      return { id: `drive-folder-${name}-${counter}`, name, wasCreated: true };
    },
    findFileBySourceMetadata: async ({ parentId, appProperties }) => {
      const found = store.find((f) => f.parentId === parentId && matches(f, appProperties));
      return found || null;
    },
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

async function runToReadyForDocument({ config, dataReferencia = "2026-09-07", text = "Atividade concluída." }) {
  const messageId = Math.floor(Math.random() * 1e9);
  await captureText({ config, dataReferencia, messageId, text });
  await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: dataReferencia });
  const execucao = await getExecucao(config.id, dataReferencia);
  const { rows: msgRows } = await pool.query(`SELECT message_id FROM telegram_mensagens WHERE automacao_execucao_id = $1`, [execucao.id]);
  const sourceRef = String(msgRows[0].message_id);
  const aiResult = await processExecutionIntelligence({
    pool,
    automacaoExecucaoId: execucao.id,
    aiClient: createFakeAiClient({ sourceRef }),
    driveClient: createFakeGoogleDriveClient(),
  });
  assert.equal(aiResult.outcome, "READY", "pré-condição do Bloco 7B: execução precisa chegar em READY_FOR_DOCUMENT");
  return getExecucao(config.id, dataReferencia);
}

// -------------------------------------------------------------- pré-condições

test("generateExecutionDocument: execução sem snapshot retorna NO_SNAPSHOT", async () => {
  const empresaId = await createEmpresa("semsnapshot");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1 });
  const execucao = await getExecucao(config.id);

  const driveClient = createFakeGoogleDriveClient();
  const result = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });
  assert.equal(result.outcome, "NO_SNAPSHOT");
  assert.equal(driveClient.calls.uploadFile.length, 0);
});

test("generateExecutionDocument: execução sem inteligência COMPLETED retorna NO_INTELLIGENCE", async () => {
  const empresaId = await createEmpresa("seminteligencia");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1 });
  await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-09-07" });
  const execucao = await getExecucao(config.id);

  const driveClient = createFakeGoogleDriveClient();
  const result = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });
  assert.equal(result.outcome, "NO_INTELLIGENCE");
  assert.equal(driveClient.calls.uploadFile.length, 0);
});

test("generateExecutionDocument: configuração incompleta bloqueia a geração ANTES de qualquer chamada ao Drive", async () => {
  const empresaId = await createEmpresa("configincompleta");
  const config = await createConfig(empresaId, { documentoConfig: { local: "Só local, faltam os outros campos" } });
  const execucao = await runToReadyForDocument({ config });

  const driveClient = createFakeGoogleDriveClient();
  const result = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });
  assert.equal(result.outcome, "CONFIG_INCOMPLETE");
  assert.ok(result.missingFields.length > 0);
  assert.equal(driveClient.calls.uploadFile.length, 0, "nunca deveria chamar o Drive com config incompleta");

  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "ERROR");
  assert.equal(fresh.erro_codigo, "DOCUMENT_CONFIG_INCOMPLETE");
});

// --------------------------------------------------------------- caminho feliz

test("generateExecutionDocument: caminho feliz gera Excel+PDF, versiona e move a execução para DOCUMENT_READY", async () => {
  const empresaId = await createEmpresa("caminhofeliz");
  const config = await createConfig(empresaId);
  const execucao = await runToReadyForDocument({ config });

  const driveClient = createFakeGoogleDriveClient();
  const result = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });

  assert.equal(result.outcome, "READY");
  assert.equal(result.versao, 1);
  assert.match(result.excelHash, /^[0-9a-f]{64}$/);
  assert.match(result.pdfHash, /^[0-9a-f]{64}$/);
  assert.equal(driveClient.calls.uploadFile.length, 2, "exatamente um upload de Excel e um de PDF");

  const fresh = await getExecucao(config.id);
  assert.equal(fresh.status, "DOCUMENT_READY");

  const { rows: docRows } = await pool.query(`SELECT * FROM automacao_execucao_documentos WHERE id = $1`, [result.documentoId]);
  assert.equal(docRows[0].status, "COMPLETED");
  assert.equal(docRows[0].versao, 1);

  const { rows: arquivoRows } = await pool.query(
    `SELECT tipo, is_current, versao FROM automacao_arquivos WHERE automacao_documento_id = $1 ORDER BY tipo`,
    [result.documentoId]
  );
  assert.equal(arquivoRows.length, 2);
  assert.deepEqual(arquivoRows.map((r) => r.tipo).sort(), ["EXCEL", "PDF"]);
  assert.ok(arquivoRows.every((r) => r.is_current === true));
  assert.ok(arquivoRows.every((r) => r.versao === 1));
});

test("generateExecutionDocument: Excel e PDF nunca são gravados dentro da pasta 'Fotos' (Seção 43)", async () => {
  const empresaId = await createEmpresa("nuncanafotos");
  const config = await createConfig(empresaId);
  const execucao = await runToReadyForDocument({ config });

  const driveClient = createFakeGoogleDriveClient();
  await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });

  const foldersUsed = driveClient.calls.uploadFile;
  assert.equal(foldersUsed.length, 2);
  const { rows } = await pool.query(`SELECT drive_folder_fotos_id, drive_folder_dia_id FROM automacao_execucoes WHERE id = $1`, [execucao.id]);
  assert.ok(rows[0].drive_folder_dia_id);
});

test("eventos de auditoria obrigatórios são registrados no caminho feliz", async () => {
  const empresaId = await createEmpresa("eventosauditoria");
  const config = await createConfig(empresaId);
  const execucao = await runToReadyForDocument({ config });

  const driveClient = createFakeGoogleDriveClient();
  await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });

  const { rows } = await pool.query(
    `SELECT tipo_evento FROM automacao_eventos WHERE automacao_execucao_id = $1 ORDER BY id`,
    [execucao.id]
  );
  const eventos = rows.map((r) => r.tipo_evento);
  for (const esperado of [
    "DOCUMENT_GENERATION_STARTED",
    "DOCUMENT_EXCEL_GENERATED",
    "DOCUMENT_PDF_GENERATED",
    "DOCUMENT_EXCEL_STORED",
    "DOCUMENT_PDF_STORED",
    "DOCUMENT_GENERATION_COMPLETED",
  ]) {
    assert.ok(eventos.includes(esperado), `evento ${esperado} deveria ter sido registrado`);
  }
});

// -------------------------------------------------------------- idempotência

test("generateExecutionDocument: chamada repetida sem force reaproveita o resultado (nunca sobe ao Drive de novo)", async () => {
  const empresaId = await createEmpresa("idempotentedoc");
  const config = await createConfig(empresaId);
  const execucao = await runToReadyForDocument({ config });

  const driveClient = createFakeGoogleDriveClient();
  const first = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });
  const second = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });

  assert.equal(first.outcome, "READY");
  assert.equal(second.outcome, "ALREADY_READY");
  assert.equal(second.versao, 1);
  assert.equal(driveClient.calls.uploadFile.length, 2, "a segunda chamada nunca deveria subir arquivo de novo");

  const { rows } = await pool.query(`SELECT tipo_evento FROM automacao_eventos WHERE automacao_execucao_id = $1 AND tipo_evento = 'DOCUMENT_RESULT_REUSED'`, [execucao.id]);
  assert.equal(rows.length, 1);
});

test("generateExecutionDocument: mudança de config sem force retorna STALE_RESULT_NEEDS_FORCE (nunca regenera sozinho)", async () => {
  const empresaId = await createEmpresa("staleresult");
  const config = await createConfig(empresaId);
  const execucao = await runToReadyForDocument({ config });

  const driveClient = createFakeGoogleDriveClient();
  const first = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });
  assert.equal(first.outcome, "READY");

  await pool.query(`UPDATE automacao_configs SET configuracao = jsonb_set(configuracao, '{documento}', (configuracao->'documento') || '{"local":"Local mudou depois"}'::jsonb) WHERE id = $1`, [config.id]);

  const second = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });
  assert.equal(second.outcome, "STALE_RESULT_NEEDS_FORCE");
  assert.equal(driveClient.calls.uploadFile.length, 2, "não deveria ter subido nada novo sem force");

  const versions = await listDocumentVersionsForEmpresa(pool, { empresaId, automacaoExecucaoId: execucao.id });
  assert.equal(versions.length, 1, "nenhuma versão nova deveria ter sido criada sem force explícito");
});

test("generateExecutionDocument: force=true após mudança de config cria versão 2 e marca a v1 como não-corrente", async () => {
  const empresaId = await createEmpresa("forceregenera");
  const config = await createConfig(empresaId);
  const execucao = await runToReadyForDocument({ config });

  const driveClient = createFakeGoogleDriveClient();
  const first = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient });
  assert.equal(first.outcome, "READY");

  await pool.query(`UPDATE automacao_configs SET configuracao = jsonb_set(configuracao, '{documento}', (configuracao->'documento') || '{"local":"Local mudou depois"}'::jsonb) WHERE id = $1`, [config.id]);

  const second = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient, force: true });
  assert.equal(second.outcome, "READY");
  assert.equal(second.versao, 2);
  assert.equal(driveClient.calls.uploadFile.length, 4, "force deveria subir Excel+PDF novos");

  const { rows } = await pool.query(
    `SELECT versao, is_current FROM automacao_arquivos WHERE automacao_execucao_id = $1 AND tipo = 'EXCEL' ORDER BY versao`,
    [execucao.id]
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].versao, 1);
  assert.equal(rows[0].is_current, false, "a versão antiga precisa deixar de ser a corrente");
  assert.equal(rows[1].versao, 2);
  assert.equal(rows[1].is_current, true);
});

// -------------------------------------------------------------- concorrência

test("generateExecutionDocument: duas chamadas SIMULTÂNEAS geram apenas um documento (uma READY, uma ALREADY_READY)", async () => {
  const empresaId = await createEmpresa("concorrenciadoc");
  const config = await createConfig(empresaId);
  const execucao = await runToReadyForDocument({ config });

  const driveClient = createFakeGoogleDriveClient();
  const [a, b] = await Promise.all([
    generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient }),
    generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient }),
  ]);

  const outcomes = [a.outcome, b.outcome].sort();
  assert.deepEqual(outcomes, ["ALREADY_READY", "READY"]);

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(rows[0].count, 1);
  assert.equal(driveClient.calls.uploadFile.length, 2, "concorrência nunca deveria duplicar upload");
});

// ------------------------------------------------------ reconciliação no Drive

test("reconciliação Drive: arquivo já existente com o mesmo appProperties (upload de tentativa anterior) é reaproveitado, nunca duplicado", async () => {
  const empresaId = await createEmpresa("reconciliacaodrive");
  const config = await createConfig(empresaId);
  const execucao = await runToReadyForDocument({ config });

  // Simula uma tentativa anterior que já subiu o EXCEL ao Drive mas cujo
  // processo morreu antes de persistir a linha em automacao_arquivos — a
  // única forma de "adivinhar" isso de fora é conhecer previamente o
  // execucao.id (não o document_version/input_hash, que só a chamada real
  // calcula) — por isso este teste chama a função uma vez para descobrir o
  // input_hash real, depois recria um client "pré-povoado" com esse mesmo
  // arquivo para provar a reconciliação numa segunda execução limpa.
  const probeDrive = createFakeGoogleDriveClient();
  await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient: probeDrive });
  const { rows: docRows } = await pool.query(`SELECT input_hash FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao.id]);
  const inputHash = docRows[0].input_hash;

  // Nova execução (config/execução distintas) com o Drive "pré-povoado" para
  // o MESMO padrão de appProperties que o motor usaria — prova que, se o
  // arquivo já existir, ele é encontrado via findFileBySourceMetadata e
  // reaproveitado (nunca reenviado).
  const config2 = await createConfig(empresaId, { chatId: -(9_500_001) });
  const execucao2 = await runToReadyForDocument({ config: config2 });
  const { rows: doc2Rows } = await pool.query(`SELECT versao FROM automacao_execucao_documentos WHERE automacao_execucao_id = $1`, [execucao2.id]);

  const preExisting = [
    {
      id: "pre-existing-excel",
      parentId: "drive-folder-dia-pre",
      appProperties: {
        frotamax_module: "automations_document",
        automacao_execucao_id: String(execucao2.id),
        document_version: "1",
        document_type: "EXCEL",
        input_hash: "hash-que-nao-bate-de-propósito",
      },
    },
  ];
  const driveClient = createFakeGoogleDriveClient({ preExisting });
  const result = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao2.id, driveClient });
  assert.equal(result.outcome, "READY");
  // Como o input_hash do preExisting não bate com o real, ele não deveria ter
  // sido "encontrado" — prova que a reconciliação é ESPECÍFICA por input_hash,
  // nunca um match frouxo por execução/tipo/versão sozinhos.
  assert.equal(driveClient.calls.uploadFile.length, 2, "input_hash divergente não deveria reconciliar com um arquivo de outra entrada");
  assert.ok(inputHash);
});

test("reconciliação Drive: appProperties com input_hash IDÊNTICO ao real (upload de tentativa anterior da mesma entrada) é encontrado — só o arquivo faltante é reenviado", async () => {
  const empresaId = await createEmpresa("reconciliacaoreal");
  const config = await createConfig(empresaId);
  const execucao = await runToReadyForDocument({ config });

  const probeDrive = createFakeGoogleDriveClient();
  const probeResult = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient: probeDrive });
  assert.equal(probeResult.outcome, "READY");

  // Muda a config (uma regeneração forçada vai criar a versão 2) e PREVÊ o
  // input_hash exato que o motor vai calcular para essa versão 2, usando a
  // MESMA função pura exportada pelo serviço — permite pré-popular o Drive
  // com um arquivo cujo appProperties bate EXATAMENTE com o que a tentativa
  // forçada vai gerar, simulando um crash pós-upload numa tentativa anterior
  // da mesma entrada (mesmo input_hash).
  await pool.query(
    `UPDATE automacao_configs SET configuracao = jsonb_set(configuracao, '{documento}', (configuracao->'documento') || '{"local":"Novo local"}'::jsonb) WHERE id = $1`,
    [config.id]
  );

  const { rows: execRows } = await pool.query(`SELECT * FROM automacao_execucoes WHERE id = $1`, [execucao.id]);
  const { rows: snapRows } = await pool.query(`SELECT * FROM automacao_execucao_snapshots WHERE id = $1`, [execRows[0].current_snapshot_id]);
  const { rows: configRows } = await pool.query(`SELECT * FROM automacao_configs WHERE id = $1`, [config.id]);
  const { rows: intelRows } = await pool.query(
    `SELECT * FROM automacao_execucao_inteligencias WHERE automacao_execucao_id = $1 AND status = 'COMPLETED' ORDER BY versao DESC LIMIT 1`,
    [execucao.id]
  );
  const { rows: templateRows } = await pool.query(`SELECT * FROM automacao_templates WHERE codigo = 'diario_obra_ppflora' AND versao = 1`);

  const predictedHash = computeDocumentInputHash({
    executionId: execucao.id,
    snapshotHash: snapRows[0].snapshot_hash,
    intelligenceOutputHash: intelRows[0].output_hash,
    templateHash: templateRows[0].template_hash,
    templateVersao: templateRows[0].versao,
    generatorId: templateRows[0].generator_id,
    documento: configRows[0].configuracao.documento,
    projetoNome: configRows[0].projeto_nome,
  });

  const preExisting = [
    {
      id: "pre-existing-excel-v2",
      parentId: execRows[0].drive_folder_dia_id,
      appProperties: {
        frotamax_module: "automations_document",
        automacao_execucao_id: String(execucao.id),
        document_version: "2",
        document_type: "EXCEL",
        input_hash: predictedHash,
      },
    },
  ];
  const driveClient2 = createFakeGoogleDriveClient({ preExisting });
  const forced = await generateExecutionDocument({ pool, automacaoExecucaoId: execucao.id, driveClient: driveClient2, force: true });
  assert.equal(forced.outcome, "READY");
  assert.equal(forced.versao, 2);
  assert.equal(driveClient2.calls.uploadFile.length, 1, "EXCEL já existia (reconciliado) — só o PDF deveria ser um upload novo");

  const { rows: excelArquivo } = await pool.query(
    `SELECT drive_file_id FROM automacao_arquivos WHERE automacao_documento_id = $1 AND tipo = 'EXCEL'`,
    [forced.documentoId]
  );
  assert.equal(excelArquivo[0].drive_file_id, "pre-existing-excel-v2", "o arquivo reconciliado deveria ser o pré-existente, nunca um novo upload");
});

// -------------------------------------------------------------- multiempresa

test("multiempresa: generateExecutionDocument com empresaId de outra empresa retorna NOT_FOUND", async () => {
  const empresaA = await createEmpresa("tenantA1doc");
  const empresaB = await createEmpresa("tenantB1doc");
  const configB = await createConfig(empresaB);
  const execucaoB = await runToReadyForDocument({ config: configB });

  const driveClient = createFakeGoogleDriveClient();
  const result = await generateExecutionDocument({ pool, empresaId: empresaA, automacaoExecucaoId: execucaoB.id, driveClient });
  assert.equal(result.outcome, "NOT_FOUND");
  assert.equal(driveClient.calls.uploadFile.length, 0);

  const fresh = await getExecucao(configB.id);
  assert.equal(fresh.status, "READY_FOR_DOCUMENT", "execução real da empresa B não deveria ter sido tocada por uma tentativa cross-tenant");
});

test("multiempresa: getDocumentStatusForEmpresa/getCurrentDocumentForEmpresa/listDocumentVersionsForEmpresa nunca vazam dados de outra empresa", async () => {
  const empresaA = await createEmpresa("tenantA2doc");
  const empresaB = await createEmpresa("tenantB2doc");
  const configB = await createConfig(empresaB);
  const execucaoB = await runToReadyForDocument({ config: configB });
  await generateExecutionDocument({ pool, automacaoExecucaoId: execucaoB.id, driveClient: createFakeGoogleDriveClient() });

  assert.equal(await getDocumentStatusForEmpresa(pool, { empresaId: empresaA, automacaoExecucaoId: execucaoB.id }), null);
  assert.equal(await getCurrentDocumentForEmpresa(pool, { empresaId: empresaA, automacaoExecucaoId: execucaoB.id }), null);
  assert.deepEqual(await listDocumentVersionsForEmpresa(pool, { empresaId: empresaA, automacaoExecucaoId: execucaoB.id }), []);

  assert.ok(await getDocumentStatusForEmpresa(pool, { empresaId: empresaB, automacaoExecucaoId: execucaoB.id }));
  assert.ok(await getCurrentDocumentForEmpresa(pool, { empresaId: empresaB, automacaoExecucaoId: execucaoB.id }));
});

// ------------------------------------------------------------------- template

test("generateExecutionDocument: falta de template ativo retorna TEMPLATE_NOT_FOUND sem chamar o Drive", async () => {
  const empresaId = await createEmpresa("semtemplate");
  const config = await createConfig(empresaId);
  const execucao = await runToReadyForDocument({ config });

  // Bloco 11, Seção 2: `automacao_templates` é uma tabela ESTRUTURAL global
  // (Bloco 2) — a linha seedada de 'diario_obra_ppflora' é compartilhada por
  // TODOS os processos de teste rodando em paralelo contra o mesmo Postgres
  // local (`node --test` roda cada arquivo `.test.js` em seu próprio
  // processo). Um UPDATE ativo=false COMMITADO aqui ficaria visível para
  // qualquer outro arquivo concorrente que dependa do template ativo — esta
  // era a causa raiz da flakiness intermitente relatada no Bloco 10 entre
  // este arquivo e documentDistributionService.test.js.
  //
  // Correção estrutural (não é timeout, não é serializar a suíte, não é
  // reexecutar até passar): manter o UPDATE dentro de uma transação Postgres
  // NUNCA COMMITADA (sempre ROLLBACK ao final, inclusive se o teste falhar).
  // Pelo isolamento MVCC padrão do Postgres (READ COMMITTED), nenhuma OUTRA
  // conexão enxerga um UPDATE não commitado — a mudança fica 100% invisível
  // para os demais processos de teste durante toda a duração deste teste, e
  // é desfeita sozinha ao final (inclusive se o processo morrer no meio,
  // uma transação nunca commitada de uma conexão encerrada é descartada pelo
  // próprio Postgres). O código sob teste precisa enxergar essa mudança
  // "invisível para os outros", então recebe um `pool` PROXY cujo `.query`
  // roda na MESMA conexão/transação deste teste — `.connect()` continua
  // apontando para o pool real, porque o advisory lock por execução do
  // `documentGenerationService.js` é uma preocupação ortogonal (sempre numa
  // conexão própria) que nunca precisou de isolamento transacional.
  const txClient = await pool.connect();
  try {
    await txClient.query("BEGIN");
    await txClient.query(`UPDATE automacao_templates SET ativo = false WHERE codigo = 'diario_obra_ppflora'`);

    const isolatedPool = { query: (...args) => txClient.query(...args), connect: (...args) => pool.connect(...args) };
    const driveClient = createFakeGoogleDriveClient();
    const result = await generateExecutionDocument({ pool: isolatedPool, automacaoExecucaoId: execucao.id, driveClient });
    assert.equal(result.outcome, "TEMPLATE_NOT_FOUND");
    assert.equal(driveClient.calls.uploadFile.length, 0);

    const { rows: freshRows } = await txClient.query(`SELECT erro_codigo FROM automacao_execucoes WHERE id = $1`, [execucao.id]);
    assert.equal(freshRows[0].erro_codigo, "DOCUMENT_TEMPLATE_NOT_FOUND");
  } finally {
    await txClient.query("ROLLBACK").catch(() => {});
    txClient.release();
  }
});
