import { useMemo } from "react";

/**
 * Dados de frota no shell empresa (placeholder até módulo dedicado).
 * Não partilha estado com transporte, combustível ou parte diária.
 */
export function useFleetData() {
  return useMemo(
    () => ({
      phase: "placeholder",
      items: [],
      loading: false,
      error: null,
    }),
    []
  );
}
