"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");

const RUN_TAG = `aischema-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome) VALUES ($1,$2,'cfg') RETURNING *`,
    [empresaId, cat.rows[0].id]
  );
  return rows[0];
}

async function createExecucaoComSnapshot(config) {
  const { rows: execRows } = await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia) VALUES ($1,$2,'2026-02-14') RETURNING *`,
    [config.id, config.empresa_id]
  );
  const execucao = execRows[0];
  const { rows: snapRows } = await pool.query(
    `INSERT INTO automacao_execucao_snapshots (empresa_id, automacao_execucao_id, versao, snapshot, snapshot_hash, reason)
     VALUES ($1,$2,1,'{}'::jsonb,'hash1','INITIAL_CLOSING') RETURNING *`,
    [config.empresa_id, execucao.id]
  );
  return { execucao, snapshot: snapRows[0] };
}

test("rodar initAutomationsSchema 2x seguidas não falha (idempotência do Bloco 6)", async () => {
  await assert.doesNotReject(() => initAutomationsSchema(pool));
  await assert.doesNotReject(() => initAutomationsSchema(pool));
});

test("CHECK de status aceita AI_PROCESSING e READY_FOR_DOCUMENT", async () => {
  const empresaId = await createEmpresa("statusai");
  const config = await createConfig(empresaId);
  for (const status of ["AI_PROCESSING", "READY_FOR_DOCUMENT"]) {
    await assert.doesNotReject(
      () =>
        pool.query(`INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia, status) VALUES ($1,$2,$3,$4)`, [
          config.id,
          empresaId,
          status === "AI_PROCESSING" ? "2026-01-01" : "2026-01-02",
          status,
        ]),
      `status ${status} deveria ser aceito`
    );
  }
});

test("CHECK de erro_codigo (execuções) aceita códigos de IA além dos de fechamento", async () => {
  const empresaId = await createEmpresa("errocodigoia");
  const config = await createConfig(empresaId);
  const { execucao } = await createExecucaoComSnapshot(config);
  for (const code of ["AI_TIMEOUT", "AI_RATE_LIMIT", "AI_DISABLED", "AI_SOURCE_REFERENCE_INVALID"]) {
    await assert.doesNotReject(() => pool.query(`UPDATE automacao_execucoes SET erro_codigo = $2 WHERE id = $1`, [execucao.id, code]));
  }
  await assert.rejects(() => pool.query(`UPDATE automacao_execucoes SET erro_codigo = 'CODIGO_INVENTADO' WHERE id = $1`, [execucao.id]));
});

test("automacao_execucao_inteligencias: CHECK de status aceita PROCESSING/COMPLETED/FAILED, rejeita outro valor", async () => {
  const empresaId = await createEmpresa("intstatus");
  const config = await createConfig(empresaId);
  const { execucao, snapshot } = await createExecucaoComSnapshot(config);

  for (const status of ["PROCESSING", "COMPLETED", "FAILED"]) {
    await assert.doesNotReject(() =>
      pool.query(
        `INSERT INTO automacao_execucao_inteligencias (empresa_id, automacao_execucao_id, snapshot_id, versao, prompt_version, model, status)
         VALUES ($1,$2,$3,$4,'1','m',$5)`,
        [empresaId, execucao.id, snapshot.id, status === "PROCESSING" ? 1 : status === "COMPLETED" ? 2 : 3, status]
      )
    );
  }
  await assert.rejects(() =>
    pool.query(
      `INSERT INTO automacao_execucao_inteligencias (empresa_id, automacao_execucao_id, snapshot_id, versao, prompt_version, model, status)
       VALUES ($1,$2,$3,4,'1','m','ESTADO_INVENTADO')`,
      [empresaId, execucao.id, snapshot.id]
    )
  );
});

test("automacao_execucao_inteligencias: UNIQUE(execucao, snapshot, versao) impede duas linhas iguais", async () => {
  const empresaId = await createEmpresa("intunique");
  const config = await createConfig(empresaId);
  const { execucao, snapshot } = await createExecucaoComSnapshot(config);

  await pool.query(
    `INSERT INTO automacao_execucao_inteligencias (empresa_id, automacao_execucao_id, snapshot_id, versao, prompt_version, model, status)
     VALUES ($1,$2,$3,1,'1','m','PROCESSING')`,
    [empresaId, execucao.id, snapshot.id]
  );
  await assert.rejects(() =>
    pool.query(
      `INSERT INTO automacao_execucao_inteligencias (empresa_id, automacao_execucao_id, snapshot_id, versao, prompt_version, model, status)
       VALUES ($1,$2,$3,1,'1','m2','PROCESSING')`,
      [empresaId, execucao.id, snapshot.id]
    )
  );
});

test("histórico de inteligências é preservado: duas versões do mesmo (execucao, snapshot) convivem", async () => {
  const empresaId = await createEmpresa("inthistorico");
  const config = await createConfig(empresaId);
  const { execucao, snapshot } = await createExecucaoComSnapshot(config);
  await pool.query(
    `INSERT INTO automacao_execucao_inteligencias (empresa_id, automacao_execucao_id, snapshot_id, versao, prompt_version, model, status)
     VALUES ($1,$2,$3,1,'1','m','COMPLETED'), ($1,$2,$3,2,'1','m','COMPLETED')`,
    [empresaId, execucao.id, snapshot.id]
  );
  const { rows } = await pool.query(`SELECT versao FROM automacao_execucao_inteligencias WHERE automacao_execucao_id = $1 ORDER BY versao`, [execucao.id]);
  assert.deepEqual(rows.map((r) => r.versao), [1, 2]);
});

test("automacao_arquivo_analises: UNIQUE(arquivo, model, prompt_version) impede duplicata de cache", async () => {
  const empresaId = await createEmpresa("cacheunique");
  const config = await createConfig(empresaId);
  const { execucao } = await createExecucaoComSnapshot(config);
  const { rows: arquivoRows } = await pool.query(
    `INSERT INTO automacao_arquivos (empresa_id, automacao_execucao_id, tipo, drive_file_id) VALUES ($1,$2,'PHOTO','d1') RETURNING id`,
    [empresaId, execucao.id]
  );
  const arquivoId = arquivoRows[0].id;

  await pool.query(
    `INSERT INTO automacao_arquivo_analises (empresa_id, automacao_arquivo_id, model, prompt_version, analysis, analysis_hash)
     VALUES ($1,$2,'m','1','{}'::jsonb,'h1')`,
    [empresaId, arquivoId]
  );
  await assert.rejects(() =>
    pool.query(
      `INSERT INTO automacao_arquivo_analises (empresa_id, automacao_arquivo_id, model, prompt_version, analysis, analysis_hash)
       VALUES ($1,$2,'m','1','{}'::jsonb,'h2')`,
      [empresaId, arquivoId]
    )
  );
});

test("automacao_arquivo_analises: modelo/prompt_version diferentes coexistem para o mesmo arquivo (cache por versão)", async () => {
  const empresaId = await createEmpresa("cachemulti");
  const config = await createConfig(empresaId);
  const { execucao } = await createExecucaoComSnapshot(config);
  const { rows: arquivoRows } = await pool.query(
    `INSERT INTO automacao_arquivos (empresa_id, automacao_execucao_id, tipo, drive_file_id) VALUES ($1,$2,'PHOTO','d2') RETURNING id`,
    [empresaId, execucao.id]
  );
  const arquivoId = arquivoRows[0].id;

  await pool.query(
    `INSERT INTO automacao_arquivo_analises (empresa_id, automacao_arquivo_id, model, prompt_version, analysis, analysis_hash)
     VALUES ($1,$2,'m1','1','{}'::jsonb,'h1'), ($1,$2,'m2','1','{}'::jsonb,'h2')`,
    [empresaId, arquivoId]
  );
  const { rows } = await pool.query(`SELECT model FROM automacao_arquivo_analises WHERE automacao_arquivo_id = $1 ORDER BY model`, [arquivoId]);
  assert.deepEqual(rows.map((r) => r.model), ["m1", "m2"]);
});

test("soft delete da config não apaga o histórico de inteligências (deleted_at nunca dispara CASCADE)", async () => {
  const empresaId = await createEmpresa("softdeleteia");
  const config = await createConfig(empresaId);
  const { execucao, snapshot } = await createExecucaoComSnapshot(config);
  await pool.query(
    `INSERT INTO automacao_execucao_inteligencias (empresa_id, automacao_execucao_id, snapshot_id, versao, prompt_version, model, status)
     VALUES ($1,$2,$3,1,'1','m','COMPLETED')`,
    [empresaId, execucao.id, snapshot.id]
  );
  await pool.query(`UPDATE automacao_configs SET deleted_at = NOW() WHERE id = $1`, [config.id]);
  const { rows } = await pool.query(`SELECT id FROM automacao_execucao_inteligencias WHERE automacao_execucao_id = $1`, [execucao.id]);
  assert.equal(rows.length, 1);
});
