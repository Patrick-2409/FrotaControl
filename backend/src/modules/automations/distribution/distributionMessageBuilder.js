"use strict";

/**
 * Textos padrão e Message-ID da distribuição por e-mail (Bloco 9, Seções
 * 11/25/32) — default neutro e profissional, nunca nome pessoal ou nome de
 * cliente específico hardcoded (Seção 32): todo dado vem da própria
 * configuração (`projeto_nome`, `configuracao.documento`).
 */

const { getEmailMessageIdDomain } = require("./distributionConfig");

const DEFAULT_SUBJECT_TEMPLATE = "Diário de Obra — {projeto} — {data}";

const DEFAULT_BODY_TEMPLATE = [
  "Prezados, boa tarde!",
  "",
  "Segue, anexo a este, o Diário de Obra referente ao projeto {projeto}, data {data}.",
  "",
  "Atenciosamente,",
  "{identificacao}",
].join("\n");

/**
 * Monta os valores dos placeholders permitidos a partir de dados já
 * resolvidos (nunca busca nada sozinho) — `identificacao` nunca é um nome
 * pessoal hardcoded: usa o responsável técnico já configurado (Bloco 7B) ou
 * um rótulo genérico derivado do próprio projeto.
 */
function buildPlaceholderValues({ projetoNome, dataReferencia, versao, clienteRazaoSocial, referenciaContratual, responsavelTecnico }) {
  return {
    projeto: projetoNome || "",
    data: dataReferencia,
    versao: String(versao),
    cliente: clienteRazaoSocial || "",
    referenciaContratual: referenciaContratual || "",
    identificacao: responsavelTecnico || (projetoNome ? `Equipe ${projetoNome}` : "Equipe"),
  };
}

/** Nunca uma garantia de deduplicação do provedor (Seção 25/26) — só ajuda auditoria/rastreio. */
function buildDistributionMessageId(distributionId, env = process.env) {
  const domain = getEmailMessageIdDomain(env);
  return `<automacao-distribuicao-${distributionId}@${domain}>`;
}

module.exports = { DEFAULT_SUBJECT_TEMPLATE, DEFAULT_BODY_TEMPLATE, buildPlaceholderValues, buildDistributionMessageId };
