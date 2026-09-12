/**
 * Parsing tolerante do update da Telegram Bot API (Bloco 3).
 *
 * Duas responsabilidades distintas e deliberadamente separadas:
 *
 * 1) `parseTelegramJson` — faz o papel de `JSON.parse`, mas preserva como
 *    string qualquer inteiro fora do range seguro do JavaScript
 *    (> Number.MAX_SAFE_INTEGER). O Telegram usa inteiros de 64 bits para
 *    chat_id/message_id/user_id (chat_id de supergrupo é tipicamente
 *    negativo e pode ter 13+ dígitos); o `JSON.parse` nativo já perderia
 *    precisão silenciosamente antes que qualquer código nosso rodasse. Isto
 *    NÃO é uma regex ingênua sobre o texto todo (o que corromperia números
 *    de 16+ dígitos dentro de `text`/`caption` livres do usuário) — é um
 *    scanner de uma passada que respeita literais de string (aspas e
 *    escapes) e só protege dígitos que estão FORA de uma string.
 *
 * 2) `normalizeUpdate` — valida com Zod de forma tolerante (`.passthrough()`
 *    em todo objeto — nunca rejeita um update inteiro por causa de campos
 *    desconhecidos) e devolve uma estrutura normalizada e mínima, sem nunca
 *    guardar o payload bruto.
 */

const { z } = require("zod");

const MIN_PROTECTED_DIGITS = 15; // conservador: MAX_SAFE_INTEGER já tem 16 dígitos.

