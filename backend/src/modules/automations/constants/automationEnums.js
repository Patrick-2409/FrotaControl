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
// 6 estendeu com AI_PROCESSING (estruturação inteligente do dia) e
// READY_FOR_DOCUMENT. O Bloco 7B estende com DOCUMENT_PROCESSING/
// DOCUMENT_READY (geração versionada do Excel/PDF — nenhum envio ainda).
// AWAITING_APPROVAL em diante ficam reservados para um bloco futuro (envio
// ao Telegram/aprovação).
const AUTOMATION_EXECUTION_STATUSES = Object.freeze([
  "COLLECTING",
  "PROCESSING",
  "READY_FOR_GENERATION",
  "AI_PROCESSING",
  "READY_FOR_DOCUMENT",
  "DOCUMENT_PROCESSING",
  "DOCUMENT_READY",
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

// Ciclo de vida de UMA solicitação de aprovação (Bloco 8) — entidade PRÓPRIA,
// distinta da execução (que só transiciona para AWAITING_APPROVAL depois do
// envio ao Telegram ser CONFIRMADO, nunca antes — Seção 3). PENDING_SEND é o
// estado de claim (permite reentrada em caso de crash entre o claim e o
// envio real); SENT é o estado "aguardando decisão humana"; APPROVED/REJECTED
// são terminais definidos pela primeira decisão válida (Seção 10);
// SUPERSEDED marca uma solicitação cuja versão foi substituída por um
// REGENERAR (nunca apaga o histórico); ERROR é recuperável via nova chamada
// de envio (não reabre automaticamente).
const AUTOMATION_APPROVAL_REQUEST_STATUSES = Object.freeze([
  "PENDING_SEND",
  "SENT",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
  "ERROR",
]);

// Códigos de erro da SOLICITAÇÃO DE APROVAÇÃO (Bloco 8) — coluna PRÓPRIA
// (automacao_solicitacoes_aprovacao.erro_codigo), nunca a coluna compartilhada
// de automacao_execucoes (o envio ao Telegram nunca muda o status da
// execução até ser confirmado, então uma falha de envio nunca precisa tocar
// automacao_execucoes.erro_codigo — ver documentApprovalService.js).
const AUTOMATION_APPROVAL_ERROR_CODES = Object.freeze([
  "APPROVAL_FILE_NOT_FOUND",
  "APPROVAL_TELEGRAM_SEND_FAILED",
  "APPROVAL_REGENERATION_FAILED",
]);

// APPROVAL_FILE_NOT_FOUND fica de fora: um automacao_arquivos ausente para um
// documento já COMPLETED indica inconsistência de dados, não algo que se
// resolve só tentando de novo. Os outros dois são transitórios por natureza
// (rede/timeout do Telegram, ou uma falha recuperável já classificada pelo
// próprio documentGenerationService ao regenerar).
const AUTOMATION_APPROVAL_RECOVERABLE_ERROR_CODES = Object.freeze([
  "APPROVAL_TELEGRAM_SEND_FAILED",
  "APPROVAL_REGENERATION_FAILED",
]);

// Ciclo de vida de UMA distribuição por e-mail (Bloco 9) — ao contrário da
// solicitação de aprovação do Bloco 8, aqui a própria execução acompanha a
// distribuição em lockstep (`APPROVED -> SENDING -> SENT`, Seção 23), porque
// a claim atômica na execução já é o mecanismo de proteção contra duas
// instâncias enviarem a mesma versão (Seção 24) — não precisou de um estado
// transitório separado como o `PENDING_SEND` do Bloco 8.
const AUTOMATION_DISTRIBUTION_STATUSES = Object.freeze(["PENDING", "SENDING", "SENT", "ERROR"]);

// Vocabulário completo de erro do módulo de distribuição (Seções 28/29) —
// usado como `code` em outcomes/eventos. Nem todo código aqui é
// persistível numa coluna com CHECK (ver AUTOMATION_DISTRIBUTION_PERSISTABLE_ERROR_CODES
// abaixo): os seis primeiros são falhas de PRÉ-REQUISITO (aprovação
// ausente/inconsistente, entrada obsoleta, sem destinatário TO, e-mail
// inválido, configuração de remetente incompleta) que nunca chegam a criar
// uma linha em `automacao_distribuicoes` nem a mudar o status da execução —
// mesmo espírito de NO_SNAPSHOT/NO_APPROVER dos Blocos 7B/8. Só os três
// últimos ocorrem DEPOIS do claim atômico, quando já existe uma linha de
// distribuição em andamento.
const AUTOMATION_DISTRIBUTION_ERROR_CODES = Object.freeze([
  "DISTRIBUTION_DOCUMENT_NOT_APPROVED",
  "DISTRIBUTION_APPROVAL_INCONSISTENT",
  "DISTRIBUTION_INPUT_STALE",
  "DISTRIBUTION_NO_PRIMARY_RECIPIENT",
  "DISTRIBUTION_INVALID_RECIPIENT_EMAIL",
  "DISTRIBUTION_CONFIG_INCOMPLETE",
  "DISTRIBUTION_FILE_NOT_FOUND",
  "DISTRIBUTION_ATTACHMENT_TOO_LARGE",
  "DISTRIBUTION_EMAIL_SEND_FAILED",
]);

// Subconjunto de AUTOMATION_DISTRIBUTION_ERROR_CODES que de fato é escrito em
// `automacao_distribuicoes.erro_codigo` e no erro_codigo compartilhado de
// `automacao_execucoes` — só os que acontecem depois do claim (Seção 23).
const AUTOMATION_DISTRIBUTION_PERSISTABLE_ERROR_CODES = Object.freeze([
  "DISTRIBUTION_FILE_NOT_FOUND",
  "DISTRIBUTION_ATTACHMENT_TOO_LARGE",
  "DISTRIBUTION_EMAIL_SEND_FAILED",
]);

// DISTRIBUTION_FILE_NOT_FOUND fica de fora: indica inconsistência de dados
// (o automacao_arquivos vinculado ao documento aprovado desapareceu), não
// algo que se resolve só tentando de novo. ATTACHMENT_TOO_LARGE também exige
// intervenção (reduzir o documento não é algo automático). Só a falha de
// envio em si (rede/timeout/indisponibilidade do provedor SMTP) é transitória.
const AUTOMATION_DISTRIBUTION_RECOVERABLE_ERROR_CODES = Object.freeze(["DISTRIBUTION_EMAIL_SEND_FAILED"]);

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

// Códigos de erro da GERAÇÃO DE DOCUMENTO (Bloco 7B) — mesma coluna
// compartilhada automacao_execucoes.erro_codigo.
const AUTOMATION_DOCUMENT_ERROR_CODES = Object.freeze([
  "DOCUMENT_CONFIG_INCOMPLETE",
  "DOCUMENT_TEMPLATE_NOT_FOUND",
  "DOCUMENT_INPUT_INVALID",
  "DOCUMENT_LAYOUT_OVERFLOW",
  "DOCUMENT_EXCEL_GENERATION_FAILED",
  "DOCUMENT_PDF_GENERATION_FAILED",
  "DOCUMENT_STORAGE_FAILED",
]);

// DOCUMENT_CONFIG_INCOMPLETE fica de fora: exige preencher configuração
// (ação humana), nunca resolve só de tentar de novo — mesma lógica de
// AI_DISABLED. DOCUMENT_TEMPLATE_NOT_FOUND também exige intervenção (o
// template precisa existir/estar ativo). Os demais são todos transitórios ou
// corrigíveis numa nova tentativa sem mudança externa (bug momentâneo,
// indisponibilidade do Drive, etc.).
const AUTOMATION_DOCUMENT_RECOVERABLE_ERROR_CODES = Object.freeze([
  "DOCUMENT_INPUT_INVALID",
  "DOCUMENT_LAYOUT_OVERFLOW",
  "DOCUMENT_EXCEL_GENERATION_FAILED",
  "DOCUMENT_PDF_GENERATION_FAILED",
  "DOCUMENT_STORAGE_FAILED",
]);

// União usada SÓ na CHECK constraint de automacao_execucoes.erro_codigo —
// a coluna é compartilhada entre os três subsistemas (fechamento, IA,
// documento).
const AUTOMATION_EXECUTION_ERROR_CODES = Object.freeze([
  ...AUTOMATION_CLOSING_ERROR_CODES,
  ...AUTOMATION_AI_ERROR_CODES,
  ...AUTOMATION_DOCUMENT_ERROR_CODES,
  ...AUTOMATION_DISTRIBUTION_PERSISTABLE_ERROR_CODES,
]);

// Ciclo de vida de UMA linha de automacao_execucao_documentos (Bloco 7B) —
// mesmo espírito de AUTOMATION_INTELLIGENCE_STATUSES.
const AUTOMATION_DOCUMENT_STATUSES = Object.freeze(["PROCESSING", "COMPLETED", "FAILED"]);

// Tipos de geração de documento suportados (Bloco 7B) — hoje só o híbrido
// Excel+PDF; deixa espaço para um bloco futuro que talvez gere só um dos dois.
const AUTOMATION_DOCUMENT_GENERATOR_TYPES = Object.freeze(["EXCEL_PDF_HIBRIDO"]);

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

// Condição de clima por período do dia (Bloco 12, correção de qualidade do
// D.O.) — campo estruturado PRÓPRIO (`clima.manha/tarde/noite`), separado dos
// `facts` livres, para que o Diário de Obra possa marcar o quadro
// MANHÃ/TARDE/NOITE x BOM/CHUVAS de forma determinística, sem depender de
// interpretar texto livre. NAO_INFORMADO é o default seguro — nunca inferido.
const AUTOMATION_AI_WEATHER_CONDITIONS = Object.freeze(["BOM", "CHUVAS", "NAO_INFORMADO"]);

// Bloco 10 (Seção 24-32) — motivo pelo qual uma SOLICITAÇÃO DE APROVAÇÃO
// (Telegram) foi marcada SUPERSEDED: REGENERATE clicado pelo aprovador, ou um
// late input que obrigou reconstrução do snapshot/inteligência/documento
// enquanto esta solicitação ainda aguardava decisão.
const AUTOMATION_APPROVAL_SUPERSEDED_REASONS = Object.freeze(["REGENERATION", "LATE_INPUT"]);

// Bloco 10 (Seção 32) — motivo pelo qual uma GERAÇÃO de documento
// (automacao_execucao_documentos) deixou de ser a corrente da execução.
// MANUAL_REGENERATION fica reservado para uma ação administrativa futura
// (fora do escopo deste bloco — nenhum código atual emite este valor ainda).
const AUTOMATION_DOCUMENT_SUPERSEDED_REASONS = Object.freeze(["REGENERATION", "LATE_INPUT", "MANUAL_REGENERATION"]);

// Bloco 10 (Seção 33-36) — ciclo de vida de UMA execução do orquestrador
// (automacao_orquestracao_runs). DISABLED/ALREADY_RUNNING nunca chegam a
// escanear nada (kill switch desligado, ou lock global já em uso por outra
// instância) — ainda assim são registrados para auditoria/observabilidade.
const AUTOMATION_ORCHESTRATION_RUN_STATUSES = Object.freeze(["RUNNING", "COMPLETED", "PARTIAL_FAILURE", "FAILED", "ALREADY_RUNNING", "DISABLED"]);

// Origem que disparou um ciclo do orquestrador — RENDER_CRON é reservado para
// um bloco futuro (nenhum cron real é criado neste bloco); nunca inventar que
// já existe um agendamento externo configurado.
const AUTOMATION_ORCHESTRATION_TRIGGERS = Object.freeze(["CLI", "TEST", "MANUAL", "RENDER_CRON"]);

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
  AUTOMATION_AI_WEATHER_CONDITIONS,
  AUTOMATION_DOCUMENT_ERROR_CODES,
  AUTOMATION_DOCUMENT_RECOVERABLE_ERROR_CODES,
  AUTOMATION_DOCUMENT_STATUSES,
  AUTOMATION_DOCUMENT_GENERATOR_TYPES,
  AUTOMATION_APPROVAL_REQUEST_STATUSES,
  AUTOMATION_APPROVAL_ERROR_CODES,
  AUTOMATION_APPROVAL_RECOVERABLE_ERROR_CODES,
  AUTOMATION_DISTRIBUTION_STATUSES,
  AUTOMATION_DISTRIBUTION_ERROR_CODES,
  AUTOMATION_DISTRIBUTION_PERSISTABLE_ERROR_CODES,
  AUTOMATION_DISTRIBUTION_RECOVERABLE_ERROR_CODES,
  AUTOMATION_APPROVAL_SUPERSEDED_REASONS,
  AUTOMATION_DOCUMENT_SUPERSEDED_REASONS,
  AUTOMATION_ORCHESTRATION_RUN_STATUSES,
  AUTOMATION_ORCHESTRATION_TRIGGERS,
};
