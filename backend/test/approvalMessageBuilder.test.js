"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatCivilDate,
  formatInstantInTimezone,
  buildApprovalSummaryText,
  buildApprovalKeyboard,
  buildDecisionAnnotationText,
  buildTelegramFileName,
} = require("../src/modules/automations/approval/approvalMessageBuilder");

test("formatCivilDate: YYYY-MM-DD -> DD/MM/YYYY", () => {
  assert.equal(formatCivilDate("2026-09-12"), "12/09/2026");
});

test("formatInstantInTimezone: nunca hardcoda UTC-3 — usa o timezone informado (Seção 37)", () => {
  const instant = new Date("2026-09-12T13:00:00.000Z");
  assert.equal(formatInstantInTimezone(instant, "America/Sao_Paulo"), "12/09/2026 10:00");
  assert.equal(formatInstantInTimezone(instant, "UTC"), "12/09/2026 13:00");
  assert.equal(formatInstantInTimezone(instant, "Europe/Lisbon"), "12/09/2026 14:00");
});

test("buildApprovalSummaryText: inclui projeto/data/versão/métricas reais, nunca PPFlora hardcoded (Seção 11)", () => {
  const text = buildApprovalSummaryText({
    projetoNome: "Obra Central",
    dataReferencia: "2026-09-12",
    versao: 2,
    metrics: { messagesTotal: 10, photosTotal: 5, photosStored: 4 },
    alertsCount: 3,
  });
  assert.ok(text.includes("Obra Central"));
  assert.ok(text.includes("12/09/2026"));
  assert.ok(text.includes("Versão: 2"));
  assert.ok(text.includes("Mensagens processadas: 10"));
  assert.ok(text.includes("Fotos: 5"));
  assert.ok(text.includes("Fotos armazenadas: 4"));
  assert.ok(text.includes("Pendências/alertas: 3"));
  assert.ok(!/ppflora/i.test(text), "nunca deveria hardcodar PPFlora — só reflete projeto_nome");
});

test("buildApprovalSummaryText: nunca inclui token/hash/id interno/e-mail (Seção 33)", () => {
  const text = buildApprovalSummaryText({
    projetoNome: "Obra X",
    dataReferencia: "2026-09-12",
    versao: 1,
    metrics: { messagesTotal: 1, photosTotal: 0, photosStored: 0 },
    alertsCount: 0,
  });
  assert.ok(!/[0-9a-f]{32,}/i.test(text), "nunca deveria conter algo parecido com hash/token");
  assert.ok(!text.includes("@"), "nunca deveria conter e-mail");
  assert.ok(!/drive\.google/i.test(text));
});

test("buildApprovalSummaryText: campos ausentes nunca lançam — usa 0/placeholder seguro", () => {
  const text = buildApprovalSummaryText({ projetoNome: null, dataReferencia: "2026-09-12", versao: 1, metrics: null, alertsCount: undefined });
  assert.ok(text.includes("(sem nome definido)"));
  assert.ok(text.includes("Mensagens processadas: 0"));
});

test("buildApprovalKeyboard: 3 botões com callback_data compacto e resolvível", () => {
  const keyboard = buildApprovalKeyboard(77);
  const buttons = keyboard.inline_keyboard[0];
  assert.equal(buttons.length, 3);
  assert.deepEqual(
    buttons.map((b) => b.callback_data),
    ["appr:77:a", "appr:77:r", "appr:77:g"]
  );
});

test("buildDecisionAnnotationText: APROVAR/REJEITAR anexam quem/quando; REGENERAR indica versão superada", () => {
  const instant = new Date("2026-09-12T13:00:00.000Z");
  const approved = buildDecisionAnnotationText({ baseText: "Decisão:", action: "APPROVE", aprovadorNome: "Ana", instant, timezone: "America/Sao_Paulo" });
  assert.ok(approved.includes("APROVADO"));
  assert.ok(approved.includes("Ana"));
  assert.ok(approved.includes("10:00"));

  const rejected = buildDecisionAnnotationText({ baseText: "Decisão:", action: "REJECT", aprovadorNome: "Bruno", instant, timezone: "America/Sao_Paulo" });
  assert.ok(rejected.includes("REJEITADO"));
  assert.ok(rejected.includes("Bruno"));

  const regenerated = buildDecisionAnnotationText({ baseText: "Decisão:", action: "REGENERATE", instant, timezone: "America/Sao_Paulo" });
  assert.ok(regenerated.includes("VERSÃO SUPERADA"));
});

test("buildTelegramFileName: preserva o padrão DO_vN.ext ao enviar ao Telegram (Seção 36)", () => {
  assert.equal(buildTelegramFileName(1, "xlsx"), "DO_v1.xlsx");
  assert.equal(buildTelegramFileName(3, "pdf"), "DO_v3.pdf");
});