function protectLargeIntegers(raw) {
  let out = "";
  let inString = false;
  let escapeNext = false;
  let i = 0;
  const n = raw.length;

  while (i < n) {
    const ch = raw[i];

    if (inString) {
      out += ch;
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === "\\") {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i;
      if (raw[j] === "-") j += 1;
      const digitsStart = j;
      while (j < n && raw[j] >= "0" && raw[j] <= "9") j += 1;
      const isFloatOrExp = raw[j] === "." || raw[j] === "e" || raw[j] === "E";
      const digitCount = j - digitsStart;
      const token = raw.slice(i, j);
      if (!isFloatOrExp && digitCount >= MIN_PROTECTED_DIGITS) {
        out += `"${token}"`;
      } else {
        out += token;
      }
      i = j;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/** Parse seguro do corpo bruto do webhook — nunca perde precisão em IDs grandes. */
function parseTelegramJson(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw ?? "");
  return JSON.parse(protectLargeIntegers(text));
}

// ---------------------------------------------------------------- schemas

const telegramId = z.union([z.string(), z.number()]).transform((v) => String(v));

const photoSizeSchema = z
  .object({
    file_id: z.string(),
    file_unique_id: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
    file_size: z.number().optional(),
  })
  .passthrough();

const fromSchema = z
  .object({
    id: telegramId,
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    is_bot: z.boolean().optional(),
  })
  .passthrough();

const chatSchema = z
  .object({
    id: telegramId,
    type: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

const documentSchema = z
  .object({
    file_id: z.string(),
    file_unique_id: z.string(),
    file_name: z.string().optional(),
    mime_type: z.string().optional(),
    file_size: z.number().optional(),
  })
  .passthrough();

// Campos que caracterizam uma "service message" do Telegram (entrada/saída de
// membro, mudança de título, pin, etc.) — nunca viram conteúdo de D.O.
const SERVICE_MESSAGE_FIELDS = [
  "new_chat_members",
  "left_chat_member",
  "new_chat_title",
  "new_chat_photo",
  "delete_chat_photo",
  "group_chat_created",
  "supergroup_chat_created",
  "channel_chat_created",
  "pinned_message",
  "migrate_to_chat_id",
  "migrate_from_chat_id",
  "message_auto_delete_timer_changed",
];

const messageSchema = z
  .object({
    message_id: telegramId,
    date: z.number(),
    chat: chatSchema,
    from: fromSchema.optional(),
    text: z.string().optional(),
    caption: z.string().optional(),
    photo: z.array(photoSizeSchema).optional(),
    document: documentSchema.optional(),
    media_group_id: z.string().optional(),
  })
  .passthrough();

// Bloco 8 — estrutura mínima de um callback_query (clique num botão inline).
// `.passthrough()` em todo nível: nunca rejeita o update inteiro por causa de
// campos desconhecidos que o Telegram venha a adicionar no futuro.
const callbackMessageSchema = z
  .object({
    message_id: telegramId,
    chat: chatSchema,
  })
  .passthrough();

const callbackQuerySchema = z
  .object({
    id: z.string(),
    from: fromSchema,
    data: z.string().optional(),
    message: callbackMessageSchema.optional(),
  })
  .passthrough();

const updateSchema = z
  .object({
    update_id: telegramId,
    message: messageSchema.optional(),
    channel_post: messageSchema.optional(),
    edited_message: messageSchema.optional(),
    callback_query: callbackQuerySchema.optional(),
  })
  .passthrough();

function isServiceMessage(rawMessage) {
  return SERVICE_MESSAGE_FIELDS.some((field) => rawMessage[field] !== undefined);
}

function buildAuthorName(from) {
  if (!from) return null;
  const parts = [from.first_name, from.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function normalizeMessage(rawMessage) {
  return {
    messageId: rawMessage.message_id,
    chatId: rawMessage.chat.id,
    dateUnix: rawMessage.date,
    from: rawMessage.from
      ? {
          id: rawMessage.from.id,
          firstName: rawMessage.from.first_name || null,
          lastName: rawMessage.from.last_name || null,
          username: rawMessage.from.username || null,
        }
      : null,
    authorName: buildAuthorName(rawMessage.from),
    text: rawMessage.text ?? null,
    caption: rawMessage.caption ?? null,
    mediaGroupId: rawMessage.media_group_id ?? null,
    photos: (rawMessage.photo || []).map((p) => ({
      fileId: p.file_id,
      fileUniqueId: p.file_unique_id,
      width: p.width ?? null,
      height: p.height ?? null,
      fileSize: p.file_size ?? null,
    })),
    document: rawMessage.document
      ? {
          fileId: rawMessage.document.file_id,
          fileUniqueId: rawMessage.document.file_unique_id,
          fileName: rawMessage.document.file_name || null,
          mimeType: rawMessage.document.mime_type || null,
          fileSize: rawMessage.document.file_size ?? null,
        }
      : null,
    isServiceMessage: isServiceMessage(rawMessage),
  };
}

/** Estrutura mínima e normalizada de um callback_query (Bloco 8) — nunca inclui o objeto bruto do Telegram. */
function normalizeCallbackQuery(rawCallbackQuery) {
  return {
    id: rawCallbackQuery.id,
    data: rawCallbackQuery.data ?? null,
    from: { id: rawCallbackQuery.from.id, username: rawCallbackQuery.from.username || null },
    message: rawCallbackQuery.message
      ? { messageId: rawCallbackQuery.message.message_id, chatId: rawCallbackQuery.message.chat.id }
      : null,
  };
}

/**
 * Normaliza um update já parseado (objeto JS) em `{ updateId, kind, message, callbackQuery }`.
 * `kind`: "message" | "callback_query" | "unknown" | "invalid".
 * Nunca lança — updates fora do subconjunto suportado viram "unknown"/"invalid".
 */
function normalizeUpdate(rawUpdate) {
  const parsed = updateSchema.safeParse(rawUpdate);
  if (!parsed.success) {
    const fallbackId = rawUpdate && rawUpdate.update_id != null ? String(rawUpdate.update_id) : null;
    return { updateId: fallbackId, kind: "invalid", message: null, callbackQuery: null };
  }

  const data = parsed.data;
  const updateId = data.update_id;

  if (data.callback_query) {
    return { updateId, kind: "callback_query", message: null, callbackQuery: normalizeCallbackQuery(data.callback_query) };
  }

  const rawMessage = data.message || data.channel_post || data.edited_message;
  if (!rawMessage) {
    return { updateId, kind: "unknown", message: null, callbackQuery: null };
  }

  return { updateId, kind: "message", message: normalizeMessage(rawMessage), callbackQuery: null };
}

/** Tipo de conteúdo persistido — mesmo domínio de TELEGRAM_MESSAGE_TYPES (automationEnums.js). */
function resolveMessageType(message) {
  if (message.photos && message.photos.length) return "PHOTO";
  if (message.document) return "DOCUMENT";
  if (message.text) return "TEXT";
  return "OUTRO";
}

/** Nenhum conteúdo aproveitável para o D.O. (nem texto, nem legenda, nem mídia tratada). */
function hasRelevantContent(message) {
  return Boolean(message.text || message.caption || (message.photos && message.photos.length) || message.document);
}

/**
 * Seleciona a variante de maior resolução entre os tamanhos de foto enviados
 * pelo Telegram, de forma determinística (maior área; empate resolvido pelo
 * maior file_size; a ordem do array nunca é assumida como garantida).
 */
function selectBestPhoto(photos) {
  if (!photos || !photos.length) return null;
  return photos.reduce((best, current) => {
    if (!best) return current;
    const bestArea = (best.width || 0) * (best.height || 0);
    const currentArea = (current.width || 0) * (current.height || 0);
    if (currentArea !== bestArea) return currentArea > bestArea ? current : best;
    return (current.fileSize || 0) > (best.fileSize || 0) ? current : best;
  }, null);
}

module.exports = {
  parseTelegramJson,
  protectLargeIntegers,
  normalizeUpdate,
  resolveMessageType,
  hasRelevantContent,
  selectBestPhoto,
};
