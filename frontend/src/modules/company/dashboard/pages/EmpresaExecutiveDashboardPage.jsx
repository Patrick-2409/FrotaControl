import { useMemo } from "react";
import { Link } from "react-router-dom";
import SkeletonRows from "../../../../components/SkeletonRows";
import { useEmpresaExecutiveStats } from "../hooks/useEmpresaExecutiveStats";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const shortcutClass =
  "group flex flex-col gap-1 rounded-xl border border-slate-700/80 bg-slate-900/50 p-4 transition hover:border-blue-500/40 hover:bg-slate-900/80";

export default function EmpresaExecutiveDashboardPage() {
  const { stats, loading } = useEmpresaExecutiveStats();

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
      ? "text-emerald-400"
      : trendSummary.direction === "down"
      ? "text-rose-400"
      : "text-slate-400";

  const parteDiariaRegistros = useMemo(() => {
    const arr = stats?.por_tipo || [];
    const hit = arr.find((x) => String(x.tipo || "").toLowerCase() === "parte_diaria");
    return Number(hit?.total ?? 0);
  }, [stats]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="fc-card border-slate-700/60 p-4">
              <SkeletonRows rows={2} />
            </div>
          ))}
        </div>
        <div className="fc-card border-slate-700/60 p-5">
          <SkeletonRows rows={3} />
        </div>
      </div>
    );
  }

  if (!stats) {
    return <p className="text-sm text-rose-300">Não foi possível carregar o painel executivo.</p>;
  }

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-800/90 pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Dashboard</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Visão consolidada</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Indicadores sintéticos. Transporte e combustível detalhados têm módulos próprios com filtros isolados.
        </p>
      </header>

      <section aria-labelledby="exec-resumo">
        <h2 id="exec-resumo" className="sr-only">
          Resumo rápido
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="fc-card border-slate-700/70 bg-slate-950/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Motoristas ativos</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{fmtInt(stats.motoristas_ativos)}</p>
            <p className="mt-1 text-xs text-slate-500">Com lançamentos na semana</p>
          </article>
          <article className="fc-card border-slate-700/70 bg-slate-950/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Veículos ativos</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{fmtInt(stats.veiculos_ativos)}</p>
            <p className="mt-1 text-xs text-slate-500">Frota da empresa</p>
          </article>
          <article className="fc-card border-slate-700/70 bg-slate-950/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Registros hoje</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{fmtInt(stats.total_hoje)}</p>
            <p className={`mt-1 text-xs font-medium ${trendClass}`}>
              {trendIcon} {Math.abs(trendSummary.delta)} vs. ontem · méd. {trendSummary.avg}/dia
            </p>
          </article>
          <article className="fc-card border-slate-700/70 bg-slate-950/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total 7 dias</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{fmtInt(stats.total_semanal)}</p>
            <p className="mt-1 text-xs text-slate-500">Pico diário: {trendSummary.peak}</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="exec-cards" className="grid gap-4 lg:grid-cols-3">
        <h2 id="exec-cards" className="sr-only">
          Cards executivos
        </h2>
        <article className="fc-card flex flex-col justify-between border-cyan-900/40 bg-gradient-to-b from-slate-950/90 to-slate-950/50 p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-500/90">Produção / porto</p>
            <p className="mt-3 text-sm text-slate-300">
              Toneladas, estéril/rocha, metas e gráfico planejado x executado foram centralizados no módulo Transporte.
            </p>
          </div>
          <Link
            to="/empresa/transporte"
            className="fc-btn mt-4 inline-flex w-fit rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Abrir Transporte
          </Link>
        </article>

        <article className="fc-card flex flex-col justify-between border-emerald-900/40 bg-gradient-to-b from-slate-950/90 to-slate-950/50 p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500/90">Combustível</p>
            <p className="mt-3 text-sm text-slate-300">
              Litros, custos, pizza por veículo, médias e ranking estão no módulo Combustível, com filtros próprios.
            </p>
          </div>
          <Link
            to="/empresa/combustivel"
            className="fc-btn mt-4 inline-flex w-fit rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Abrir Combustível
          </Link>
        </article>

        <article className="fc-card flex flex-col justify-between border-violet-900/40 bg-gradient-to-b from-slate-950/90 to-slate-950/50 p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-400/90">Parte diária</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-violet-200">{fmtInt(parteDiariaRegistros)}</p>
            <p className="mt-2 text-xs text-slate-500">Registros consolidados no período do painel.</p>
          </div>
        </article>
      </section>

      <section aria-labelledby="exec-charts" className="grid gap-4 lg:grid-cols-2">
        <h2 id="exec-charts" className="sr-only">
          Gráficos resumidos
        </h2>
        <article className="fc-card border-slate-700/70 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ritmo · últimos 7 dias</p>
          <div className="mt-4 space-y-2">
            {trend.length === 0 ? (
              <p className="text-sm text-slate-500">Sem série para exibir.</p>
            ) : (
              trend.map((d) => (
                <div key={d.dia} className="flex items-center gap-3">
                  <span className="w-[4.5rem] shrink-0 text-xs tabular-nums text-slate-500">
                    {new Date(d.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                      style={{ width: `${Math.max(3, Math.min(100, (d.total || 0) * 8))}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums text-slate-300">{d.total}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="fc-card flex flex-col justify-between border-slate-700/70 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Meta e execução</p>
          <p className="mt-3 text-sm text-slate-400">
            O gráfico de atingimento de metas e o planejamento semanal estão no módulo Transporte, com filtros e estado
            próprios.
          </p>
          <Link
            to="/empresa/transporte"
            className="fc-btn mt-4 inline-flex w-fit rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100"
          >
            Ver metas e produção
          </Link>
        </article>
      </section>

      <section aria-labelledby="exec-tipos">
        <h2 id="exec-tipos" className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Registros por tipo
        </h2>
        <div className="flex flex-wrap gap-2">
          {(stats.por_tipo || [])
            .filter((item) => String(item.tipo || "").toLowerCase() !== "parte_diaria")
            .map((item) => (
              <span
                key={item.tipo}
                className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200"
              >
                <span className="text-slate-500">{item.tipo}</span>
                <span className="font-semibold tabular-nums text-white">{item.total}</span>
              </span>
            ))}
        </div>
      </section>

      <section aria-labelledby="exec-atalhos">
        <h2 id="exec-atalhos" className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Atalhos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link to="/empresa/transporte" className={shortcutClass}>
            <span className="text-sm font-semibold text-white">Transporte</span>
            <span className="text-xs text-slate-500">Toneladas, metas e produtividade</span>
          </Link>
          <Link to="/empresa/combustivel" className={shortcutClass}>
            <span className="text-sm font-semibold text-white">Combustível</span>
            <span className="text-xs text-slate-500">Litros, custos e ranking</span>
          </Link>
          <Link to="/empresa/parte-diaria" className={shortcutClass}>
            <span className="text-sm font-semibold text-white">Parte diária</span>
            <span className="text-xs text-slate-500">Documentação operacional</span>
          </Link>
          <Link to="/dashboard" className={shortcutClass}>
            <span className="text-sm font-semibold text-white">Visão operacional completa</span>
            <span className="text-xs text-slate-500">Painel legado</span>
          </Link>
          <Link to="/dashboard/relatorios" className={shortcutClass}>
            <span className="text-sm font-semibold text-white">Relatórios</span>
            <span className="text-xs text-slate-500">Exportação e auditoria</span>
          </Link>
          <Link to="/dashboard/gestao" className={shortcutClass}>
            <span className="text-sm font-semibold text-white">Gestão</span>
            <span className="text-xs text-slate-500">Usuários e veículos</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
