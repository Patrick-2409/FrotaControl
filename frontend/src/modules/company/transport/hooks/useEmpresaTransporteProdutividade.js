import { useCallback, useEffect, useMemo, useState } from "react";
import api, { extractApiErrorMessage } from "../../../../services/api";

function getTransportTotal(row) {
  const viagens = Number(row?.viagens);
  if (Number.isFinite(viagens) && viagens > 0) return viagens;
  const romaneios = Number(row?.romaneios);
  if (!Number.isFinite(romaneios)) return 0;
  return romaneios;
}

/**
 * Indicadores de produtividade e série temporal para o módulo Transporte (GET /dashboard/stats isolado).
 * @param {{ enabled?: boolean }} [options]
 */
export function useEmpresaTransporteProdutividade(options = {}) {
  const { enabled = true } = options;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);

  const loadStats = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setStatsError(null);
    try {
      const { data } = await api.get("/dashboard/stats");
      setStats(data);
    } catch (err) {
      setStats(null);
      setStatsError(extractApiErrorMessage(err) || "Falha ao carregar indicadores de produtividade.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const trend = useMemo(() => stats?.ultimos_7_dias || [], [stats]);

  const trendSummary = useMemo(() => {
    if (!trend.length) {
      return { delta: 0, direction: "neutral", peak: 0, avg: 0 };
    }
    const sorted = [...trend].sort((a, b) => new Date(a.dia) - new Date(b.dia));
    const last = getTransportTotal(sorted[sorted.length - 1]);
    const prev = getTransportTotal(sorted[sorted.length - 2]);
    const delta = last - prev;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
    const peak = sorted.reduce((m, item) => Math.max(m, getTransportTotal(item)), 0);
    const avg = Math.round(
      sorted.reduce((acc, item) => acc + getTransportTotal(item), 0) / Math.max(1, sorted.length)
    );
    return { delta, direction, peak, avg };
  }, [trend]);

  const trendClass =
    trendSummary.direction === "up"
      ? "fc-kpi-trend-up"
      : trendSummary.direction === "down"
        ? "fc-kpi-trend-down"
        : "fc-kpi-trend-neutral";

  const trendLabel =
    trendSummary.direction === "up"
      ? "Tendência positiva"
      : trendSummary.direction === "down"
        ? "Tendência negativa"
        : "Tendência estável";

  return useMemo(
    () => ({
      stats,
      loading,
      statsError,
      refetchStats: loadStats,
      trend,
      trendSummary,
      trendLabel,
      trendClass,
    }),
    [stats, loading, statsError, loadStats, trend, trendSummary, trendLabel, trendClass]
  );
}
