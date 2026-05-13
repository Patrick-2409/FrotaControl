/* eslint-disable react-refresh/only-export-components -- ficheiro agrupa Provider + hook de consumo do contexto */
import { createContext, useContext } from "react";
import { useEmpresaParteDiariaModule } from "../daily/hooks/useEmpresaParteDiariaModule";

const DailyOperationsContext = createContext(null);

/** Contexto isolado da parte diária (período, equipamento, status local). */
export function DailyOperationsProvider({ children }) {
  const value = useEmpresaParteDiariaModule({ enabled: true });
  return <DailyOperationsContext.Provider value={value}>{children}</DailyOperationsContext.Provider>;
}

export function useDailyOperationsContext() {
  const ctx = useContext(DailyOperationsContext);
  if (!ctx) {
    throw new Error("useDailyOperationsContext deve ser usado dentro de DailyOperationsProvider.");
  }
  return ctx;
}
