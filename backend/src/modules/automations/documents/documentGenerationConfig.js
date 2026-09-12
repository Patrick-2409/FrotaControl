"use strict";

/**
 * Configuração do módulo de geração de documento (Bloco 7B) — mesmo padrão
 * dos demais `*Config.js` do módulo: tudo opcional, com default seguro.
 */

function parsePositiveIntEnv(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getDocumentGenerationMaxAttempts(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_DOCUMENT_MAX_ATTEMPTS, 3);
}

// Teto de tamanho por foto baixada do Drive para compor o documento — mesma
// família de proteção de `getAutomationAiMaxImageBytes` (Bloco 6), aqui do
// lado da montagem do Excel/PDF em vez do envio à IA.
function getDocumentPhotoMaxBytes(env = process.env) {
  return parsePositiveIntEnv(env.AUTOMATION_DOCUMENT_PHOTO_MAX_BYTES, 10 * 1024 * 1024);
}

module.exports = { getDocumentGenerationMaxAttempts, getDocumentPhotoMaxBytes };
