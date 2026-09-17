"use strict";

/**
 * Fábricas de conveniência para os clientes REAIS de produção (lidas de
 * `process.env`), prontas para um bloco futuro (scheduler/worker) chamar —
 * ver aviso em photoStorageService.js sobre por que nada invoca isso ainda.
 *
 * Construir estes clientes NUNCA faz uma chamada de rede nem lança por causa
 * de env vazia — a validação de credenciais só acontece dentro de uma
 * chamada de verdade (`getFile`/`downloadFile`/`ensureFolder`/...), que
 * nenhum teste deste bloco exercita. Isso permite testar que a fiação de
 * produção "não quebra ao simplesmente existir" sem jamais tocar a internet.
 */

const nodemailer = require("nodemailer");
const { createTelegramFileClient } = require("./telegramFileClient");
const { createGoogleAuthProvider } = require("./googleAuthProvider");
const { createGoogleDriveClient } = require("./googleDriveClient");
const { createTelegramBotClient } = require("../approval/telegramBotClient");
const { createAutomationEmailClient } = require("../distribution/automationEmailClient");
const { createGmailApiEmailClient } = require("../distribution/gmailApiEmailClient");
const { createGmailAuthProvider } = require("../distribution/gmailAuthProvider");
const {
  getAutomationEmailProvider,
  getGmailClientId,
  getGmailClientSecret,
  getGmailRefreshToken,
  getEmailFrom,
} = require("../distribution/distributionConfig");

function createDefaultTelegramFileClient(env = process.env) {
  return createTelegramFileClient({ tokenProvider: () => env.TELEGRAM_BOT_TOKEN });
}

function createDefaultGoogleDriveClient(env = process.env) {
  const authProvider = createGoogleAuthProvider({ env });
  return createGoogleDriveClient({ authProvider, sharedDriveId: env.GOOGLE_DRIVE_SHARED_DRIVE_ID || null });
}

// Bloco 8 — mesma disciplina das fábricas acima: nunca faz chamada de rede
// nem lança por env vazia ao simplesmente ser criado; a validação do token só
// acontece dentro de uma chamada de verdade (sendMessage/sendDocument/...).
function createDefaultTelegramBotClient(env = process.env) {
  return createTelegramBotClient({ tokenProvider: () => env.TELEGRAM_BOT_TOKEN });
}

// Bloco 9 — mesma disciplina: `nodemailer.createTransport` nunca conecta nem
// valida credenciais ao ser chamado (só na hora de `sendMail`/`verify` de
// verdade), então construir isto com env vazia nunca lança nem faz rede.
function createDefaultSmtpAutomationEmailClient(env = process.env) {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return createAutomationEmailClient({ transporter });
}

// Envio institucional via Gmail API (aditivo — "provider selecionável").
// Credenciais SEMPRE independentes do Drive (nunca GOOGLE_REFRESH_TOKEN) —
// ver distributionConfig.js para a cadeia de fallback exata de client
// id/secret. Mesma disciplina das demais fábricas: nem `createGmailAuthProvider`
// nem `createGmailApiEmailClient` fazem chamada de rede ou lançam por env
// vazia ao serem CRIADOS — a validação de credenciais só acontece dentro de
// um `sendMail()` de verdade.
function createDefaultGmailApiEmailClient(env = process.env) {
  const authProvider = createGmailAuthProvider({
    clientId: getGmailClientId(env),
    clientSecret: getGmailClientSecret(env),
    refreshToken: getGmailRefreshToken(env),
  });
  return createGmailApiEmailClient({ authProvider });
}

/**
 * Fábrica ÚNICA consumida por todo o resto do módulo (orquestrador,
 * distribuição) — escolhe o provedor via `AUTOMATION_EMAIL_PROVIDER`
 * (Seção "provider selecionável"). SMTP é o default EXPLÍCITO quando a
 * variável está ausente/vazia — preserva 100% o comportamento já em
 * produção sem NENHUMA mudança de configuração adicional. Nunca troca de
 * provedor sozinho: só ativa Gmail com `AUTOMATION_EMAIL_PROVIDER=GMAIL_API`
 * configurado explicitamente. NENHUM fallback automático Gmail->SMTP existe
 * aqui nem em nenhum outro ponto do módulo: esta função decide o provedor
 * UMA ÚNICA VEZ, de forma determinística, a partir do `env` recebido — uma
 * falha de envio do cliente Gmail (`gmailApiEmailClient.js`) nunca chega a
 * reconstruir/trocar para o cliente SMTP, ela só sobe como exceção para
 * `documentDistributionService.js` (que já trata isso como falha
 * recuperável de distribuição, sujeita a retry — nunca um envio silencioso
 * por outro canal).
 *
 * Log de diagnóstico SEGURO (Seção "confirmar em runtime qual provider está
 * ativo") — cada processo que constrói este cliente (o Cron Job do
 * orquestrador e a API administrativa, cada um com SEU PRÓPRIO conjunto de
 * variáveis de ambiente no Render) imprime qual provedor e remetente
 * resolveu, uma linha por construção. NUNCA imprime client secret, refresh
 * token ou senha SMTP — só o nome do provedor (enum fixo) e o endereço de
 * remetente (já seria visível no cabeçalho "From" de qualquer e-mail
 * enviado, nunca um segredo).
 */
function createDefaultAutomationEmailClient(env = process.env) {
  const provider = getAutomationEmailProvider(env);
  const from = getEmailFrom(env);
  console.log(`[automation-email] provider=${provider}`);
  console.log(`[automation-email] from=${from || "(ausente — DISTRIBUTION_CONFIG_INCOMPLETE ao tentar enviar)"}`);

  if (provider === "GMAIL_API") {
    return createDefaultGmailApiEmailClient(env);
  }
  return createDefaultSmtpAutomationEmailClient(env);
}

module.exports = {
  createDefaultTelegramFileClient,
  createDefaultGoogleDriveClient,
  createDefaultTelegramBotClient,
  createDefaultAutomationEmailClient,
};
