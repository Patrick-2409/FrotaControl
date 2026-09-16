"use strict";

/**
 * Provedor de autenticação da Gmail API (OAuth2) — MESMA abstração de
 * `storage/googleAuthProvider.js` (Drive): `{ getAuthHeaders }`, injetável
 * em `gmailApiEmailClient.js` exatamente como `googleDriveClient.js` recebe
 * seu `authProvider`. Único modo (não há SERVICE_ACCOUNT aqui — envio
 * institucional via Gmail sempre usa uma conta de usuário/OAuth).
 *
 * Credenciais SEMPRE INDEPENDENTES do Google Drive (Seção "nunca reutilizar
 * implicitamente o refresh token do Drive") — client id/secret PODEM cair
 * para as variáveis do Drive (mesmo OAuth Client no Google Cloud é uma
 * configuração válida — ver `distributionConfig.js`), mas o refresh token
 * NUNCA tem esse fallback, sempre uma variável própria.
 *
 * Escopo EXCLUSIVO `gmail.send` — nunca `gmail.readonly`/`gmail.modify`/
 * `gmail.compose`/`mail.google.com`.
 *
 * Só CONSTRÓI e VALIDA a presença das credenciais — nunca faz nenhuma
 * chamada de rede ao ser criado (isso só acontece dentro de
 * `getAuthHeaders()`, chamado exclusivamente pelo `gmailApiEmailClient.js`
 * real de produção; nenhum teste deste módulo invoca esse caminho — mesma
 * disciplina de `googleAuthProvider.test.js`, que só testa validação).
 */

const { OAuth2Client } = require("google-auth-library");

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

class GmailAuthConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "GmailAuthConfigError";
    this.code = "GMAIL_CONFIG_INCOMPLETE";
  }
}

function createGmailAuthProvider({ clientId, clientSecret, refreshToken } = {}) {
  let cachedClient = null;

  function buildClient() {
    if (!clientId || !clientSecret || !refreshToken) {
      throw new GmailAuthConfigError(
        "Gmail API não configurada: GOOGLE_GMAIL_CLIENT_ID/GOOGLE_GMAIL_CLIENT_SECRET/GOOGLE_GMAIL_REFRESH_TOKEN ausentes."
      );
    }
    const client = new OAuth2Client({ clientId, clientSecret });
    client.setCredentials({ refresh_token: refreshToken, scope: GMAIL_SEND_SCOPE });
    return client;
  }

  async function getAuthHeaders() {
    if (!cachedClient) cachedClient = buildClient();
    return cachedClient.getRequestHeaders();
  }

  return { getAuthHeaders };
}

module.exports = { createGmailAuthProvider, GmailAuthConfigError, GMAIL_SEND_SCOPE };
