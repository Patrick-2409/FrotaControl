import { useTransportContext } from "../contexts/TransportContext";

/** Métricas de produtividade + operações de porto/viagens, isoladas de outros módulos. */
export function useTransportMetrics() {
  return useTransportContext();
}
