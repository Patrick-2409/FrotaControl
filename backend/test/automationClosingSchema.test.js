"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");

const RUN_TAG = `closingschema-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

async function createExecucao(config, dataReferencia = "2026-02-14") {
  const { rows } = await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia) VALUES ($1,$2,$3) RETURNING *`,
    [config.id, config.empresa_id, dataReferencia]
  );
  return rows[0];
}

test("rodar initAutomationsSchema 2x seguidas não falha (idempotência do Bloco 5)", async () => {
  await assert.doesNotReject(() => initAutomationsSchema(pool));
  await assert.doesNotReject(() => initAutomationsSchema(pool));
});

test("CHECK de status aceita READY_FOR_GENERATION", async () => {
  const empresaId = await createEmpresa("statusready");
  const config = await createConfig(empresaId);
  await assert.doesNotReject(() =>
    pool.query(`INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia, status) VALUES ($1,$2,'2026-02-14','READY_FOR_GENERATION')`, [
      config.id,
      empresaId,
    ])
  );
});

test("CHECK de status rejeita valor inválido", async () => {
  const empresaId = await createEmpresa("statusinvalido");
  const config = await createConfig(empresaId);
  await assert.rejects(() =>
    pool.query(`INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia, status) VALUES ($1,$2,'2026-02-14','ESTADO_INVENTADO')`, [
      config.id,
      empresaId,
    ])
  );
});

test("CHECK de erro_codigo aceita NULL e PHOTO_STORAGE_PENDING, rejeita valor fora do domínio", async () => {
  const empresaId = await createEmpresa("errocodigo");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);

  await assert.doesNotReject(() =>
    pool.query(`UPDATE automacao_execucoes SET erro_codigo = NULL WHERE id = $1`, [execucao.id])
  );
  await assert.doesNotReject(() =>
    pool.query(`UPDATE automacao_execucoes SET erro_codigo = 'PHOTO_STORAGE_PENDING' WHERE id = $1`, [execucao.id])
  );
  await assert.rejects(() =>
    pool.query(`UPDATE automacao_execucoes SET erro_codigo = 'CODIGO_INVENTADO' WHERE id = $1`, [execucao.id])
  );
});

test("CHECK de reason em automacao_execucao_snapshots aceita INITIAL_CLOSING/REBUILD, rejeita outro valor", async () => {
  const empresaId = await createEmpresa("snapreason");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);

  const insert = (reason) =>
    pool.query(
      `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason)
       VALUES ($1,$2,$3,'{}'::jsonb,'hash',$4)`,
      [empresaId, execucao.id, reason === "INITIAL_CLOSING" ? 1 : 2, reason]
    );

  await assert.doesNotReject(() => insert("INITIAL_CLOSING"));
  await assert.doesNotReject(() => insert("REBUILD"));
  await assert.rejects(() =>
    pool.query(
      `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason)
       VALUES ($1,$2,3,'{}'::jsonb,'hash','MOTIVO_INVENTADO')`,
      [empresaId, execucao.id]
    )
  );
});

test("UNIQUE(automacao_execucao_id, versao): não permite duas linhas com a mesma versão para a mesma execução", async () => {
  const empresaId = await createEmpresa("snapunique");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);

  await pool.query(
    `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason)
     VALUES ($1,$2,1,'{}'::jsonb,'hash-a','INITIAL_CLOSING')`,
    [empresaId, execucao.id]
  );
  await assert.rejects(() =>
    pool.query(
      `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason)
       VALUES ($1,$2,1,'{}'::jsonb,'hash-b','REBUILD')`,
      [empresaId, execucao.id]
    )
  );
});

test("histórico de snapshots é preservado: duas versões da mesma execução convivem", async () => {
  const empresaId = await createEmpresa("historico");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);

  await pool.query(
    `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason)
     VALUES ($1,$2,1,'{"v":1}'::jsonb,'hash-v1','INITIAL_CLOSING'), ($1,$2,2,'{"v":2}'::jsonb,'hash-v2','REBUILD')`,
    [empresaId, execucao.id]
  );
  const { rows } = await pool.query(
    `SELECT versao, snapshot_hash FROM automacao_execucao_snapshots WHERE automacao_execucao_id = $1 ORDER BY versao`,
    [execucao.id]
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].snapshot_hash, "hash-v1");
  assert.equal(rows[1].snapshot_hash, "hash-v2");
});

test("soft delete da config NÃO apaga o histórico de snapshots (deleted_at nunca dispara CASCADE)", async () => {
  const empresaId = await createEmpresa("softdelete");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  await pool.query(
    `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason)
     VALUES ($1,$2,1,'{}'::jsonb,'hash-x','INITIAL_CLOSING')`,
    [empresaId, execucao.id]
  );

  await pool.query(`UPDATE automacao_configs SET deleted_at = NOW() WHERE id = $1`, [config.id]);

  const { rows } = await pool.query(`SELECT id FROM automacao_execucao_snapshots WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(rows.length, 1, "soft delete não é DELETE físico — nunca aciona ON DELETE CASCADE");
});

test("FK tenant-safe: automacao_execucao_snapshots carrega empresa_id direto (não só via JOIN)", async () => {
  const empresaId = await createEmpresa("tenantsafe");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  const { rows: insertRows } = await pool.query(
    `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason)
     VALUES ($1,$2,1,'{}'::jsonb,'hash','INITIAL_CLOSING') RETURNING empresa_id`,
    [empresaId, execucao.id]
  );
  assert.equal(insertRows[0].empresa_id, empresaId);
});

test("delete físico de uma execução ainda em cascata apaga seus snapshots (FK ON DELETE CASCADE), nunca o contrário", async () => {
  const empresaId = await createEmpresa("cascade");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config);
  await pool.query(
    `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason)
     VALUES ($1,$2,1,'{}'::jsonb,'hash','INITIAL_CLOSING')`,
    [empresaId, execucao.id]
  );
  await pool.query(`DELETE FROM automacao_execucoes WHERE id = $1`, [execucao.id]);
  const { rows } = await pool.query(`SELECT id FROM automacao_execucao_snapshots WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(rows.length, 0);
});
