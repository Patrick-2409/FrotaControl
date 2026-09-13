"use strict";

/**
 * Testes de integração contra o Postgres LOCAL de desenvolvimento (mesmo
 * banco dos Blocos 1-3) — necessário porque o que se prova aqui é o
 * comportamento do advisory lock e da persistência condicional, que mocks
 * não reproduziriam com fidelidade (ver mesma justificativa em
 * telegramWebhookCapture.test.js). O `driveClient` é SEMPRE uma fake
 * injetada — nenhuma chamada de rede real acontece.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const { ensureExecutionFolders } = require("../src/modules/automations/storage/folderProvisioningService");

const RUN_TAG = `folderprov-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

async function createExecucao(config, dataReferencia) {
  const { rows } = await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia) VALUES ($1,$2,$3) RETURNING *`,
    [config.id, config.empresa_id, dataReferencia]
  );
  return rows[0];
}

/**
 * Fake que simula o comportamento REAL de `ensureFolder` (find-or-create por
 * parentId+name) — importante para o teste de "reaproveitamento entre
 * execuções" (ver abaixo): mesmo quando folderProvisioningService pede pra
 * (re)criar um nível cujo ID não estava cacheado NAQUELA execução (ex.: o
 * "ano" é uma coluna por execução, não só por config), o Drive de verdade
 * encontraria a pasta já existente por nome — nunca duplica.
 */
function createFakeDriveClient({ delayMs = 0 } = {}) {
  const calls = [];
  const store = new Map();
  let counter = 0;
  return {
    calls,
    ensureFolder: async ({ parentId, name, appProperties }) => {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      calls.push({ parentId, name, appProperties });
      const key = `${parentId}::${name}`;
      if (store.has(key)) {
        return { ...store.get(key), wasCreated: false };
      }
      counter += 1;
      const folder = { id: `drive-${name}-${counter}`, name };
      store.set(key, folder);
      return { ...folder, wasCreated: true };
    },
  };
}

test("execução inexistente lança erro claro", async () => {
  const driveClient = createFakeDriveClient();
  await assert.rejects(() => ensureExecutionFolders({ pool, execucaoId: 999999999, driveClient }), /não encontrada/);
  assert.equal(driveClient.calls.length, 0);
});

test("config sem google_drive_pasta_raiz_id falha como CONFIGURACAO_INCOMPLETA (DEFINITIVE), sem chamar o Drive", async () => {
  const empresaId = await createEmpresa("semraiz");
  const config = await createConfig(empresaId, { raizId: null });
  const execucao = await createExecucao(config, "2026-02-14");
  const driveClient = createFakeDriveClient();
  await assert.rejects(() => ensureExecutionFolders({ pool, execucaoId: execucao.id, driveClient }), (err) => {
    assert.equal(err.code, "CONFIGURACAO_INCOMPLETA");
    assert.equal(err.storageErrorClass, "DEFINITIVE");
    return true;
  });
  assert.equal(driveClient.calls.length, 0);
});

test("provisionamento completo cria os 5 níveis em cadeia e persiste cada um", async () => {
  const empresaId = await createEmpresa("completo");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config, "2026-02-14");
  const driveClient = createFakeDriveClient();

  const result = await ensureExecutionFolders({ pool, execucaoId: execucao.id, driveClient });

  assert.equal(driveClient.calls.length, 5);
  assert.deepEqual(
    driveClient.calls.map((c) => c.name),
    ["Diários de Obra", "2026", "02 - Fevereiro", "2026-02-14", "Fotos"]
  );
  // Cada nível é criado dentro do pai correto — a cadeia (raiz -> Diários de
  // Obra -> ano -> mês -> dia -> Fotos) é o que garante a árvore certa no Drive.
  assert.equal(driveClient.calls[0].parentId, "root-fake-1");
  assert.equal(driveClient.calls[1].parentId, `drive-${driveClient.calls[0].name}-1`);
  assert.equal(driveClient.calls[2].parentId, result.anoId);
  assert.equal(driveClient.calls[3].parentId, result.mesId);
  assert.equal(driveClient.calls[4].parentId, result.diaId);

  const { rows: configRows } = await pool.query(`SELECT google_drive_pasta_diarios_id FROM automacao_configs WHERE id = $1`, [config.id]);
  assert.ok(configRows[0].google_drive_pasta_diarios_id);

  const { rows: execRows } = await pool.query(
    `SELECT drive_folder_ano_id, drive_folder_mes_id, drive_folder_dia_id, drive_folder_fotos_id FROM automacao_execucoes WHERE id = $1`,
    [execucao.id]
  );
  assert.equal(execRows[0].drive_folder_ano_id, result.anoId);
  assert.equal(execRows[0].drive_folder_mes_id, result.mesId);
  assert.equal(execRows[0].drive_folder_dia_id, result.diaId);
  assert.equal(execRows[0].drive_folder_fotos_id, result.fotosId);
});

