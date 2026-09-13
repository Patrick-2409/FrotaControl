"use strict";

/**
 * Testes de integração contra o Postgres local — a claim atômica
 * (UPDATE ... FOR UPDATE SKIP LOCKED) e o ciclo de tentativas/estados só se
 * provam com transações/linhas reais, não com mocks de `pool.query`. Os
 * clientes Telegram/Drive são SEMPRE fakes injetadas — nenhuma chamada de
 * rede real acontece em nenhum destes testes.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const { StorageError } = require("../src/modules/automations/storage/errorClassification");
const {
  claimNextPendingPhotoMessage,
  processPhotoMessageStorage,
  processPendingPhotoStorage,
} = require("../src/modules/automations/storage/photoStorageService");

const RUN_TAG = `photostorage-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

async function createEmpresa(nome) {
  const { rows } = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [`${RUN_TAG}-${nome}`]);
  createdEmpresaIds.push(rows[0].id);
  return rows[0].id;
}

async function createConfig(empresaId, { raizId = "root-fake-1" } = {}) {
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, google_drive_pasta_raiz_id) VALUES ($1,$2,'cfg',$3) RETURNING *`,
    [empresaId, cat.rows[0].id, raizId]
  );
  return rows[0];
}

async function createExecucao(config, dataReferencia = "2026-02-14") {
  const { rows } = await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia) VALUES ($1,$2,$3) RETURNING *`,
    [config.id, config.empresa_id, dataReferencia]
  );
  return rows[0];
}

let seq = 1;
async function createPhotoMessage(config, execucao, overrides = {}) {
  const messageId = overrides.messageId ?? seq++;
  const { rows } = await pool.query(
    `INSERT INTO telegram_mensagens (
       empresa_id, automacao_config_id, automacao_execucao_id, chat_id, message_id,
       tipo, telegram_file_id, telegram_file_unique_id, storage_status, storage_attempts, storage_last_attempt_at
     ) VALUES ($1,$2,$3,$4,$5,'PHOTO',$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      config.empresa_id,
      config.id,
      execucao.id,
      overrides.chatId ?? -1001,
      messageId,
      overrides.fileId ?? `file-${messageId}`,
      overrides.fileUniqueId ?? `uniq-${messageId}`,
      overrides.storageStatus ?? "PENDING",
      overrides.storageAttempts ?? 0,
      overrides.storageLastAttemptAt ?? null,
    ]
  );
  return rows[0];
}

async function createTextMessage(config, execucao) {
  const messageId = seq++;
  const { rows } = await pool.query(
    `INSERT INTO telegram_mensagens (empresa_id, automacao_config_id, automacao_execucao_id, chat_id, message_id, tipo, texto)
     VALUES ($1,$2,$3,$4,$5,'TEXT','oi') RETURNING *`,
    [config.empresa_id, config.id, execucao.id, -1001, messageId]
  );
  return rows[0];
}

function createFakeTelegramFileClient({ getFileImpl, downloadFileImpl } = {}) {
  const calls = { getFile: [], downloadFile: [] };
  return {
    calls,
    getFile: async (fileId) => {
      calls.getFile.push(fileId);
      if (getFileImpl) return getFileImpl(fileId);
      return { filePath: `photos/${fileId}.jpg`, fileSize: 1000, fileId, fileUniqueId: `u-${fileId}` };
    },
    downloadFile: async (filePath) => {
      calls.downloadFile.push(filePath);
      if (downloadFileImpl) return downloadFileImpl(filePath);
      return Buffer.from([1, 2, 3]);
    },
  };
}

function createFakeGoogleDriveClient({ existingFile = null, uploadImpl } = {}) {
  const calls = { ensureFolder: [], findFileBySourceMetadata: [], uploadFile: [] };
  let counter = 0;
  return {
    calls,
    ensureFolder: async ({ parentId, name }) => {
      counter += 1;
      calls.ensureFolder.push({ parentId, name });
      return { id: `drive-${name}-${counter}`, name, wasCreated: true };
    },
    findFileBySourceMetadata: async (args) => {
      calls.findFileBySourceMetadata.push(args);
      return existingFile;
    },
    uploadFile: async (args) => {
      calls.uploadFile.push(args);
      counter += 1;
      if (uploadImpl) return uploadImpl(args, counter);
      return { id: `uploaded-${counter}`, name: args.name, size: String(args.buffer.length) };
    },
  };
}

async function getMensagem(id) {
  const { rows } = await pool.query(`SELECT * FROM telegram_mensagens WHERE id = $1`, [id]);
  return rows[0];
}

async function getEventosDaExecucao(execucaoId) {
  const { rows } = await pool.query(
    `SELECT tipo_evento, dados FROM automacao_eventos WHERE automacao_execucao_id = $1 ORDER BY created_at ASC`,
    [execucaoId]
  );
  return rows;
}

// ---------------------------------------------------------------- claim

test("claim: pega a mensagem PENDING mais antiga e marca PROCESSING + incrementa tentativa", async () => {
  const empresaId = await createEmpresa("claim1");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  const msg = await createPhotoMessage(config, execucao);

  const claimed = await claimNextPendingPhotoMessage(pool, { automacaoConfigId: config.id });
  assert.equal(claimed.id, msg.id);
  assert.equal(claimed.storage_status, "PROCESSING");
  assert.equal(claimed.storage_attempts, 1);
  assert.ok(claimed.storage_last_attempt_at);
});

test("claim: nunca pega mensagem TEXT (storage_status NULL, não aplicável)", async () => {
  const empresaId = await createEmpresa("claimtext");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  await createTextMessage(config, execucao);

  const claimed = await claimNextPendingPhotoMessage(pool, { automacaoConfigId: config.id });
  assert.equal(claimed, null);
});

test("claim: não pega mensagem que já esgotou as tentativas", async () => {
  const empresaId = await createEmpresa("claimmax");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  await createPhotoMessage(config, execucao, { storageAttempts: 5 });

  const claimed = await claimNextPendingPhotoMessage(pool, { maxAttempts: 5, automacaoConfigId: config.id });
  assert.equal(claimed, null);
});

test("claim: reclama uma linha travada em PROCESSING há mais tempo que o limite de abandono", async () => {
  const empresaId = await createEmpresa("claimstale");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  const msg = await createPhotoMessage(config, execucao, { storageStatus: "PROCESSING", storageAttempts: 1 });
  await pool.query(`UPDATE telegram_mensagens SET storage_last_attempt_at = NOW() - INTERVAL '20 minutes' WHERE id = $1`, [msg.id]);

  const claimed = await claimNextPendingPhotoMessage(pool, { staleMinutes: 10, automacaoConfigId: config.id });
  assert.equal(claimed.id, msg.id);
  assert.equal(claimed.storage_attempts, 2);
});

test("claim: NÃO reclama uma linha PROCESSING ainda recente", async () => {
  const empresaId = await createEmpresa("claimfresh");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  await createPhotoMessage(config, execucao, { storageStatus: "PROCESSING", storageAttempts: 1, storageLastAttemptAt: new Date() });

  const claimed = await claimNextPendingPhotoMessage(pool, { staleMinutes: 10, automacaoConfigId: config.id });
  assert.equal(claimed, null);
});

test("claim: duas claims concorrentes com 2 mensagens pendentes nunca pegam a mesma linha", async () => {
  const empresaId = await createEmpresa("claimconc");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  const m1 = await createPhotoMessage(config, execucao);
  const m2 = await createPhotoMessage(config, execucao);

  const [a, b] = await Promise.all([claimNextPendingPhotoMessage(pool, { automacaoConfigId: config.id }), claimNextPendingPhotoMessage(pool, { automacaoConfigId: config.id })]);
  assert.notEqual(a.id, b.id);
  assert.deepEqual(new Set([a.id, b.id]), new Set([m1.id, m2.id]));
});

// -------------------------------------------------------- processamento

test("processPhotoMessageStorage: caminho feliz (upload novo) cria automacao_arquivos e completa a mensagem", async () => {
  const empresaId = await createEmpresa("upload-ok");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  const msg = await createPhotoMessage(config, execucao);
  const claimed = await claimNextPendingPhotoMessage(pool, { automacaoConfigId: config.id });

  const telegramFileClient = createFakeTelegramFileClient();
  const googleDriveClient = createFakeGoogleDriveClient();

  const result = await processPhotoMessageStorage({ mensagem: claimed, pool, telegramFileClient, googleDriveClient });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.recovered, false);
  assert.equal(telegramFileClient.calls.getFile.length, 1);
  assert.equal(telegramFileClient.calls.downloadFile.length, 1);
  assert.equal(googleDriveClient.calls.uploadFile.length, 1);

  const mensagemFinal = await getMensagem(msg.id);
  assert.equal(mensagemFinal.storage_status, "COMPLETED");
  assert.ok(mensagemFinal.storage_completed_at);

  const { rows: arquivos } = await pool.query(`SELECT * FROM automacao_arquivos WHERE telegram_mensagem_id = $1`, [msg.id]);
  assert.equal(arquivos.length, 1);
  assert.equal(arquivos[0].tipo, "PHOTO");
  assert.equal(arquivos[0].drive_file_id, result.driveFileId);
  assert.equal(arquivos[0].nome_arquivo, "2026-02-14_msg-" + msg.message_id + ".jpg");

  const eventos = await getEventosDaExecucao(execucao.id);
  const tipos = eventos.map((e) => e.tipo_evento);
  assert.ok(tipos.includes("DRIVE_FOLDER_CREATED"));
  assert.ok(tipos.includes("TELEGRAM_FILE_DOWNLOADED"));
  assert.ok(tipos.includes("DRIVE_PHOTO_UPLOADED"));
});

test("processPhotoMessageStorage: reconciliação via appProperties pula download/upload quando o Drive já tem o arquivo", async () => {
  const empresaId = await createEmpresa("reconcilia");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  const msg = await createPhotoMessage(config, execucao);
  const claimed = await claimNextPendingPhotoMessage(pool, { automacaoConfigId: config.id });

  const telegramFileClient = createFakeTelegramFileClient();
  const googleDriveClient = createFakeGoogleDriveClient({ existingFile: { id: "ja-existe-1", size: "500" } });

  const result = await processPhotoMessageStorage({ mensagem: claimed, pool, telegramFileClient, googleDriveClient });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.recovered, true);
  assert.equal(result.driveFileId, "ja-existe-1");
  assert.equal(telegramFileClient.calls.getFile.length, 0, "nunca deveria baixar de novo do Telegram");
  assert.equal(googleDriveClient.calls.uploadFile.length, 0, "nunca deveria subir de novo pro Drive");

  const eventos = await getEventosDaExecucao(execucao.id);
  const tipos = eventos.map((e) => e.tipo_evento);
  assert.ok(tipos.includes("DRIVE_PHOTO_RECOVERED"));
  assert.ok(!tipos.includes("DRIVE_PHOTO_UPLOADED"));
  assert.ok(!tipos.includes("TELEGRAM_FILE_DOWNLOADED"));

  const { rows: arquivos } = await pool.query(`SELECT * FROM automacao_arquivos WHERE telegram_mensagem_id = $1`, [msg.id]);
  assert.equal(arquivos.length, 1);
  assert.equal(arquivos[0].drive_file_id, "ja-existe-1");
});

test("processPhotoMessageStorage: erro TEMPORARY volta a mensagem para PENDING (ainda há tentativas)", async () => {
  const empresaId = await createEmpresa("temp-erro");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  const msg = await createPhotoMessage(config, execucao);
  const claimed = await claimNextPendingPhotoMessage(pool, { maxAttempts: 5, automacaoConfigId: config.id });

  const telegramFileClient = createFakeTelegramFileClient({
    getFileImpl: async () => {
      const err = new StorageError("instabilidade de rede simulada", { code: "TELEGRAM_NETWORK_ERROR", storageErrorClass: "TEMPORARY" });
      throw err;
    },
  });
  const googleDriveClient = createFakeGoogleDriveClient();

  await assert.rejects(() =>
    processPhotoMessageStorage({ mensagem: claimed, pool, telegramFileClient, googleDriveClient, maxAttempts: 5 })
  );

  const mensagemFinal = await getMensagem(msg.id);
  assert.equal(mensagemFinal.storage_status, "PENDING");
  assert.equal(mensagemFinal.storage_attempts, 1);
  assert.ok(mensagemFinal.storage_last_error.includes("instabilidade de rede simulada"));

  const eventos = await getEventosDaExecucao(execucao.id);
  const falhaEvento = eventos.find((e) => e.tipo_evento === "DRIVE_PHOTO_UPLOAD_FAILED");
  assert.ok(falhaEvento);
  assert.equal(falhaEvento.dados.classe, "TEMPORARY");
});

test("processPhotoMessageStorage: erro DEFINITIVE (config sem pasta raiz) marca FAILED já na 1ª tentativa", async () => {
  const empresaId = await createEmpresa("def-erro");
  const config = await createConfig(empresaId, { raizId: null });
  const execucao = await createExecucao(config);
  const msg = await createPhotoMessage(config, execucao);
  const claimed = await claimNextPendingPhotoMessage(pool, { maxAttempts: 5, automacaoConfigId: config.id });

  const telegramFileClient = createFakeTelegramFileClient();
  const googleDriveClient = createFakeGoogleDriveClient();

  await assert.rejects(() =>
    processPhotoMessageStorage({ mensagem: claimed, pool, telegramFileClient, googleDriveClient, maxAttempts: 5 })
  );

  const mensagemFinal = await getMensagem(msg.id);
  assert.equal(mensagemFinal.storage_status, "FAILED");
  assert.equal(mensagemFinal.storage_attempts, 1, "não deveria esperar esgotar tentativas para um erro definitivo");
});

test("processPhotoMessageStorage: erros TEMPORARY repetidos esgotam as tentativas e terminam em FAILED", async () => {
  const empresaId = await createEmpresa("esgota");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  const msg = await createPhotoMessage(config, execucao);
  const maxAttempts = 2;

  const telegramFileClient = createFakeTelegramFileClient({
    getFileImpl: async () => {
      throw new StorageError("sempre falha", { code: "TELEGRAM_NETWORK_ERROR", storageErrorClass: "TEMPORARY" });
    },
  });
  const googleDriveClient = createFakeGoogleDriveClient();

  for (let i = 0; i < maxAttempts; i += 1) {
    const claimed = await claimNextPendingPhotoMessage(pool, { maxAttempts, automacaoConfigId: config.id });
    assert.ok(claimed, `deveria conseguir claim na tentativa ${i + 1}`);
    await assert.rejects(() =>
      processPhotoMessageStorage({ mensagem: claimed, pool, telegramFileClient, googleDriveClient, maxAttempts })
    );
  }

  const mensagemFinal = await getMensagem(msg.id);
  assert.equal(mensagemFinal.storage_status, "FAILED");
  assert.equal(mensagemFinal.storage_attempts, maxAttempts);

  const naoDeveriaClamar = await claimNextPendingPhotoMessage(pool, { maxAttempts, automacaoConfigId: config.id });
  assert.equal(naoDeveriaClamar, null, "mensagem FAILED nunca mais deve ser elegível para claim");
});

// -------------------------------------------------------------- loop em lote

test("processPendingPhotoStorage: processa várias mensagens, uma falha não interrompe as demais", async () => {
  const empresaId = await createEmpresa("lote1");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  await createPhotoMessage(config, execucao, { fileId: "ok-1" });
  await createPhotoMessage(config, execucao, { fileId: "quebra" });
  await createPhotoMessage(config, execucao, { fileId: "ok-2" });

  const telegramFileClient = createFakeTelegramFileClient({
    getFileImpl: async (fileId) => {
      if (fileId === "quebra") {
        throw new StorageError("falha proposital", { code: "TELEGRAM_NETWORK_ERROR", storageErrorClass: "DEFINITIVE" });
      }
      return { filePath: `photos/${fileId}.jpg` };
    },
  });
  const googleDriveClient = createFakeGoogleDriveClient();

  const summary = await processPendingPhotoStorage({ pool, telegramFileClient, googleDriveClient, limit: 10, automacaoConfigId: config.id });
  assert.equal(summary.processed, 3);
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.failed, 1);
});

test("processPendingPhotoStorage: respeita o limit e deixa o restante pendente", async () => {
  const empresaId = await createEmpresa("lote-limit");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  for (let i = 0; i < 5; i += 1) {
    await createPhotoMessage(config, execucao);
  }

  const telegramFileClient = createFakeTelegramFileClient();
  const googleDriveClient = createFakeGoogleDriveClient();

  const summary = await processPendingPhotoStorage({ pool, telegramFileClient, googleDriveClient, limit: 2, automacaoConfigId: config.id });
  assert.equal(summary.processed, 2);
  assert.equal(summary.succeeded, 2);

  const { rows: pendentes } = await pool.query(
    `SELECT id FROM telegram_mensagens WHERE automacao_execucao_id = $1 AND storage_status = 'PENDING'`,
    [execucao.id]
  );
  assert.equal(pendentes.length, 3);
});

test("processPendingPhotoStorage: retorna zeros quando não há nada pendente", async () => {
  const empresaId = await createEmpresa("lote-vazio");
  const config = await createConfig(empresaId);

  const telegramFileClient = createFakeTelegramFileClient();
  const googleDriveClient = createFakeGoogleDriveClient();
  const summary = await processPendingPhotoStorage({ pool, telegramFileClient, googleDriveClient, limit: 5, automacaoConfigId: config.id });
  assert.deepEqual(summary, { processed: 0, succeeded: 0, failed: 0 });
});
