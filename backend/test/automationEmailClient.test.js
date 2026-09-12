"use strict";

/**
 * 100% offline — `transporter` é sempre uma fake injetada, nunca um
 * transporte Nodemailer real. Nenhum destes testes deve, em nenhuma
 * hipótese, abrir uma conexão SMTP de verdade (ver também
 * distributionEngineGeneric.test.js).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAutomationEmailClient } = require("../src/modules/automations/distribution/automationEmailClient");

function createFakeTransporter({ onSendMail } = {}) {
  const calls = [];
  return {
    calls,
    sendMail: async (options) => {
      calls.push(options);
      if (onSendMail) return onSendMail(options);
      return { messageId: "<fake-id@example.com>", accepted: [options.to].flat(), rejected: [] };
    },
  };
}

test("createAutomationEmailClient: lança se o transporter não tiver sendMail()", () => {
  assert.throws(() => createAutomationEmailClient({ transporter: {} }));
  assert.throws(() => createAutomationEmailClient({}));
});

test("sendMail: repassa from/to/cc/subject/text/attachments/messageId ao transporter", async () => {
  const transporter = createFakeTransporter();
  const client = createAutomationEmailClient({ transporter });
  await client.sendMail({
    from: "no-reply@example.com",
    to: ["gestor1@example.com"],
    cc: ["gestor2@example.com"],
    subject: "Assunto",
    text: "Corpo",
    attachments: [{ filename: "DO.xlsx", content: Buffer.from([1, 2]), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
    messageId: "<abc@example.com>",
  });
  assert.equal(transporter.calls.length, 1);
  const sent = transporter.calls[0];
  assert.equal(sent.from, "no-reply@example.com");
  assert.deepEqual(sent.to, ["gestor1@example.com"]);
  assert.deepEqual(sent.cc, ["gestor2@example.com"]);
  assert.equal(sent.subject, "Assunto");
  assert.equal(sent.messageId, "<abc@example.com>");
  assert.equal(sent.attachments.length, 1);
});

test("sendMail: fromName monta {name, address}, sem fromName usa string simples", async () => {
  const transporter = createFakeTransporter();
  const client = createAutomationEmailClient({ transporter });
  await client.sendMail({ from: "no-reply@example.com", fromName: "FrotaMax Automações", to: ["a@example.com"], subject: "s", text: "t" });
  assert.deepEqual(transporter.calls[0].from, { name: "FrotaMax Automações", address: "no-reply@example.com" });

  await client.sendMail({ from: "no-reply@example.com", to: ["a@example.com"], subject: "s", text: "t" });
  assert.equal(transporter.calls[1].from, "no-reply@example.com");
});

test("sendMail: cc vazio nunca é enviado como array vazio (undefined em vez de [])", async () => {
  const transporter = createFakeTransporter();
  const client = createAutomationEmailClient({ transporter });
  await client.sendMail({ from: "x@example.com", to: ["a@example.com"], cc: [], subject: "s", text: "t" });
  assert.equal(transporter.calls[0].cc, undefined);
});

test("sendMail: retorna provider/providerMessageId/accepted/rejected a partir do resultado do transporter", async () => {
  const transporter = createFakeTransporter({ onSendMail: async () => ({ messageId: "<real-123@smtp>", accepted: ["a@example.com"], rejected: ["b@example.com"] }) });
  const client = createAutomationEmailClient({ transporter, providerName: "smtp" });
  const result = await client.sendMail({ from: "x@example.com", to: ["a@example.com", "b@example.com"], subject: "s", text: "t" });
  assert.deepEqual(result, { provider: "smtp", providerMessageId: "<real-123@smtp>", accepted: ["a@example.com"], rejected: ["b@example.com"] });
});

test("sendMail: propaga falha do transporter (nunca engole silenciosamente)", async () => {
  const transporter = createFakeTransporter({ onSendMail: async () => { throw new Error("Conexão SMTP recusada."); } });
  const client = createAutomationEmailClient({ transporter });
  await assert.rejects(() => client.sendMail({ from: "x@example.com", to: ["a@example.com"], subject: "s", text: "t" }), /Conexão SMTP recusada/);
});