test("fast path: segunda chamada com tudo já persistido não toca o Drive", async () => {
  const empresaId = await createEmpresa("fastpath");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config, "2026-02-14");
  const driveClient1 = createFakeDriveClient();
  await ensureExecutionFolders({ pool, execucaoId: execucao.id, driveClient: driveClient1 });

  const driveClient2 = createFakeDriveClient();
  const result2 = await ensureExecutionFolders({ pool, execucaoId: execucao.id, driveClient: driveClient2 });
  assert.equal(driveClient2.calls.length, 0);
  assert.equal(result2.anyCreated, false);
});

test("segunda execução da MESMA config em outro mês reaproveita 'Diários de Obra' (cache em config) e o Drive deduplica o ano por nome", async () => {
  const empresaId = await createEmpresa("reaproveita");
  const config = await createConfig(empresaId);
  // UM único fake compartilhado entre as duas execuções — simula o mesmo
  // backend real do Drive sendo consultado duas vezes, não dois Drives
  // diferentes. `drive_folder_ano_id`/`mes_id` são colunas POR EXECUÇÃO (já
  // existiam desde o Bloco 1), então uma execução nova sempre pede pro Drive
  // de novo pra "ano"/"mês" — o que importa é que o Drive (real ou este fake)
  // devolve o MESMO id por nome, nunca duplica a pasta.
  const sharedDriveClient = createFakeDriveClient();

  const execucao1 = await createExecucao(config, "2026-02-14");
  const result1 = await ensureExecutionFolders({ pool, execucaoId: execucao1.id, driveClient: sharedDriveClient });
  assert.equal(sharedDriveClient.calls.length, 5);

  const execucao2 = await createExecucao(config, "2026-03-01");
  const result2 = await ensureExecutionFolders({ pool, execucaoId: execucao2.id, driveClient: sharedDriveClient });

  // "Diários de Obra" veio do cache em automacao_configs — não gerou nova
  // chamada; "ano"/"mês"/"dia"/"Fotos" pedem de novo (são por execução), mas
  // sem duplicar nada no Drive.
  assert.equal(sharedDriveClient.calls.length, 9, "5 da primeira execução + 4 da segunda (ano/mês/dia/fotos)");
  const call6to9 = sharedDriveClient.calls.slice(5).map((c) => c.name);
  assert.deepEqual(call6to9, ["2026", "03 - Março", "2026-03-01", "Fotos"]);
  assert.equal(result2.anoId, result1.anoId, "o Drive deduplica por nome: mesmo ano civil => mesmo ID, nunca uma pasta '2026' duplicada");
});

test("concorrência: duas chamadas simultâneas para a MESMA execução nunca-provisionada não duplicam pastas (advisory lock)", async () => {
  const empresaId = await createEmpresa("concorrencia");
  const config = await createConfig(empresaId);
  const execucao = await createExecucao(config, "2026-05-10");

  const sharedDriveClient = createFakeDriveClient({ delayMs: 40 });
  const [resultA, resultB] = await Promise.all([
    ensureExecutionFolders({ pool, execucaoId: execucao.id, driveClient: sharedDriveClient }),
    ensureExecutionFolders({ pool, execucaoId: execucao.id, driveClient: sharedDriveClient }),
  ]);

  assert.equal(sharedDriveClient.calls.length, 5, "os 5 níveis devem ser criados exatamente uma vez no total, nunca 10");
  // O vencedor da corrida pelo advisory lock reporta anyCreated:true; quem
  // esperou reaproveita tudo já persistido (anyCreated:false) — isso é
  // esperado e correto, o que NUNCA pode divergir são os IDs retornados.
  assert.deepEqual(
    { anoId: resultA.anoId, mesId: resultA.mesId, diaId: resultA.diaId, fotosId: resultA.fotosId },
    { anoId: resultB.anoId, mesId: resultB.mesId, diaId: resultB.diaId, fotosId: resultB.fotosId }
  );
  assert.equal([resultA.anyCreated, resultB.anyCreated].filter(Boolean).length, 1, "exatamente um dos dois deve ter criado as pastas");
});
