/* eslint-disable react-refresh/only-export-components -- ficheiro agrupa Provider + hook de consumo do contexto */
import { createContext, useContext, useMemo, useState } from "react";
import { useEmpresaTransporte } from "../transport/hooks/useEmpresaTransporte";
import { useEmpresaTransporteProdutividade } from "../transport/hooks/useEmpresaTransporteProdutividade";

const TransportContext = createContext(null);

/**
 * Contexto isolado do módulo Transporte (viagens, metas, produtividade).
 * Filtros de período e material não partilham estado com combustível ou parte diária.
 */
export function TransportProvider({ children }) {
  const operations = useEmpresaTransporte({ enabled: true });
  const metrics = useEmpresaTransporteProdutividade({ enabled: true });
  const [materialTab, setMaterialTab] = useState("todos");

  const value = useMemo(
    () => ({
      operations,
      metrics,
      /** Foco visual na produção: todos | esteril | rocha (sem alterar contratos de API). */
      materialTab,
      setMaterialTab,
    }),
    [operations, metrics, materialTab]
  );

  return <TransportContext.Provider value={value}>{children}</TransportContext.Provider>;
}

export function useTransportContext() {
  const ctx = useContext(TransportContext);
  if (!ctx) {
    throw new Error("useTransportContext deve ser usado dentro de TransportProvider.");
  }
  return ctx;
}
