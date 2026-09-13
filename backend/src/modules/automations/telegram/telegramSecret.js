/**
 * Validação do header `X-Telegram-Bot-Api-Secret-Token` (Bloco 3).
 *
 * O projeto não tem hoje nenhum helper de comparação segura reutilizável
 * (verificado: nenhum uso de `crypto.timingSafeEqual` em src/) — este módulo
 * cria um, escopado ao domínio de automações.
 *
 * `crypto.timingSafeEqual` lança se os dois buffers tiverem comprimentos
 * diferentes, o que por si só vazaria informação de tamanho e quebraria a
 * comparação para um valor forjado de tamanho errado. Para evitar isso (e
 * simplificar a comparação, já que o secret pode ter qualquer tamanho),
 * comparamos o HASH SHA-256 de ambos os valores — sempre 32 bytes, tempo
 * constante, e nunca lança por causa de tamanho.
 */

const crypto = require("crypto");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest();
}

/**
 * `expected` deve vir SEMPRE de variável de ambiente (nunca hardcoded, nunca
 * do banco, nunca da UI). Se `expected` estiver vazio, o webhook nunca é
 * considerado válido — não há um "modo aberto" acidental.
 */
function isValidWebhookSecret(providedHeaderValue, expected) {
  const expectedValue = String(expected ?? "").trim();
  if (!expectedValue) return false;
  const providedValue = String(providedHeaderValue ?? "");
  return crypto.timingSafeEqual(sha256(expectedValue), sha256(providedValue));
}

module.exports = { isValidWebhookSecret };
