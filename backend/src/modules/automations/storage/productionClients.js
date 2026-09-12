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

const { createTelegramFileClient } = require("./telegramFileClient");
const { createGoogleAuthProvider } = require("./googleAuthProvider");
const { createGoogleDriveClient } = require("./googleDriveClient");
const { createTelegramBotClient } = require("../approval/telegramBotClient");

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

module.exports = { createDefaultTelegramFileClient, createDefaultGoogleDriveClient, createDefaultTelegramBotClient };
