import { useMemo } from "react";
import { Link } from "react-router-dom";
import SkeletonRows from "../../../../components/SkeletonRows";
import { useEmpresaExecutiveStats } from "../hooks/useEmpresaExecutiveStats";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const shortcutClass =
  "group flex flex-col gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/40 p-4 transition-colors hover:border-zinc-600 hover:bg-zinc-900/50";

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

  const trendLabel =
    trendSummary.direction === "up"
      ? "Tendência positiva"
      : trendSummary.direction === "down"
        ? "Tendência negativa"
        : "Tendência estável";
  const trendClass =
    trendSummary.direction === "up"
      ? "fc-kpi-trend-up"
      : trendSummary.direction === "down"
        ? "fc-kpi-trend-down"
        : "fc-kpi-trend-neutral";

  const parteDiariaRegistros = useMemo(() => {
    const arr = stats?.por_tipo || [];
    const hit = arr.find((x) => String(x.tipo || "").toLowerCase() === "parte_diaria");
    return Number(hit?.total ?? 0);
  }, [stats]);

  if (loading) {
    return (
      <div className="fc-erp-workspace">
        <div className="fc-erp-grid-kpi">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="fc-card border-zinc-800/90 p-5">
              <SkeletonRows rows={2} />
            </div>
          ))}
        </div>
        <div className="fc-card border-zinc-800/90 p-6">
          <SkeletonRows rows={3} />
        </div>
      </div>
    );
  }

  if (!stats) {
    return <p className="text-sm text-red-400/90">Não foi possível carregar o painel executivo.</p>;
  }

  return (
    <div className="fc-erp-workspace">
      <header className="border-b border-zinc-800 pb-8">
        <p className="fc-erp-eyebrow">Dashboard</p>
        <h1 className="fc-erp-h1 mt-2">Visão consolidada</h1>
        <p className="fc-erp-lead mt-3">
          Indicadores sintéticos. Transporte e combustível detalhados têm módulos próprios com filtros isolados.
        </p>
      </header>

      <section aria-labelledby="exec-resumo">
        <h2 id="exec-resumo" className="sr-only">
          Resumo rápido
        </h2>
        <div className="fc-erp-grid-kpi">
          <article className="fc-card border-zinc-800/90 p-5">
            <p className="fc-erp-eyebrow">Motoristas ativos</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-zinc-50">{fmtInt(stats.motoristas_ativos)}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">Com lançamentos na semana</p>
          </article>
          <article className="fc-card border-zinc-800/90 p-5">
            <p className="fc-erp-eyebrow">Veículos ativos</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-zinc-50">{fmtInt(stats.veiculos_ativos)}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">Frota da empresa</p>
          </article>
          <article className="fc-card border-zinc-800/90 p-5">
            <p className="fc-erp-eyebrow">Registros hoje</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-zinc-50">{fmtInt(stats.total_hoje)}</p>
            <p className={`mt-2 text-xs font-medium ${trendClass}`}>
              {trendLabel} · {Math.abs(trendSummary.delta)} vs. ontem · méd. {trendSummary.avg}/dia
            </p>
          </article>
          <article className="fc-card border-zinc-800/90 p-5">
            <p className="fc-erp-eyebrow">Total 7 dias</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-zinc-50">{fmtInt(stats.total_semanal)}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">Pico diário: {trendSummary.peak}</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="exec-cards" className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <h2 id="exec-cards" className="sr-only">
          Cards executivos
        </h2>
        <article className="fc-card flex flex-col justify-between border-zinc-800/90 p-6">
          <div>
            <p className="fc-erp-eyebrow">Produção / porto</p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              Toneladas, estéril/rocha, metas e gráfico planejado x executado foram centralizados no módulo Transporte.
            </p>
          </div>
          <Link
            to="/empresa/transporte"
            className="fc-btn mt-6 inline-flex w-fit rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            Abrir Transporte
          </Link>
        </article>

        <article className="fc-card flex flex-col justify-between border-zinc-800/90 p-6">
          <div>
            <p className="fc-erp-eyebrow">Combustível</p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              Litros, custos, pizza por veículo, médias e ranking estão no módulo Combustível, com filtros próprios.
            </p>
          </div>
          <Link
            to="/empresa/combustivel"
            className="fc-btn mt-6 inline-flex w-fit rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            Abrir Combustível
          </Link>
        </article>

        <article className="fc-card flex flex-col justify-between border-zinc-800/90 p-6">
          <div>
            <p className="fc-erp-eyebrow">Parte diária</p>
            <p className="mt-4 text-3xl font-semibold tabular-nums text-zinc-100">{fmtInt(parteDiariaRegistros)}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">Registros consolidados no período do painel.</p>
          </div>
        </article>
      </section>

      <section aria-labelledby="exec-charts" className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <h2 id="exec-charts" className="sr-only">
          Gráficos resumidos
        </h2>
        <article className="fc-card border-zinc-800/90 p-6">
          <p className="fc-erp-eyebrow">Ritmo · últimos 7 dias</p>
          <div className="mt-5 space-y-2.5">
            {trend.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem série para exibir.</p>
            ) : (
              trend.map((d) => (
                <div key={d.dia} className="flex items-center gap-3">
                  <span className="w-[4.5rem] shrink-0 text-xs tabular-nums text-zinc-500">
                    {new Date(d.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-sm bg-zinc-800">
                    <div
                      className="h-2 rounded-sm bg-gradient-to-r from-amber-700/90 to-amber-500/85"
                      style={{ width: `${Math.max(3, Math.min(100, (d.total || 0) * 8))}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums text-zinc-300">{d.total}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="fc-card flex flex-col justify-between border-zinc-800/90 p-6">
          <p className="fc-erp-eyebrow">Meta e execução</p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            O gráfico de atingimento de metas e o planejamento semanal estão no módulo Transporte, com filtros e estado
            próprios.
          </p>
          <Link
            to="/empresa/transporte"
            className="fc-btn mt-6 inline-flex w-fit rounded-md border border-zinc-600 bg-transparent px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-900/80"
          >
            Ver metas e produção
          </Link>
        </article>
      </section>

      <section aria-labelledby="exec-tipos">
        <h2 id="exec-tipos" className="fc-erp-eyebrow mb-4">
          Registros por tipo
        </h2>
        <div className="flex flex-wrap gap-2">
          {(stats.por_tipo || [])
            .filter((item) => String(item.tipo || "").toLowerCase() !== "parte_diaria")
            .map((item) => (
              <span
                key={item.tipo}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300"
              >
                <span className="text-zinc-500">{item.tipo}</span>
                <span className="font-semibold tabular-nums text-zinc-100">{item.total}</span>
              </span>
            ))}
        </div>
      </section>

      <section aria-labelledby="exec-atalhos">
        <h2 id="exec-atalhos" className="fc-erp-eyebrow mb-4">
          Atalhos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          <Link to="/empresa/transporte" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Transporte</span>
            <span className="text-xs leading-snug text-zinc-500">Toneladas, metas e produtividade</span>
          </Link>
          <Link to="/empresa/combustivel" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Combustível</span>
            <span className="text-xs leading-snug text-zinc-500">Litros, custos e ranking</span>
          </Link>
          <Link to="/empresa/parte-diaria" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Parte diária</span>
            <span className="text-xs leading-snug text-zinc-500">Documentação operacional</span>
          </Link>
          <Link to="/dashboard" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Visão operacional completa</span>
            <span className="text-xs leading-snug text-zinc-500">Painel legado</span>
          </Link>
          <Link to="/dashboard/relatorios" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Relatórios</span>
            <span className="text-xs leading-snug text-zinc-500">Exportação e auditoria</span>
          </Link>
          <Link to="/dashboard/gestao" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Gestão</span>
            <span className="text-xs leading-snug text-zinc-500">Usuários e veículos</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
