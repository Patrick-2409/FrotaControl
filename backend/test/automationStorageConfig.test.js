"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getMaxStorageAttempts,
  getTelegramApiTimeoutMs,
  getTelegramMediaMaxBytes,
  getGoogleDriveTimeoutMs,
  STALE_PROCESSING_MINUTES,
} = require("../src/modules/automations/storage/automationStorageConfig");

test("getMaxStorageAttempts usa default seguro quando env vazia", () => {
  assert.equal(getMaxStorageAttempts({}), 5);
});

test("getMaxStorageAttempts respeita valor válido da env", () => {
  assert.equal(getMaxStorageAttempts({ AUTOMATION_STORAGE_MAX_ATTEMPTS: "3" }), 3);
});

test("getMaxStorageAttempts ignora valor inválido/negativo/zero e usa default", () => {
  assert.equal(getMaxStorageAttempts({ AUTOMATION_STORAGE_MAX_ATTEMPTS: "abc" }), 5);
  assert.equal(getMaxStorageAttempts({ AUTOMATION_STORAGE_MAX_ATTEMPTS: "-1" }), 5);
  assert.equal(getMaxStorageAttempts({ AUTOMATION_STORAGE_MAX_ATTEMPTS: "0" }), 5);
});

test("getTelegramApiTimeoutMs / getGoogleDriveTimeoutMs têm defaults seguros", () => {
  assert.equal(getTelegramApiTimeoutMs({}), 15000);
  assert.equal(getGoogleDriveTimeoutMs({}), 20000);
});

test("getTelegramMediaMaxBytes default é 20MB (teto de download da Bot API local)", () => {
  assert.equal(getTelegramMediaMaxBytes({}), 20 * 1024 * 1024);
});

test("getTelegramMediaMaxBytes respeita override válido da env", () => {
  assert.equal(getTelegramMediaMaxBytes({ TELEGRAM_MEDIA_MAX_BYTES: "1048576" }), 1048576);
});

test("STALE_PROCESSING_MINUTES é uma constante numérica positiva", () => {
  assert.equal(typeof STALE_PROCESSING_MINUTES, "number");
  assert.ok(STALE_PROCESSING_MINUTES > 0);
});
