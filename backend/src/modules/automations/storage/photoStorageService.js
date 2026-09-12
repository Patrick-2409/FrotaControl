"use strict";

/**
 * Orquestração do armazenamento de fotos do Telegram no Google Drive
 * (Bloco 4) — download + upload idempotente de UMA mensagem PHOTO por vez.
 *
 * Ponto de entrada deliberadamente SEPARADO do webhook (Bloco 3): o Bloco 3
 * já garante que a mensagem é persistida com storage_status = 'PENDING'
 * DEPOIS do commit da transação de captura (nunca dentro dela — ver
 * telegramWebhookService.js). Este módulo não é chamado automaticamente por
 * nada ainda: a auditoria (Bloco 0) já havia constatado que o FrotaMax não
 * tem nenhum scheduler/worker em produção hoje, e criar um está fora do
 * escopo do Bloco 4 (que é especificamente "download + armazenamento", não
 * "orquestração/agendamento"). `processPendingPhotoStorage` é a função que um
 * bloco futuro (scheduler ou worker) deverá invocar periodicamente — por ora
 * ela só é exercida pelos testes e por chamada manual.
 *
 * Isso também é o que torna a separação "upload nunca dentro da transação do
 * webhook" trivialmente verdadeira: não existe NENHUM caminho de código que
 * chame este módulo a partir do handler HTTP do webhook.
 */

const { StorageError, classifyStorageError } = require("./errorClassification");
const { ensureExecutionFolders } = require("./folderProvisioningService");
const { photoFileName } = require("./folderNaming");
const { getMaxStorageAttempts, STALE_PROCESSING_MINUTES } = require("./automationStorageConfig");
const { logInfo, logWarn } = require("../../../services/loggerService");

// Telegram sempre reencoda o campo `photo` como JPEG (é um array de variantes
// de uma mesma compressão) — diferente de `document`, que pode ter qualquer
// mime type e fica fora do escopo do Bloco 4. Não há ambiguidade a resolver
// aqui, então o mime/extensão são fixos, não inferidos do binário.
const PHOTO_MIME_TYPE = "image/jpeg";
const PHOTO_EXTENSION = "jpg";

/**
 * `automacaoConfigId`/`automacaoExecucaoId` são opcionais — ambos omitidos, a
 * claim é GLOBAL (a fila inteira da plataforma, o modo esperado para um
 * worker/scheduler real de produção, que processa todas as configs de uma
 * vez). `automacaoConfigId` restringe a uma config específica — útil tanto
 * para um reprocessamento manual pontual quanto para isolar testes entre si
 * sem depender de limpeza de dados no final de cada teste (mesmo espírito de
 * nunca depender de filtro implícito que já rege `tenantContext.js` no resto
 * do projeto). `automacaoExecucaoId` (adicionado no Bloco 5) restringe ainda
 * mais, a UMA execução específica — o motor de fechamento diário precisa
 * disso: uma config pode ter fotos pendentes de OUTROS dias além do que está
 * sendo fechado agora, e retentar só as da execução atual é o que a Seção 13
 * do Bloco 5 pede ("para cada foto ainda [pendente] tentar uma rodada").
 */
