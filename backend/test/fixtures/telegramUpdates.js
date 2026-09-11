"use strict";

/**
 * Builders de updates Telegram para testes do Bloco 3 — evita espalhar JSON
 * gigante copiado em dezenas de arquivos. Cada builder aceita overrides
 * parciais (chat_id, message_id, date, from, etc.).
 */

let sequence = 1000;
function nextId() {
  sequence += 1;
  return sequence;
}

function baseChat(overrides = {}) {
  return { id: -1001234567890, type: "supergroup", title: "Obra Teste", ...overrides };
}

function baseFrom(overrides = {}) {
  return { id: 555000111, is_bot: false, first_name: "João", last_name: "Fiscal", username: "joaofiscal", ...overrides };
}

function textUpdate({ updateId, messageId, chatId, date, from, text, chat, ...rest } = {}) {
  return {
    update_id: updateId ?? nextId(),
    message: {
      message_id: messageId ?? nextId(),
      date: date ?? Math.floor(Date.now() / 1000),
      chat: chat || baseChat(chatId != null ? { id: chatId } : {}),
      from: from === null ? undefined : baseFrom(from || {}),
      text: text ?? "Serviço concluído na frente 3, sem intercorrências.",
      ...rest,
    },
  };
}

function photoSize({ fileId, fileUniqueId, width, height, fileSize }) {
  return { file_id: fileId, file_unique_id: fileUniqueId, width, height, file_size: fileSize };
}

function photoUpdate({ updateId, messageId, chatId, date, from, caption, mediaGroupId, sizes, chat, ...rest } = {}) {
  const id = messageId ?? nextId();
  return {
    update_id: updateId ?? nextId(),
    message: {
      message_id: id,
      date: date ?? Math.floor(Date.now() / 1000),
      chat: chat || baseChat(chatId != null ? { id: chatId } : {}),
      from: from === null ? undefined : baseFrom(from || {}),
      caption,
      media_group_id: mediaGroupId,
      photo: sizes || [
        photoSize({ fileId: `small-${id}`, fileUniqueId: `uniq-small-${id}`, width: 90, height: 60, fileSize: 1200 }),
        photoSize({ fileId: `medium-${id}`, fileUniqueId: `uniq-medium-${id}`, width: 320, height: 213, fileSize: 15000 }),
        photoSize({ fileId: `large-${id}`, fileUniqueId: `uniq-large-${id}`, width: 1280, height: 853, fileSize: 180000 }),
      ],
      ...rest,
    },
  };
}

/** Álbum: N updates independentes compartilhando o mesmo media_group_id. */
function albumUpdates({ count = 2, chatId, date, mediaGroupId, ...rest } = {}) {
  const groupId = mediaGroupId || `album-${nextId()}`;
  const baseDate = date ?? Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, (_, i) => photoUpdate({ chatId, date: baseDate, mediaGroupId: groupId, ...rest }));
}

function serviceMessageUpdate(type = "new_chat_members", { chatId, chat } = {}) {
  const fieldsByType = {
    new_chat_members: { new_chat_members: [baseFrom({ id: 777, first_name: "Novo Membro" })] },
    left_chat_member: { left_chat_member: baseFrom({ id: 778, first_name: "Quem Saiu" }) },
    new_chat_title: { new_chat_title: "Novo título do grupo" },
    pinned_message: { pinned_message: { message_id: nextId(), text: "fixado" } },
  };
  return {
    update_id: nextId(),
    message: {
      message_id: nextId(),
      date: Math.floor(Date.now() / 1000),
      chat: chat || baseChat(chatId != null ? { id: chatId } : {}),
      from: baseFrom(),
      ...fieldsByType[type],
    },
  };
}

function callbackQueryUpdate({ chatId } = {}) {
  return {
    update_id: nextId(),
    callback_query: {
      id: `cb-${nextId()}`,
      from: baseFrom(),
      data: "APROVAR",
      message: { message_id: nextId(), chat: baseChat(chatId != null ? { id: chatId } : {}) },
    },
  };
}

function documentUpdate({ chatId, date } = {}) {
  const id = nextId();
  return {
    update_id: nextId(),
    message: {
      message_id: id,
      date: date ?? Math.floor(Date.now() / 1000),
      chat: baseChat(chatId != null ? { id: chatId } : {}),
      from: baseFrom(),
      document: {
        file_id: `doc-${id}`,
        file_unique_id: `doc-uniq-${id}`,
        file_name: "relatorio.pdf",
        mime_type: "application/pdf",
        file_size: 20480,
      },
    },
  };
}

module.exports = {
  baseChat,
  baseFrom,
  textUpdate,
  photoUpdate,
  albumUpdates,
  serviceMessageUpdate,
  callbackQueryUpdate,
  documentUpdate,
};
