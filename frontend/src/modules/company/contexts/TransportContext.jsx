/* eslint-disable react-refresh/only-export-components -- ficheiro agrupa Provider + hook de consumo do contexto */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useEmpresaTransporte } from "../transport/hooks/useEmpresaTransporte";
import { useEmpresaTransporteProdutividade } from "../transport/hooks/useEmpresaTransporteProdutividade";
import { readSessionJson, writeSessionJson } from "../shared/sessionFilters";

const TransportContext = createContext(null);

const MATERIAL_TABS = new Set(["todos", "esteril", "rocha_pulmao", "rocha_armacao"]);

/**
 * Contexto isolado do módulo Transporte (viagens, metas, produtividade).
 * Filtros de período e material não partilham estado com combustível ou parte diária.
 */
export function TransportProvider({ children }) {
  const operations = useEmpresaTransporte({ enabled: true });
  const metrics = useEmpresaTransporteProdutividade({ enabled: true });
  const savedTab = useMemo(() => readSessionJson("filters:transport:v1", null), []);
  const [materialTab, setMaterialTab] = useState(() =>
    MATERIAL_TABS.has(savedTab?.materialTab) ? savedTab.materialTab : "todos"
  );

  useEffect(() => {
    writeSessionJson("filters:transport:v1", { materialTab });
  }, [materialTab]);

  const value = useMemo(
    () => ({
      operations,
      metrics,
      /** Foco visual na produção: todos | esteril | rocha_pulmao | rocha_armacao. */
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
