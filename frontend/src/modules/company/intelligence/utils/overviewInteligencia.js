export const getDadosGraficos = (overview) => {
  const graficos = overview?.dados_graficos || overview || {};
  return {
    consumo_por_veiculo: graficos.consumo_por_veiculo || overview?.consumo_por_veiculo || [],
    custo_por_periodo: graficos.custo_por_periodo || overview?.custo_por_periodo || [],
    consumo_vs_producao: graficos.consumo_vs_producao || overview?.consumo_vs_producao || [],
    parte_diaria: graficos.parte_diaria || overview?.parte_diaria || null,
  };
};

export const mapStatusTone = (status) => {
  const normalized = String(status || "OK").toUpperCase();
  if (normalized.includes("CRIT")) return "critical";
  if (normalized.includes("ALERT")) return "warning";
  return "ok";
};

export const mapStatusLabel = (overview) =>
  overview?.status_operacao?.label || overview?.status || "OK";

export const normalizeMensagens = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return String(item.mensagem || item.texto || item.descricao || "").trim();
      }
      return "";
    })
    .filter(Boolean);

export const getExecutiveToneStyles = (tone) => {
  const styles = {
    critical: {
      card: "border-red-500/70 bg-red-950/25",
      badge: "border-red-400 bg-red-600 text-white shadow-lg shadow-red-950/50",
      accent: "text-red-300",
      dot: "bg-red-500",
    },
    warning: {
      card: "border-amber-500/70 bg-amber-950/25",
      badge: "border-amber-400 bg-amber-500 text-amber-950 shadow-lg shadow-amber-950/40",
      accent: "text-amber-300",
      dot: "bg-amber-500",
    },
    ok: {
      card: "border-emerald-500/70 bg-emerald-950/25",
      badge: "border-emerald-400 bg-emerald-600 text-white shadow-lg shadow-emerald-950/40",
      accent: "text-emerald-300",
      dot: "bg-emerald-500",
    },
    default: {
      card: "border-zinc-700/80 bg-zinc-950/40",
      badge: "border-zinc-500 bg-zinc-700 text-zinc-100",
      accent: "text-zinc-300",
      dot: "bg-zinc-500",
    },
  };
  return styles[tone] || styles.default;
};
