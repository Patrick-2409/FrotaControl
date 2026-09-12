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

// Máquina de estados da execução diária. COLLECTING/PROCESSING existiam desde
// o Bloco 1 sem uso real; o Bloco 5 é o primeiro a implementar a transição de
// verdade (COLLECTING -> PROCESSING -> READY_FOR_GENERATION, com ERROR como
// estado de retry recuperável). AWAITING_APPROVAL em diante ficam reservados
// para blocos futuros (geração do D.O., aprovação, envio).
const AUTOMATION_EXECUTION_STATUSES = Object.freeze([
  "COLLECTING",
  "PROCESSING",
  "READY_FOR_GENERATION",
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

// Ciclo de vida do armazenamento de mídia no Drive (Bloco 4). Só se aplica a
// mensagens tipo PHOTO — TEXT/DOCUMENT/OUTRO mantêm storage_status NULL
// ("não aplicável"), nunca um valor deste enum. NULL satisfaz a CHECK
// `IN (...)` do Postgres (constraint só falha em FALSE, não em NULL), então
// nenhum valor "N/A" precisa existir nesta lista.
const AUTOMATION_STORAGE_STATUSES = Object.freeze(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);

// Motivo de cada linha em automacao_execucao_snapshots (Bloco 5): o primeiro
// fechamento do dia, ou um reprocessamento explícito posterior (late input).
const AUTOMATION_SNAPSHOT_REASONS = Object.freeze(["INITIAL_CLOSING", "REBUILD"]);

// Códigos de erro do MOTOR DE FECHAMENTO (automacao_execucoes.erro_codigo,
// Bloco 5) — NULL continua significando "sem erro" ou "erro sem código
// específico" (ex.: exceção inesperada, guardada só em erro_mensagem).
// Todo código aqui precisa aparecer também em AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES
// OU numa lista de códigos definitivos de um bloco futuro — nunca fica ambíguo.
const AUTOMATION_CLOSING_ERROR_CODES = Object.freeze(["PHOTO_STORAGE_PENDING"]);

// Subconjunto de AUTOMATION_CLOSING_ERROR_CODES que autoriza uma nova
// tentativa de fechamento (ERROR -> PROCESSING via claim atômico). Erros
// definitivos de configuração (ex.: template inexistente, de um bloco
// futuro) NUNCA entram aqui — teriam outra política, fora do escopo deste bloco.
const AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES = Object.freeze(["PHOTO_STORAGE_PENDING"]);

module.exports = {
  AUTOMATION_EXECUTION_STATUSES,
  AUTOMATION_FILE_TYPES,
  AUTOMATION_FILE_TYPES_WITH_CURRENT_VERSION,
  AUTOMATION_APPROVAL_DECISIONS,
  AUTOMATION_RECIPIENT_TYPES,
  TELEGRAM_MESSAGE_TYPES,
  AUTOMATION_STORAGE_STATUSES,
  AUTOMATION_SNAPSHOT_REASONS,
  AUTOMATION_CLOSING_ERROR_CODES,
  AUTOMATION_CLOSING_RECOVERABLE_ERROR_CODES,
};
