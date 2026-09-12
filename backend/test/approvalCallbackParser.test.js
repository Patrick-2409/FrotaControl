"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseApprovalCallbackData, buildApprovalCallbackData } = require("../src/modules/automations/approval/approvalCallbackParser");

test("parseApprovalCallbackData: formato válido para as 3 ações", () => {
  assert.deepEqual(parseApprovalCallbackData("appr:123:a"), { valid: true, solicitacaoId: 123, action: "APPROVE" });
  assert.deepEqual(parseApprovalCallbackData("appr:123:r"), { valid: true, solicitacaoId: 123, action: "REJECT" });
  assert.deepEqual(parseApprovalCallbackData("appr:123:g"), { valid: true, solicitacaoId: 123, action: "REGENERATE" });
});

test("parseApprovalCallbackData: namespace diferente nunca é reivindicado (Seção 18 — não quebra callbacks de outros recursos)", () => {
  assert.deepEqual(parseApprovalCallbackData("outro:123:a"), { valid: false });
  assert.deepEqual(parseApprovalCallbackData("APROVAR"), { valid: false });
  assert.deepEqual(parseApprovalCallbackData(""), { valid: false });
});

test("parseApprovalCallbackData: id não-numérico é rejeitado (nunca confia em formato externo)", () => {
  assert.deepEqual(parseApprovalCallbackData("appr:abc:a"), { valid: false });
  assert.deepEqual(parseApprovalCallbackData("appr:12.5:a"), { valid: false });
  assert.deepEqual(parseApprovalCallbackData("appr:-1:a"), { valid: false });
});

test("parseApprovalCallbackData: código de ação desconhecido é rejeitado", () => {
  assert.deepEqual(parseApprovalCallbackData("appr:123:x"), { valid: false });
});

test("parseApprovalCallbackData: número errado de segmentos é rejeitado", () => {
  assert.deepEqual(parseApprovalCallbackData("appr:123"), { valid: false });
  assert.deepEqual(parseApprovalCallbackData("appr:123:a:extra"), { valid: false });
});

test("parseApprovalCallbackData: entrada não-string nunca lança", () => {
  assert.deepEqual(parseApprovalCallbackData(undefined), { valid: false });
  assert.deepEqual(parseApprovalCallbackData(null), { valid: false });
  assert.deepEqual(parseApprovalCallbackData(12345), { valid: false });
  assert.deepEqual(parseApprovalCallbackData({ data: "appr:1:a" }), { valid: false });
});

test("buildApprovalCallbackData: round-trip com parseApprovalCallbackData", () => {
  for (const action of ["APPROVE", "REJECT", "REGENERATE"]) {
    const data = buildApprovalCallbackData(999, action);
    assert.deepEqual(parseApprovalCallbackData(data), { valid: true, solicitacaoId: 999, action });
  }
});

test("buildApprovalCallbackData: nunca carrega dado sensível — só namespace/id/ação (Seção 15)", () => {
  const data = buildApprovalCallbackData(42, "APPROVE");
  assert.equal(data, "appr:42:a");
  assert.ok(Buffer.byteLength(data, "utf8") <= 64, "callback_data deve respeitar o limite de 64 bytes do Telegram");
  assert.ok(!data.includes("@"), "nunca deveria conter e-mail");
});

test("buildApprovalCallbackData: ação desconhecida lança em vez de gerar dado inválido silenciosamente", () => {
  assert.throws(() => buildApprovalCallbackData(1, "APAGAR_TUDO"));
});
