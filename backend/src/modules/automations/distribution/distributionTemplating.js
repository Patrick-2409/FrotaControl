"use strict";

/**
 * Templating SEGURO de assunto/corpo do e-mail de distribuição (Bloco 9,
 * Seção 12) — SOMENTE substituição literal de placeholders de uma lista
 * fechada (`ALLOWED_PLACEHOLDERS`). Nunca `eval`/`new Function`/interpolação
 * de expressão arbitrária — não existe caminho de código aqui capaz de
 * executar algo que não seja `String.prototype.replace` sobre um valor já
 * resolvido internamente, então template injection não é possível por
 * construção (o "template" nunca controla o QUÊ é executado, só ONDE um
 * valor fixo é inserido).
 *
 * Placeholder desconhecido (Seção 12): a política escolhida é NUNCA lançar
 * em tempo de renderização (um e-mail não pode falhar de forma obscura por
 * causa de um texto salvo antes de uma mudança na lista de placeholders
 * suportados) — o token é deixado EXPLICITAMENTE identificado no texto
 * final, sem substituição. A validação de placeholder desconhecido em tempo
 * de SALVAMENTO da configuração é feita separadamente, em
 * `emailConfigSchema.js` (Zod, Seção 31).
 */

const ALLOWED_PLACEHOLDERS = Object.freeze([
  "projeto",
  "data",
  "versao",
  "cliente",
  "referenciaContratual",
  "identificacao",
  // Bloco 12 — dia da semana da dataReferencia da execução, calculado a
  // partir da data civil (nunca de `new Date()`/relógio do servidor, Seção
  // "placeholders do e-mail").
  "dia_semana",
  "data_com_dia_semana",
]);

// Sintaxe histórica do FrotaMax é chave ÚNICA ({data}, {projeto}, etc. — ver
// EmpresaAutomacoesPage.jsx e DEFAULT_SUBJECT_TEMPLATE/DEFAULT_BODY_TEMPLATE
// em distributionMessageBuilder.js). O pedido de {{dia_semana}}/
// {{data_com_dia_semana}} (chave DUPLA) precisa funcionar SEM quebrar essa
// sintaxe já em produção — a solução é um único padrão que aceita as duas
// chaves de abertura/fechamento como OPCIONAIS independentemente
// (`\{\{?...\}\}?`), nunca as duas obrigatórias: "{data}" continua batendo
// (chave única de cada lado), "{{dia_semana}}" bate inteiro numa side
// só (nunca deixa uma chave sobrando de nenhum dos dois lados — a mesma
// lógica vale para QUALQUER placeholder da lista, não só os dois novos).
const PLACEHOLDER_PATTERN = /\{\{?([a-zA-Z0-9_]+)\}\}?/g;

/** Lista (sem duplicatas) de nomes de placeholder presentes no texto — nunca lança. */
function extractPlaceholders(text) {
  const found = new Set();
  const pattern = new RegExp(PLACEHOLDER_PATTERN);
  let match;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    found.add(match[1]);
  }
  return [...found];
}

/** Subconjunto de extractPlaceholders() que NÃO está na lista permitida — usado na validação de salvamento (Seção 31). */
function findUnknownPlaceholders(text) {
  return extractPlaceholders(text).filter((name) => !ALLOWED_PLACEHOLDERS.includes(name));
}

/**
 * Substitui apenas placeholders conhecidos com valor definido em `values`;
 * qualquer outro token (desconhecido, ou conhecido mas sem valor) permanece
 * literal no texto — nunca lança, nunca remove silenciosamente.
 */
function renderTemplate(text, values = {}) {
  const pattern = new RegExp(PLACEHOLDER_PATTERN);
  return String(text || "").replace(pattern, (fullMatch, name) => {
    if (!ALLOWED_PLACEHOLDERS.includes(name)) return fullMatch;
    if (!Object.prototype.hasOwnProperty.call(values, name) || values[name] == null) return fullMatch;
    return String(values[name]);
  });
}

module.exports = { ALLOWED_PLACEHOLDERS, extractPlaceholders, findUnknownPlaceholders, renderTemplate };
