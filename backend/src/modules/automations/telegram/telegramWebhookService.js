/**
 * Orquestração da captura de mensagens Telegram (Bloco 3).
 *
 * Fluxo por config ativa correspondente ao chat_id da mensagem:
 *   1. calcular data_referencia (message.date + timezone da config);
 *   2. getOrCreateDailyExecution (idempotente, protegido por UNIQUE);
 *   3. tentar inserir telegram_mensagens (ON CONFLICT DO NOTHING — a UNIQUE
 *      (automacao_config_id, chat_id, message_id) do Bloco 1 é a fonte de
 *      verdade da deduplicação, não update_id);
 *   4. se duplicada, encerrar idempotentemente (sem 2º evento);
 *   5. se nova, registrar automacao_eventos e incrementar contadores.
 * Passos 2-5 rodam na MESMA transação: uma falha entre criar a execução e
 * registrar a mensagem nunca deixa estado parcial — tudo ou nada.
 *
 * Uma mesma mensagem física pode ter mais de uma config ativa correspondente
 * ao mesmo chat_id (decisão do Bloco 1) — cada config é processada de forma
 * independente, em sua própria transação.
 */

const { pool } = require("../../../db");
const { logInfo, logWarn } = require("../../../services/loggerService");
const {
  normalizeUpdate,
  resolveMessageType,
  hasRelevantContent,
  selectBestPhoto,
} = require("./telegramUpdateParser");
const { parseApprovalCallbackData } = require("../approval/approvalCallbackParser");
const { handleApprovalCallback } = require("../approval/documentApprovalService");
const { createTelegramBotClient } = require("../approval/telegramBotClient");

