import { useEffect, useMemo, useState } from "react";
import api from "../../../../services/api";
import { emitToast } from "../../../../services/uiEvents";

/**
 * Indicadores de produtividade e série temporal para o módulo Transporte (GET /dashboard/stats isolado).
 */
export function useEmpresaTransporteProdutividade() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/dashboard/stats")
      .then(({ data }) => setStats(data))
      .catch(() => emitToast("Não foi possível carregar indicadores de produtividade.", "warning"))
      .finally(() => setLoading(false));
  }, []);

  const trend = useMemo(() => stats?.ultimos_7_dias || [], [stats]);

  const trendSummary = useMemo(() => {
    if (!trend.length) {
      return { delta: 0, direction: "neutral", peak: 0, avg: 0 };
    }
    const sorted = [...trend].sort((a, b) => new Date(a.dia) - new Date(b.dia));
    const last = sorted[sorted.length - 1]?.total || 0;
    const prev = sorted[sorted.length - 2]?.total || 0;
    const delta = last - prev;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
    const peak = sorted.reduce((m, item) => Math.max(m, item.total || 0), 0);
    const avg = Math.round(
      sorted.reduce((acc, item) => acc + (item.total || 0), 0) / Math.max(1, sorted.length)
    );
    return { delta, direction, peak, avg };
  }, [trend]);

  const trendIcon = trendSummary.direction === "up" ? "↑" : trendSummary.direction === "down" ? "↓" : "→";
  const trendClass =
    trendSummary.direction === "up"
      ? "fc-kpi-trend-up"
      : trendSummary.direction === "down"
      ? "fc-kpi-trend-down"
      : "fc-kpi-trend-neutral";

  return {
    stats,
    loading,
    trend,
    trendSummary,
    trendIcon,
    trendClass,
  };
}
