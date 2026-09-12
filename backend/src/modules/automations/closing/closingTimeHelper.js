"use strict";

/**
 * Cálculo determinístico do instante de fechamento de uma execução diária
 * (Bloco 5) — nunca hardcoda UTC-3, nunca usa o timezone do processo/container
 * (`Date.getHours()` etc. dependem do timezone do SO, que num container pode
 * ser UTC mesmo servindo clientes no Brasil).
 *
 * O problema é o inverso do resolvido em telegramWebhookService.js
 * (`computeDataReferencia`, que vai de instante -> data civil num timezone).
 * Aqui vamos de "data civil + hora civil + timezone IANA" -> instante UTC, o
 * que `Intl.DateTimeFormat` não faz diretamente (só formata instante ->
 * civil). A técnica padrão (usada por libs como date-fns-tz/luxon
 * internamente) é: chutar o instante tratando os números civis como se
 * fossem UTC, medir o offset real do timezone alvo NAQUELE instante
 * aproximado, e corrigir. Duas iterações bastam mesmo perto de uma troca de
 * horário de verão (o offset só pode mudar uma vez entre a 1ª estimativa e a
 * correção).
 */

/** Offset (ms) tal que `instanteReal + offset = leitura do relógio local em timeZone, mal-interpretada como UTC`. */
function getTimeZoneOffsetMs(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(instant).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const wallClockAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "00" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return wallClockAsUtcMs - instant.getTime();
}

/**
 * Converte uma data civil (`YYYY-MM-DD`) + hora civil (`HH:MM` ou `HH:MM:SS`)
 * num timezone IANA para o instante UTC correspondente.
 */
function zonedWallClockToInstant({ dataReferencia, horaLocal, timeZone }) {
  const dataMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataReferencia ?? ""));
  if (!dataMatch) {
    throw new Error(`dataReferencia inválida (esperado YYYY-MM-DD): ${dataReferencia}`);
  }
  const horaMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(horaLocal ?? ""));
  if (!horaMatch) {
    throw new Error(`horaLocal inválida (esperado HH:MM ou HH:MM:SS): ${horaLocal}`);
  }
  if (!timeZone || !Intl.supportedValuesOf("timeZone").includes(timeZone)) {
    throw new Error(`timeZone inválido ou não suportado: ${timeZone}`);
  }

  const [, ano, mes, dia] = dataMatch;
  const [, hora, minuto, segundo = "00"] = horaMatch;
  const guessUtcMs = Date.UTC(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(minuto), Number(segundo));

  let instant = new Date(guessUtcMs);
  for (let i = 0; i < 2; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(instant, timeZone);
    instant = new Date(guessUtcMs - offsetMs);
  }
  return instant;
}

/** Instante em que uma config deveria considerar `dataReferencia` fechada. */
function computeClosingInstant(config, dataReferencia) {
  if (!config?.horario_fechamento) return null;
  return zonedWallClockToInstant({
    dataReferencia,
    horaLocal: config.horario_fechamento,
    timeZone: config.timezone,
  });
}

/**
 * Verdadeiro somente quando: config ativa e não deletada, execução em
 * COLLECTING, e o horário local de fechamento já foi alcançado em `now`.
 * `now` é sempre recebido explicitamente — nunca `Date.now()` escondido.
 */
function isExecutionDueForClosing(config, execution, now) {
  if (!config || config.ativo === false || config.deleted_at) return false;
  if (!execution || execution.status !== "COLLECTING") return false;
  const closingInstant = computeClosingInstant(config, execution.dataReferencia);
  if (!closingInstant) return false;
  return now.getTime() >= closingInstant.getTime();
}

module.exports = {
  getTimeZoneOffsetMs,
  zonedWallClockToInstant,
  computeClosingInstant,
  isExecutionDueForClosing,
};
