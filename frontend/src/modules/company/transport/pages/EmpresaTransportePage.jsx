import { useMemo } from "react";
import { Link } from "react-router-dom";
import SkeletonRows from "../../../../components/SkeletonRows";
import BIDashboardShell from "../../bi/components/BIDashboardShell";
import BIChartCard from "../../bi/components/BIChartCard";
import TransportPlannedVsActualBars from "../components/TransportPlannedVsActualBars";
import TransportPlanExecutadoPizza from "../components/TransportPlanExecutadoPizza";
import { TransportProvider } from "../../contexts/TransportContext";
import { useTransportMetrics } from "../../hooks/useTransportMetrics";
import EmpresaModuleErrorPanel from "../../shared/components/EmpresaModuleErrorPanel";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtTon = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

const fmtCountLabel = (count, singular, plural) => {
  const n = Number(count) || 0;
  return `${fmtInt(n)} ${n === 1 ? singular : plural}`;
};

function pickFirstNumber(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function fmtDiaBr(ymd) {
  if (!ymd || typeof ymd !== "string") return "—";
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function pctTone(p) {
  if (p >= 100) return "text-emerald-300";
  if (p >= 70) return "text-amber-200";
  return "text-rose-300";
}

function EmpresaTransportePageContent() {
  const { operations: tr, metrics: prod, materialTab, setMaterialTab } = useTransportMetrics();
  const trendSorted = useMemo(
    () => [...(prod.trend || [])].sort((a, b) => new Date(a.dia) - new Date(b.dia)),
    [prod.trend]
  );

  const maxTrend = useMemo(() => {
    if (!trendSorted.length) return 1;
    return Math.max(1, ...trendSorted.map((d) => Number(d.total) || 0));
  }, [trendSorted]);

  const pageLoading = prod.loading && !prod.stats;

  if (pageLoading) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Transporte" lead="" showRoadmap={false}>
        <div className="fc-card p-8">
          <SkeletonRows rows={5} />
        </div>
      </BIDashboardShell>
    );
  }

  if (!prod.loading && !prod.stats && prod.statsError) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Transporte" lead="" showRoadmap={false}>
        <EmpresaModuleErrorPanel
          title="Indicadores de transporte indisponíveis"
          description={prod.statsError}
          onRetry={prod.refetchStats}
        />
      </BIDashboardShell>
    );
  }

  if (!prod.stats) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Transporte" lead="" showRoadmap={false}>
        <EmpresaModuleErrorPanel
          title="Transporte"
          description="Não foi possível carregar os indicadores. Confirme se continua ligado e tente outra vez."
          onRetry={prod.refetchStats}
        />
      </BIDashboardShell>
    );
  }

  const totalToneladasPeriodo =
    tr.viagensResumo != null
      ? Number(tr.viagensResumo.total_toneladas_esteril || 0) + Number(tr.viagensResumo.total_toneladas_rocha || 0)
      : 0;

  const pctTotal = Number(tr.comparacao?.percentual_total ?? 0);
  const porTipoSemana = Array.isArray(prod.stats?.por_tipo_semana) ? prod.stats.por_tipo_semana : [];
  const totalTiposComRegistros = porTipoSemana.filter((item) => Number(item?.total || 0) > 0).length;
  const isHistoricoSomenteRomaneio = totalTiposComRegistros > 0 && totalTiposComRegistros === 1 && porTipoSemana.some((item) => item?.tipo === "romaneio" && Number(item?.total || 0) > 0);
  const historicoItemSingular = isHistoricoSomenteRomaneio ? "romaneio" : "registro";
  const historicoItemPlural = isHistoricoSomenteRomaneio ? "romaneios" : "registros";
  const historicoTitle = isHistoricoSomenteRomaneio
    ? "Histórico semanal (romaneios)"
    : "Histórico semanal (registros operacionais)";
  const historicoLead = isHistoricoSomenteRomaneio
    ? "Últimos 7 dias — total de romaneios por dia."
    : "Últimos 7 dias — total de registros operacionais por dia.";

  return (
    <BIDashboardShell eyebrow="Indicadores" title="Transporte" lead="Toneladas, metas e planejamento do período.">
      {tr.temAlertasTransporte ? (
        <div
          role="status"
          className="fc-erp-alert-panel fc-erp-alert-panel--amber space-y-3 rounded-xl border border-amber-500/30 bg-amber-950/25 p-4 text-sm text-zinc-100 sm:p-5"
        >
          <p className="fc-erp-eyebrow text-amber-200/90">Alertas</p>
          {tr.alertasTransporte.veiculos_sem_capacidade > 0 ? (
            <p className="flex items-start gap-3 font-medium leading-snug">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/95" aria-hidden />
              <span>
                {tr.alertasTransporte.veiculos_sem_capacidade === 1
                  ? "1 veículo sem capacidade definida"
                  : `${fmtInt(tr.alertasTransporte.veiculos_sem_capacidade)} veículos sem capacidade definida`}
              </span>
            </p>
          ) : null}
          {tr.alertasTransporte.custo_alto ? (
            <p className="flex items-start gap-3 font-medium leading-snug">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/95" aria-hidden />
              <span>Custo operacional elevado no período</span>
            </p>
          ) : null}
          {tr.alertasTransporte.meta_risco ? (
            <p className="flex items-start gap-3 font-medium leading-snug">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/95" aria-hidden />
              <span>Produção abaixo da meta</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <section
        className={`fc-card overflow-hidden rounded-2xl border-2 p-6 sm:p-8 ${
          tr.comparacao && tr.metaPlanejadaTotal > 0
            ? pctTotal >= 100
              ? "border-emerald-500/35 bg-emerald-950/20"
              : pctTotal >= 70
                ? "border-amber-500/35 bg-amber-950/15"
                : "border-rose-500/35 bg-rose-950/15"
            : "border-zinc-700 bg-zinc-950/80"
        }`}
        aria-label="Total de toneladas no período"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total no período filtrado</p>
        {tr.viagensLoading ? (
          <div className="mt-4">
            <SkeletonRows rows={2} />
          </div>
        ) : tr.viagensError ? (
          <p className="mt-2 text-sm text-rose-300">{tr.viagensError}</p>
        ) : (
          <>
            <p className="mt-2 font-mono text-4xl font-black tabular-nums tracking-tight text-zinc-50 sm:text-5xl md:text-6xl">
              {fmtTon(totalToneladasPeriodo)} <span className="text-2xl font-bold text-zinc-400 sm:text-3xl">t</span>
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <p className="text-xs text-zinc-500">Estéril</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-zinc-100">
                  {tr.viagensResumo ? `${fmtTon(tr.viagensResumo.total_toneladas_esteril)} t` : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {fmtCountLabel(tr.viagensResumo?.total_viagens_esteril, "viagem", "viagens")}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <p className="text-xs text-amber-200/80">Rocha</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-zinc-100">
                  {tr.viagensResumo ? `${fmtTon(tr.viagensResumo.total_toneladas_rocha)} t` : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {fmtCountLabel(tr.viagensResumo?.total_viagens_rocha, "viagem", "viagens")}
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="fc-erp-panel space-y-5 rounded-2xl p-5 lg:p-7" aria-labelledby="transporte-porto-title">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="transporte-porto-title" className="fc-erp-h1 text-lg text-zinc-100 md:text-xl">
            Período e material
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Período do resumo de viagens">
            {[
              { id: "dia", label: "Dia" },
              { id: "semana", label: "Semana" },
              { id: "mes", label: "Mês" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => tr.setPeriodoFiltro(p.id)}
                className={`fc-btn rounded-md border px-3 py-2 text-sm font-medium transition ${
                  tr.periodoFiltro === p.id
                    ? "border-amber-500/50 bg-zinc-800/80 text-zinc-50 shadow-inner"
                    : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-zinc-800/80 pt-4" role="group" aria-label="Tipo de material">
          {[
            { id: "todos", label: "Todos" },
            { id: "esteril", label: "Estéril" },
            { id: "rocha", label: "Rocha" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMaterialTab(t.id)}
              className={`fc-btn rounded-md border px-3 py-2 text-sm font-medium transition ${
                materialTab === t.id
                  ? "border-amber-500/50 bg-zinc-800/80 text-zinc-50 shadow-inner"
                  : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!tr.viagensLoading && tr.viagensResumo && totalToneladasPeriodo <= 0 ? (
          <p className="text-sm text-zinc-500">Sem toneladas com capacidade registada neste período.</p>
        ) : null}
      </section>

      <BIChartCard title="Planejado vs executado" className="mt-2" bodyClassName="min-h-[10rem]">
        {tr.comparLoading ? (
          <SkeletonRows rows={3} />
        ) : tr.comparError ? (
          <EmpresaModuleErrorPanel
            title="Não foi possível carregar o comparativo"
            description={tr.comparError}
            onRetry={() => {
              void tr.refetchComparacao();
            }}
          />
        ) : tr.comparacao ? (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-center lg:gap-12 xl:gap-16">
              <div className="flex shrink-0 justify-center lg:flex-1 lg:justify-center">
                <TransportPlanExecutadoPizza
                  totalToneladasEsteril={Number(tr.viagensResumo?.total_toneladas_esteril ?? 0)}
                  totalToneladasRocha={Number(tr.viagensResumo?.total_toneladas_rocha ?? 0)}
                />
              </div>
              <div className="flex w-full min-w-0 flex-col justify-center gap-5 sm:max-w-md lg:max-w-none lg:flex-1">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Meta total</p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-zinc-100 sm:text-3xl">
                    {fmtTon(tr.metaPlanejadaTotal)} t
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Executado</p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-zinc-100 sm:text-3xl">
                    {fmtTon(tr.executadoTotal)} t
                  </p>
                </div>
                <div
                  className={`rounded-xl border px-4 py-4 sm:px-5 sm:py-5 ${
                    pctTotal >= 100
                      ? "border-emerald-500/35 bg-emerald-950/20"
                      : pctTotal >= 70
                        ? "border-amber-500/35 bg-amber-950/20"
                        : "border-rose-500/35 bg-rose-950/20"
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">% atingido</p>
                  <p className={`mt-1 text-4xl font-black tabular-nums tracking-tight sm:text-5xl ${pctTone(pctTotal)}`}>
                    {fmtPct(pctTotal)}%
                  </p>
                </div>
              </div>
            </div>
            <TransportPlannedVsActualBars comparacao={tr.comparacao} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Comparativo indisponível.</p>
        )}
      </BIChartCard>

      <section className="fc-card border-zinc-800/90 p-5 lg:p-6" aria-labelledby="hist-semanal">
        <h3 id="hist-semanal" className="text-base font-semibold text-zinc-100">
          {historicoTitle}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">{historicoLead}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-2 pr-3">Dia</th>
                <th className="pb-2 pr-3">Total</th>
                <th className="pb-2">Ritmo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {trendSorted.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-zinc-500">
                    Sem dados.
                  </td>
                </tr>
              ) : (
                trendSorted.map((row) => {
                  const v = Number(row.total) || 0;
                  const viagens = pickFirstNumber(row.viagens, row.total_viagens, row.viagens_total);
                  const totalLabel = fmtCountLabel(v, historicoItemSingular, historicoItemPlural);
                  const viagensLabel = viagens != null ? fmtCountLabel(viagens, "viagem", "viagens") : null;
                  const w = Math.round((v / maxTrend) * 100);
                  return (
                    <tr key={row.dia}>
                      <td className="py-2.5 pr-3 text-zinc-300">{fmtDiaBr(row.dia)}</td>
                      <td className="py-2.5 pr-3 font-semibold tabular-nums text-zinc-100">
                        {totalLabel}
                        {viagensLabel ? <span className="text-zinc-400"> {" • "}{viagensLabel}</span> : null}
                      </td>
                      <td className="py-2.5">
                        <div className="h-2 min-w-[80px] overflow-hidden rounded-full bg-zinc-800">
                          <div className="h-2 rounded-full bg-amber-500/90" style={{ width: `${w}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fc-card border-zinc-800/90 p-5 lg:p-6" aria-labelledby="planejamento-form">
        <h3 id="planejamento-form" className="text-base font-semibold text-zinc-100">
          Planejamento
        </h3>
        <p className="mt-1 text-xs text-zinc-500">Edite datas e metas, ou zere as metas do período ativo.</p>

        {tr.metaPlanejadaTotal <= 0 && tr.comparacao ? (
          <p className="mt-3 text-sm text-amber-200/90">Sem meta ativa para hoje. Defina datas que incluam hoje.</p>
        ) : null}

        <form className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={tr.submitPlanejamento}>
          <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
            <span className="fc-erp-eyebrow">Início</span>
            <input
              type="date"
              required
              className="fc-input rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={tr.planForm.data_inicio}
              onChange={(ev) => tr.setPlanForm((p) => ({ ...p, data_inicio: ev.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
            <span className="fc-erp-eyebrow">Fim</span>
            <input
              type="date"
              required
              className="fc-input rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={tr.planForm.data_fim}
              onChange={(ev) => tr.setPlanForm((p) => ({ ...p, data_fim: ev.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
            <span className="fc-erp-eyebrow">Meta estéril (t)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="fc-input rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={tr.planForm.meta_esteril_ton}
              onChange={(ev) => tr.setPlanForm((p) => ({ ...p, meta_esteril_ton: ev.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
            <span className="fc-erp-eyebrow">Meta rocha (t)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="fc-input rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={tr.planForm.meta_rocha_ton}
              onChange={(ev) => tr.setPlanForm((p) => ({ ...p, meta_rocha_ton: ev.target.value }))}
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={tr.planSaving}
              className="fc-btn rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-50"
            >
              {tr.planSaving ? "Salvando…" : "Salvar planejamento"}
            </button>
            <button
              type="button"
              disabled={tr.planSaving}
              onClick={() => void tr.reloadPlanejamentoAtual()}
              className="fc-btn rounded-md border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
            >
              Carregar plano vigente
            </button>
            <button
              type="button"
              disabled={tr.planSaving}
              onClick={() => {
                if (!window.confirm("Zerar as metas (estéril e rocha) do período de planejamento ativo?")) return;
                void tr.clearPlanejamentoMetas();
              }}
              className="fc-btn rounded-md border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-950/50 disabled:opacity-50"
            >
              Zerar metas do período ativo
            </button>
          </div>
        </form>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/empresa/dashboard"
          className="fc-btn inline-flex rounded-md border border-zinc-600 px-4 py-3 text-center text-sm font-semibold text-zinc-200 hover:border-zinc-500"
        >
          Painel executivo
        </Link>
        <Link
          to="/empresa/relatorios"
          className="fc-btn inline-flex rounded-md border border-zinc-600 px-4 py-3 text-center text-sm font-semibold text-zinc-200"
        >
          Relatórios
        </Link>
      </div>
    </BIDashboardShell>
  );
}

export default function EmpresaTransportePage() {
  return (
    <TransportProvider>
      <EmpresaTransportePageContent />
    </TransportProvider>
  );
}
