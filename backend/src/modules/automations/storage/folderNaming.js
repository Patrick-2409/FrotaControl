"use strict";

/**
 * Nomes determinísticos de pastas/arquivos do Drive — nunca usa
 * `toLocaleString`/`Intl` (dependeria de locale/ICU do runtime) nem `Date.now()`
 * (a data usada é sempre `data_referencia`, já calculada no Bloco 3 a partir de
 * `message.date` + timezone da config, nunca a hora do servidor).
 *
 * IMPORTANTE sobre `data_referencia` vinda do Postgres: a coluna é `DATE`, e o
 * driver `pg` por padrão desserializa `DATE` como `new Date(ano, mês, dia)` em
 * horário LOCAL do processo Node, não UTC. Isso é uma armadilha: extrair
 * ano/mês/dia de volta desse objeto com getters UTC (`getUTCDate()` etc.) só
 * dá o resultado certo se o timezone do processo tiver offset <= 0 (nunca dá
 * errado no Brasil, mas quebraria silenciosamente num servidor com TZ positivo,
 * ex. Ásia). Para nunca depender disso, todo código deste módulo que lê
 * `data_referencia` do banco DEVE usar `to_char(data_referencia, 'YYYY-MM-DD')`
 * na própria query (ver folderProvisioningService.js/photoStorageService.js) —
 * este arquivo só aceita a string já formatada, nunca um objeto Date.
 */

const MESES_PT_BR = Object.freeze([
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]);

const DIARIOS_DE_OBRA_FOLDER_NAME = "Diários de Obra";
const PHOTOS_FOLDER_NAME = "Fotos";

function parseDataReferencia(dataReferencia) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataReferencia ?? ""));
  if (!match) {
    const err = new Error(
      `data_referencia inválida (esperado string YYYY-MM-DD, nunca Date): ${JSON.stringify(dataReferencia)}`
    );
    err.code = "DATA_REFERENCIA_INVALIDA";
    throw err;
  }
  const [, ano, mes, dia] = match;
  const mesIndex = Number(mes) - 1;
  if (mesIndex < 0 || mesIndex > 11) {
    const err = new Error(`mês inválido em data_referencia: ${dataReferencia}`);
    err.code = "DATA_REFERENCIA_INVALIDA";
    throw err;
  }
  return { ano, mes, dia, mesIndex };
}

function yearFolderName(dataReferencia) {
  return parseDataReferencia(dataReferencia).ano;
}

function monthFolderName(dataReferencia) {
  const { mes, mesIndex } = parseDataReferencia(dataReferencia);
  return `${mes} - ${MESES_PT_BR[mesIndex]}`;
}

function dayFolderName(dataReferencia) {
  const { ano, mes, dia } = parseDataReferencia(dataReferencia);
  return `${ano}-${mes}-${dia}`;
}

function photoFileName({ dataReferencia, telegramMessageId, extension }) {
  const { ano, mes, dia } = parseDataReferencia(dataReferencia);
  if (telegramMessageId === null || telegramMessageId === undefined || telegramMessageId === "") {
    const err = new Error("telegramMessageId é obrigatório para nomear o arquivo da foto");
    err.code = "DATA_REFERENCIA_INVALIDA";
    throw err;
  }
  const ext = String(extension || "jpg")
    .replace(/^\./, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${ano}-${mes}-${dia}_msg-${telegramMessageId}.${ext || "jpg"}`;
}

module.exports = {
  MESES_PT_BR,
  DIARIOS_DE_OBRA_FOLDER_NAME,
  PHOTOS_FOLDER_NAME,
  parseDataReferencia,
  yearFolderName,
  monthFolderName,
  dayFolderName,
  photoFileName,
};
