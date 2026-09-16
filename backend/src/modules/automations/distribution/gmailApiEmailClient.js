"use strict";

/**
 * Cliente de e-mail institucional via Gmail API + OAuth2 (aditivo — nunca
 * altera o SMTP existente, ver `automationEmailClient.js`). Implementa a
 * MESMA interface (`sendMail`) já consumida por `documentDistributionService.js`
 * — nenhuma mudança é necessária lá para trocar de provedor (a seleção
 * acontece só em `storage/productionClients.js`, via `AUTOMATION_EMAIL_PROVIDER`).
 *
 * Recebe um `authProvider` INJETADO (`{ getAuthHeaders }`) — MESMO desenho
 * de `googleDriveClient.js` — nunca constrói seu próprio `OAuth2Client`
 * diretamente (isso é responsabilidade de `gmailAuthProvider.js`). Duas
 * vantagens: (1) testável 100% offline com um fake `authProvider`, sem
 * jamais exercitar a troca refresh_token->access_token real do
 * `google-auth-library` (que faria uma chamada de rede de verdade — mesma
 * disciplina de `googleDriveClient.test.js`); (2) autenticação Gmail
 * SEMPRE independente do Drive, nunca a mesma instância/token.
 *
 * Este client NUNCA chama nenhum endpoint de LEITURA da caixa postal (não
 * há `messages.list`/`messages.get`/`users.getProfile` em nenhum caminho de
 * código aqui) — o único endpoint chamado é
 * `POST /gmail/v1/users/me/messages/send`, com escopo OAuth EXCLUSIVO
 * `https://www.googleapis.com/auth/gmail.send` (nunca `gmail.readonly`,
 * `gmail.modify`, `gmail.compose` ou `mail.google.com`).
 *
 * `googleapis` (o SDK completo, com `gmail.users.messages.send(...)`) NÃO é
 * dependência do projeto — reproduzimos aqui a MESMA chamada REST que esse
 * SDK faria por baixo dos panos, via `fetch` nativo, seguindo exatamente o
 * padrão já estabelecido em `storage/googleDriveClient.js` (Drive também
 * não usa o SDK `googleapis`, só `google-auth-library` + REST).
 *
 * MIME RFC 2822 é construído com `nodemailer/lib/mail-composer` (nodemailer
 * já é dependência do projeto para o SMTP) — evita reimplementar
 * codificação de anexos/assunto UTF-8/boundary multipart à mão.
 */

const MailComposer = require("nodemailer/lib/mail-composer");

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

class GmailApiError extends Error {
  constructor(message, { code, cause, status } = {}) {
    super(message);
    this.name = "GmailApiError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * `google-auth-library@11` (Bloco 11, mesma causa raiz já documentada em
 * `googleDriveClient.js`): `OAuth2Client.getRequestHeaders()` retorna uma
 * instância `Headers` (WHATWG), não um objeto plano — `{ ...headers }` não
 * copia nada dela. Normaliza ANTES de usar; um objeto plano (fake de teste)
 * passa direto, sem custo extra.
 */
function normalizeHeaders(headers) {
  if (!headers) return {};
  if (typeof headers.entries === "function") {
    return Object.fromEntries(headers.entries());
  }
  return { ...headers };
}

function buildMimeMessage({ from, fromName, to, cc, subject, text, html, attachments, messageId }) {
  return new Promise((resolve, reject) => {
    const mail = new MailComposer({
      from: fromName ? { name: fromName, address: from } : from,
      to,
      cc: cc && cc.length ? cc : undefined,
      subject,
      text,
      html,
      attachments,
      messageId,
    });
    mail.compile().build((err, message) => {
      if (err) return reject(err);
      resolve(message);
    });
  });
}

/** Base64url SEM padding — formato exigido pelo campo `raw` da Gmail API (RFC 4648 §5). */
function toBase64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * `authProvider`: `{ getAuthHeaders() }` — ver `gmailAuthProvider.js` para a
 * implementação real (OAuth2 do Gmail, credenciais independentes do Drive).
 * `fetchImpl` é injetável só para teste (nunca chamada de rede real em
 * teste algum, mesma disciplina dos demais clients do módulo).
 */
function createGmailApiEmailClient({ authProvider, fetchImpl = fetch, timeoutMs = 20000, providerName = "gmail_api" } = {}) {
  if (!authProvider || typeof authProvider.getAuthHeaders !== "function") {
    throw new GmailApiError("createGmailApiEmailClient requer um authProvider injetado com getAuthHeaders().", { code: "GMAIL_CONFIG_INCOMPLETE" });
  }

  async function sendMail({ from, fromName, to, cc, subject, text, html, attachments, messageId }) {
    const mimeMessage = await buildMimeMessage({ from, fromName, to, cc, subject, text, html, attachments, messageId });
    const raw = toBase64Url(mimeMessage);

    const authHeaders = await authProvider.getAuthHeaders();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(GMAIL_SEND_URL, {
        method: "POST",
        headers: { ...normalizeHeaders(authHeaders), "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new GmailApiError("Timeout ao comunicar com a Gmail API.", { code: "GMAIL_API_TIMEOUT", cause: err });
      }
      throw new GmailApiError(`Falha de rede ao comunicar com a Gmail API: ${err.message}`, { code: "GMAIL_API_NETWORK_ERROR", cause: err });
    } finally {
      clearTimeout(timer);
    }

    let body = null;
    try {
      body = await response.json();
    } catch {
      /* corpo vazio/ilegível — body permanece null, erro usa só o status */
    }

    if (!response.ok) {
      // Nunca "sucesso disfarçado": qualquer HTTP não-2xx sobe como exceção —
      // quem chama (documentDistributionService.js) já trata isso como falha
      // recuperável de distribuição, sem marcar SENT (Seção "fallback").
      const message = body?.error?.message || `HTTP ${response.status}`;
      const err = new GmailApiError(`Gmail API messages.send falhou: ${message}`, {
        code: response.status === 401 || response.status === 403 ? "GMAIL_API_PERMISSAO_NEGADA" : "GMAIL_API_SEND_FAILED",
      });
      err.status = response.status;
      throw err;
    }

    if (!body?.id) {
      throw new GmailApiError("Gmail API messages.send respondeu 200 sem um id de mensagem.", { code: "GMAIL_API_SEND_FAILED" });
    }

    return {
      provider: providerName,
      providerMessageId: body.id,
      accepted: [to].flat().filter(Boolean).concat(cc ? [cc].flat().filter(Boolean) : []),
      rejected: [],
    };
  }

  return { sendMail };
}

module.exports = { createGmailApiEmailClient, GmailApiError, GMAIL_SEND_URL, toBase64Url };
