"use strict";

/**
 * Textos padrão e Message-ID da distribuição por e-mail (Bloco 9, Seções
 * 11/25/32) — default neutro e profissional, nunca nome pessoal ou nome de
 * cliente específico hardcoded (Seção 32): todo dado vem da própria
 * configuração (`projeto_nome`, `configuracao.documento`).
 */

const { getEmailMessageIdDomain } = require("./distributionConfig");
const { zonedWallClockToInstant } = require("../closing/closingTimeHelper");

const DEFAULT_SUBJECT_TEMPLATE = "Diário de Obra — {projeto} — {data}";

const DEFAULT_BODY_TEMPLATE = [
  "Prezados, boa tarde!",
  "",
  "Segue, anexo a este, o Diário de Obra referente ao projeto {projeto}, data {data}.",
  "",
  "Atenciosamente,",
  "{identificacao}",
].join("\n");

const WEEKDAY_LABELS_PT_BR = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/**
 * Nome do dia da semana (pt-BR) de uma `dataReferencia` (YYYY-MM-DD) — Seção
 * "placeholders do e-mail": NUNCA usa `new Date()`/relógio do servidor, só a
 * própria dataReferencia da execução. `timezone` é validado (mesma
 * validação de `closingTimeHelper.js`, reaproveitada aqui via
 * `zonedWallClockToInstant`) mas não muda o resultado: o dia da semana de
 * uma data civil já resolvida é uma propriedade do calendário, a mesma em
 * qualquer fuso horário — o cálculo em si nunca depende de dados de
 * locale/ICU do runtime (um build Node com small-icu formataria em inglês
 * silenciosamente), só aritmética de data determinística.
 */
function resolveWeekdayLabel(dataReferencia, timezone) {
  zonedWallClockToInstant({ dataReferencia, horaLocal: "12:00", timeZone: timezone });
  const [ano, mes, dia] = dataReferencia.split("-").map(Number);
  return WEEKDAY_LABELS_PT_BR[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
}

/**
 * Monta os valores dos placeholders permitidos a partir de dados já
 * resolvidos (nunca busca nada sozinho) — `identificacao` nunca é um nome
 * pessoal hardcoded: usa o responsável técnico já configurado (Bloco 7B) ou
 * um rótulo genérico derivado do próprio projeto. `dataReferenciaRaw`
 * (YYYY-MM-DD) + `timezone` são opcionais e usados SOMENTE para
 * `dia_semana`/`data_com_dia_semana` — uma falha ao resolvê-los (formato
 * inválido, timezone desconhecido) nunca impede o envio do e-mail em si
 * (mesma filosofia de `renderTemplate`: nunca lançar em tempo de envio),
 * só deixa esses dois placeholders vazios.
 */
function buildPlaceholderValues({ projetoNome, dataReferencia, dataReferenciaRaw, timezone, versao, clienteRazaoSocial, referenciaContratual, responsavelTecnico }) {
  let diaSemana = "";
  if (dataReferenciaRaw && timezone) {
    try {
      diaSemana = resolveWeekdayLabel(dataReferenciaRaw, timezone);
    } catch {
      diaSemana = "";
    }
  }
  return {
    projeto: projetoNome || "",
    data: dataReferencia,
    versao: String(versao),
    cliente: clienteRazaoSocial || "",
    referenciaContratual: referenciaContratual || "",
    identificacao: responsavelTecnico || (projetoNome ? `Equipe ${projetoNome}` : "Equipe"),
    dia_semana: diaSemana,
    data_com_dia_semana: diaSemana ? `${dataReferencia} (${diaSemana})` : dataReferencia,
  };
}

/** Nunca uma garantia de deduplicação do provedor (Seção 25/26) — só ajuda auditoria/rastreio. */
function buildDistributionMessageId(distributionId, env = process.env) {
  const domain = getEmailMessageIdDomain(env);
  return `<automacao-distribuicao-${distributionId}@${domain}>`;
}

module.exports = { DEFAULT_SUBJECT_TEMPLATE, DEFAULT_BODY_TEMPLATE, buildPlaceholderValues, buildDistributionMessageId, resolveWeekdayLabel };
