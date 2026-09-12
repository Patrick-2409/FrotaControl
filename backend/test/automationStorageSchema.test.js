"use strict";

/**
 * Testes de schema específicos do Bloco 4 (o arquivo do Bloco 1,
 * automationsSchemaFoundation.test.js, permanece intocado — cada bloco
 * cobre sua própria evolução aditiva).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");

const RUN_TAG = `storageschema-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

async function createConfig(empresaId) {
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  const { rows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome, google_drive_pasta_raiz_id) VALUES ($1,$2,'cfg','root1') RETURNING *`,
    [empresaId, cat.rows[0].id]
  );
  return rows[0];
}

async function createExecucao(config) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia) VALUES ($1,$2,'2026-02-14') RETURNING *`,
    [config.id, config.empresa_id]
  );
  return rows[0];
}

test("rodar initAutomationsSchema 2x seguidas não falha (idempotência do Bloco 4)", async () => {
  await assert.doesNotReject(() => initAutomationsSchema(pool));
  await assert.doesNotReject(() => initAutomationsSchema(pool));
});

test("CHECK de storage_status aceita NULL (mensagem não-PHOTO)", async () => {
  const empresaId = await createEmpresa("checknull");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  await assert.doesNotReject(() =>
    pool.query(
      `INSERT INTO telegram_mensagens (empresa_id, automacao_config_id, automacao_execucao_id, chat_id, message_id, tipo, storage_status)
       VALUES ($1,$2,$3,-1,1,'TEXT',NULL)`,
      [empresaId, config.id, execucao.id]
    )
  );
});

test("CHECK de storage_status rejeita valor fora do enum", async () => {
  const empresaId = await createEmpresa("checkinvalido");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO telegram_mensagens (empresa_id, automacao_config_id, automacao_execucao_id, chat_id, message_id, tipo, storage_status)
         VALUES ($1,$2,$3,-1,1,'PHOTO','VALOR_INVENTADO')`,
        [empresaId, config.id, execucao.id]
      ),
    /telegram_mensagens_storage_status_chk|check constraint/i
  );
});

test("automacao_arquivos: no máximo 1 linha por telegram_mensagem_id (índice único parcial)", async () => {
  const empresaId = await createEmpresa("uxarquivo");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  const { rows: msgRows } = await pool.query(
    `INSERT INTO telegram_mensagens (empresa_id, automacao_config_id, automacao_execucao_id, chat_id, message_id, tipo, storage_status)
     VALUES ($1,$2,$3,-1,1,'PHOTO','PENDING') RETURNING id`,
    [empresaId, config.id, execucao.id]
  );
  const mensagemId = msgRows[0].id;

  const insertArquivo = () =>
    pool.query(
      `INSERT INTO automacao_arquivos (empresa_id, automacao_execucao_id, tipo, telegram_mensagem_id)
       VALUES ($1,$2,'PHOTO',$3)
       ON CONFLICT (telegram_mensagem_id) WHERE telegram_mensagem_id IS NOT NULL DO NOTHING`,
      [empresaId, execucao.id, mensagemId]
    );

  await insertArquivo();
  await insertArquivo();

  const { rows } = await pool.query(`SELECT id FROM automacao_arquivos WHERE telegram_mensagem_id = $1`, [mensagemId]);
  assert.equal(rows.length, 1, "a segunda tentativa de insert deveria ser um no-op silencioso");
});

test("automacao_arquivos.telegram_mensagem_id é nullable (EXCEL/PDF de blocos futuros não têm origem no Telegram)", async () => {
  const empresaId = await createEmpresa("nullorigem");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  await assert.doesNotReject(() =>
    pool.query(
      `INSERT INTO automacao_arquivos (empresa_id, automacao_execucao_id, tipo, telegram_mensagem_id) VALUES ($1,$2,'EXCEL',NULL)`,
      [empresaId, execucao.id]
    )
  );
});

test("colunas de storage têm defaults corretos numa inserção mínima de mensagem PHOTO", async () => {
  const empresaId = await createEmpresa("defaults");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  const { rows } = await pool.query(
    `INSERT INTO telegram_mensagens (empresa_id, automacao_config_id, automacao_execucao_id, chat_id, message_id, tipo, storage_status)
     VALUES ($1,$2,$3,-1,1,'PHOTO','PENDING') RETURNING storage_attempts, storage_last_error, storage_completed_at`,
    [empresaId, config.id, execucao.id]
  );
  assert.equal(rows[0].storage_attempts, 0);
  assert.equal(rows[0].storage_last_error, null);
  assert.equal(rows[0].storage_completed_at, null);
});
