"use strict";

/**
 * Parser DETERMINÍSTICO de comandos explícitos de atividade enviados pelo
 * Telegram (Seção "comandos explícitos de atividade") — reconhece os
 * cabeçalhos fixos abaixo, case-insensitive, e nunca depende da IA para
 * interpretá-los: uma mensagem que combine com um destes cabeçalhos é
 * classificada aqui, ANTES (e independente) de qualquer classificação de
 * `structuredOutput.facts`. Uma mensagem que não combine com nenhum
 * cabeçalho retorna `null` e segue o caminho normal (classificação da IA),
 * exatamente como antes desta função existir — nunca corrompe nem perde uma
 * mensagem comum.
 *
 *   ATIVIDADE SEM FOTO:
 *   <um ou mais blocos de atividade, separados por linha(s) em branco>
 *
 *   INSERIR NA ATIVIDADE N:   (ou "ADICIONAR À ATIVIDADE N:" / sem acento)
 *   <texto a ser anexado, como linha(s) adicionais, à atividade N já existente>
 *
 * Texto e quebras de linha são preservados EXATAMENTE como recebidos do
 * Telegram — este módulo nunca reescreve, resume ou parafraseia nada.
 */

const SEM_FOTO_HEADER = /^\s*atividade\s+sem\s+foto\s*:\s*/i;
const COMPLEMENTO_HEADER = /^\s*(?:inserir\s+na\s+atividade|adicionar\s+(?:à|a)\s+atividade)\s+(\d+)\s*:\s*/i;

/**
 * Divide o corpo em blocos por linha(s) em branco — cada bloco vira UMA
 * atividade própria (Seção "cada bloco vira uma célula/atividade"). Quebras
 * de linha DENTRO de um bloco nunca são tocadas; só a linha em branco entre
 * blocos é removida (ela é só um separador, não conteúdo).
 */
function splitIntoBlocks(body) {
  return String(body || "")
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * Classifica uma mensagem TEXT como um comando explícito de atividade, ou
 * `null` se não combinar com nenhum cabeçalho conhecido (mensagem comum,
 * segue para a classificação normal da IA).
 */
function parseExplicitActivityCommand(text) {
  const raw = String(text || "");

  const semFotoMatch = raw.match(SEM_FOTO_HEADER);
  if (semFotoMatch) {
    return { type: "SEM_FOTO", blocks: splitIntoBlocks(raw.slice(semFotoMatch[0].length)) };
  }

  const complementoMatch = raw.match(COMPLEMENTO_HEADER);
  if (complementoMatch) {
    const texto = raw.slice(complementoMatch[0].length).trim();
    return { type: "COMPLEMENTO", targetNumero: Number(complementoMatch[1]), texto };
  }

  return null;
}

module.exports = {
  parseExplicitActivityCommand,
  splitIntoBlocks,
  SEM_FOTO_HEADER,
  COMPLEMENTO_HEADER,
};
