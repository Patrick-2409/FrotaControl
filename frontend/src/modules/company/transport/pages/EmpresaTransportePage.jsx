import { Link } from "react-router-dom";
import SkeletonRows from "../../../../components/SkeletonRows";
import { TransportProvider } from "../../contexts/TransportContext";
import { useTransportMetrics } from "../../hooks/useTransportMetrics";
import EmpresaModuleErrorPanel from "../../shared/components/EmpresaModuleErrorPanel";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtTon = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

function EmpresaTransportePageContent() {
  const { operations: tr, metrics: prod, materialTab, setMaterialTab } = useTransportMetrics();

  const pageLoading = prod.loading && !prod.stats;

  if (pageLoading) {
    return (
      <div className="fc-erp-workspace">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="fc-card p-5">
            <SkeletonRows rows={2} />
          </div>
          <div className="fc-card p-5">
            <SkeletonRows rows={2} />
          </div>
          <div className="fc-card p-5">
            <SkeletonRows rows={2} />
          </div>
        </div>
        <div className="fc-card p-5">
          <SkeletonRows rows={4} />
        </div>
      </div>
    );
  }

  if (!prod.loading && !prod.stats && prod.statsError) {
    return (
      <div className="fc-erp-workspace">
        <EmpresaModuleErrorPanel
          title="Indicadores de transporte indisponíveis"
          description={prod.statsError}
          onRetry={prod.refetchStats}
        />
      </div>
    );
  }

  if (!prod.stats) {
    return (
      <div className="fc-erp-workspace">
        <EmpresaModuleErrorPanel
          title="Módulo de transporte"
          description="Não foi possível carregar os indicadores de produtividade. Verifique a sessão e a ligação à rede."
          onRetry={prod.refetchStats}
        />
      </div>
    );
  }

  const { stats, trend, trendSummary, trendLabel, trendClass } = prod;

  return (
    <div className="fc-erp-workspace">
      <header className="border-b border-zinc-800 pb-6">
        <p className="fc-erp-eyebrow">Módulo transporte</p>
        <h1 className="fc-erp-h1 mt-2">Porto e produção</h1>
        <p className="fc-erp-lead mt-3">
          Toneladas, metas, planejado x executado e produtividade. Filtros e estado são exclusivos desta rota.
        </p>
      </header>

      {tr.temAlertasTransporte ? (
        <div role="status" className="fc-erp-alert-panel fc-erp-alert-panel--amber space-y-3 p-4 text-sm text-zinc-100 sm:p-5">
          <p className="fc-erp-eyebrow text-amber-200/90">Alertas operacionais</p>
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
              <span>Custo operacional elevado no período selecionado</span>
            </p>
          ) : null}
          {tr.alertasTransporte.meta_risco ? (
            <p className="flex items-start gap-3 font-medium leading-snug">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/95" aria-hidden />
              <span>Produção abaixo da meta</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="transporte-produtividade" className="space-y-4">
        <h2 id="transporte-produtividade" className="fc-erp-eyebrow">
          Produtividade e ritmo
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          <article className="fc-card border-zinc-800/90 p-5">
            <p className="fc-erp-eyebrow">Motoristas ativos</p>
            <p className="mt-3 text-3xl font-bold tabular-nums text-zinc-100">{stats.motoristas_ativos || 0}</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">Motoristas com lançamentos na semana.</p>
            <p className={`mt-3 text-xs font-semibold ${trendClass}`}>
              {trendLabel} — ritmo operacional semanal
            </p>
          </article>

          <article className="fc-card border-zinc-800/90 p-5">
            <p className="fc-erp-eyebrow">Veículos ativos</p>
            <p className="mt-3 text-3xl font-bold tabular-nums text-zinc-100">{stats.veiculos_ativos || 0}</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">Veículos cadastrados na frota da empresa.</p>
            <p className="mt-3 text-xs font-semibold text-zinc-500">Pico em 7 dias: {trendSummary.peak} registros</p>
          </article>

          <article className="fc-card border-zinc-800/90 p-5 sm:col-span-2 lg:col-span-1">
            <p className="fc-erp-eyebrow">Registros hoje</p>
            <p className="mt-3 text-3xl font-bold tabular-nums text-zinc-100">{stats.total_hoje}</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">Registros operacionais lançados hoje.</p>
            <p className={`mt-3 text-xs font-semibold ${trendClass}`}>
              {trendLabel} · {Math.abs(trendSummary.delta)} vs. ontem · média diária: {trendSummary.avg}
            </p>
          </article>
        </div>

        <article className="fc-card border-zinc-800/90 p-5">
          <p className="fc-erp-eyebrow">Total semanal</p>
          <p className="mt-3 text-3xl font-bold tabular-nums text-zinc-100">{stats.total_semanal || 0}</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">Total de lançamentos nos últimos 7 dias.</p>
        </article>
      </section>

      <section className="fc-erp-panel space-y-6 p-6 lg:p-8" aria-labelledby="transporte-porto-title">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="fc-erp-eyebrow">Operação — Porto</p>
            <h2 id="transporte-porto-title" className="fc-erp-h1 mt-2 text-xl md:text-2xl">
              Transporte
            </h2>
            <p className="fc-erp-lead mt-3">
              O período abaixo filtra toneladas e alertas desta tela. Planejado versus executado e o formulário de metas
              usam o planejamento vigente.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2" role="group" aria-label="Período do resumo de viagens">
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

        <div className="flex flex-col gap-3 border-t border-zinc-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="fc-erp-eyebrow">Foco por tipo de material</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de material (visualização)">
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
        </div>

        {tr.viagensError && !tr.viagensLoading ? (
          <div className="mt-6">
            <EmpresaModuleErrorPanel
              title="Resumo de viagens indisponível"
              description={tr.viagensError}
              onRetry={() => {
                void tr.refetchViagens();
              }}
            />
          </div>
        ) : null}

        {tr.viagensLoading ? (
          <div className="mt-6">
            <SkeletonRows rows={2} />
          </div>
        ) : tr.viagensResumo &&
          Number(tr.viagensResumo.total_toneladas_esteril || 0) + Number(tr.viagensResumo.total_toneladas_rocha || 0) >
            0 ? (
          <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-950/40 p-4 lg:p-5">
            <p className="fc-erp-eyebrow">Toneladas no período</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">Com capacidade informada nas viagens apontadas.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <article
                className={`rounded-md border border-zinc-800 bg-zinc-950/60 p-3 ${
                  materialTab === "esteril" ? "ring-2 ring-amber-500/45 ring-offset-2 ring-offset-zinc-950" : ""
                }`}
              >
                <p className="fc-erp-eyebrow">Estéril</p>
                <p className="mt-2 text-lg font-bold tabular-nums text-zinc-100">
                  {fmtTon(tr.viagensResumo.total_toneladas_esteril)} t
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Viagens: {fmtInt(tr.viagensResumo.total_viagens_esteril)}
                </p>
              </article>
              <article
                className={`rounded-md border border-amber-500/25 bg-zinc-950/60 p-3 ${
                  materialTab === "rocha" ? "ring-2 ring-amber-500/45 ring-offset-2 ring-offset-zinc-950" : ""
                }`}
              >
                <p className="fc-erp-eyebrow text-amber-200/90">Rocha</p>
                <p className="mt-2 text-lg font-bold tabular-nums text-zinc-100">
                  {fmtTon(tr.viagensResumo.total_toneladas_rocha)} t
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Viagens: {fmtInt(tr.viagensResumo.total_viagens_rocha)}
                </p>
              </article>
              <article
                className={`rounded-md border border-zinc-700/80 bg-zinc-950/60 p-3 ${
                  materialTab === "todos" ? "ring-2 ring-zinc-500/40 ring-offset-2 ring-offset-zinc-950" : ""
                }`}
              >
                <p className="fc-erp-eyebrow">Total</p>
                <p className="mt-2 text-lg font-bold tabular-nums text-zinc-50">
                  {fmtTon(
                    Number(tr.viagensResumo.total_toneladas_esteril || 0) +
                      Number(tr.viagensResumo.total_toneladas_rocha || 0)
                  )}{" "}
                  t
                </p>
              </article>
            </div>
          </div>
        ) : !tr.viagensLoading && tr.viagensResumo ? (
          <p className="mt-6 text-sm leading-relaxed text-zinc-500">
            Sem toneladas com capacidade no período selecionado (apenas contagem de viagens, se houver, não entra neste
            bloco).
          </p>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">Resumo de viagens indisponível.</p>
        )}

        <div className="border-t border-zinc-800 pt-6">
          <p className="fc-erp-eyebrow">Planejado vs executado</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Metas do planejamento ativo (hoje dentro do período) frente às toneladas executadas nas viagens.
          </p>

          {tr.comparLoading ? (
            <div className="mt-6">
              <SkeletonRows rows={2} />
            </div>
          ) : tr.comparError ? (
            <div className="mt-6">
              <EmpresaModuleErrorPanel
                title="Planejado vs executado"
                description={tr.comparError}
                onRetry={() => {
                  void tr.refetchComparacao();
                }}
              />
            </div>
          ) : tr.comparacao ? (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <article className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="fc-erp-eyebrow">Meta total</p>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-zinc-100">{fmtTon(tr.metaPlanejadaTotal)} t</p>
                </article>
                <article className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="fc-erp-eyebrow">Executado total</p>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-zinc-100">{fmtTon(tr.executadoTotal)} t</p>
                </article>
                <article className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="fc-erp-eyebrow">% atingido (total)</p>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-amber-200/95">
                    {fmtPct(tr.comparacao.percentual_total)}%
                  </p>
                </article>
              </div>

              <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
                <div className="flex min-w-0 flex-1 flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
                  <div
                    className="h-44 w-44 shrink-0 rounded-full border-4 border-zinc-800 shadow-inner"
                    style={tr.planVsExecPieStyle}
                    role="img"
                    aria-label="Diagrama planejado versus executado: fatia âmbar é o executado face à meta"
                  />
                  <ul className="max-w-md space-y-2.5 text-sm text-zinc-300">
                    <li className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-amber-600" aria-hidden />
                      <span>
                        <span className="font-semibold text-zinc-100">Executado</span> — {fmtTon(tr.executadoTotal)} t
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-zinc-600" aria-hidden />
                      <span>
                        <span className="font-semibold text-zinc-100">Restante da meta</span> —{" "}
                        {tr.metaPlanejadaTotal > tr.executadoTotal
                          ? `${fmtTon(tr.metaPlanejadaTotal - tr.executadoTotal)} t`
                          : tr.metaPlanejadaTotal > 0
                            ? "0 t (meta atingida)"
                            : "—"}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full border border-zinc-600 bg-zinc-900"
                        aria-hidden
                      />
                      <span>
                        <span className="font-semibold text-zinc-100">Meta planejada</span> — {fmtTon(tr.metaPlanejadaTotal)} t
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="min-w-0 flex-1 lg:max-w-md">
                  <p className="fc-erp-eyebrow">Barra de atingimento</p>
                  <div
                    className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-800"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(tr.barWidthPct)}
                  >
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-amber-700 to-amber-500 transition-[width] duration-500"
                      style={{ width: `${tr.barWidthPct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Estéril {fmtPct(tr.comparacao.percentual_esteril)}% · Rocha {fmtPct(tr.comparacao.percentual_rocha)}%
                  </p>
                  {tr.metaPlanejadaTotal > 0 && tr.executadoTotal > tr.metaPlanejadaTotal ? (
                    <p className="mt-2 text-xs text-amber-200/90">Execução acima da meta no período planejado.</p>
                  ) : null}
                </div>
              </div>

              {tr.metaPlanejadaTotal <= 0 ? (
                <p className="mt-6 text-sm leading-relaxed text-amber-200/90">
                  Não há planejamento ativo para hoje ou as metas estão zeradas. Cadastre um período que inclua a data
                  atual e defina as metas abaixo.
                </p>
              ) : null}

              <form
                className="mt-8 grid max-w-2xl gap-4 border-t border-zinc-800 pt-6 sm:grid-cols-2"
                onSubmit={tr.submitPlanejamento}
              >
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
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={tr.planSaving}
                    className="fc-btn rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-50"
                  >
                    {tr.planSaving ? "Salvando…" : "Salvar planejamento da semana"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p className="mt-6 text-sm text-zinc-500">Indicadores de planejamento indisponíveis.</p>
          )}
        </div>
      </section>

      <div className="fc-card border-zinc-800/90 p-5 lg:p-6">
        <h3 className="text-base font-semibold text-zinc-100">Painel operacional</h3>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">Registros consolidados por tipo (exceto parte diária).</p>
        <div className="mt-4 grid gap-2 text-sm text-zinc-300 md:grid-cols-2">
          {(stats.por_tipo || [])
            .filter((item) => String(item.tipo || "").toLowerCase() !== "parte_diaria")
            .map((item) => (
              <p key={item.tipo} className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
                {item.tipo}: <span className="font-semibold text-zinc-100">{item.total}</span>
              </p>
            ))}
        </div>
      </div>

      <div className="fc-card border-zinc-800/90 p-5 lg:p-6">
        <h3 className="text-base font-semibold text-zinc-100">Últimos 7 dias</h3>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">Volume diário de lançamentos.</p>
        <div className="mt-4 space-y-2.5">
          {trend.map((d) => (
            <div key={d.dia} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs tabular-nums text-zinc-500">
                {new Date(d.dia).toLocaleDateString("pt-BR")}
              </span>
              <div className="h-3 min-w-0 flex-1 rounded-sm bg-zinc-800">
                <div
                  className="h-3 rounded-sm bg-amber-600/85"
                  style={{ width: `${Math.max(4, Math.min(100, d.total * 10))}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-zinc-400">{d.total}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/empresa/dashboard"
          className="fc-btn inline-flex rounded-md border border-zinc-600 px-4 py-3 text-center font-semibold text-zinc-200 hover:border-zinc-500"
        >
          Painel executivo
        </Link>
        <Link
          to="/dashboard"
          className="fc-btn inline-flex rounded-md border border-amber-500/40 bg-zinc-800/80 px-4 py-3 text-center font-semibold text-zinc-100 hover:border-amber-500/55"
        >
          Visão operacional completa
        </Link>
        <Link
          to="/empresa/relatorios"
          className="fc-btn inline-flex rounded-md border border-zinc-600 px-4 py-3 text-center font-semibold text-zinc-200"
        >
          Relatórios
        </Link>
      </div>
    </div>
  );
}

export default function EmpresaTransportePage() {
  return (
    <TransportProvider>
      <EmpresaTransportePageContent />
    </TransportProvider>
  );
}
