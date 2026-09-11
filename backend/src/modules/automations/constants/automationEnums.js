/**
 * Constantes de domínio do módulo de automações.
 *
 * Seguem o mesmo padrão já usado no schema principal (ex.: veiculos.status_operacional,
 * usuarios.conta_status): coluna VARCHAR + CHECK constraint nomeada, em vez de ENUM
 * do PostgreSQL — evita as limitações de evolução de ENUM (não é possível remover
 * valores, e adicionar exige comando fora de transação em versões antigas do PG).
 *
 * Estas listas devem permanecer sincronizadas com as CHECK constraints definidas em
 * automationSchema.js. O teste de fundação (automationsSchemaFoundation.test.js)
 * valida essa sincronia.
 */

// Máquina de estados da execução diária (persistência preparada; a transição de
// estados/orquestração fica para um bloco futuro — aqui é só o domínio de valores).
const AUTOMATION_EXECUTION_STATUSES = Object.freeze([
  "COLLECTING",
  "PROCESSING",
  "AWAITING_APPROVAL",
  "APPROVED",
  "SENDING",
  "SENT",
  "REJECTED",
  "ERROR",
]);

const AUTOMATION_FILE_TYPES = Object.freeze(["PHOTO", "EXCEL", "PDF"]);

// Tipos de arquivo que têm noção de "versão vigente única" (ver ux_automacao_arquivos_current_documento
// em automationSchema.js). PHOTO fica de fora de propósito: fotos são entidades distintas por
// mensagem do Telegram, não versões de um mesmo documento.
const AUTOMATION_FILE_TYPES_WITH_CURRENT_VERSION = Object.freeze(["EXCEL", "PDF"]);

const AUTOMATION_APPROVAL_DECISIONS = Object.freeze([
  "APROVADO",
  "REJEITADO",
  "REGENERAR_SOLICITADO",
]);

const AUTOMATION_RECIPIENT_TYPES = Object.freeze(["TO", "CC"]);

const TELEGRAM_MESSAGE_TYPES = Object.freeze(["TEXT", "PHOTO", "DOCUMENT", "OUTRO"]);

module.exports = {
  AUTOMATION_EXECUTION_STATUSES,
  AUTOMATION_FILE_TYPES,
  AUTOMATION_FILE_TYPES_WITH_CURRENT_VERSION,
  AUTOMATION_APPROVAL_DECISIONS,
  AUTOMATION_RECIPIENT_TYPES,
  TELEGRAM_MESSAGE_TYPES,
};
