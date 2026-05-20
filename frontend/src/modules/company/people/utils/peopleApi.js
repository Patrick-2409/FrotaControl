import api, { extractApiErrorMessage, getFriendlyApiErrorMessage } from "../../../../services/api";

export const PEOPLE_FETCH_TIMEOUT_MS = 10_000;
export const PEOPLE_LOAD_ERROR = "Erro ao carregar dados de pessoas";

/**
 * GET com timeout dedicado à tela Pessoas e medição de tempo em desenvolvimento.
 */
export async function peopleGet(url, { params, label = "people-request" } = {}) {
  if (import.meta.env.DEV) console.time(label);
  try {
    return await api.get(url, {
      params,
      timeout: PEOPLE_FETCH_TIMEOUT_MS,
    });
  } finally {
    if (import.meta.env.DEV) console.timeEnd(label);
  }
}

export function peopleErrorMessage(err, fallback = PEOPLE_LOAD_ERROR) {
  const friendly = getFriendlyApiErrorMessage(err);
  if (
    err?.code === "ECONNABORTED" ||
    String(err?.message || "").toLowerCase().includes("timeout")
  ) {
    return fallback;
  }
  if (!err?.response) return fallback;
  return friendly || extractApiErrorMessage(err) || fallback;
}
