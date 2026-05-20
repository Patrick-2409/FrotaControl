import api, { extractApiErrorMessage, getFriendlyApiErrorMessage } from "../../../../services/api";

export const FLEET_FETCH_TIMEOUT_MS = 15_000;
export const FLEET_LOAD_ERROR = "Erro ao carregar dados da frota";

/**
 * GET com timeout dedicado à frota e medição de tempo em desenvolvimento.
 */
export async function fleetGet(url, { params, label = "fleet-request" } = {}) {
  if (import.meta.env.DEV) console.time(label);
  try {
    return await api.get(url, {
      params,
      timeout: FLEET_FETCH_TIMEOUT_MS,
      skipErrorLog: url.includes("/summary"),
      skipGlobalErrorToast: url.includes("/summary"),
    });
  } finally {
    if (import.meta.env.DEV) console.timeEnd(label);
  }
}

export function fleetErrorMessage(err, fallback = FLEET_LOAD_ERROR) {
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
