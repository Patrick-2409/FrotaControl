/* eslint-disable react-refresh/only-export-components -- ficheiro agrupa Provider + hook de consumo do contexto */
import { createContext, useContext } from "react";
import { useEmpresaFuelDashboard } from "../fuel/hooks/useEmpresaFuelDashboard";

const FuelContext = createContext(null);

export function FuelProvider({ children }) {
  const value = useEmpresaFuelDashboard({ moduleId: "fuel" });
  return <FuelContext.Provider value={value}>{children}</FuelContext.Provider>;
}

export function useFuelContext() {
  const ctx = useContext(FuelContext);
  if (!ctx) {
    throw new Error("useFuelContext deve ser usado dentro de FuelProvider.");
  }
  return ctx;
}
