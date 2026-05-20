const PREFIX_SEM = "pessoas.motorista_sem_romaneio:";
const PREFIX_BAIXA = "pessoas.motorista_baixa_atividade:";

function alertMotoristaId(item) {
  const fromPayload = Number(item?.payload?.usuario_id);
  if (Number.isFinite(fromPayload) && fromPayload > 0) return fromPayload;
  const tail = String(item?.alert_key || "").split(":").pop();
  const fromKey = Number(tail);
  return Number.isFinite(fromKey) && fromKey > 0 ? fromKey : null;
}

/** Motoristas sem nenhum romaneio no período (7 dias) — zero atividade. */
export function zeroAtividadeMotoristaIds(prodItems = []) {
  const ids = new Set();
  for (const row of prodItems) {
    if (row?.role !== "MOTORISTA") continue;
    if (Number(row?.romaneios) === 0) ids.add(Number(row.id));
  }
  return ids;
}

/**
 * Métricas de exibição do risco operacional (somente frontend).
 * - Sem romaneio: contagem do resumo (regra backend 7 dias).
 * - Baixa produtividade: alertas de baixa excluindo quem está sem registros.
 */
export function computeRiscoDisplayMetrics(summary, prodItems = [], feedItems = []) {
  const semRomaneio = Number(summary?.motoristas_sem_romaneio_7d ?? 0);
  const zeroIds = zeroAtividadeMotoristaIds(prodItems);

  const baixaAlertIds = new Set();
  for (const item of feedItems) {
    const key = String(item?.alert_key || "");
    if (!key.startsWith(PREFIX_BAIXA)) continue;
    const id = alertMotoristaId(item);
    if (id) baixaAlertIds.add(id);
  }

  let baixaProdutividade = [...baixaAlertIds].filter((id) => !zeroIds.has(id)).length;

  if (baixaAlertIds.size === 0) {
    const rawBaixa = Number(summary?.motoristas_baixa_atividade ?? 0);
    baixaProdutividade = semRomaneio > 0 ? 0 : rawBaixa;
  }

  const semIds = new Set(zeroIds);
  const baixaIds = new Set([...baixaAlertIds].filter((id) => !zeroIds.has(id)));
  const riscoMotoristaIds = new Set([...semIds, ...baixaIds]);

  return {
    semRomaneio,
    baixaProdutividade,
    semIds,
    baixaIds,
    riscoMotoristaIds,
    temRisco: semRomaneio > 0 || baixaProdutividade > 0,
  };
}

export function extractRiscoMotoristaIdsFromFeed(feedItems = [], prodItems = []) {
  return computeRiscoDisplayMetrics({}, prodItems, feedItems).riscoMotoristaIds;
}
