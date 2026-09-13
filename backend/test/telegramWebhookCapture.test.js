"use strict";

/**
 * Testes funcionais de captura Telegram (Bloco 3) — banco real (Postgres
 * local, mesmo padrão introduzido no Bloco 1), chamando o serviço
 * diretamente (`processTelegramUpdate`), sem HTTP. A validação da rota HTTP
 * (secret, isolamento de authMiddleware) fica em telegramWebhookHttp.test.js.
 *
 * Nenhum teste chama telegram.org — updates são gerados por fixtures locais.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const {
  processTelegramUpdate,
  computeDataReferencia,
  getOrCreateDailyExecution,
} = require("../src/modules/automations/telegram/telegramWebhookService");
const fixtures = require("./fixtures/telegramUpdates");

const RUN_TAG = `tgtest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdEmpresaIds = [];
const createdAutomacaoIds = [];
let diarioObraId;
let chatCounter = -1_009_000_000_000_000;

function nextChatId() {
  chatCounter -= 1;
  return chatCounter;
}

async function createEmpresa(nome) {
  const { rows } = await pool.query(`INSERT INTO empresas (nome) VALUES ($1) RETURNING id`, [
    `${RUN_TAG}-${nome}`,
  ]);
  createdEmpresaIds.push(rows[0].id);
  return rows[0].id;
}

async function createConfig(empresaId, { chatId, timezone = "America/Sao_Paulo", ativo = true, deleted = false } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, timezone, telegram_chat_id, ativo, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, empresa_id, timezone`,
    [empresaId, diarioObraId, `${RUN_TAG}-config`, timezone, chatId, ativo, deleted ? new Date() : null]
  );
  return rows[0];
}

async function countMensagens(configId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM telegram_mensagens WHERE automacao_config_id = $1`,
    [configId]
  );
  return rows[0].c;
}

async function countExecucoes(configId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM automacao_execucoes WHERE automacao_config_id = $1`,
    [configId]
  );
  return rows[0].c;
}

async function countEventos(configId, tipoEvento) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM automacao_eventos WHERE automacao_config_id = $1 AND tipo_evento = $2`,
    [configId, tipoEvento]
  );
  return rows[0].c;
}

test.before(async () => {
  await initAutomationsSchema(pool);
  const { rows } = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  diarioObraId = rows[0].id;
});

test.after(async () => {
  if (createdEmpresaIds.length) {
    await pool.query(`DELETE FROM empresas WHERE id = ANY($1::int[])`, [createdEmpresaIds]);
  }
  if (createdAutomacaoIds.length) {
    await pool.query(`DELETE FROM automacoes WHERE id = ANY($1::int[])`, [createdAutomacaoIds]);
  }
  await pool.end();
});

// ---------------------------------------------------------- 5, 6: mensagens

test("mensagem de texto válida cria registro em telegram_mensagens", async () => {
  const empresaId = await createEmpresa("texto");
  const chatId = nextChatId();
  const config = await createConfig(empresaId, { chatId });

  const result = await processTelegramUpdate(fixtures.textUpdate({ chatId, text: "Tudo certo hoje." }));
  assert.equal(result.handled, true);
  assert.equal(result.results[0].status, "created");

  const { rows } = await pool.query(`SELECT tipo, texto, caption FROM telegram_mensagens WHERE automacao_config_id = $1`, [
    config.id,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tipo, "TEXT");
  assert.equal(rows[0].texto, "Tudo certo hoje.");
  assert.equal(rows[0].caption, null);
});

test("foto válida (sem caption) é persistida com tipo PHOTO", async () => {
  const empresaId = await createEmpresa("foto");
  const chatId = nextChatId();
  await createConfig(empresaId, { chatId });

  const result = await processTelegramUpdate(fixtures.photoUpdate({ chatId }));
  assert.equal(result.results[0].status, "created");

  const { rows } = await pool.query(
    `SELECT tipo, caption, telegram_file_id FROM telegram_mensagens WHERE empresa_id = $1`,
    [empresaId]
  );
  assert.equal(rows[0].tipo, "PHOTO");
  assert.equal(rows[0].caption, null);
  assert.ok(rows[0].telegram_file_id);
});

test("foto com caption preserva texto e legenda separadamente", async () => {
  const empresaId = await createEmpresa("foto-caption");
  const chatId = nextChatId();
  await createConfig(empresaId, { chatId });

  await processTelegramUpdate(fixtures.photoUpdate({ chatId, caption: "Frente 2 concluída" }));

  const { rows } = await pool.query(`SELECT tipo, texto, caption FROM telegram_mensagens WHERE empresa_id = $1`, [
    empresaId,
  ]);
  assert.equal(rows[0].tipo, "PHOTO");
  assert.equal(rows[0].texto, null);
  assert.equal(rows[0].caption, "Frente 2 concluída");
});

// -------------------------------------------------------- 8: maior resolução

test("seleciona a maior resolução entre os tamanhos enviados pelo Telegram", async () => {
  const empresaId = await createEmpresa("foto-resolucao");
  const chatId = nextChatId();
  await createConfig(empresaId, { chatId });

  const update = fixtures.photoUpdate({
    chatId,
    // Formato snake_case real da Bot API (não o camelCase normalizado que o
    // parser devolve) — é isto que photoUpdate() injeta em message.photo.
    sizes: [
      { file_id: "grande", file_unique_id: "u-grande", width: 1600, height: 1200, file_size: 300000 },
      { file_id: "pequena", file_unique_id: "u-pequena", width: 90, height: 68, file_size: 900 },
    ],
  });
  await processTelegramUpdate(update);

  const { rows } = await pool.query(
    `SELECT telegram_file_id, foto_largura, foto_altura, foto_tamanho_bytes FROM telegram_mensagens WHERE empresa_id = $1`,
    [empresaId]
  );
  assert.equal(rows[0].telegram_file_id, "grande");
  assert.equal(rows[0].foto_largura, 1600);
  assert.equal(rows[0].foto_altura, 1200);
  assert.equal(Number(rows[0].foto_tamanho_bytes), 300000);
});

// ----------------------------------------------------- 9, 10: várias fotos/álbum

test("várias fotos distintas na mesma config geram registros independentes", async () => {
  const empresaId = await createEmpresa("varias-fotos");
  const chatId = nextChatId();
  await createConfig(empresaId, { chatId });

  await processTelegramUpdate(fixtures.photoUpdate({ chatId }));
  await processTelegramUpdate(fixtures.photoUpdate({ chatId }));
  await processTelegramUpdate(fixtures.photoUpdate({ chatId }));

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM telegram_mensagens WHERE empresa_id = $1`, [
    empresaId,
  ]);
  assert.equal(rows[0].c, 3);
});

test("álbum: media_group_id é preservado sem tentar montar/fechar o álbum", async () => {
  const empresaId = await createEmpresa("album");
  const chatId = nextChatId();
  await createConfig(empresaId, { chatId });

  const updates = fixtures.albumUpdates({ count: 3, chatId, mediaGroupId: "album-abc" });
  for (const update of updates) {
    await processTelegramUpdate(update);
  }

  const { rows } = await pool.query(
    `SELECT media_group_id FROM telegram_mensagens WHERE empresa_id = $1 ORDER BY id`,
    [empresaId]
  );
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.media_group_id === "album-abc"));
});

// -------------------------------------------------- 11, 12: deduplicação

test("mensagem duplicada (mesmo update reprocessado) não duplica registro nem evento", async () => {
  const empresaId = await createEmpresa("dedup-msg");
  const chatId = nextChatId();
  const config = await createConfig(empresaId, { chatId });
  const update = fixtures.textUpdate({ chatId });

  const first = await processTelegramUpdate(update);
  const second = await processTelegramUpdate(update);

  assert.equal(first.results[0].status, "created");
  assert.equal(second.results[0].status, "duplicate");
  assert.equal(await countMensagens(config.id), 1);
  assert.equal(await countEventos(config.id, "TELEGRAM_MESSAGE_RECEIVED"), 1);
});

test("webhook retransmitido (mesmo update_id e message_id) termina idempotente", async () => {
  const empresaId = await createEmpresa("dedup-retransmit");
  const chatId = nextChatId();
  const config = await createConfig(empresaId, { chatId });
  const update = fixtures.photoUpdate({ chatId, caption: "retransmissão" });

  await processTelegramUpdate(update);
  await processTelegramUpdate(update);
  await processTelegramUpdate(update);

  assert.equal(await countMensagens(config.id), 1);
  assert.equal(await countExecucoes(config.id), 1);
  assert.equal(await countEventos(config.id, "TELEGRAM_PHOTO_RECEIVED"), 1);
});

// --------------------------------------------------- 13, 14, 15: execução diária

test("primeira mensagem relevante do dia cria execução COLLECTING", async () => {
  const empresaId = await createEmpresa("exec-primeira");
  const chatId = nextChatId();
  const config = await createConfig(empresaId, { chatId });

  await processTelegramUpdate(fixtures.textUpdate({ chatId }));

  const { rows } = await pool.query(
    `SELECT status, data_referencia FROM automacao_execucoes WHERE automacao_config_id = $1`,
    [config.id]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "COLLECTING");
});

test("segunda mensagem do mesmo dia reutiliza a mesma execução", async () => {
  const empresaId = await createEmpresa("exec-reutiliza");
  const chatId = nextChatId();
  const config = await createConfig(empresaId, { chatId });
  const sameDay = Math.floor(new Date("2026-03-10T15:00:00Z").getTime() / 1000);

  const first = await processTelegramUpdate(fixtures.textUpdate({ chatId, date: sameDay, text: "msg 1" }));
  const second = await processTelegramUpdate(fixtures.textUpdate({ chatId, date: sameDay + 60, text: "msg 2" }));

  assert.equal(first.results[0].executionId, second.results[0].executionId);
  assert.equal(await countExecucoes(config.id), 1);

  const { rows } = await pool.query(`SELECT mensagens_capturadas FROM automacao_execucoes WHERE id = $1`, [
    first.results[0].executionId,
  ]);
  assert.equal(rows[0].mensagens_capturadas, 2);
});

test("mensagem no dia seguinte cria uma nova execução distinta", async () => {
  const empresaId = await createEmpresa("exec-dia-seguinte");
  const chatId = nextChatId();
  const config = await createConfig(empresaId, { chatId, timezone: "UTC" });
  const day1 = Math.floor(new Date("2026-03-10T12:00:00Z").getTime() / 1000);
  const day2 = Math.floor(new Date("2026-03-11T12:00:00Z").getTime() / 1000);

  const first = await processTelegramUpdate(fixtures.textUpdate({ chatId, date: day1 }));
  const second = await processTelegramUpdate(fixtures.textUpdate({ chatId, date: day2 }));

  assert.notEqual(first.results[0].executionId, second.results[0].executionId);
  assert.equal(await countExecucoes(config.id), 2);
});

// -------------------------------------------------------------- 16: timezone

test("timezone da config determina a data_referencia corretamente (23:55 no Brasil continua no dia local)", () => {
  // 2026-03-10 23:55 em America/Sao_Paulo (UTC-3) == 2026-03-11 02:55 UTC.
  const unixSeconds = Math.floor(new Date("2026-03-11T02:55:00Z").getTime() / 1000);
  const dataReferencia = computeDataReferencia(unixSeconds, "America/Sao_Paulo");
  assert.equal(dataReferencia, "2026-03-10");

  const dataReferenciaUtc = computeDataReferencia(unixSeconds, "UTC");
  assert.equal(dataReferenciaUtc, "2026-03-11");
});

test("timezone diferente do Brasil também é suportado (sem hardcode de UTC-3)", () => {
  const unixSeconds = Math.floor(new Date("2026-06-01T04:30:00Z").getTime() / 1000);
  // Bogotá é UTC-5 — 04:30 UTC ainda é 23:30 do dia anterior lá.
  assert.equal(computeDataReferencia(unixSeconds, "America/Bogota"), "2026-05-31");
  assert.equal(computeDataReferencia(unixSeconds, "UTC"), "2026-06-01");
});

// --------------------------------------------- 17, 18, 19: config/chat inválidos

test("config inativa ignora a mensagem (nenhum dado criado)", async () => {
  const empresaId = await createEmpresa("config-inativa");
  const chatId = nextChatId();
  await createConfig(empresaId, { chatId, ativo: false });

  const result = await processTelegramUpdate(fixtures.textUpdate({ chatId }));
  assert.equal(result.handled, false);
  assert.equal(result.reason, "chat_not_configured");

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM telegram_mensagens WHERE empresa_id = $1`, [
    empresaId,
  ]);
  assert.equal(rows[0].c, 0);
});

test("config soft-deleted ignora a mensagem (nenhum dado criado)", async () => {
  const empresaId = await createEmpresa("config-deletada");
  const chatId = nextChatId();
  await createConfig(empresaId, { chatId, deleted: true });

  const result = await processTelegramUpdate(fixtures.textUpdate({ chatId }));
  assert.equal(result.handled, false);

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucoes WHERE empresa_id = $1`, [
    empresaId,
  ]);
  assert.equal(rows[0].c, 0);
});

test("chat desconhecido (nenhuma config) não cria dados e responde sucesso lógico", async () => {
  const chatId = nextChatId(); // nunca associado a nenhuma config
  const result = await processTelegramUpdate(fixtures.textUpdate({ chatId }));
  assert.equal(result.handled, false);
  assert.equal(result.reason, "chat_not_configured");
});

// ------------------------------------------------------- 22, 23, 24: conteúdo

test("mensagem de serviço (membro entrou) não entra no conteúdo do D.O.", async () => {
  const empresaId = await createEmpresa("service-msg");
  const chatId = nextChatId();
  await createConfig(empresaId, { chatId });

  const result = await processTelegramUpdate(fixtures.serviceMessageUpdate("new_chat_members", { chatId }));
  assert.equal(result.handled, false);
  assert.equal(result.reason, "service_message");

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM telegram_mensagens WHERE empresa_id = $1`, [
    empresaId,
  ]);
  assert.equal(rows[0].c, 0);
});

test("callback_query é reconhecido mas nenhuma ação de aprovação é executada", async () => {
  const empresaId = await createEmpresa("callback");
  const chatId = nextChatId();
  await createConfig(empresaId, { chatId });

  const result = await processTelegramUpdate(fixtures.callbackQueryUpdate({ chatId }));
  assert.equal(result.handled, false);
  assert.equal(result.reason, "callback_query_not_implemented");

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM automacao_execucoes WHERE empresa_id = $1`, [
    empresaId,
  ]);
  assert.equal(rows[0].c, 0);
});

test("texto permanece na coluna texto e legenda na coluna caption, nunca concatenados", async () => {
  const empresaId = await createEmpresa("texto-vs-caption");
  const chatId = nextChatId();
  await createConfig(empresaId, { chatId });

  await processTelegramUpdate(fixtures.textUpdate({ chatId, text: "Somente texto" }));
  await processTelegramUpdate(fixtures.photoUpdate({ chatId, caption: "Somente legenda" }));

  const { rows } = await pool.query(
    `SELECT tipo, texto, caption FROM telegram_mensagens WHERE empresa_id = $1 ORDER BY id`,
    [empresaId]
  );
  assert.equal(rows[0].texto, "Somente texto");
  assert.equal(rows[0].caption, null);
  assert.equal(rows[1].texto, null);
  assert.equal(rows[1].caption, "Somente legenda");
});

// --------------------------------------------------------------- 21: BigInt

test("IDs Telegram grandes não perdem precisão ao serem persistidos e lidos de volta", async () => {
  const { parseTelegramJson } = require("../src/modules/automations/telegram/telegramUpdateParser");
  const empresaId = await createEmpresa("bigint");
  const chatId = -1009999999999999; // ainda representável como Number no cadastro da config (colunas normais)
  await createConfig(empresaId, { chatId });

  // rawUpdate construído como string literal — nunca passa por um Number JS
  // intermediário para os IDs de 16+ dígitos, replicando fielmente o que o
  // Telegram envia de fato no corpo bruto do webhook.
  const dateUnix = Math.floor(Date.now() / 1000);
  const raw = `{"update_id":1,"message":{"message_id":222222222222222222,"date":${dateUnix},"chat":{"id":${chatId}},"from":{"id":333333333333333333,"first_name":"T"},"text":"oi"}}`;
  const rawUpdate = parseTelegramJson(raw);

  const result = await processTelegramUpdate(rawUpdate);
  assert.equal(result.results[0].status, "created");

  const { rows } = await pool.query(
    `SELECT message_id, telegram_user_id FROM telegram_mensagens WHERE empresa_id = $1`,
    [empresaId]
  );
  assert.equal(rows[0].message_id, "222222222222222222");
  assert.equal(rows[0].telegram_user_id, "333333333333333333");
});

// ------------------------------------------------ 25: duas configs, mesmo chat

test("duas configs ativas no mesmo chat processam a mesma mensagem de forma independente", async () => {
  const empresaId = await createEmpresa("duas-configs");
  const chatId = nextChatId();
  const configA = await createConfig(empresaId, { chatId });
  const configB = await createConfig(empresaId, { chatId });

  const update = fixtures.textUpdate({ chatId, text: "mensagem para ambas" });
  const result = await processTelegramUpdate(update);

  assert.equal(result.results.length, 2);
  assert.ok(result.results.every((r) => r.status === "created"));

  assert.equal(await countMensagens(configA.id), 1);
  assert.equal(await countMensagens(configB.id), 1);

  // Mesma mensagem física, chat_id e message_id iguais, mas configs diferentes
  // — a UNIQUE(automacao_config_id, chat_id, message_id) nunca é violada.
  const { rows } = await pool.query(
    `SELECT automacao_config_id FROM telegram_mensagens WHERE empresa_id = $1 ORDER BY automacao_config_id`,
    [empresaId]
  );
  assert.deepEqual(
    rows.map((r) => r.automacao_config_id).sort((a, b) => a - b),
    [configA.id, configB.id].sort((a, b) => a - b)
  );

  // Reprocessar o mesmo update de novo: idempotente para as duas configs.
  const replay = await processTelegramUpdate(update);
  assert.ok(replay.results.every((r) => r.status === "duplicate"));
  assert.equal(await countMensagens(configA.id), 1);
  assert.equal(await countMensagens(configB.id), 1);
});

// -------------------------------------------------------- 26: falha transacional

test("falha ao registrar o evento não deixa execução/mensagem parcialmente persistida (ROLLBACK completo)", async () => {
  const empresaId = await createEmpresa("falha-transacional");
  const chatId = nextChatId();
  const config = await createConfig(empresaId, { chatId });

  // node-postgres usa internamente uma interface dual (Promise OU callback)
  // tanto em `pool.connect` quanto em `client.query` — `pool.query(...)`
  // (usado por findActiveConfigsByChatId e pelas próprias asserções deste
  // teste) chama `pool.connect(callback)` no estilo callback por baixo dos
  // panos. Um mock que só soubesse responder no estilo Promise faria essa
  // chamada interna ficar pendurada para sempre (o callback nunca seria
  // invocado) — por isso o mock abaixo detecta e delega os dois estilos.
  const originalConnect = pool.connect.bind(pool);
  pool.connect = function (callback) {
    if (typeof callback === "function") {
      return originalConnect(callback);
    }
    return (async () => {
      const client = await originalConnect();
      const originalQuery = client.query.bind(client);
      client.query = function (sql, params, cb) {
        if (typeof params === "function") {
          cb = params;
          params = undefined;
        }
        if (typeof sql === "string" && sql.includes("INSERT INTO automacao_eventos")) {
          const err = new Error("Falha proposital de teste");
          if (typeof cb === "function") return cb(err);
          return Promise.reject(err);
        }
        return originalQuery(sql, params, cb);
      };
      return client;
    })();
  };

  try {
    await assert.rejects(
      () => processTelegramUpdate(fixtures.textUpdate({ chatId })),
      /Falha proposital de teste/
    );
  } finally {
    pool.connect = originalConnect;
  }

  assert.equal(await countMensagens(config.id), 0, "mensagem não pode sobreviver ao ROLLBACK");
  assert.equal(await countExecucoes(config.id), 0, "execução criada na mesma transação também deve ser desfeita");
});

test("getOrCreateDailyExecution é idempotente sob a constraint UNIQUE mesmo chamado fora de uma transação já aberta", async () => {
  const empresaId = await createEmpresa("get-or-create-direto");
  const chatId = nextChatId();
  const config = await createConfig(empresaId, { chatId });
  const client = await pool.connect();
  try {
    const first = await getOrCreateDailyExecution(client, config.id, empresaId, "2026-05-01");
    const second = await getOrCreateDailyExecution(client, config.id, empresaId, "2026-05-01");
    assert.equal(first.id, second.id);
  } finally {
    client.release();
  }
});
