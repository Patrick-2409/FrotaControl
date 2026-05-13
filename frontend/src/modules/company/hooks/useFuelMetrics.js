import { useFuelContext } from "../contexts/FuelContext";

/** Métricas e filtros do módulo Combustível (isolado de transporte e parte diária). */
export function useFuelMetrics() {
  return useFuelContext();
}
