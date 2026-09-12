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
// o Bloco 1 sem uso real; o Bloco 5 implementou COLLECTING -> PROCESSING ->
// READY_FOR_GENERATION (com ERROR como estado de retry recuperável). O Bloco
// 6 estende com AI_PROCESSING (estruturação inteligente do dia) e
// READY_FOR_DOCUMENT (dados prontos para o gerador do D.O. de um bloco
// futuro — nenhum documento é gerado ainda). AWAITING_APPROVAL em diante
// ficam reservados para blocos futuros (aprovação, envio).
const AUTOMATION_EXECUTION_STATUSES = Object.freeze([
  "COLLECTING",
  "PROCESSING",
  "READY_FOR_GENERATION",
  "AI_PROCESSING",
  "READY_FOR_DOCUMENT",
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

// Códigos de erro da ESTRUTURAÇÃO POR IA (Bloco 6) — mesma coluna
// automacao_execucoes.erro_codigo do motor de fechamento (Bloco 5); os
// valores nunca colidem entre si, então o próprio código já diz de qual
// subsistema (fechamento vs IA) o erro corrente é.
const AUTOMATION_AI_ERROR_CODES = Object.freeze([
  "AI_TIMEOUT",
  "AI_RATE_LIMIT",
  "AI_PROVIDER_ERROR",
  "AI_INVALID_OUTPUT",
  "AI_SOURCE_REFERENCE_INVALID",
  "AI_DISABLED",
  "IMAGE_DOWNLOAD_FAILED",
  "AI_LIMIT_EXCEEDED",
]);

// AI_DISABLED fica de fora: exige uma mudança explícita de configuração
// (usa_ia=true), nunca resolve sozinho só de tentar de novo. Todos os
// outros — incluindo saída inválida da IA — valem a pena re-tentar (um LLM
// não é determinístico; a mesma entrada pode produzir uma saída válida da
// próxima vez, e rate limit/timeout/erro de provedor são por natureza
// transitórios).
const AUTOMATION_AI_RECOVERABLE_ERROR_CODES = Object.freeze([
  "AI_TIMEOUT",
  "AI_RATE_LIMIT",
  "AI_PROVIDER_ERROR",
  "AI_INVALID_OUTPUT",
  "AI_SOURCE_REFERENCE_INVALID",
  "IMAGE_DOWNLOAD_FAILED",
  "AI_LIMIT_EXCEEDED",
]);

// União usada SÓ na CHECK constraint de automacao_execucoes.erro_codigo —
// a coluna é compartilhada entre os dois subsistemas (Seção 5 do Bloco 6).
const AUTOMATION_EXECUTION_ERROR_CODES = Object.freeze([
  ...AUTOMATION_CLOSING_ERROR_CODES,
  ...AUTOMATION_AI_ERROR_CODES,
]);

// Ciclo de vida de UMA linha de automacao_execucao_inteligencias (Bloco 6) —
// distinto do status da EXECUÇÃO (que também passa por AI_PROCESSING): esta
// é a máquina de estados do REGISTRO DE TENTATIVA em si.
const AUTOMATION_INTELLIGENCE_STATUSES = Object.freeze(["PROCESSING", "COMPLETED", "FAILED"]);

// Categorias de fato genéricas (Bloco 6) — deliberadamente independentes do
// layout final do D.O. (que ainda não existe no repositório). Nenhuma é
// obrigatória; arrays vazios são sempre preferíveis a inventar conteúdo.
const AUTOMATION_AI_FACT_CATEGORIES = Object.freeze([
  "ACTIVITY",
  "LOCATION",
  "EQUIPMENT",
  "PERSONNEL",
  "QUANTITY",
  "WEATHER",
  "ENVIRONMENT",
  "SAFETY",
  "OCCURRENCE",
  "MATERIAL",
  "OTHER",
]);

// Tipo de evidência que sustenta um fato — usado pelo validador para aplicar
// a proteção contra números (Seção 30): IMAGE_VISIBLE nunca pode carregar um
// número como fato oficial, só TEXT_EXPLICIT/CAPTION_EXPLICIT podem.
const AUTOMATION_AI_EVIDENCE_TYPES = Object.freeze(["TEXT_EXPLICIT", "CAPTION_EXPLICIT", "IMAGE_VISIBLE"]);

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
  AUTOMATION_AI_ERROR_CODES,
  AUTOMATION_AI_RECOVERABLE_ERROR_CODES,
  AUTOMATION_EXECUTION_ERROR_CODES,
  AUTOMATION_INTELLIGENCE_STATUSES,
  AUTOMATION_AI_FACT_CATEGORIES,
  AUTOMATION_AI_EVIDENCE_TYPES,
};
