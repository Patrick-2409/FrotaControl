"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyStorageError, StorageError, DEFINITIVE_CODES } = require("../src/modules/automations/storage/errorClassification");

test("StorageError com storageErrorClass explícito é respeitado sem reclassificar", () => {
  const err = new StorageError("x", { storageErrorClass: "DEFINITIVE", code: "QUALQUER" });
  assert.equal(classifyStorageError(err), "DEFINITIVE");
  const err2 = new StorageError("y", { storageErrorClass: "TEMPORARY" });
  assert.equal(classifyStorageError(err2), "TEMPORARY");
});

test("códigos conhecidos de configuração/permanentes são DEFINITIVE", () => {
  for (const code of DEFINITIVE_CODES) {
    assert.equal(classifyStorageError(new StorageError("x", { code })), "DEFINITIVE");
  }
});

test("status HTTP 400/401/403/404/413 são DEFINITIVE", () => {
  for (const status of [400, 401, 403, 404, 413]) {
    const err = new Error("x");
    err.status = status;
    assert.equal(classifyStorageError(err), "DEFINITIVE");
  }
});

test("status HTTP 429 e 5xx são TEMPORARY (rate limit e instabilidade do provedor)", () => {
  for (const status of [429, 500, 502, 503]) {
    const err = new Error("x");
    err.status = status;
    assert.equal(classifyStorageError(err), "TEMPORARY");
  }
});

test("status em err.response.status (formato de libs HTTP comuns) também é lido", () => {
  const err = new Error("x");
  err.response = { status: 404 };
  assert.equal(classifyStorageError(err), "DEFINITIVE");
});

test("timeout (AbortError) e erros de rede de baixo nível são TEMPORARY", () => {
  const abortErr = new Error("aborted");
  abortErr.name = "AbortError";
  assert.equal(classifyStorageError(abortErr), "TEMPORARY");

  for (const code of ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND"]) {
    const err = new Error("x");
    err.code = code;
    assert.equal(classifyStorageError(err), "TEMPORARY");
  }
});

test("erro totalmente desconhecido é tratado como TEMPORARY por padrão (mais seguro tentar de novo)", () => {
  assert.equal(classifyStorageError(new Error("algo nunca visto antes")), "TEMPORARY");
});

test("classifyStorageError nunca lança, mesmo com null/undefined", () => {
  assert.equal(classifyStorageError(null), "TEMPORARY");
  assert.equal(classifyStorageError(undefined), "TEMPORARY");
});
