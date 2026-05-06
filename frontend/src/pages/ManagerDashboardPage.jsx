import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import SkeletonRows from "../components/SkeletonRows";
import { emitToast } from "../services/uiEvents";

export default function ManagerDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard/stats")
      .then(({ data }) => setStats(data))
      .catch(() => emitToast("Não foi possível carregar o dashboard agora.", "warning"))
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="fc-card p-5"><SkeletonRows rows={2} /></div>
          <div className="fc-card p-5"><SkeletonRows rows={2} /></div>
          <div className="fc-card p-5"><SkeletonRows rows={2} /></div>
        </div>
        <div className="fc-card p-5"><SkeletonRows rows={4} /></div>
      </div>
    );
  }
  if (!stats) return <p className="text-red-300">Não foi possível carregar o dashboard.</p>;

  return (
    <div className="space-y-6">
      <section className="fc-card border-blue-500/20 bg-gradient-to-r from-blue-950/40 to-slate-900/70 p-5">
        <p className="text-xs uppercase tracking-wider text-blue-200">Visão operacional</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Resumo da operação da empresa</h2>
        <p className="mt-2 text-sm text-slate-300">
          Acompanhe indicadores em tempo real, produtividade por tipo e tendência semanal.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="fc-card border-blue-500/20 p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400">Motoristas ativos</p>
          <p className="mt-2 text-3xl font-bold text-emerald-300">{stats.motoristas_ativos || 0}</p>
          <p className="mt-2 text-sm text-slate-300">Motoristas com lançamentos na semana.</p>
          <p className={`mt-2 text-xs font-semibold ${trendClass}`}>{trendIcon} Ritmo operacional semanal</p>
        </article>

        <article className="fc-card border-blue-500/20 p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400">Veículos ativos</p>
          <p className="mt-2 text-3xl font-bold text-blue-300">{stats.veiculos_ativos || 0}</p>
          <p className="mt-2 text-sm text-slate-300">Veículos cadastrados na frota da empresa.</p>
          <p className="mt-2 text-xs font-semibold text-slate-300">Pico em 7 dias: {trendSummary.peak} registros</p>
        </article>

        <article className="fc-card border-blue-500/20 p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400">Registros hoje</p>
          <p className="mt-2 text-3xl font-bold text-violet-300">{stats.total_hoje}</p>
          <p className="mt-2 text-sm text-slate-300">Registros operacionais lançados hoje.</p>
          <p className={`mt-2 text-xs font-semibold ${trendClass}`}>
            {trendIcon} {Math.abs(trendSummary.delta)} vs ontem | média diária: {trendSummary.avg}
          </p>
        </article>
      </div>

      <article className="fc-card border-blue-500/20 p-5">
        <p className="text-xs uppercase tracking-wider text-slate-400">Total semanal</p>
        <p className="mt-2 text-3xl font-bold text-amber-300">{stats.total_semanal || 0}</p>
        <p className="mt-2 text-sm text-slate-300">Total de lançamentos nos últimos 7 dias.</p>
      </article>

      <div className="fc-card border-blue-500/20 p-5">
        <h3 className="mb-3 font-semibold text-white">Painel operacional</h3>
        <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
          {(stats.por_tipo || []).map((item) => (
            <p key={item.tipo} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              {item.tipo}: <span className="font-semibold text-slate-100">{item.total}</span>
            </p>
          ))}
        </div>
      </div>

      <div className="fc-card border-blue-500/20 p-5">
        <h3 className="mb-2 font-semibold text-white">Últimos 7 dias</h3>
        <div className="space-y-2">
          {trend.map((d) => (
            <div key={d.dia} className="flex items-center gap-2">
              <span className="w-20 text-xs text-slate-400">{new Date(d.dia).toLocaleDateString("pt-BR")}</span>
              <div className="h-3 flex-1 rounded bg-slate-800">
                <div
                  className="h-3 rounded bg-blue-500"
                  style={{ width: `${Math.max(4, Math.min(100, d.total * 10))}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs text-slate-300">{d.total}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/dashboard/relatorios" className="fc-btn inline-flex rounded-xl bg-blue-600 px-4 py-3 text-center font-semibold">
          Abrir relatórios completos
        </Link>
        <Link to="/dashboard/gestao" className="fc-btn inline-flex rounded-xl border border-emerald-500 px-4 py-3 text-center font-semibold text-emerald-200">
          Gerenciar motoristas e veículos
        </Link>
      </div>
    </div>
  );
}
