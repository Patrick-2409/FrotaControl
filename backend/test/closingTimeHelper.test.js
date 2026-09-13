"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  zonedWallClockToInstant,
  computeClosingInstant,
  isExecutionDueForClosing,
} = require("../src/modules/automations/closing/closingTimeHelper");

test("zonedWallClockToInstant: America/Sao_Paulo (UTC-3, sem horário de verão desde 2019)", () => {
  const instant = zonedWallClockToInstant({ dataReferencia: "2026-02-14", horaLocal: "17:00", timeZone: "America/Sao_Paulo" });
  assert.equal(instant.toISOString(), "2026-02-14T20:00:00.000Z");
});

test("zonedWallClockToInstant: outro timezone (Asia/Tokyo, UTC+9) — nunca hardcode UTC-3", () => {
  const instant = zonedWallClockToInstant({ dataReferencia: "2026-02-14", horaLocal: "09:00", timeZone: "Asia/Tokyo" });
  assert.equal(instant.toISOString(), "2026-02-14T00:00:00.000Z");
});

test("zonedWallClockToInstant: timezone com horário de verão (America/New_York) resolve corretamente em janeiro (EST, UTC-5)", () => {
  const instant = zonedWallClockToInstant({ dataReferencia: "2026-01-15", horaLocal: "17:00", timeZone: "America/New_York" });
  assert.equal(instant.toISOString(), "2026-01-15T22:00:00.000Z");
});

test("zonedWallClockToInstant: mesmo timezone em julho (EDT, UTC-4) — offset muda com a estação, não hardcoded", () => {
  const instant = zonedWallClockToInstant({ dataReferencia: "2026-07-15", horaLocal: "17:00", timeZone: "America/New_York" });
  assert.equal(instant.toISOString(), "2026-07-15T21:00:00.000Z");
});

test("zonedWallClockToInstant: aceita hora sem segundos (HH:MM)", () => {
  const a = zonedWallClockToInstant({ dataReferencia: "2026-02-14", horaLocal: "17:00", timeZone: "America/Sao_Paulo" });
  const b = zonedWallClockToInstant({ dataReferencia: "2026-02-14", horaLocal: "17:00:00", timeZone: "America/Sao_Paulo" });
  assert.equal(a.toISOString(), b.toISOString());
});

test("zonedWallClockToInstant: rejeita data em formato errado", () => {
  assert.throws(() => zonedWallClockToInstant({ dataReferencia: "14/02/2026", horaLocal: "17:00", timeZone: "America/Sao_Paulo" }));
});

test("zonedWallClockToInstant: rejeita hora em formato errado", () => {
  assert.throws(() => zonedWallClockToInstant({ dataReferencia: "2026-02-14", horaLocal: "5pm", timeZone: "America/Sao_Paulo" }));
});

test("zonedWallClockToInstant: rejeita timezone inválido/não IANA", () => {
  assert.throws(() => zonedWallClockToInstant({ dataReferencia: "2026-02-14", horaLocal: "17:00", timeZone: "Brasil/Inventado" }));
});

// ------------------------------------------------------------ computeClosingInstant

test("computeClosingInstant: retorna null quando a config não tem horário de fechamento", () => {
  const result = computeClosingInstant({ timezone: "America/Sao_Paulo", horario_fechamento: null }, "2026-02-14");
  assert.equal(result, null);
});

test("computeClosingInstant: usa timezone e horário da config", () => {
  const instant = computeClosingInstant({ timezone: "America/Sao_Paulo", horario_fechamento: "18:30:00" }, "2026-02-14");
  assert.equal(instant.toISOString(), "2026-02-14T21:30:00.000Z");
});

// ------------------------------------------------------------ isExecutionDueForClosing

const baseConfig = { ativo: true, deleted_at: null, timezone: "America/Sao_Paulo", horario_fechamento: "18:00:00" };
const baseExecution = { status: "COLLECTING", dataReferencia: "2026-02-14" };

test("isExecutionDueForClosing: antes do horário -> não due", () => {
  const now = new Date("2026-02-14T20:59:59.000Z"); // 17:59:59 local
  assert.equal(isExecutionDueForClosing(baseConfig, baseExecution, now), false);
});

test("isExecutionDueForClosing: exatamente no horário -> due", () => {
  const now = new Date("2026-02-14T21:00:00.000Z"); // 18:00:00 local
  assert.equal(isExecutionDueForClosing(baseConfig, baseExecution, now), true);
});

test("isExecutionDueForClosing: depois do horário -> due", () => {
  const now = new Date("2026-02-14T23:00:00.000Z");
  assert.equal(isExecutionDueForClosing(baseConfig, baseExecution, now), true);
});

test("isExecutionDueForClosing: config inativa -> nunca due", () => {
  const now = new Date("2026-02-14T23:00:00.000Z");
  assert.equal(isExecutionDueForClosing({ ...baseConfig, ativo: false }, baseExecution, now), false);
});

test("isExecutionDueForClosing: config soft-deletada -> nunca due", () => {
  const now = new Date("2026-02-14T23:00:00.000Z");
  assert.equal(isExecutionDueForClosing({ ...baseConfig, deleted_at: new Date() }, baseExecution, now), false);
});

test("isExecutionDueForClosing: execução que não está COLLECTING -> nunca due", () => {
  const now = new Date("2026-02-14T23:00:00.000Z");
  assert.equal(isExecutionDueForClosing(baseConfig, { ...baseExecution, status: "READY_FOR_GENERATION" }, now), false);
});

test("isExecutionDueForClosing: config sem horário de fechamento configurado -> nunca due automaticamente", () => {
  const now = new Date("2026-02-14T23:00:00.000Z");
  assert.equal(isExecutionDueForClosing({ ...baseConfig, horario_fechamento: null }, baseExecution, now), false);
});
