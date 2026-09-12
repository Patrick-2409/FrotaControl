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
function createDefaultAutomationEmailClient(env = process.env) {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return createAutomationEmailClient({ transporter });
}

module.exports = {
  createDefaultTelegramFileClient,
  createDefaultGoogleDriveClient,
  createDefaultTelegramBotClient,
  createDefaultAutomationEmailClient,
};
