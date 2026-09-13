"use strict";

/**
 * Construção do cliente de autenticação Google (Bloco 4) — dois modos
 * possíveis, escolhidos por `GOOGLE_DRIVE_AUTH_MODE`:
 *
 *   - SERVICE_ACCOUNT: `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
 *     (chave da conta de serviço — precisa de acesso explícito à pasta raiz
 *     configurada em cada automacao_configs, ou a um Shared Drive).
 *   - OAUTH_USER: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REFRESH_TOKEN`
 *     (uma conta pessoal do Google Drive do próprio cliente).
 *
 * Usa `google-auth-library` (não o pacote `googleapis` inteiro — só
 * precisamos de obtenção/renovação de token, não de toda a superfície de
 * clientes gerados; ver relatório do Bloco 4 para a justificativa completa).
 * O client aqui só CONSTRÓI e VALIDA a presença das variáveis — nunca faz
 * nenhuma chamada de rede (isso só acontece dentro de `getAuthHeaders()`,
 * chamado exclusivamente pelo googleDriveClient real de produção; nenhum
 * teste deste bloco invoca esse caminho).
 */

const { JWT, OAuth2Client } = require("google-auth-library");
const { StorageError } = require("./errorClassification");

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

function buildAuthClient(env) {
  const mode = String(env.GOOGLE_DRIVE_AUTH_MODE || "").trim().toUpperCase();

  if (mode === "SERVICE_ACCOUNT") {
    const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (!email || !privateKey) {
      throw new StorageError(
        "GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY não configurados (modo SERVICE_ACCOUNT).",
        { code: "CONFIGURACAO_INCOMPLETA", storageErrorClass: "DEFINITIVE" }
      );
    }
    return new JWT({
      email,
      // Convenção comum ao colar uma chave PEM numa variável de ambiente de
      // uma linha só: \n literal precisa virar quebra de linha real.
      key: privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey,
      scopes: [DRIVE_SCOPE],
    });
  }

  if (mode === "OAUTH_USER") {
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    const refreshToken = env.GOOGLE_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new StorageError(
        "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN não configurados (modo OAUTH_USER).",
        { code: "CONFIGURACAO_INCOMPLETA", storageErrorClass: "DEFINITIVE" }
      );
    }
    const client = new OAuth2Client({ clientId, clientSecret });
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  throw new StorageError(
    `GOOGLE_DRIVE_AUTH_MODE inválido ou não configurado (esperado SERVICE_ACCOUNT ou OAUTH_USER, recebido "${mode || "(vazio)"}").`,
    { code: "CONFIGURACAO_INCOMPLETA", storageErrorClass: "DEFINITIVE" }
  );
}

function createGoogleAuthProvider({ env = process.env } = {}) {
  const mode = String(env.GOOGLE_DRIVE_AUTH_MODE || "").trim().toUpperCase();
  let cachedClient = null;

  async function getAuthHeaders() {
    if (!cachedClient) cachedClient = buildAuthClient(env);
    return cachedClient.getRequestHeaders();
  }

  return { getAuthHeaders, mode };
}

module.exports = { createGoogleAuthProvider, buildAuthClient, DRIVE_SCOPE };
