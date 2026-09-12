"use strict";

/**
 * Construção do snapshot imutável de uma execução diária (Bloco 5) — 100%
 * determinístico, sem IA, sem inferência. Consolida `telegram_mensagens` (+
 * `automacao_arquivos` para fotos já armazenadas) num objeto normalizado
 * pronto para o gerador do D.O. de um bloco futuro.
 *
 * NUNCA inclui: bot token, webhook secret, URL do Telegram, credencial
 * OAuth/Google, ou qualquer payload técnico bruto do update — só os campos
 * de negócio já teorizados no domínio (id, timestamp, autor, texto/legenda,
 * referência ao arquivo no Drive).
 */

const crypto = require("crypto");

// Formato do JSON do snapshot em si (campo "version" DENTRO do payload) —
// NUNCA confundir com `automacao_execucao_snapshots.versao` (contador de
// quantas vezes ESTA execução foi fechada/reprocessada). Um muda quando a
// FORMA do JSON muda (nunca aconteceu ainda); o outro muda a cada fechamento.
const SNAPSHOT_FORMAT_VERSION = 1;

const MAX_FAILURE_REASON_LENGTH = 300;

function sanitizeFailureReason(rawMessage) {
  if (!rawMessage) return null;
  return String(rawMessage).slice(0, MAX_FAILURE_REASON_LENGTH);
}

/**
 * Serialização canônica: chaves de objeto sempre em ordem alfabética, em
 * qualquer profundidade. `JSON.stringify` sozinho não garante isso (a ordem
 * de inserção das chaves poderia mudar sem intenção em uma edição futura,
 * silenciosamente alterando o hash) — esta função remove essa dependência,
 * fazendo o hash depender só do CONTEÚDO lógico, nunca da ordem de escrita
 * do código que monta o objeto.
 */
function canonicalStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
}

function computeSnapshotHash(snapshot) {
  return crypto.createHash("sha256").update(canonicalStringify(snapshot), "utf8").digest("hex");
}

/** Transforma uma linha (telegram_mensagens LEFT JOIN automacao_arquivos) no formato de snapshot. */
function buildMessageSnapshot(row) {
  const text = row.texto ?? null;
  const caption = row.caption ?? null;

  const message = {
    telegramMessageId: String(row.message_id),
    // TIMESTAMPTZ é seguro para virar Date/ISOString direto (ao contrário de
    // DATE puro — ver aviso em folderNaming.js do Bloco 4): carrega o
    // instante absoluto, sem ambiguidade de timezone do processo.
    timestamp: row.data_hora_original ? row.data_hora_original.toISOString() : null,
    type: row.tipo,
    author: {
      id: row.telegram_user_id != null ? String(row.telegram_user_id) : null,
      name: row.autor_nome ?? null,
      username: row.telegram_username ?? null,
    },
    text,
    caption,
    // Derivado, nunca destrutivo: text/caption originais continuam intactos
    // acima. `effectiveText` é só uma conveniência para quem só quer "o texto
    // relevante, seja lá de onde veio".
    effectiveText: text ?? caption ?? null,
    mediaGroupId: row.media_group_id ?? null,
    photo: null,
  };

  if (row.tipo === "PHOTO") {
    const stored = row.storage_status === "COMPLETED";
    const failed = row.storage_status === "FAILED";
    message.photo = {
      stored,
      driveFileId: row.drive_file_id ?? null,
      fileUniqueId: row.telegram_file_unique_id ?? null,
      failed,
      failureReason: failed ? sanitizeFailureReason(row.storage_last_error) : null,
    };
  }

  return message;
}

/** Métricas agregadas do dia (Seção 22) — persistidas junto do snapshot, nunca recalculadas depois sem um rebuild explícito. */
function computeMetrics(messages) {
  const mediaGroups = new Set();
  let textMessagesTotal = 0;
  let photosTotal = 0;
  let photosStored = 0;
  let photosFailedPermanent = 0;

  for (const message of messages) {
    if (message.type === "TEXT") textMessagesTotal += 1;
    if (message.type === "PHOTO") {
      photosTotal += 1;
      if (message.photo?.stored) photosStored += 1;
      if (message.photo?.failed) photosFailedPermanent += 1;
    }
    if (message.mediaGroupId) mediaGroups.add(message.mediaGroupId);
  }

  return {
    messagesTotal: messages.length,
    textMessagesTotal,
    photosTotal,
    photosStored,
    photosFailedPermanent,
    mediaGroupsTotal: mediaGroups.size,
  };
}

const MESSAGES_QUERY = `
  SELECT
    m.message_id, m.telegram_user_id, m.autor_nome, m.telegram_username,
    m.data_hora_original, m.tipo, m.texto, m.caption, m.media_group_id,
    m.telegram_file_unique_id, m.storage_status, m.storage_last_error,
    a.drive_file_id
  FROM telegram_mensagens m
  LEFT JOIN automacao_arquivos a ON a.telegram_mensagem_id = m.id
  WHERE m.automacao_execucao_id = $1
  -- Ordenação determinística (Seção 18): timestamp Telegram ASC, message_id
  -- ASC como desempate — comparação numérica de BIGINT feita pelo Postgres
  -- em si, nunca por um Number JS (que perderia precisão em IDs de 15+
  -- dígitos, exatamente o problema que o Bloco 3 já resolveu na captura).
  ORDER BY m.data_hora_original ASC NULLS LAST, m.message_id ASC
`;

/** Constrói o snapshot + métricas de UMA execução a partir do estado atual em `telegram_mensagens`/`automacao_arquivos`. */
async function buildExecutionSnapshot(pool, { execucaoId, dataReferencia, timezone }) {
  const { rows } = await pool.query(MESSAGES_QUERY, [execucaoId]);
  const messages = rows.map(buildMessageSnapshot);
  const metrics = computeMetrics(messages);
  const snapshot = {
    version: SNAPSHOT_FORMAT_VERSION,
    referenceDate: dataReferencia,
    timezone,
    messages,
  };
  return { snapshot, metrics };
}

module.exports = {
  SNAPSHOT_FORMAT_VERSION,
  canonicalStringify,
  computeSnapshotHash,
  buildMessageSnapshot,
  computeMetrics,
  buildExecutionSnapshot,
};