/** Data civil (YYYY-MM-DD) de um timestamp UNIX (segundos) num timezone IANA — nunca UTC hardcoded. */
function computeDataReferencia(dateUnixSeconds, timezone) {
  const date = new Date(dateUnixSeconds * 1000);
  // "en-CA" formata nativamente como YYYY-MM-DD — evita montar a string à mão.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

async function findActiveConfigsByChatId(chatId) {
  const { rows } = await pool.query(
    `SELECT id, empresa_id, timezone
     FROM automacao_configs
     WHERE telegram_chat_id = $1::bigint AND ativo = true AND deleted_at IS NULL`,
    [chatId]
  );
  return rows;
}

/** Idempotente: cria a execução COLLECTING do dia se ainda não existir, ou reaproveita a existente. */
async function getOrCreateDailyExecution(client, configId, empresaId, dataReferencia) {
  const inserted = await client.query(
    `INSERT INTO automacao_execucoes (automacao_config_id, empresa_id, data_referencia, status)
     VALUES ($1, $2, $3, 'COLLECTING')
     ON CONFLICT (automacao_config_id, data_referencia) DO NOTHING
     RETURNING *`,
    [configId, empresaId, dataReferencia]
  );
  if (inserted.rows.length) return inserted.rows[0];

  const { rows } = await client.query(
    `SELECT * FROM automacao_execucoes WHERE automacao_config_id = $1 AND data_referencia = $2`,
    [configId, dataReferencia]
  );
  return rows[0];
}

async function processForConfig(config, updateId, message) {
  const dataReferencia = computeDataReferencia(message.dateUnix, config.timezone);
  const tipo = resolveMessageType(message);
  const bestPhoto = tipo === "PHOTO" ? selectBestPhoto(message.photos) : null;
  const dadosAdicionais = message.document
    ? { document_file_name: message.document.fileName, document_mime_type: message.document.mimeType }
    : {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const execucao = await getOrCreateDailyExecution(client, config.id, config.empresa_id, dataReferencia);

    const insertMensagem = await client.query(
      `INSERT INTO telegram_mensagens (
         empresa_id, automacao_config_id, automacao_execucao_id, chat_id, message_id,
         update_id, telegram_user_id, autor_nome, telegram_username, data_hora_original,
         data_referencia, tipo, texto, caption, telegram_file_id, telegram_file_unique_id,
         media_group_id, foto_largura, foto_altura, foto_tamanho_bytes, dados_adicionais,
         storage_status
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, to_timestamp($10),
         $11, $12, $13, $14, $15, $16,
         $17, $18, $19, $20, $21::jsonb,
         $22
       )
       ON CONFLICT (automacao_config_id, chat_id, message_id) DO NOTHING
       RETURNING id`,
      [
        config.empresa_id,
        config.id,
        execucao.id,
        message.chatId,
        message.messageId,
        updateId,
        message.from?.id ?? null,
        message.authorName,
        message.from?.username ?? null,
        message.dateUnix,
        dataReferencia,
        tipo,
        message.text,
        message.caption,
        bestPhoto?.fileId ?? message.document?.fileId ?? null,
        bestPhoto?.fileUniqueId ?? message.document?.fileUniqueId ?? null,
        message.mediaGroupId,
        bestPhoto?.width ?? null,
        bestPhoto?.height ?? null,
        bestPhoto?.fileSize ?? null,
        JSON.stringify(dadosAdicionais),
        // Bloco 4: só fotos entram na fila de armazenamento no Drive —
        // TEXT/DOCUMENT/OUTRO mantêm storage_status NULL (não aplicável).
        tipo === "PHOTO" ? "PENDING" : null,
      ]
    );

    if (!insertMensagem.rows.length) {
      // Duplicata (retransmissão do Telegram ou reprocessamento): a execução
      // COLLECTING do dia é sempre garantida (idempotente), mas nenhum evento
      // novo é criado — encerra em sucesso silencioso.
      await client.query("COMMIT");
      return { status: "duplicate", executionId: execucao.id };
    }

    const eventType = tipo === "PHOTO" ? "TELEGRAM_PHOTO_RECEIVED" : "TELEGRAM_MESSAGE_RECEIVED";
    await client.query(
      `INSERT INTO automacao_eventos (empresa_id, automacao_config_id, automacao_execucao_id, tipo_evento, origem, dados)
       VALUES ($1, $2, $3, $4, 'SISTEMA', $5::jsonb)`,
      [
        config.empresa_id,
        config.id,
        execucao.id,
        eventType,
        JSON.stringify({ message_id: message.messageId, chat_id: message.chatId, tipo }),
      ]
    );

    await client.query(
      `UPDATE automacao_execucoes
       SET mensagens_capturadas = mensagens_capturadas + 1,
           fotos_capturadas = fotos_capturadas + $2,
           updated_at = NOW()
       WHERE id = $1`,
      [execucao.id, tipo === "PHOTO" ? 1 : 0]
    );

    // Bloco 5 (Seção 24/42) — entrada tardia: a execução já saiu de
    // COLLECTING (fechamento já rodou, ou foi além) e mesmo assim uma
    // mensagem NOVA e relevante chegou para o mesmo dia. A captura em si
    // nunca é bloqueada nem adiada — a mensagem é sempre persistida
    // normalmente (já aconteceu acima). O que muda é só a sinalização:
    // marca a execução para reprocessamento explícito, nunca reabre
    // silenciosamente para COLLECTING (um documento já pode ter sido gerado
    // ou até aprovado a partir do snapshot atual — reabrir sem auditoria
    // destruiria essa garantia). Só um `rebuildDailySnapshot` explícito,
    // chamado de propósito, incorpora este late input.
    if (execucao.status !== "COLLECTING") {
      await client.query(
        `UPDATE automacao_execucoes SET has_late_inputs = true, needs_reprocessing = true, updated_at = NOW() WHERE id = $1`,
        [execucao.id]
      );
      await client.query(
        `INSERT INTO automacao_eventos (empresa_id, automacao_config_id, automacao_execucao_id, tipo_evento, origem, dados)
         VALUES ($1, $2, $3, 'LATE_INPUT_RECEIVED', 'SISTEMA', $4::jsonb)`,
        [
          config.empresa_id,
          config.id,
          execucao.id,
          JSON.stringify({ message_id: message.messageId, chat_id: message.chatId, tipo, status_no_momento: execucao.status }),
        ]
      );
    }

    await client.query("COMMIT");
    return { status: "created", executionId: execucao.id, messageId: insertMensagem.rows[0].id, lateInput: execucao.status !== "COLLECTING" };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ponto de entrada do webhook. Nunca lança para updates fora do subconjunto
 * suportado — apenas classifica e responde `handled: false` com o motivo, o
 * que o controller traduz sempre em HTTP 200 (nunca provoca retry do Telegram
 * para algo que nunca vai ficar diferente). Só propaga exceção para falhas
 * reais de infraestrutura (ex.: banco indisponível), que o controller traduz
 * num status que permite retry.
 */
async function processTelegramUpdate(rawUpdate) {
  const { updateId, kind, message, callbackQuery } = normalizeUpdate(rawUpdate);

  if (kind === "callback_query") {
    // Namespace dedicado (Bloco 8, Seção 18): um callback de qualquer outro
    // recurso futuro (fora de `appr:`) nunca é interceptado por engano aqui —
    // cai no mesmo "reconhecido, não tratado" de antes, preservando o
    // comportamento já testado para callbacks desconhecidos.
    const parsed = parseApprovalCallbackData(callbackQuery?.data);
    if (!parsed.valid) {
      return { handled: false, reason: "callback_query_not_implemented" };
    }
    // Nunca importa nada do pipeline de Drive/armazenamento aqui (mesma
    // regra estática do Bloco 4 para este arquivo) — só a mensageria do
    // Telegram (responder o callback, editar a mensagem). A ação REGENERAR
    // só registra o pedido; quem efetivamente gera e reenvia a nova versão
    // é `regenerateAndResendForApproval`, chamada só por teste/API
    // administrativa (Seção 40 da autorização do Bloco 8).
    const telegramClient = createTelegramBotClient({ tokenProvider: () => process.env.TELEGRAM_BOT_TOKEN });
    const result = await handleApprovalCallback({ pool, telegramClient, callbackQuery });
    return { handled: true, results: [{ approval: result }] };
  }
  if (kind !== "message" || !message) {
    return { handled: false, reason: kind === "invalid" ? "invalid_update" : "unsupported_update_kind" };
  }
  if (message.isServiceMessage) {
    return { handled: false, reason: "service_message" };
  }
  if (!hasRelevantContent(message)) {
    return { handled: false, reason: "no_relevant_content" };
  }

  const configs = await findActiveConfigsByChatId(message.chatId);
  if (!configs.length) {
    logInfo("telegram_chat_not_configured", { chat_id: message.chatId });
    return { handled: false, reason: "chat_not_configured" };
  }

  // Cada config tem sua PRÓPRIA transação: se a config N falhar, as configs
  // 1..N-1 já foram commitadas de forma independente e permanecem persistidas
  // (não fazem parte da mesma transação, então não são desfeitas). Propagar o
  // erro aqui interrompe as configs restantes e faz o controller responder um
  // status que provoca retry do Telegram — no reenvio, as configs que já
  // tiveram sucesso caem no caminho "duplicate" (idempotente) e só as que
  // ainda faltavam são de fato reprocessadas.
  const results = [];
  for (const config of configs) {
    try {
      results.push({ configId: config.id, ...(await processForConfig(config, updateId, message)) });
    } catch (err) {
      logWarn("telegram_message_processing_failed", { configId: config.id, message: err.message, code: err.code });
      throw err;
    }
  }

  return { handled: true, results };
}

module.exports = {
  computeDataReferencia,
  findActiveConfigsByChatId,
  getOrCreateDailyExecution,
  processForConfig,
  processTelegramUpdate,
};
