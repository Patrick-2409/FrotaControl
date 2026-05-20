import { isRankingTransporte } from "./peopleRanking";

const PREFIX_BAIXA = "pessoas.motorista_baixa_atividade:";

function alertMotoristaId(item) {
  const fromPayload = Number(item?.payload?.usuario_id);
  if (Number.isFinite(fromPayload) && fromPayload > 0) return fromPayload;
  const tail = String(item?.alert_key || "").split(":").pop();
  const fromKey = Number(tail);
  return Number.isFinite(fromKey) && fromKey > 0 ? fromKey : null;
}

function transportProdById(prodItems = []) {
  const map = new Map();
  for (const row of prodItems) {
    if (isRankingTransporte(row)) map.set(Number(row.id), row);
  }
  return map;
}

/** Motoristas de transporte sem romaneio no período (7 dias). */
export function zeroAtividadeTransporteIds(prodItems = []) {
  const ids = new Set();
  for (const row of prodItems) {
    if (!isRankingTransporte(row)) continue;
    if (Number(row?.romaneios) === 0) ids.add(Number(row.id));
  }
  return ids;
}

/**
 * Métricas de exibição do risco operacional (somente frontend).
 * Avalia apenas motoristas com veículo de transporte de material.
 */
export function computeRiscoDisplayMetrics(summary, prodItems = [], feedItems = []) {
  const transportMap = transportProdById(prodItems);
  const zeroIds = zeroAtividadeTransporteIds(prodItems);

  const baixaAlertIds = new Set();
  for (const item of feedItems) {
    const key = String(item?.alert_key || "");
    if (!key.startsWith(PREFIX_BAIXA)) continue;
    const id = alertMotoristaId(item);
    if (id && transportMap.has(id)) baixaAlertIds.add(id);
  }

  let baixaAtividade = [...baixaAlertIds].filter((id) => !zeroIds.has(id)).length;

  if (baixaAlertIds.size === 0) {
    const rawBaixa = Number(summary?.motoristas_baixa_atividade ?? 0);
    baixaAtividade = zeroIds.size > 0 ? 0 : Math.min(rawBaixa, transportMap.size);
  }

  const semIds = new Set(zeroIds);
  const baixaIds = new Set([...baixaAlertIds].filter((id) => !zeroIds.has(id)));
  const riscoMotoristaIds = new Set([...semIds, ...baixaIds]);

  const semRomaneio = zeroIds.size;
  const totalTransporte = transportMap.size;

  return {
    semRomaneio,
    baixaAtividade,
    totalTransporte,
    semIds,
    baixaIds,
    riscoMotoristaIds,
    temRisco: semRomaneio > 0 || baixaAtividade > 0,
  };
}

export function isForaControleProducao(row) {
  if (!row) return true;
  if (row.role === "APONTADOR") return true;
  return !isRankingTransporte(row);
}

export function foraControleProducaoLabel() {
  return "Não aplicável para romaneio";
}

/** Listas para cadastro quando filtro de risco está ativo. */
export function splitRiscoCadastroLists(prodItems = [], riscoMotoristaIds = new Set()) {
  const transporteRisco = [];
  const foraControle = [];
  for (const row of prodItems) {
    if (riscoMotoristaIds.has(Number(row.id)) && isRankingTransporte(row)) {
      transporteRisco.push(row);
    } else if (isForaControleProducao(row)) {
      foraControle.push(row);
    }
  }
  return { transporteRisco, foraControle };
}
