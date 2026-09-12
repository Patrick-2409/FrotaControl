"use strict";

/**
 * 100% offline — `fetchImpl` e `authProvider` são sempre fakes injetadas.
 * Nenhum teste aqui deve resolver `googleapis.com` de verdade.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createGoogleDriveClient } = require("../src/modules/automations/storage/googleDriveClient");

const fakeAuthProvider = { getAuthHeaders: async () => ({ Authorization: "Bearer fake-token" }) };

function fakeResponse({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: async () => json };
}

test("construção sem authProvider válido lança CONFIGURACAO_INCOMPLETA", () => {
  assert.throws(() => createGoogleDriveClient({ authProvider: null }), (err) => {
    assert.equal(err.code, "CONFIGURACAO_INCOMPLETA");
    return true;
  });
  assert.throws(() => createGoogleDriveClient({ authProvider: {} }));
});

test("findFolder: retorna null quando a listagem vem vazia", async () => {
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async () => fakeResponse({ json: { files: [] } }),
  });
  const result = await client.findFolder({ parentId: "root1", name: "2026" });
  assert.equal(result, null);
});

test("findFolder: monta a query com aspas simples escapadas corretamente", async () => {
  let capturedUrl;
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async (url) => {
      capturedUrl = new URL(url);
      return fakeResponse({ json: { files: [{ id: "f1", name: "Diário's" }] } });
    },
  });
  await client.findFolder({ parentId: "p1", name: "Diário's de Obra" });
  const q = capturedUrl.searchParams.get("q");
  assert.ok(q.includes("Diário\\'s de Obra"), `esperava aspa escapada em: ${q}`);
  assert.ok(q.includes("'p1' in parents"));
  assert.ok(q.includes("mimeType = 'application/vnd.google-apps.folder'"));
});

test("createFolder: envia mimeType de pasta e parents corretos", async () => {
  let capturedBody;
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return fakeResponse({ json: { id: "novo1", name: capturedBody.name, appProperties: capturedBody.appProperties } });
    },
  });
  const created = await client.createFolder({ parentId: "pai1", name: "2026", appProperties: { nivel: "ano" } });
  assert.equal(created.id, "novo1");
  assert.equal(capturedBody.mimeType, "application/vnd.google-apps.folder");
  assert.deepEqual(capturedBody.parents, ["pai1"]);
  assert.deepEqual(capturedBody.appProperties, { nivel: "ano" });
});

test("ensureFolder: reaproveita pasta existente sem chamar create (wasCreated: false)", async () => {
  let createCalled = false;
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async (url, options) => {
      if (options?.method === "POST") {
        createCalled = true;
        return fakeResponse({ json: { id: "novo" } });
      }
      return fakeResponse({ json: { files: [{ id: "existente1", name: "2026" }] } });
    },
  });
  const result = await client.ensureFolder({ parentId: "p1", name: "2026" });
  assert.equal(result.id, "existente1");
  assert.equal(result.wasCreated, false);
  assert.equal(createCalled, false);
});

test("ensureFolder: cria quando não encontra (wasCreated: true)", async () => {
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async (url, options) => {
      if (options?.method === "POST") return fakeResponse({ json: { id: "criado1", name: "2026" } });
      return fakeResponse({ json: { files: [] } });
    },
  });
  const result = await client.ensureFolder({ parentId: "p1", name: "2026" });
  assert.equal(result.id, "criado1");
  assert.equal(result.wasCreated, true);
});

test("findFileBySourceMetadata: inclui cláusula appProperties has {...} na query", async () => {
  let capturedUrl;
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async (url) => {
      capturedUrl = new URL(url);
      return fakeResponse({ json: { files: [{ id: "foto1", appProperties: { telegram_file_unique_id: "u1" } }] } });
    },
  });
  const result = await client.findFileBySourceMetadata({ parentId: "fotos1", appProperties: { telegram_file_unique_id: "u1" } });
  assert.equal(result.id, "foto1");
  const q = capturedUrl.searchParams.get("q");
  assert.ok(q.includes("appProperties has { key='telegram_file_unique_id' and value='u1' }"));
});

test("findFileBySourceMetadata: retorna null se não achar nada", async () => {
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async () => fakeResponse({ json: { files: [] } }),
  });
  const result = await client.findFileBySourceMetadata({ parentId: "fotos1", appProperties: { telegram_file_unique_id: "inexistente" } });
  assert.equal(result, null);
});

test("uploadFile: monta multipart com boundary consistente entre metadata e Content-Type", async () => {
  let capturedOptions;
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async (url, options) => {
      capturedOptions = options;
      return fakeResponse({ json: { id: "arquivo1", name: "2026-02-14_msg-1.jpg", size: "1234" } });
    },
  });
  const buffer = Buffer.from([1, 2, 3]);
  const result = await client.uploadFile({
    parentId: "fotos1",
    name: "2026-02-14_msg-1.jpg",
    mimeType: "image/jpeg",
    buffer,
    appProperties: { telegram_file_unique_id: "u1" },
  });
  assert.equal(result.id, "arquivo1");
  const contentType = capturedOptions.headers["Content-Type"];
  const boundaryMatch = /boundary=(\S+)/.exec(contentType);
  assert.ok(boundaryMatch);
  const bodyStr = capturedOptions.body.toString("latin1");
  assert.ok(bodyStr.includes(`--${boundaryMatch[1]}`));
  assert.ok(bodyStr.includes('"name":"2026-02-14_msg-1.jpg"'));
  assert.ok(bodyStr.includes("Content-Type: image/jpeg"));
});

test("uploadFile: usa o endpoint /upload/ (base diferente de leitura/metadata)", async () => {
  let capturedUrl;
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async (url) => {
      capturedUrl = String(url);
      return fakeResponse({ json: { id: "x" } });
    },
  });
  await client.uploadFile({ parentId: "p1", name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from([1]) });
  assert.ok(capturedUrl.startsWith("https://www.googleapis.com/upload/drive/v3/files"));
  assert.ok(capturedUrl.includes("uploadType=multipart"));
});

test("getFileMetadata: retorna os campos do arquivo", async () => {
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async () => fakeResponse({ json: { id: "f1", name: "x.jpg", size: "10" } }),
  });
  const meta = await client.getFileMetadata({ fileId: "f1" });
  assert.equal(meta.id, "f1");
});

test("401/403 do Drive são classificados como PERMISSAO_NEGADA", async () => {
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async () => fakeResponse({ ok: false, status: 403, json: { error: { message: "Forbidden" } } }),
  });
  await assert.rejects(() => client.findFolder({ parentId: "p1", name: "x" }), (err) => {
    assert.equal(err.code, "PERMISSAO_NEGADA");
    assert.equal(err.status, 403);
    return true;
  });
});

test("timeout na chamada ao Drive é classificado TEMPORARY", async () => {
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    timeoutMs: 5,
    retries: 0,
    fetchImpl: (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
  });
  await assert.rejects(() => client.findFolder({ parentId: "p1", name: "x" }), (err) => {
    assert.equal(err.storageErrorClass, "TEMPORARY");
    assert.equal(err.code, "GOOGLE_DRIVE_TIMEOUT");
    return true;
  });
});

test("Shared Drive: quando sharedDriveId é passado, os parâmetros de corpora/driveId entram na query", async () => {
  let capturedUrl;
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    sharedDriveId: "shared-xyz",
    fetchImpl: async (url) => {
      capturedUrl = new URL(url);
      return fakeResponse({ json: { files: [] } });
    },
  });
  await client.findFolder({ parentId: "p1", name: "x" });
  assert.equal(capturedUrl.searchParams.get("corpora"), "drive");
  assert.equal(capturedUrl.searchParams.get("driveId"), "shared-xyz");
  assert.equal(capturedUrl.searchParams.get("supportsAllDrives"), "true");
});

test("sem Shared Drive configurado, não envia corpora/driveId", async () => {
  let capturedUrl;
  const client = createGoogleDriveClient({
    authProvider: fakeAuthProvider,
    fetchImpl: async (url) => {
      capturedUrl = new URL(url);
      return fakeResponse({ json: { files: [] } });
    },
  });
  await client.findFolder({ parentId: "p1", name: "x" });
  assert.equal(capturedUrl.searchParams.get("corpora"), null);
  assert.equal(capturedUrl.searchParams.get("driveId"), null);
});
