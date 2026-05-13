import { useMemo } from "react";
import { Link } from "react-router-dom";
import SkeletonRows from "../../../../components/SkeletonRows";
import BIDashboardShell from "../../bi/components/BIDashboardShell";
import BIChartCard from "../../bi/components/BIChartCard";
import BIKpiCard from "../../bi/components/BIKpiCard";
import BILineSeriesChart from "../../bi/components/BILineSeriesChart";
import { growthPercent } from "../../bi/utils/chartMath";
import { useEmpresaExecutiveStats } from "../hooks/useEmpresaExecutiveStats";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const shortcutClass = "fc-erp-shortcut-card group";

export default function EmpresaExecutiveDashboardPage() {
  const { stats, loading } = useEmpresaExecutiveStats();

  const trend = useMemo(() => stats?.ultimos_7_dias || [], [stats]);
  const trendSorted = useMemo(
    () => [...trend].sort((a, b) => new Date(a.dia) - new Date(b.dia)),
    [trend]
  );
  const sparkSeries = useMemo(() => trendSorted.map((d) => d.total || 0), [trendSorted]);

  const trendSummary = useMemo(() => {
    if (!trendSorted.length) {
      return { delta: 0, direction: "neutral", peak: 0, avg: 0 };
    }
    const last = trendSorted[trendSorted.length - 1]?.total || 0;
    const prev = trendSorted[trendSorted.length - 2]?.total || 0;
    const delta = last - prev;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
    const peak = trendSorted.reduce((m, item) => Math.max(m, item.total || 0), 0);
    const avg = Math.round(
      trendSorted.reduce((acc, item) => acc + (item.total || 0), 0) / Math.max(1, trendSorted.length)
    );
    return { delta, direction, peak, avg };
  }, [trendSorted]);

  const trendLabel =
    trendSummary.direction === "up"
      ? "Tendência positiva"
      : trendSummary.direction === "down"
        ? "Tendência negativa"
        : "Tendência estável";

  const parteDiariaRegistros = useMemo(() => {
    const arr = stats?.por_tipo || [];
    const hit = arr.find((x) => String(x.tipo || "").toLowerCase() === "parte_diaria");
    return Number(hit?.total ?? 0);
  }, [stats]);

  const metaSemanalSoft = Math.max(1, trendSummary.avg * 7);
  const pctSemanal =
    stats && trendSummary.avg > 0
      ? Math.min(100, Math.round(((stats.total_semanal || 0) / metaSemanalSoft) * 100))
      : null;
  const pctHoje =
    stats && trendSummary.avg > 0
      ? Math.min(100, Math.round(((stats.total_hoje || 0) / Math.max(1, trendSummary.avg)) * 100))
      : null;

  const growthSemanal = growthPercent(stats?.total_semanal, metaSemanalSoft);

  if (loading) {
    return (
      <BIDashboardShell
        eyebrow="Indicadores"
        title="Executivo"
        lead="As áreas de transporte, combustível e frota têm filtros próprios e guardam as últimas escolhas neste computador."
        showRoadmap={false}
      >
        <div className="fc-erp-grid-kpi">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="fc-card fc-erp-kpi-card border-zinc-800/90 p-5">
              <SkeletonRows rows={2} />
            </div>
          ))}
        </div>
        <div className="fc-card border-zinc-800/90 p-6">
          <SkeletonRows rows={3} />
        </div>
      </BIDashboardShell>
    );
  }

  if (!stats) {
    return (
      <BIDashboardShell
        eyebrow="Indicadores"
        title="Executivo"
        lead="Resumo da operação."
        showRoadmap={false}
      >
        <p className="text-sm text-red-400/90">Não foi possível carregar o painel executivo.</p>
      </BIDashboardShell>
    );
  }

  return (
    <BIDashboardShell
      eyebrow="Indicadores"
      title="Executivo"
      lead="Números-chave com tendência e comparação com a média dos últimos dias. Transporte, combustível e frota têm
      painéis próprios, cada um com filtros que permanecem ao mudar de tela."
    >
      <section aria-labelledby="exec-resumo">
        <h2 id="exec-resumo" className="sr-only">
          Resumo rápido
        </h2>
        <div className="fc-erp-grid-kpi">
          <BIKpiCard
            label="Motoristas ativos"
            value={fmtInt(stats.motoristas_ativos)}
            hint="Com lançamentos na semana"
            sparklineValues={sparkSeries}
          />
          <BIKpiCard
            label="Veículos ativos"
            value={fmtInt(stats.veiculos_ativos)}
            hint="Frota da empresa"
            sparklineValues={sparkSeries}
          />
          <BIKpiCard
            label="Registros hoje"
            value={fmtInt(stats.total_hoje)}
            trendDirection={trendSummary.direction}
            deltaLabel={`${trendLabel} · ${Math.abs(trendSummary.delta)} vs. ontem`}
            comparisonLabel={`Média diária na série: ${trendSummary.avg}/dia`}
            targetPct={pctHoje}
            sparklineValues={sparkSeries}
          />
          <BIKpiCard
            label="Total 7 dias"
            value={fmtInt(stats.total_semanal)}
            comparisonLabel={`Pico diário: ${trendSummary.peak}`}
            targetPct={pctSemanal}
            growthLabel={
              growthSemanal != null
                ? `Variação vs. meta derivada da média: ${growthSemanal >= 0 ? "+" : ""}${growthSemanal.toFixed(1)}%`
                : undefined
            }
            sparklineValues={sparkSeries}
          />
        </div>
      </section>

      <section aria-labelledby="exec-cards" className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <h2 id="exec-cards" className="sr-only">
          Cards executivos
        </h2>
        <article className="fc-card fc-erp-module-card flex flex-col justify-between border-zinc-800/90 p-6">
          <div>
            <p className="fc-erp-eyebrow">Produção / porto</p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              Toneladas, material (estéril ou rocha), metas e gráfico planejado versus executado na área de Transporte.
            </p>
          </div>
          <Link
            to="/empresa/transporte"
            className="fc-btn mt-6 inline-flex w-fit rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            Abrir Transporte
          </Link>
        </article>

        <article className="fc-card fc-erp-module-card flex flex-col justify-between border-zinc-800/90 p-6">
          <div>
            <p className="fc-erp-eyebrow">Combustível</p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              Litros, custos, gráfico por veículo e ranking, com filtros próprios a esta área.
            </p>
          </div>
          <Link
            to="/empresa/combustivel"
            className="fc-btn mt-6 inline-flex w-fit rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            Abrir Combustível
          </Link>
        </article>

        <article className="fc-card fc-erp-module-card flex flex-col justify-between border-zinc-800/90 p-6">
          <div>
            <p className="fc-erp-eyebrow">Parte diária</p>
            <p className="mt-4 text-3xl font-semibold tabular-nums text-zinc-100">{fmtInt(parteDiariaRegistros)}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">Total de registros de parte diária no período deste painel.</p>
          </div>
        </article>
      </section>

      <section aria-labelledby="exec-charts" className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <h2 id="exec-charts" className="sr-only">
          Gráficos resumidos
        </h2>
        <BIChartCard
          title="Ritmo operacional"
          subtitle="Evolução dia a dia — pode aproximar o gráfico e ver o valor em cada data."
          legend={
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-6 rounded-sm bg-gradient-to-r from-amber-800 to-amber-400" aria-hidden />
              Registros / dia
            </span>
          }
          bodyClassName="min-h-[14rem]"
        >
          {trendSorted.length === 0 ? (
            <p className="text-sm text-zinc-500">Sem série para exibir.</p>
          ) : (
            <BILineSeriesChart data={trendSorted} valueKey="total" labelKey="dia" yAxisLabel="Registros" height={220} />
          )}
        </BIChartCard>

        <article className="fc-card fc-erp-module-card flex flex-col justify-between border-zinc-800/90 p-6">
          <p className="fc-erp-eyebrow">Metas e planejamento</p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            Atingimento de metas e planejado versus executado estão no painel de Transporte; a escolha do material
            (todos, estéril ou rocha) é memorizada neste navegador.
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
          <Link to="/empresa/frota" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Frota</span>
            <span className="text-xs leading-snug text-zinc-500">Disponibilidade e documentação</span>
          </Link>
          <Link to="/empresa/pessoas" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Pessoas</span>
            <span className="text-xs leading-snug text-zinc-500">Produtividade e vínculos</span>
          </Link>
          <Link to="/empresa/parte-diaria" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Parte diária</span>
            <span className="text-xs leading-snug text-zinc-500">Documentação operacional</span>
          </Link>
          <Link to="/empresa/relatorios" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Relatórios</span>
            <span className="text-xs leading-snug text-zinc-500">Exportação e auditoria</span>
          </Link>
          <Link to="/dashboard/gestao" className={shortcutClass}>
            <span className="text-sm font-semibold text-zinc-100">Gestão</span>
            <span className="text-xs leading-snug text-zinc-500">Usuários e veículos</span>
          </Link>
        </div>
      </section>
    </BIDashboardShell>
  );
}
