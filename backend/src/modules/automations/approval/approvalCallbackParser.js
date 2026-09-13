"use strict";

/**
 * Formato compacto e opaco do `callback_data` de aprovação (Bloco 8, Seções
 * 15/16/18) — `appr:<solicitacaoId>:<ação>`. Namespace `appr` dedicado
 * (Seção 18): um callback de qualquer outro recurso futuro (`appr` é só
 * deste módulo) nunca é interpretado por engano por este parser, e este
 * parser nunca reivindica um callback que não comece exatamente com
 * `appr:`.
 *
 * Nunca carrega dado sensível/grande: nenhum e-mail, token, hash ou JSON —
 * só um id interno (opaco para quem está fora do sistema) e uma letra de
 * ação. TUDO o mais (empresa, config, documento, estado, aprovador) é
 * resolvido consultando o banco a partir do id — nunca confiado no próprio
 * callback_data (Seção 16).
 */

const NAMESPACE = "appr";
const ACTION_CODES = Object.freeze({ a: "APPROVE", r: "REJECT", g: "REGENERATE" });

/** `{ valid: true, solicitacaoId, action }` ou `{ valid: false }` — nunca lança. */
function parseApprovalCallbackData(rawData) {
  if (typeof rawData !== "string") return { valid: false };
  const parts = rawData.split(":");
  if (parts.length !== 3) return { valid: false };
  const [namespace, idPart, actionCode] = parts;
  if (namespace !== NAMESPACE) return { valid: false };
  if (!/^\d+$/.test(idPart)) return { valid: false };
  const action = ACTION_CODES[actionCode];
  if (!action) return { valid: false };
  return { valid: true, solicitacaoId: Number(idPart), action };
}

function buildApprovalCallbackData(solicitacaoId, action) {
  const actionCode = Object.entries(ACTION_CODES).find(([, value]) => value === action)?.[0];
  if (!actionCode) {
    throw new Error(`Ação de aprovação desconhecida: ${action}`);
  }
  const data = `${NAMESPACE}:${solicitacaoId}:${actionCode}`;
  // Telegram limita callback_data a 64 bytes — checagem defensiva, nunca
  // deveria disparar com ids numéricos normais (Seção 15).
  if (Buffer.byteLength(data, "utf8") > 64) {
    throw new Error(`callback_data excede 64 bytes: ${data}`);
  }
  return data;
}

module.exports = { parseApprovalCallbackData, buildApprovalCallbackData, ACTION_CODES };