async function claimNextPendingPhotoMessage(
  pool,
  {
    maxAttempts = getMaxStorageAttempts(),
    staleMinutes = STALE_PROCESSING_MINUTES,
    automacaoConfigId = null,
    automacaoExecucaoId = null,
  } = {}
) {
  const { rows } = await pool.query(
    `UPDATE telegram_mensagens
     SET storage_status = 'PROCESSING',
         storage_attempts = storage_attempts + 1,
         storage_last_attempt_at = NOW()
     WHERE id = (
       SELECT id FROM telegram_mensagens
       WHERE tipo = 'PHOTO'
         AND ($3::int IS NULL OR automacao_config_id = $3)
         AND ($4::int IS NULL OR automacao_execucao_id = $4)
         AND (
           storage_status = 'PENDING'
           OR (storage_status = 'PROCESSING' AND storage_last_attempt_at < NOW() - ($1 || ' minutes')::interval)
         )
         AND storage_attempts < $2
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
    [staleMinutes, maxAttempts, automacaoConfigId, automacaoExecucaoId]
  );
  return rows[0] || null;
}

/**
 * Claim de UMA mensagem específica (por id), não "a próxima da fila" —
 * introduzida no Bloco 5 para o motor de fechamento diário, que precisa de
 * "no máximo uma tentativa por foto, por chamada de fechamento" (nunca um
 * loop que reclama a MESMA mensagem repetidas vezes até esgotar
 * storage_attempts de uma só vez, o que aconteceria se o motor de fechamento
 * usasse `processPendingPhotoStorage` num loop: uma foto que falha volta
 * para PENDING e ficaria imediatamente elegível de novo dentro do MESMO
 * loop). Mesma WHERE de elegibilidade de `claimNextPendingPhotoMessage`, só
 * que mirada num id — se a mensagem não estiver mais elegível (já
 * COMPLETED/FAILED, ou tentativas esgotadas), retorna null sem tocar nada.
 */
async function claimSpecificPhotoMessage(pool, mensagemId, { maxAttempts = getMaxStorageAttempts(), staleMinutes = STALE_PROCESSING_MINUTES } = {}) {
  const { rows } = await pool.query(
    `UPDATE telegram_mensagens
     SET storage_status = 'PROCESSING',
         storage_attempts = storage_attempts + 1,
         storage_last_attempt_at = NOW()
     WHERE id = $1
       AND tipo = 'PHOTO'
       AND (
         storage_status = 'PENDING'
         OR (storage_status = 'PROCESSING' AND storage_last_attempt_at < NOW() - ($2 || ' minutes')::interval)
       )
       AND storage_attempts < $3
     RETURNING *`,
    [mensagemId, staleMinutes, maxAttempts]
  );
  return rows[0] || null;
}

async function loadMessageContext(pool, mensagemId) {
  // to_char evita o objeto Date que o `pg` construiria para uma coluna DATE
  // (ver aviso em folderNaming.js) — o nome do arquivo precisa da string
  // YYYY-MM-DD exata, nunca de uma reinterpretação por timezone do processo.
  const { rows } = await pool.query(
    `SELECT m.*, to_char(e.data_referencia, 'YYYY-MM-DD') AS data_referencia_str
     FROM telegram_mensagens m
     JOIN automacao_execucoes e ON e.id = m.automacao_execucao_id
     WHERE m.id = $1`,
    [mensagemId]
  );
  return rows[0] || null;
}

async function logAutomationEvent(pool, { empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, dados }) {
  await pool.query(
    `INSERT INTO automacao_eventos (empresa_id, automacao_config_id, automacao_execucao_id, tipo_evento, origem, dados)
     VALUES ($1, $2, $3, $4, 'SISTEMA', $5::jsonb)`,
    [empresaId, automacaoConfigId, automacaoExecucaoId, tipoEvento, JSON.stringify(dados || {})]
  );
}

async function markMessageCompleted(pool, mensagemId) {
  await pool.query(
    `UPDATE telegram_mensagens
     SET storage_status = 'COMPLETED', storage_completed_at = NOW(), storage_last_error = NULL
     WHERE id = $1`,
    [mensagemId]
  );
}

async function markMessageFailed(pool, mensagemId, { errorMessage, definitive, attempts, maxAttempts }) {
  const isFinal = definitive || attempts >= maxAttempts;
  await pool.query(
    `UPDATE telegram_mensagens
     SET storage_status = $2, storage_last_error = $3
     WHERE id = $1`,
    [mensagemId, isFinal ? "FAILED" : "PENDING", String(errorMessage || "").slice(0, 4000)]
  );
  return isFinal;
}

/**
 * Processa UMA mensagem já CLAIMADA (storage_status = 'PROCESSING'). Nunca
 * chama claimNextPendingPhotoMessage sozinha — quem orquestra várias
 * mensagens é processPendingPhotoStorage, abaixo.
 */
async function processPhotoMessageStorage({ mensagem, pool, telegramFileClient, googleDriveClient, maxAttempts = getMaxStorageAttempts() }) {
  const context = await loadMessageContext(pool, mensagem.id);
  if (!context) {
    throw new StorageError(`Mensagem ${mensagem.id} não encontrada (ou sem execução/config associada).`, {
      code: "MENSAGEM_NAO_ENCONTRADA",
      storageErrorClass: "DEFINITIVE",
    });
  }

  const eventBase = {
    empresaId: context.empresa_id,
    automacaoConfigId: context.automacao_config_id,
    automacaoExecucaoId: context.automacao_execucao_id,
  };

  try {
    const { fotosId, anyCreated, createdLevels } = await ensureExecutionFolders({
      pool,
      execucaoId: context.automacao_execucao_id,
      driveClient: googleDriveClient,
    });
    await logAutomationEvent(pool, {
      ...eventBase,
      tipoEvento: anyCreated ? "DRIVE_FOLDER_CREATED" : "DRIVE_FOLDER_REUSED",
      dados: { createdLevels, mensagem_id: mensagem.id },
    });

    const fileName = photoFileName({
      dataReferencia: context.data_referencia_str,
      telegramMessageId: context.message_id,
      extension: PHOTO_EXTENSION,
    });

    const appProperties = {
      telegram_file_unique_id: String(context.telegram_file_unique_id || ""),
      telegram_mensagem_id: String(context.id),
      automacao_execucao_id: String(context.automacao_execucao_id),
    };

    let driveFile = await googleDriveClient.findFileBySourceMetadata({
      parentId: fotosId,
      appProperties: { telegram_file_unique_id: appProperties.telegram_file_unique_id },
    });
    let recovered = Boolean(driveFile);

    if (!driveFile) {
      const { filePath } = await telegramFileClient.getFile(context.telegram_file_id);
      await logAutomationEvent(pool, { ...eventBase, tipoEvento: "TELEGRAM_FILE_DOWNLOADED", dados: { mensagem_id: mensagem.id } });
      const buffer = await telegramFileClient.downloadFile(filePath);

      driveFile = await googleDriveClient.uploadFile({
        parentId: fotosId,
        name: fileName,
        mimeType: PHOTO_MIME_TYPE,
        buffer,
        appProperties,
      });
      await logAutomationEvent(pool, {
        ...eventBase,
        tipoEvento: "DRIVE_PHOTO_UPLOADED",
        dados: { mensagem_id: mensagem.id, drive_file_id: driveFile.id, tamanho_bytes: buffer.byteLength },
      });
    } else {
      await logAutomationEvent(pool, {
        ...eventBase,
        tipoEvento: "DRIVE_PHOTO_RECOVERED",
        dados: { mensagem_id: mensagem.id, drive_file_id: driveFile.id },
      });
    }

    await pool.query(
      `INSERT INTO automacao_arquivos (
         empresa_id, automacao_execucao_id, tipo, nome_arquivo, mime_type, tamanho_bytes,
         drive_file_id, drive_folder_id, telegram_file_id, telegram_mensagem_id, metadata
       ) VALUES ($1,$2,'PHOTO',$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT (telegram_mensagem_id) WHERE telegram_mensagem_id IS NOT NULL DO NOTHING`,
      [
        context.empresa_id,
        context.automacao_execucao_id,
        fileName,
        PHOTO_MIME_TYPE,
        typeof driveFile.size === "string" || typeof driveFile.size === "number" ? Number(driveFile.size) : null,
        driveFile.id,
        fotosId,
        context.telegram_file_id,
        context.id,
        JSON.stringify({ recovered, telegram_file_unique_id: appProperties.telegram_file_unique_id }),
      ]
    );

    await markMessageCompleted(pool, context.id);
    logInfo("automation_photo_storage_completed", { mensagemId: context.id, recovered });
    return { status: "COMPLETED", driveFileId: driveFile.id, recovered };
  } catch (err) {
    const storageClass = classifyStorageError(err);
    const isFinal = await markMessageFailed(pool, context.id, {
      errorMessage: err.message,
      definitive: storageClass === "DEFINITIVE",
      attempts: mensagem.storage_attempts,
      maxAttempts,
    });
    await logAutomationEvent(pool, {
      ...eventBase,
      tipoEvento: "DRIVE_PHOTO_UPLOAD_FAILED",
      dados: { mensagem_id: mensagem.id, erro: err.message, classe: storageClass, tentativa_final: isFinal },
    });
    logWarn("automation_photo_storage_failed", { mensagemId: context.id, storageClass, isFinal, message: err.message });
    throw err;
  }
}

/**
 * Loop de processamento em lote — função pensada para ser chamada por um
 * scheduler/worker de um bloco futuro (nenhum existe hoje no FrotaMax, ver
 * comentário do topo do arquivo). Nunca lança por causa de UMA mensagem
 * falhar — cada claim é isolada; o loop só para quando não há mais nada
 * elegível ou ao atingir `limit`.
 */
async function processPendingPhotoStorage({
  pool,
  telegramFileClient,
  googleDriveClient,
  limit = 20,
  maxAttempts = getMaxStorageAttempts(),
  automacaoConfigId = null,
  automacaoExecucaoId = null,
}) {
  const summary = { processed: 0, succeeded: 0, failed: 0 };
  for (let i = 0; i < limit; i += 1) {
    const mensagem = await claimNextPendingPhotoMessage(pool, { maxAttempts, automacaoConfigId, automacaoExecucaoId });
    if (!mensagem) break;
    summary.processed += 1;
    try {
      await processPhotoMessageStorage({ mensagem, pool, telegramFileClient, googleDriveClient, maxAttempts });
      summary.succeeded += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}

module.exports = {
  PHOTO_MIME_TYPE,
  PHOTO_EXTENSION,
  claimNextPendingPhotoMessage,
  claimSpecificPhotoMessage,
  loadMessageContext,
  processPhotoMessageStorage,
  processPendingPhotoStorage,
  markMessageCompleted,
  markMessageFailed,
};
