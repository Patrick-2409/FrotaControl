"use strict";

/**
 * Testes de integração do motor de fechamento diário (Bloco 5) — Postgres
 * local real (advisory lock, claim atômico, concorrência e UNIQUE de versão
 * não se provam com mocks, mesma justificativa dos blocos anteriores).
 * Clientes Telegram/Drive são SEMPRE fakes injetadas — nenhuma chamada de
 * rede real.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const { processTelegramUpdate } = require("../src/modules/automations/telegram/telegramWebhookService");
const fixtures = require("./fixtures/telegramUpdates");
const {
  closeDailyExecution,
  rebuildDailySnapshot,
  findExecutionsDueForClosing,
  getExecutionClosingStatusForEmpresa,
  getCurrentSnapshotForEmpresa,
} = require("../src/modules/automations/closing/automationClosingService");

const RUN_TAG = `closingsvc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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
  const chatId = overrides.chatId ?? -(2_000_000 + chatSeq++);
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, telegram_chat_id, ativo, timezone, horario_fechamento, google_drive_pasta_raiz_id)
     VALUES ($1,$2,'cfg',$3,$4,$5,$6,$7) RETURNING *`,
    [
      empresaId,
      cat.rows[0].id,
      chatId,
      overrides.ativo ?? true,
      overrides.timezone ?? "America/Sao_Paulo",
      overrides.horario_fechamento ?? "18:00:00",
      overrides.raizId === undefined ? "root-fake-1" : overrides.raizId,
    ]
  );
  return rows[0];
}

async function captureText({ config, dataReferencia = "2026-02-14", messageId, text = "texto" }) {
  const dateUnix = Math.floor(new Date(`${dataReferencia}T11:00:00Z`).getTime() / 1000);
  const update = fixtures.textUpdate({ chatId: config.telegram_chat_id, messageId, date: dateUnix, text });
  const result = await processTelegramUpdate(update);
  return result.results[0];
}

async function capturePhoto({ config, dataReferencia = "2026-02-14", messageId, fileId, fileUniqueId }) {
  const dateUnix = Math.floor(new Date(`${dataReferencia}T11:00:00Z`).getTime() / 1000);
  const update = fixtures.photoUpdate({
    chatId: config.telegram_chat_id,
    messageId,
    date: dateUnix,
    sizes: [{ file_id: fileId, file_unique_id: fileUniqueId, width: 100, height: 100, file_size: 1000 }],
  });
  const result = await processTelegramUpdate(update);
  return result.results[0];
}

async function getExecucao(configId, dataReferencia = "2026-02-14") {
  const { rows } = await pool.query(
    `SELECT *, to_char(data_referencia, 'YYYY-MM-DD') AS "dataReferencia" FROM automacao_execucoes WHERE automacao_config_id = $1 AND data_referencia = $2`,
    [configId, dataReferencia]
  );
  return rows[0] || null;
}

async function setStorageStatus(fileUniqueId, status) {
  await pool.query(`UPDATE telegram_mensagens SET storage_status = $2 WHERE telegram_file_unique_id = $1`, [fileUniqueId, status]);
}

function createFakeTelegramFileClient({ getFileImpl } = {}) {
  const calls = { getFile: [] };
  return {
    calls,
    getFile: async (fileId) => {
      calls.getFile.push(fileId);
      if (getFileImpl) return getFileImpl(fileId);
      return { filePath: `photos/${fileId}.jpg` };
    },
    downloadFile: async () => Buffer.from([1, 2, 3]),
  };
}

function createFakeGoogleDriveClient() {
  let counter = 0;
  return {
    ensureFolder: async ({ name }) => {
      counter += 1;
      return { id: `drive-${name}-${counter}`, name, wasCreated: true };
    },
    findFileBySourceMetadata: async () => null,
    uploadFile: async (args) => {
      counter += 1;
      return { id: `uploaded-${counter}`, name: args.name, size: String(args.buffer.length) };
    },
  };
}

// ------------------------------------------------------------- sem movimento

test("closeDailyExecution: sem execução (sem movimento no dia) retorna NO_EXECUTION sem criar nada", async () => {
  const empresaId = await createEmpresa("semmovimento");
  const config = await createConfig(empresaId);

  const result = await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" });
  assert.equal(result.outcome, "NO_EXECUTION");

  const execucao = await getExecucao(config.id);
  assert.equal(execucao, null, "nenhuma execução deveria ter sido criada artificialmente");
});

// ----------------------------------------------------------- fechamento simples

test("closeDailyExecution: execução COLLECTING só com texto fecha para READY_FOR_GENERATION, snapshot versão 1", async () => {
  const empresaId = await createEmpresa("fechasimples");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1, text: "Serviço concluído" });

  const result = await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" });
  assert.equal(result.outcome, "READY");
  assert.equal(result.snapshotVersion, 1);
  assert.match(result.snapshotHash, /^[0-9a-f]{64}$/);

  const execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "READY_FOR_GENERATION");
  assert.equal(execucao.snapshot_version, 1);
  assert.ok(execucao.current_snapshot_id);
  assert.ok(execucao.processado_em);

  const { rows: snapRows } = await pool.query(`SELECT * FROM automacao_execucao_snapshots WHERE id = $1`, [execucao.current_snapshot_id]);
  assert.equal(snapRows[0].versao, 1);
  assert.equal(snapRows[0].reason, "INITIAL_CLOSING");
  assert.equal(snapRows[0].snapshot.messages.length, 1);
  assert.equal(snapRows[0].snapshot.messages[0].text, "Serviço concluído");
});

test("closeDailyExecution: idempotente — fechar duas vezes não duplica snapshot nem muda a versão", async () => {
  const empresaId = await createEmpresa("idempotente");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1 });

  const first = await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" });
  const second = await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" });

  assert.equal(first.outcome, "READY");
  assert.equal(second.outcome, "ALREADY_READY");
  assert.equal(second.snapshotVersion, 1);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM automacao_execucao_snapshots WHERE automacao_execucao_id = (
       SELECT id FROM automacao_execucoes WHERE automacao_config_id = $1
     )`,
    [config.id]
  );
  assert.equal(rows[0].count, 1);
});

test("closeDailyExecution: duas chamadas SIMULTÂNEAS geram um único snapshot versão 1", async () => {
  const empresaId = await createEmpresa("concorrenciafech");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1 });

  const [a, b] = await Promise.all([
    closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" }),
    closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" }),
  ]);

  const outcomes = [a.outcome, b.outcome].sort();
  assert.deepEqual(outcomes, ["ALREADY_READY", "READY"]);
  const winner = a.outcome === "READY" ? a : b;
  assert.equal(winner.snapshotVersion, 1);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM automacao_execucao_snapshots WHERE automacao_execucao_id = (
       SELECT id FROM automacao_execucoes WHERE automacao_config_id = $1
     )`,
    [config.id]
  );
  assert.equal(rows[0].count, 1, "só uma versão 1 deve existir, mesmo com duas chamadas concorrentes");
});

test("closeDailyExecution: fechar a config/data de UMA execução não bloqueia outra config nem outra data", async () => {
  const empresaId = await createEmpresa("semlockcruzado");
  const configA = await createConfig(empresaId);
  const configB = await createConfig(empresaId);
  await captureText({ config: configA, messageId: 1, dataReferencia: "2026-02-14" });
  await captureText({ config: configA, messageId: 2, dataReferencia: "2026-02-15" });
  await captureText({ config: configB, messageId: 1, dataReferencia: "2026-02-14" });

  const results = await Promise.all([
    closeDailyExecution({ pool, automacaoConfigId: configA.id, referenceDate: "2026-02-14" }),
    closeDailyExecution({ pool, automacaoConfigId: configA.id, referenceDate: "2026-02-15" }),
    closeDailyExecution({ pool, automacaoConfigId: configB.id, referenceDate: "2026-02-14" }),
  ]);
  assert.ok(results.every((r) => r.outcome === "READY"));
});

// ------------------------------------------------------------------ fotos

test("closeDailyExecution: foto PENDING dispara tentativa de storage e, se bem-sucedida, fecha normalmente", async () => {
  const empresaId = await createEmpresa("fotopendente");
  const config = await createConfig(empresaId);
  await capturePhoto({ config, messageId: 1, fileId: "file-1", fileUniqueId: "uniq-1" });

  const telegramFileClient = createFakeTelegramFileClient();
  const googleDriveClient = createFakeGoogleDriveClient();
  const result = await closeDailyExecution({
    pool,
    automacaoConfigId: config.id,
    referenceDate: "2026-02-14",
    telegramFileClient,
    googleDriveClient,
  });

  assert.equal(result.outcome, "READY");
  assert.equal(telegramFileClient.calls.getFile.length, 1);

  const execucao = await getExecucao(config.id);
  const { rows: snapRows } = await pool.query(`SELECT snapshot, metrics FROM automacao_execucao_snapshots WHERE id = $1`, [
    execucao.current_snapshot_id,
  ]);
  assert.equal(snapRows[0].snapshot.messages[0].photo.stored, true);
  assert.equal(snapRows[0].metrics.photosStored, 1);
});

test("closeDailyExecution: foto já STORED (COMPLETED) não dispara nova tentativa de download", async () => {
  const empresaId = await createEmpresa("fotostored");
  const config = await createConfig(empresaId);
  await capturePhoto({ config, messageId: 1, fileId: "file-2", fileUniqueId: "uniq-2" });
  await setStorageStatus("uniq-2", "COMPLETED");

  const telegramFileClient = createFakeTelegramFileClient();
  const googleDriveClient = createFakeGoogleDriveClient();
  const result = await closeDailyExecution({
    pool,
    automacaoConfigId: config.id,
    referenceDate: "2026-02-14",
    telegramFileClient,
    googleDriveClient,
  });

  assert.equal(result.outcome, "READY");
  assert.equal(telegramFileClient.calls.getFile.length, 0, "foto já armazenada não deveria ser baixada de novo");
});

test("closeDailyExecution: foto com erro definitivo (FAILED) não bloqueia o fechamento", async () => {
  const empresaId = await createEmpresa("fotofalhapermanente");
  const config = await createConfig(empresaId);
  await capturePhoto({ config, messageId: 1, fileId: "file-3", fileUniqueId: "uniq-3" });
  await pool.query(`UPDATE telegram_mensagens SET storage_status = 'FAILED', storage_last_error = 'arquivo muito grande' WHERE telegram_file_unique_id = 'uniq-3'`);

  const result = await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" });
  assert.equal(result.outcome, "READY");

  const execucao = await getExecucao(config.id);
  const { rows: snapRows } = await pool.query(`SELECT snapshot, metrics FROM automacao_execucao_snapshots WHERE id = $1`, [
    execucao.current_snapshot_id,
  ]);
  assert.equal(snapRows[0].snapshot.messages[0].photo.failed, true);
  assert.equal(snapRows[0].snapshot.messages[0].photo.stored, false);
  assert.equal(snapRows[0].metrics.photosFailedPermanent, 1);
});

test("closeDailyExecution: foto ainda PENDING após a rodada de retry impede READY_FOR_GENERATION (erro recuperável)", async () => {
  const empresaId = await createEmpresa("fotopendentebloqueia");
  const config = await createConfig(empresaId);
  await capturePhoto({ config, messageId: 1, fileId: "file-4", fileUniqueId: "uniq-4" });

  const telegramFileClient = createFakeTelegramFileClient({
    getFileImpl: async () => {
      throw new Error("falha de rede simulada");
    },
  });
  const googleDriveClient = createFakeGoogleDriveClient();

  const result = await closeDailyExecution({
    pool,
    automacaoConfigId: config.id,
    referenceDate: "2026-02-14",
    telegramFileClient,
    googleDriveClient,
    maxStorageAttempts: 5,
  });

  assert.equal(result.outcome, "ERROR_RECOVERABLE");
  assert.equal(result.code, "PHOTO_STORAGE_PENDING");

  const execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "ERROR");
  assert.equal(execucao.erro_codigo, "PHOTO_STORAGE_PENDING");
  assert.equal(execucao.current_snapshot_id, null, "nenhum snapshot deveria ter sido criado ainda");
});

test("closeDailyExecution: erro recuperável (ERROR + PHOTO_STORAGE_PENDING) pode ser tentado de novo depois", async () => {
  const empresaId = await createEmpresa("retrydeperror");
  const config = await createConfig(empresaId);
  await capturePhoto({ config, messageId: 1, fileId: "file-5", fileUniqueId: "uniq-5" });

  const failingClient = createFakeTelegramFileClient({
    getFileImpl: async () => {
      throw new Error("falha de rede simulada");
    },
  });
  const first = await closeDailyExecution({
    pool,
    automacaoConfigId: config.id,
    referenceDate: "2026-02-14",
    telegramFileClient: failingClient,
    googleDriveClient: createFakeGoogleDriveClient(),
    maxStorageAttempts: 5,
  });
  assert.equal(first.outcome, "ERROR_RECOVERABLE");

  const workingClient = createFakeTelegramFileClient();
  const second = await closeDailyExecution({
    pool,
    automacaoConfigId: config.id,
    referenceDate: "2026-02-14",
    telegramFileClient: workingClient,
    googleDriveClient: createFakeGoogleDriveClient(),
    maxStorageAttempts: 5,
  });
  assert.equal(second.outcome, "READY");
  assert.equal(second.snapshotVersion, 1);
});

// ------------------------------------------------------------ determinismo

test("construir o snapshot duas vezes sobre os MESMOS dados produz o mesmo hash", async () => {
  const empresaId = await createEmpresa("determinismo");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1, text: "primeira" });
  await capturePhoto({ config, messageId: 2, fileId: "file-6", fileUniqueId: "uniq-6" });
  await setStorageStatus("uniq-6", "COMPLETED");

  const { buildExecutionSnapshot, computeSnapshotHash } = require("../src/modules/automations/closing/snapshotBuilder");
  const execucao = await getExecucao(config.id);
  const config2 = await pool.query(`SELECT * FROM automacao_configs WHERE id = $1`, [config.id]);

  const build1 = await buildExecutionSnapshot(pool, { execucaoId: execucao.id, dataReferencia: execucao.dataReferencia, timezone: config2.rows[0].timezone });
  const build2 = await buildExecutionSnapshot(pool, { execucaoId: execucao.id, dataReferencia: execucao.dataReferencia, timezone: config2.rows[0].timezone });

  assert.equal(computeSnapshotHash(build1.snapshot), computeSnapshotHash(build2.snapshot));
});

// -------------------------------------------------------------- late inputs

test("late input: mensagem após READY_FOR_GENERATION marca has_late_inputs/needs_reprocessing e gera 1 evento", async () => {
  const empresaId = await createEmpresa("lateinput");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1, text: "antes do fechamento" });
  await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" });

  const lateResult = await captureText({ config, messageId: 2, text: "chegou depois do fechamento" });
  assert.equal(lateResult.status, "created");
  assert.equal(lateResult.lateInput, true);

  const execucao = await getExecucao(config.id);
  assert.equal(execucao.status, "READY_FOR_GENERATION", "snapshot fechado nunca é alterado silenciosamente");
  assert.equal(execucao.has_late_inputs, true);
  assert.equal(execucao.needs_reprocessing, true);
  assert.equal(execucao.snapshot_version, 1, "late input não deve mexer no snapshot já fechado");

  const { rows: eventos } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM automacao_eventos WHERE automacao_execucao_id = $1 AND tipo_evento = 'LATE_INPUT_RECEIVED'`,
    [execucao.id]
  );
  assert.equal(eventos[0].count, 1);
});

test("rebuildDailySnapshot: incorpora o late input, cria versão 2, preserva a versão 1, limpa needs_reprocessing", async () => {
  const empresaId = await createEmpresa("rebuild");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1, text: "mensagem original" });
  const firstClose = await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" });
  await captureText({ config, messageId: 2, text: "mensagem tardia" });

  const execucaoBeforeRebuild = await getExecucao(config.id);
  const rebuildResult = await rebuildDailySnapshot({ pool, automacaoExecucaoId: execucaoBeforeRebuild.id });

  assert.equal(rebuildResult.outcome, "READY");
  assert.equal(rebuildResult.snapshotVersion, 2);
  assert.notEqual(rebuildResult.snapshotHash, firstClose.snapshotHash, "conteúdo mudou (mensagem nova), hash deve mudar");

  const execucao = await getExecucao(config.id);
  assert.equal(execucao.needs_reprocessing, false);
  assert.equal(execucao.has_late_inputs, true, "marca histórica — nunca é limpa automaticamente");
  assert.equal(execucao.snapshot_version, 2);

  const { rows: snapshots } = await pool.query(
    `SELECT versao, snapshot_hash, reason FROM automacao_execucao_snapshots WHERE automacao_execucao_id = $1 ORDER BY versao`,
    [execucao.id]
  );
  assert.equal(snapshots.length, 2, "versão 1 nunca é apagada");
  assert.equal(snapshots[0].versao, 1);
  assert.equal(snapshots[0].snapshot_hash, firstClose.snapshotHash);
  assert.equal(snapshots[1].versao, 2);
  assert.equal(snapshots[1].reason, "REBUILD");

  const { rows: rebuiltEvent } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM automacao_eventos WHERE automacao_execucao_id = $1 AND tipo_evento = 'DAILY_SNAPSHOT_REBUILT'`,
    [execucao.id]
  );
  assert.equal(rebuiltEvent[0].count, 1);
});

test("rebuildDailySnapshot: execução ainda COLLECTING não é elegível para rebuild", async () => {
  const empresaId = await createEmpresa("rebuildinvalido");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1 });
  const execucao = await getExecucao(config.id);

  const result = await rebuildDailySnapshot({ pool, automacaoExecucaoId: execucao.id });
  assert.equal(result.outcome, "NOT_ELIGIBLE_FOR_REBUILD");
  assert.equal(result.currentStatus, "COLLECTING");
});

// ----------------------------------------------------------- reentrada "restart"

test("nova instância do serviço (module cache limpo) continua o trabalho usando só o banco", async () => {
  const empresaId = await createEmpresa("restart");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1 });
  await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" });
  await captureText({ config, messageId: 2, text: "late" });

  const modulePath = require.resolve("../src/modules/automations/closing/automationClosingService");
  delete require.cache[modulePath];
  const freshService = require("../src/modules/automations/closing/automationClosingService");

  const execucao = await getExecucao(config.id);
  const result = await freshService.rebuildDailySnapshot({ pool, automacaoExecucaoId: execucao.id });
  assert.equal(result.outcome, "READY");
  assert.equal(result.snapshotVersion, 2);
});

// -------------------------------------------------------------- multiempresa

test("multiempresa: closeDailyExecution com empresaId de outra empresa nunca fecha (NO_EXECUTION, nunca revela existência)", async () => {
  const empresaA = await createEmpresa("tenantA1");
  const empresaB = await createEmpresa("tenantB1");
  const configB = await createConfig(empresaB);
  await captureText({ config: configB, messageId: 1 });

  const result = await closeDailyExecution({ pool, empresaId: empresaA, automacaoConfigId: configB.id, referenceDate: "2026-02-14" });
  assert.equal(result.outcome, "NO_EXECUTION");

  const execucaoAindaCollecting = await getExecucao(configB.id);
  assert.equal(execucaoAindaCollecting.status, "COLLECTING", "execução real da empresa B não deve ter sido tocada");
});

test("multiempresa: getExecutionClosingStatusForEmpresa nunca retorna execução de outra empresa", async () => {
  const empresaA = await createEmpresa("tenantA2");
  const empresaB = await createEmpresa("tenantB2");
  const configB = await createConfig(empresaB);
  await captureText({ config: configB, messageId: 1 });
  const execucaoB = await getExecucao(configB.id);

  const asA = await getExecutionClosingStatusForEmpresa(pool, { empresaId: empresaA, automacaoExecucaoId: execucaoB.id });
  assert.equal(asA, null);
  const asB = await getExecutionClosingStatusForEmpresa(pool, { empresaId: empresaB, automacaoExecucaoId: execucaoB.id });
  assert.ok(asB);
});

test("multiempresa: getCurrentSnapshotForEmpresa nunca retorna snapshot de outra empresa", async () => {
  const empresaA = await createEmpresa("tenantA3");
  const empresaB = await createEmpresa("tenantB3");
  const configB = await createConfig(empresaB);
  await captureText({ config: configB, messageId: 1 });
  await closeDailyExecution({ pool, automacaoConfigId: configB.id, referenceDate: "2026-02-14" });
  const execucaoB = await getExecucao(configB.id);

  const asA = await getCurrentSnapshotForEmpresa(pool, { empresaId: empresaA, automacaoExecucaoId: execucaoB.id });
  assert.equal(asA, null);
  const asB = await getCurrentSnapshotForEmpresa(pool, { empresaId: empresaB, automacaoExecucaoId: execucaoB.id });
  assert.ok(asB);
});

test("multiempresa: rebuildDailySnapshot com empresaId de outra empresa retorna NOT_FOUND", async () => {
  const empresaA = await createEmpresa("tenantA4");
  const empresaB = await createEmpresa("tenantB4");
  const configB = await createConfig(empresaB);
  await captureText({ config: configB, messageId: 1 });
  await closeDailyExecution({ pool, automacaoConfigId: configB.id, referenceDate: "2026-02-14" });
  const execucaoB = await getExecucao(configB.id);

  const result = await rebuildDailySnapshot({ pool, empresaId: empresaA, automacaoExecucaoId: execucaoB.id });
  assert.equal(result.outcome, "NOT_FOUND");
});

// -------------------------------------------------------- findExecutionsDueForClosing

test("findExecutionsDueForClosing: retorna só as execuções realmente elegíveis", async () => {
  const empresaId = await createEmpresa("duecandidatas");

  const configDue = await createConfig(empresaId, { horario_fechamento: "10:00:00" });
  await captureText({ config: configDue, messageId: 1, dataReferencia: "2026-02-14" });

  const configNaoDue = await createConfig(empresaId, { horario_fechamento: "23:59:00" });
  await captureText({ config: configNaoDue, messageId: 1, dataReferencia: "2026-02-14" });

  const configInativa = await createConfig(empresaId, { horario_fechamento: "10:00:00", ativo: false });
  await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia, status) VALUES ($1,$2,'2026-02-14','COLLECTING')`,
    [configInativa.id, empresaId]
  );

  const configJaFechada = await createConfig(empresaId, { horario_fechamento: "10:00:00" });
  await captureText({ config: configJaFechada, messageId: 1, dataReferencia: "2026-02-14" });
  await closeDailyExecution({ pool, automacaoConfigId: configJaFechada.id, referenceDate: "2026-02-14" });

  // 15:00 local (America/Sao_Paulo, UTC-3) = 18:00 UTC.
  const now = new Date("2026-02-14T18:00:00.000Z");
  const candidatas = await findExecutionsDueForClosing(pool, now);
  const configIdsCandidatas = candidatas.filter((c) => c.automacaoConfigId === configDue.id || c.automacaoConfigId === configNaoDue.id || c.automacaoConfigId === configInativa.id || c.automacaoConfigId === configJaFechada.id).map((c) => c.automacaoConfigId);

  assert.ok(configIdsCandidatas.includes(configDue.id));
  assert.ok(!configIdsCandidatas.includes(configNaoDue.id), "horário ainda não alcançado");
  assert.ok(!configIdsCandidatas.includes(configInativa.id), "config inativa nunca é candidata");
  assert.ok(!configIdsCandidatas.includes(configJaFechada.id), "já fechada, não está mais COLLECTING");
});

// ----------------------------------------------- ordenação / conteúdo do snapshot

test("snapshot: mensagens ficam em ordem determinística por timestamp, independente da ordem de captura", async () => {
  const empresaId = await createEmpresa("ordemsnapshot");
  const config = await createConfig(empresaId);

  // Captura fora de ordem de propósito: 13:40, depois 08:05, depois 15:55,
  // depois 08:22 (foto) — o snapshot final deve reordenar por horário do
  // Telegram (message.date), nunca pela ordem em que chegaram ao webhook.
  await captureTextAt({ config, messageId: 4, hora: "13:40", text: "quarta" });
  await captureTextAt({ config, messageId: 1, hora: "08:05", text: "primeira" });
  await captureTextAt({ config, messageId: 5, hora: "15:55", text: "quinta" });
  await capturePhotoAt({ config, messageId: 2, hora: "08:22", fileId: "file-ordem", fileUniqueId: "uniq-ordem" });

  const result = await closeDailyExecution({
    pool,
    automacaoConfigId: config.id,
    referenceDate: "2026-02-14",
    telegramFileClient: createFakeTelegramFileClient(),
    googleDriveClient: createFakeGoogleDriveClient(),
  });
  assert.equal(result.outcome, "READY");

  const execucao = await getExecucao(config.id);
  const { rows } = await pool.query(`SELECT snapshot FROM automacao_execucao_snapshots WHERE id = $1`, [execucao.current_snapshot_id]);
  const ordemRecebida = rows[0].snapshot.messages.map((m) => m.telegramMessageId);
  assert.deepEqual(ordemRecebida, ["1", "2", "4", "5"], "ordem deve seguir o horário do Telegram, não a ordem de captura");
});

test("snapshot: fotos armazenadas referenciam o driveFileId retornado pelo upload", async () => {
  const empresaId = await createEmpresa("driveidcerto");
  const config = await createConfig(empresaId);
  await capturePhoto({ config, messageId: 1, fileId: "file-drive-check", fileUniqueId: "uniq-drive-check" });

  const googleDriveClient = createFakeGoogleDriveClient();
  const result = await closeDailyExecution({
    pool,
    automacaoConfigId: config.id,
    referenceDate: "2026-02-14",
    telegramFileClient: createFakeTelegramFileClient(),
    googleDriveClient,
  });
  assert.equal(result.outcome, "READY");

  const execucao = await getExecucao(config.id);
  const { rows } = await pool.query(`SELECT snapshot FROM automacao_execucao_snapshots WHERE id = $1`, [execucao.current_snapshot_id]);
  const photoMessage = rows[0].snapshot.messages[0];
  assert.ok(photoMessage.photo.driveFileId, "driveFileId não pode ficar vazio para uma foto armazenada");

  const { rows: arquivoRows } = await pool.query(`SELECT drive_file_id FROM automacao_arquivos WHERE telegram_file_id = 'file-drive-check'`);
  assert.equal(photoMessage.photo.driveFileId, arquivoRows[0].drive_file_id, "o ID no snapshot deve bater com o ID persistido em automacao_arquivos");
});

test("snapshot: mensagem de serviço nunca entra (o Bloco 3 já nem persiste — verificação estrutural fim-a-fim)", async () => {
  const empresaId = await createEmpresa("semservicemsg");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1, text: "mensagem normal" });
  await processTelegramUpdate(fixtures.serviceMessageUpdate("new_chat_members", { chatId: config.telegram_chat_id }));

  const result = await closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" });
  assert.equal(result.outcome, "READY");

  const execucao = await getExecucao(config.id);
  const { rows } = await pool.query(`SELECT snapshot FROM automacao_execucao_snapshots WHERE id = $1`, [execucao.current_snapshot_id]);
  assert.equal(rows[0].snapshot.messages.length, 1, "só a mensagem normal deveria estar no snapshot");
});

test("erro inesperado durante o pipeline nunca deixa a execução travada em PROCESSING", async () => {
  const empresaId = await createEmpresa("nuncatravaprocessing");
  const config = await createConfig(empresaId);
  await captureText({ config, messageId: 1 });

  // Config removida no meio do caminho força buildExecutionSnapshot/loadConfigById
  // a falhar de forma inesperada (config null) — simula uma falha real de
  // infraestrutura no meio do pipeline.
  const originalQuery = pool.query.bind(pool);
  let sabotaged = false;
  pool.query = function (text, params, cb) {
    if (!sabotaged && typeof text === "string" && text.includes("FROM automacao_configs WHERE id = $1")) {
      sabotaged = true;
      const err = new Error("falha simulada de infraestrutura");
      if (typeof params === "function") return params(err);
      if (typeof cb === "function") return cb(err);
      return Promise.reject(err);
    }
    return originalQuery(text, params, cb);
  };

  try {
    await assert.rejects(() => closeDailyExecution({ pool, automacaoConfigId: config.id, referenceDate: "2026-02-14" }));
  } finally {
    pool.query = originalQuery;
  }

  const execucao = await getExecucao(config.id);
  assert.notEqual(execucao.status, "PROCESSING", "nunca deveria ficar travado em PROCESSING após uma falha");
  assert.equal(execucao.status, "ERROR");
  assert.ok(execucao.erro_mensagem.includes("falha simulada"));
});

async function captureTextAt({ config, messageId, hora, text }) {
  const dateUnix = Math.floor(new Date(`2026-02-14T${hora}:00-03:00`).getTime() / 1000);
  const update = fixtures.textUpdate({ chatId: config.telegram_chat_id, messageId, date: dateUnix, text });
  const result = await processTelegramUpdate(update);
  return result.results[0];
}

async function capturePhotoAt({ config, messageId, hora, fileId, fileUniqueId }) {
  const dateUnix = Math.floor(new Date(`2026-02-14T${hora}:00-03:00`).getTime() / 1000);
  const update = fixtures.photoUpdate({
    chatId: config.telegram_chat_id,
    messageId,
    date: dateUnix,
    sizes: [{ file_id: fileId, file_unique_id: fileUniqueId, width: 100, height: 100, file_size: 1000 }],
  });
  const result = await processTelegramUpdate(update);
  return result.results[0];
}
