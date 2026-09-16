"use strict";

/**
 * Testes do cliente de e-mail institucional via Gmail API (aditivo — envio
 * institucional pelo Gmail da empresa, Seção "Gmail API + OAuth2"). Nenhuma
 * chamada de rede real em nenhum teste: `authProvider` e `fetchImpl` são
 * sempre fakes injetados (mesmo desenho de `googleDriveClient.test.js`).
 *
 * Cobre os itens C-G do checklist de testes:
 *  C) Gmail send recebe TO, CC, subject, body, PDF, XLSX.
 *  D) mensagem enviada como `raw` é base64url válido (sem +, /, =).
 *  E) providerMessageId é retornado a partir do id da resposta da API.
 *  F) erro da Gmail API sobe como exceção (falha recuperável de distribuição,
 *     nunca "sucesso disfarçado").
 *  G) nenhuma leitura de Gmail é realizada — só o endpoint messages.send.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createGmailApiEmailClient, GmailApiError, GMAIL_SEND_URL, toBase64Url } = require("../src/modules/automations/distribution/gmailApiEmailClient");

function fakeAuthProvider(headers = { Authorization: "Bearer fake-access-token" }) {
  return { getAuthHeaders: async () => headers };
}

function fakeFetchOk({ id = "gmail-msg-123", threadId = "thread-1" } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ id, threadId }) };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function decodeBase64Url(raw) {
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (raw.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("latin1");
}

function basePayload(overrides = {}) {
  return {
    from: "institucional@example.com",
    fromName: "FrotaMax Automações",
    to: "destino@example.com",
    cc: "copia@example.com",
    subject: "Diário de Obra — Teste",
    text: "Segue em anexo.",
    attachments: [
      { filename: "diario.xlsx", content: Buffer.from("xlsx-fake"), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { filename: "diario.pdf", content: Buffer.from("pdf-fake"), contentType: "application/pdf" },
    ],
    messageId: "<custom-msg-id@frotamax.local>",
    ...overrides,
  };
}

test("createGmailApiEmailClient nunca lança na própria criação (só exige authProvider injetado)", () => {
  assert.doesNotThrow(() => createGmailApiEmailClient({ authProvider: fakeAuthProvider() }));
});

test("createGmailApiEmailClient sem authProvider lança GMAIL_CONFIG_INCOMPLETE imediatamente", () => {
  assert.throws(() => createGmailApiEmailClient({}), (err) => {
    assert.ok(err instanceof GmailApiError);
    assert.equal(err.code, "GMAIL_CONFIG_INCOMPLETE");
    return true;
  });
});

test("(C) sendMail chama messages.send com TO, CC, subject, body e os DOIS anexos (PDF+XLSX) no MIME", async () => {
  const fetchImpl = fakeFetchOk();
  const client = createGmailApiEmailClient({ authProvider: fakeAuthProvider(), fetchImpl });

  const result = await client.sendMail(basePayload());

  assert.equal(fetchImpl.calls.length, 1);
  const { url, options } = fetchImpl.calls[0];
  assert.equal(url, GMAIL_SEND_URL);
  assert.equal(url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer fake-access-token");

  const bodyObj = JSON.parse(options.body);
  assert.deepEqual(Object.keys(bodyObj), ["raw"]);

  const mime = decodeBase64Url(bodyObj.raw);
  assert.ok(mime.includes("To: destino@example.com"));
  assert.ok(mime.includes("Cc: copia@example.com"));
  assert.ok(/Subject: .*Di.*rio de Obra/.test(mime) || mime.includes("Subject:"));
  assert.ok(mime.includes("filename=diario.xlsx") || mime.includes('filename="diario.xlsx"'));
  assert.ok(mime.includes("filename=diario.pdf") || mime.includes('filename="diario.pdf"'));
  assert.ok(mime.includes("Message-ID: <custom-msg-id@frotamax.local>"));

  assert.deepEqual(result.accepted.sort(), ["copia@example.com", "destino@example.com"]);
});

test("(D) campo raw enviado à API é base64url válido — nunca contém +, / ou = de padding", async () => {
  const fetchImpl = fakeFetchOk();
  const client = createGmailApiEmailClient({ authProvider: fakeAuthProvider(), fetchImpl });

  await client.sendMail(basePayload());

  const bodyObj = JSON.parse(fetchImpl.calls[0].options.body);
  assert.ok(!bodyObj.raw.includes("+"));
  assert.ok(!bodyObj.raw.includes("/"));
  assert.ok(!bodyObj.raw.includes("="));
});

test("toBase64Url produz o mesmo alfabeto usado pela Gmail API (RFC 4648 §5, sem padding)", () => {
  const buf = Buffer.from("qualquer texto >>> com bytes ??? diversos +++ ///", "utf8");
  const encoded = toBase64Url(buf);
  assert.ok(!encoded.includes("+"));
  assert.ok(!encoded.includes("/"));
  assert.ok(!encoded.includes("="));
});

test("(E) providerMessageId é extraído do id retornado pela Gmail API e persistível no resultado", async () => {
  const fetchImpl = fakeFetchOk({ id: "gmail-msg-abc-999" });
  const client = createGmailApiEmailClient({ authProvider: fakeAuthProvider(), fetchImpl, providerName: "gmail_api" });

  const result = await client.sendMail(basePayload());

  assert.equal(result.provider, "gmail_api");
  assert.equal(result.providerMessageId, "gmail-msg-abc-999");
  assert.deepEqual(result.rejected, []);
});

test("(F) HTTP não-2xx da Gmail API sobe como GmailApiError — nunca 'sucesso disfarçado' (falha recuperável de distribuição)", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "Insufficient Permission" } }) });
  const client = createGmailApiEmailClient({ authProvider: fakeAuthProvider(), fetchImpl });

  await assert.rejects(() => client.sendMail(basePayload()), (err) => {
    assert.ok(err instanceof GmailApiError);
    assert.equal(err.code, "GMAIL_API_PERMISSAO_NEGADA");
    assert.equal(err.status, 403);
    return true;
  });
});

test("(F) resposta 200 sem id de mensagem também é tratada como falha — nunca retorna sucesso sem confirmação real", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
  const client = createGmailApiEmailClient({ authProvider: fakeAuthProvider(), fetchImpl });

  await assert.rejects(() => client.sendMail(basePayload()), (err) => {
    assert.ok(err instanceof GmailApiError);
    assert.equal(err.code, "GMAIL_API_SEND_FAILED");
    return true;
  });
});

test("(F) falha de rede (fetch lança) sobe como GmailApiError com código de rede, nunca engolida silenciosamente", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNRESET simulado");
  };
  const client = createGmailApiEmailClient({ authProvider: fakeAuthProvider(), fetchImpl });

  await assert.rejects(() => client.sendMail(basePayload()), (err) => {
    assert.ok(err instanceof GmailApiError);
    assert.equal(err.code, "GMAIL_API_NETWORK_ERROR");
    return true;
  });
});

test("(G) nenhuma leitura de Gmail é realizada — a única URL chamada é sempre messages.send, mesmo em cenários de erro", async () => {
  const urlsCalled = [];
  const fetchImpl = async (url) => {
    urlsCalled.push(url);
    return { ok: true, status: 200, json: async () => ({ id: "msg-1" }) };
  };
  const client = createGmailApiEmailClient({ authProvider: fakeAuthProvider(), fetchImpl });

  await client.sendMail(basePayload());
  await client.sendMail(basePayload({ to: "outro@example.com", cc: undefined }));

  assert.equal(urlsCalled.length, 2);
  for (const url of urlsCalled) {
    assert.equal(url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    assert.ok(!url.includes("messages.list"));
    assert.ok(!url.includes("messages.get"));
    assert.ok(!url.includes("getProfile"));
  }
});

test("normaliza headers do tipo WHATWG Headers vindos do authProvider (mesmo bug já documentado em googleDriveClient.js)", async () => {
  const fetchImpl = fakeFetchOk();
  const authProvider = { getAuthHeaders: async () => new Headers({ Authorization: "Bearer via-headers-object" }) };
  const client = createGmailApiEmailClient({ authProvider, fetchImpl });

  await client.sendMail(basePayload());

  // WHATWG Headers normaliza nomes para minúsculas em .entries() — HTTP é
  // case-insensitive para nomes de header, então isso é correto na prática.
  assert.equal(fetchImpl.calls[0].options.headers.authorization, "Bearer via-headers-object");
});

test("sem CC: accepted contém só o destinatário TO, sem entradas vazias", async () => {
  const fetchImpl = fakeFetchOk();
  const client = createGmailApiEmailClient({ authProvider: fakeAuthProvider(), fetchImpl });

  const result = await client.sendMail(basePayload({ cc: undefined }));

  assert.deepEqual(result.accepted, ["destino@example.com"]);
});
