"use strict";

/**
 * Abstração de e-mail do módulo de Automações (Bloco 9, Seção 14) — NENHUM
 * service de domínio conhece Nodemailer/SMTP diretamente; todos dependem só
 * desta interface (`sendMail`), injetada como `emailClient`. Mesma
 * disciplina dos demais clients do módulo (Telegram, Drive): 100% testável
 * com um fake, nenhuma chamada de rede real em teste algum.
 *
 * A implementação real (`createDefaultAutomationEmailClient`, em
 * `storage/productionClients.js`) usa SMTP + Nodemailer (Seção 15) por ser
 * a opção mais simples e já disponível sem infraestrutura adicional — mas
 * nada além deste arquivo sabe disso; trocar de provedor no futuro (SES,
 * SendGrid, Postmark...) significa só reimplementar esta fábrica, nunca
 * tocar `documentDistributionService.js`.
 */

function createAutomationEmailClient({ transporter, providerName = "smtp" } = {}) {
  if (!transporter || typeof transporter.sendMail !== "function") {
    throw new Error("createAutomationEmailClient requer um transporter com sendMail().");
  }

  /**
   * `to`/`cc`: array de e-mails (nunca string única — evita ambiguidade de
   * separador). `attachments`: [{ filename, content: Buffer, contentType }].
   * Nunca grava nada em disco (Seção 19) — `content` é sempre um Buffer em
   * memória. Retorna `{ provider, providerMessageId, accepted, rejected }`.
   */
  async function sendMail({ from, fromName, to, cc, subject, text, html, attachments, messageId }) {
    const info = await transporter.sendMail({
      from: fromName ? { name: fromName, address: from } : from,
      to,
      cc: cc && cc.length ? cc : undefined,
      subject,
      text,
      html,
      attachments,
      messageId,
    });
    return {
      provider: providerName,
      providerMessageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
    };
  }

  return { sendMail };
}

module.exports = { createAutomationEmailClient };
