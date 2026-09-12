"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional();

const { pool } = require("../src/db");
const { initAutomationsSchema } = require("../src/modules/automations/automationSchema");
const {
  buildTextEvidence,
  buildValidSourceRefs,
  buildTextByRefMap,
  listStoredPhotosFromSnapshot,
  resolveArquivosForExecution,
} = require("../src/modules/automations/ai/evidenceBuilder");

function fakeSnapshot() {
  return {
    version: 1,
    referenceDate: "2026-02-14",
    timezone: "America/Sao_Paulo",
    messages: [
      {
        telegramMessageId: "1",
        timestamp: "2026-02-14T11:05:00.000Z",
        type: "TEXT",
        author: { id: "555", name: "João", username: "joaofiscal" },
        text: "Plantio realizado.",
        caption: null,
        effectiveText: "Plantio realizado.",
        mediaGroupId: null,
        photo: null,
      },
      {
        telegramMessageId: "2",
        timestamp: "2026-02-14T11:10:00.000Z",
        type: "PHOTO",
        author: { id: "555", name: "João", username: "joaofiscal" },
        text: null,
        caption: "Foto da equipe",
        effectiveText: "Foto da equipe",
        mediaGroupId: null,
        photo: { stored: true, driveFileId: "drive-abc", fileUniqueId: "uniq-abc", failed: false, failureReason: null },
      },
      {
        telegramMessageId: "3",
        timestamp: "2026-02-14T11:15:00.000Z",
        type: "PHOTO",
        author: { id: "555", name: "João", username: "joaofiscal" },
        text: null,
        caption: "Foto que falhou",
        effectiveText: "Foto que falhou",
        mediaGroupId: null,
        photo: { stored: false, driveFileId: null, fileUniqueId: "uniq-falha", failed: true, failureReason: "arquivo grande" },
      },
    ],
  };
}

test("buildTextEvidence: remove o sub-objeto photo, mantém os demais campos", () => {
  const evidence = buildTextEvidence(fakeSnapshot());
  assert.equal(evidence.length, 3);
  for (const item of evidence) {
    assert.equal("photo" in item, false);
  }
  assert.equal(evidence[0].text, "Plantio realizado.");
  assert.equal(evidence[1].caption, "Foto da equipe");
});

test("buildValidSourceRefs: inclui todo telegramMessageId e só driveFileId de fotos armazenadas", () => {
  const refs = buildValidSourceRefs(fakeSnapshot());
  assert.ok(refs.has("1"));
  assert.ok(refs.has("2"));
  assert.ok(refs.has("3"));
  assert.ok(refs.has("drive-abc"));
  assert.equal(refs.has(null), false);
  assert.equal(refs.size, 4);
});

test("listStoredPhotosFromSnapshot: só fotos com stored=true, nunca as falhas/pendentes", () => {
  const photos = listStoredPhotosFromSnapshot(fakeSnapshot());
  assert.equal(photos.length, 1);
  assert.equal(photos[0].sourceRef, "drive-abc");
  assert.equal(photos[0].caption, "Foto da equipe");
});

test("buildTextByRefMap: combina text+caption por telegramMessageId", () => {
  const map = buildTextByRefMap(fakeSnapshot());
  assert.equal(map.get("1"), "Plantio realizado.");
  assert.equal(map.get("2"), "Foto da equipe");
});

// -------------------------------------------------- resolução segura (Seção 23)

const RUN_TAG = `evidencebuilder-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

async function createConfigExecucaoArquivo(empresaId, driveFileId) {
  const cat = await pool.query(`SELECT id FROM automacoes WHERE codigo = 'diario_obra'`);
  const { rows: configRows } = await pool.query(
    `INSERT INTO automacao_configs (empresa_id, automacao_id, nome) VALUES ($1,$2,'cfg') RETURNING *`,
    [empresaId, cat.rows[0].id]
  );
  const config = configRows[0];
  const { rows: execRows } = await pool.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia) VALUES ($1,$2,'2026-02-14') RETURNING *`,
    [config.id, empresaId]
  );
  const execucao = execRows[0];
  await pool.query(
    `INSERT INTO automacao_arquivos (empresa_id, automacao_execucao_id, tipo, drive_file_id, mime_type) VALUES ($1,$2,'PHOTO',$3,'image/jpeg')`,
    [empresaId, execucao.id, driveFileId]
  );
  return { config, execucao };
}

test("resolveArquivosForExecution: resolve apenas arquivos da execução/empresa corretas", async () => {
  const empresaA = await createEmpresa("segA");
  const empresaB = await createEmpresa("segB");
  const { execucao: execA } = await createConfigExecucaoArquivo(empresaA, "drive-a-1");
  await createConfigExecucaoArquivo(empresaB, "drive-b-1");

  const resolved = await resolveArquivosForExecution(pool, {
    empresaId: empresaA,
    automacaoExecucaoId: execA.id,
    driveFileIds: ["drive-a-1", "drive-b-1"],
  });

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].drive_file_id, "drive-a-1");
});

test("resolveArquivosForExecution: um driveFileId arbitrário (nunca persistido) nunca é resolvido", async () => {
  const empresaId = await createEmpresa("segarbitrario");
  const { execucao } = await createConfigExecucaoArquivo(empresaId, "drive-real-1");

  const resolved = await resolveArquivosForExecution(pool, {
    empresaId,
    automacaoExecucaoId: execucao.id,
    driveFileIds: ["drive-inventado-pelo-usuario"],
  });
  assert.equal(resolved.length, 0);
});

test("resolveArquivosForExecution: lista vazia de driveFileIds retorna vazio sem consultar o banco", async () => {
  const resolved = await resolveArquivosForExecution(pool, { empresaId: 1, automacaoExecucaoId: 1, driveFileIds: [] });
  assert.deepEqual(resolved, []);
});
