"use strict";

/**
 * Preparação determinística das evidências enviadas à IA (Bloco 6, Seção 21)
 * — opera diretamente sobre o `snapshot` já construído e versionado pelo
 * Bloco 5 (`automacao_execucao_snapshots.snapshot`), que já É o pacote
 * determinístico de evidências do dia. Este módulo só reformata/filtra o que
 * a IA precisa ver, e resolve com segurança quais arquivos do Drive podem
 * ser baixados para análise visual.
 *
 * Nunca envia: tokens, secrets, IDs internos do banco, ou qualquer campo
 * técnico que não sirva para rastreabilidade (sourceRef).
 */

/** Evidência textual — mesma forma do snapshot, sem o sub-objeto `photo` (a foto em si é tratada pela Fase A). */
function buildTextEvidence(snapshot) {
  return snapshot.messages.map((m) => ({
    telegramMessageId: m.telegramMessageId,
    timestamp: m.timestamp,
    author: m.author,
    type: m.type,
    text: m.text,
    caption: m.caption,
    effectiveText: m.effectiveText,
    mediaGroupId: m.mediaGroupId,
  }));
}

/**
 * Conjunto de sourceRefs válidos DESTE snapshot — todo telegramMessageId, e
 * o driveFileId de cada foto já armazenada (Seção 16). Fotos não armazenadas
 * (pendentes/falhas) nunca entram aqui — não têm um arquivo real no Drive
 * para servir de referência.
 */
function buildValidSourceRefs(snapshot) {
  const refs = new Set();
  for (const message of snapshot.messages) {
    refs.add(message.telegramMessageId);
    if (message.type === "PHOTO" && message.photo?.stored && message.photo.driveFileId) {
      refs.add(message.photo.driveFileId);
    }
  }
  return refs;
}

/** Fotos elegíveis para análise visual (armazenadas com sucesso) — fotos pendentes/falhas nunca são baixadas. */
function listStoredPhotosFromSnapshot(snapshot) {
  return snapshot.messages
    .filter((message) => message.type === "PHOTO" && message.photo?.stored && message.photo.driveFileId)
    .map((message) => ({
      sourceRef: message.photo.driveFileId,
      telegramMessageId: message.telegramMessageId,
      caption: message.caption,
    }));
}

/**
 * Resolve driveFileIds EXCLUSIVAMENTE via `automacao_arquivos` vinculado à
 * execução/empresa corretas (Seção 23) — nunca aceita nem baixa um fileId
 * que não tenha vindo desta consulta escopada. Qualquer id fora deste
 * resultado é tratado como inexistente para fins de download.
 */
async function resolveArquivosForExecution(pool, { empresaId, automacaoExecucaoId, driveFileIds }) {
  if (!driveFileIds.length) return [];
  const { rows } = await pool.query(
    `SELECT id, drive_file_id, drive_folder_id, nome_arquivo, mime_type
     FROM automacao_arquivos
     WHERE empresa_id = $1 AND automacao_execucao_id = $2 AND tipo = 'PHOTO' AND drive_file_id = ANY($3::text[])`,
    [empresaId, automacaoExecucaoId, driveFileIds]
  );
  return rows;
}

/** Mapa telegramMessageId -> texto bruto (text+caption) — usado pelo validador para checar números citados (Seção 30). */
function buildTextByRefMap(snapshot) {
  const map = new Map();
  for (const message of snapshot.messages) {
    const combined = [message.text, message.caption].filter(Boolean).join(" ");
    map.set(message.telegramMessageId, combined);
  }
  return map;
}

module.exports = {
  buildTextEvidence,
  buildValidSourceRefs,
  buildTextByRefMap,
  listStoredPhotosFromSnapshot,
  resolveArquivosForExecution,
};
