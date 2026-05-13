import { useDailyOperationsContext } from "../contexts/DailyOperationsContext";

/** Parte diária: filtros, agregados e listagem isolados de transporte e combustível. */
export function useDailyOperations() {
  return useDailyOperationsContext();
}
