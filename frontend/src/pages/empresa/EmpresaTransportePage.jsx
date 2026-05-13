import { Link } from "react-router-dom";
import SkeletonRows from "../../components/SkeletonRows";
import { useEmpresaTransporte } from "../../hooks/empresa/useEmpresaTransporte";
import { useEmpresaTransporteProdutividade } from "../../hooks/empresa/useEmpresaTransporteProdutividade";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtTon = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

export default function EmpresaTransportePage() {
  const prod = useEmpresaTransporteProdutividade();
  const tr = useEmpresaTransporte();

  const pageLoading = prod.loading && !prod.stats;

  if (pageLoading) {
    return (
      <div className="space-y-4">
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

  if (!prod.stats) {
    return <p className="text-sm text-rose-300">Não foi possível carregar o módulo de transporte.</p>;
  }

  const { stats, trend, trendSummary, trendIcon, trendClass } = prod;

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-800/90 pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Módulo transporte</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Porto e produção</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Toneladas, metas, planejado x executado e produtividade. Filtros e estado são exclusivos desta rota.
        </p>
      </header>

      {tr.temAlertasTransporte ? (
        <div
          role="status"
          className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/35 p-4 text-sm text-amber-50 shadow-md shadow-black/20"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">Alertas operacionais</p>
          {tr.alertasTransporte.veiculos_sem_capacidade > 0 ? (
            <p className="flex items-start gap-2 font-medium">
              <span className="shrink-0" aria-hidden>
                ⚠️
              </span>
              <span>
                {tr.alertasTransporte.veiculos_sem_capacidade === 1
                  ? "1 veículo sem capacidade definida"
                  : `${fmtInt(tr.alertasTransporte.veiculos_sem_capacidade)} veículos sem capacidade definida`}
              </span>
            </p>
          ) : null}
          {tr.alertasTransporte.custo_alto ? (
            <p className="flex items-start gap-2 font-medium">
              <span className="shrink-0" aria-hidden>
                ⚠️
              </span>
              <span>Custo operacional elevado no período selecionado</span>
            </p>
          ) : null}
          {tr.alertasTransporte.meta_risco ? (
            <p className="flex items-start gap-2 font-medium">
              <span className="shrink-0" aria-hidden>
                ⚠️
              </span>
              <span>Produção abaixo da meta</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="transporte-produtividade" className="space-y-4">
        <h2 id="transporte-produtividade" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Produtividade e ritmo
        </h2>
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
      </section>

      <section
        className="fc-card border-cyan-500/25 bg-gradient-to-b from-slate-950/80 via-slate-950/60 to-slate-950/90 p-6 shadow-lg ring-1 ring-cyan-500/15"
        aria-labelledby="transporte-porto-title"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-200/90">Operação — Porto</p>
            <h2 id="transporte-porto-title" className="mt-1 text-xl font-semibold tracking-tight text-white">
              Transporte
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
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
                className={`fc-btn rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  tr.periodoFiltro === p.id
                    ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                    : "border-slate-600 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {tr.viagensLoading ? (
          <div className="mt-6">
            <SkeletonRows rows={2} />
          </div>
        ) : tr.viagensResumo &&
          Number(tr.viagensResumo.total_toneladas_esteril || 0) + Number(tr.viagensResumo.total_toneladas_rocha || 0) >
            0 ? (
          <div className="mt-6 rounded-xl border border-slate-700/80 bg-slate-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Toneladas no período</p>
            <p className="mt-1 text-xs text-slate-500">Com capacidade informada nas viagens apontadas.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <article className="rounded-lg border border-cyan-500/25 bg-slate-950/70 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Estéril</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-cyan-200">
                  {fmtTon(tr.viagensResumo.total_toneladas_esteril)} t
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Viagens: {fmtInt(tr.viagensResumo.total_viagens_esteril)}
                </p>
              </article>
              <article className="rounded-lg border border-amber-500/25 bg-slate-950/70 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Rocha</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-amber-200">
                  {fmtTon(tr.viagensResumo.total_toneladas_rocha)} t
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Viagens: {fmtInt(tr.viagensResumo.total_viagens_rocha)}
                </p>
              </article>
              <article className="rounded-lg border border-slate-600/60 bg-slate-950/70 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Total</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-white">
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
          <p className="mt-6 text-sm text-slate-500">
            Sem toneladas com capacidade no período selecionado (apenas contagem de viagens, se houver, não entra neste
            bloco).
          </p>
        ) : (
          <p className="mt-6 text-sm text-slate-500">Resumo de viagens indisponível.</p>
        )}

        <div className="mt-8 border-t border-slate-800/90 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-200/90">Planejado vs executado</p>
          <p className="mt-1 text-sm text-slate-400">
            Metas do planejamento ativo (hoje dentro do período) frente às toneladas executadas nas viagens.
          </p>

          {tr.comparLoading ? (
            <div className="mt-6">
              <SkeletonRows rows={2} />
            </div>
          ) : tr.comparacao ? (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <article className="rounded-xl border border-slate-600/40 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-400">Meta total</p>
                  <p className="mt-2 text-2xl font-bold text-white">{fmtTon(tr.metaPlanejadaTotal)} t</p>
                </article>
                <article className="rounded-xl border border-emerald-500/25 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-400">Executado total</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-300">{fmtTon(tr.executadoTotal)} t</p>
                </article>
                <article className="rounded-xl border border-violet-500/25 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-400">% atingido (total)</p>
                  <p className="mt-2 text-2xl font-bold text-violet-300">{fmtPct(tr.comparacao.percentual_total)}%</p>
                </article>
              </div>

              <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
                <div className="flex min-w-0 flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
                  <div
                    className="h-44 w-44 shrink-0 rounded-full border-4 border-slate-800 shadow-lg shadow-black/30"
                    style={tr.planVsExecPieStyle}
                    role="img"
                    aria-label="Pizza planejado versus executado: fatia verde é o executado face à meta"
                  />
                  <ul className="max-w-md space-y-2 text-sm text-slate-300">
                    <li className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                      <span>
                        <span className="font-semibold text-white">Executado</span> — {fmtTon(tr.executadoTotal)} t
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-slate-500" aria-hidden />
                      <span>
                        <span className="font-semibold text-white">Restante da meta</span> —{" "}
                        {tr.metaPlanejadaTotal > tr.executadoTotal
                          ? `${fmtTon(tr.metaPlanejadaTotal - tr.executadoTotal)} t`
                          : tr.metaPlanejadaTotal > 0
                          ? "0 t (meta atingida)"
                          : "—"}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full border border-slate-500 bg-slate-900"
                        aria-hidden
                      />
                      <span>
                        <span className="font-semibold text-white">Meta planejada</span> — {fmtTon(tr.metaPlanejadaTotal)} t
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="min-w-0 flex-1 lg:max-w-md">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Barra de atingimento</p>
                  <div
                    className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-800"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(tr.barWidthPct)}
                  >
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-[width] duration-500"
                      style={{ width: `${tr.barWidthPct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Estéril {fmtPct(tr.comparacao.percentual_esteril)}% · Rocha {fmtPct(tr.comparacao.percentual_rocha)}%
                  </p>
                  {tr.metaPlanejadaTotal > 0 && tr.executadoTotal > tr.metaPlanejadaTotal ? (
                    <p className="mt-2 text-xs text-emerald-200/90">Execução acima da meta no período planejado.</p>
                  ) : null}
                </div>
              </div>

              {tr.metaPlanejadaTotal <= 0 ? (
                <p className="mt-6 text-sm text-amber-200/90">
                  Não há planejamento ativo para hoje ou as metas estão zeradas. Cadastre um período que inclua a data
                  atual e defina as metas abaixo.
                </p>
              ) : null}

              <form
                className="mt-8 grid max-w-2xl gap-3 border-t border-slate-800/80 pt-6 sm:grid-cols-2"
                onSubmit={tr.submitPlanejamento}
              >
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  <span className="text-xs text-slate-500">Início</span>
                  <input
                    type="date"
                    required
                    className="fc-input rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                    value={tr.planForm.data_inicio}
                    onChange={(ev) => tr.setPlanForm((p) => ({ ...p, data_inicio: ev.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  <span className="text-xs text-slate-500">Fim</span>
                  <input
                    type="date"
                    required
                    className="fc-input rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                    value={tr.planForm.data_fim}
                    onChange={(ev) => tr.setPlanForm((p) => ({ ...p, data_fim: ev.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  <span className="text-xs text-slate-500">Meta estéril (t)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="fc-input rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                    value={tr.planForm.meta_esteril_ton}
                    onChange={(ev) => tr.setPlanForm((p) => ({ ...p, meta_esteril_ton: ev.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  <span className="text-xs text-slate-500">Meta rocha (t)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="fc-input rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                    value={tr.planForm.meta_rocha_ton}
                    onChange={(ev) => tr.setPlanForm((p) => ({ ...p, meta_rocha_ton: ev.target.value }))}
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={tr.planSaving}
                    className="fc-btn rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {tr.planSaving ? "Salvando…" : "Salvar planejamento da semana"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p className="mt-6 text-sm text-slate-500">Indicadores de planejamento indisponíveis.</p>
          )}
        </div>
      </section>

      <div className="fc-card border-blue-500/20 p-5">
        <h3 className="mb-3 font-semibold text-white">Painel operacional</h3>
        <p className="mb-3 text-xs text-slate-500">Registros consolidados por tipo (exceto parte diária).</p>
        <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
          {(stats.por_tipo || [])
            .filter((item) => String(item.tipo || "").toLowerCase() !== "parte_diaria")
            .map((item) => (
              <p key={item.tipo} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                {item.tipo}: <span className="font-semibold text-slate-100">{item.total}</span>
              </p>
            ))}
        </div>
      </div>

      <div className="fc-card border-blue-500/20 p-5">
        <h3 className="mb-2 font-semibold text-white">Últimos 7 dias</h3>
        <p className="mb-3 text-xs text-slate-500">Gráfico de volume diário de lançamentos.</p>
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
        <Link
          to="/empresa/dashboard"
          className="fc-btn inline-flex rounded-xl border border-slate-600 px-4 py-3 text-center font-semibold text-slate-200"
        >
          Painel executivo
        </Link>
        <Link to="/dashboard" className="fc-btn inline-flex rounded-xl bg-blue-600 px-4 py-3 text-center font-semibold">
          Visão operacional completa
        </Link>
        <Link
          to="/dashboard/relatorios"
          className="fc-btn inline-flex rounded-xl border border-cyan-500/50 px-4 py-3 text-center font-semibold text-cyan-100"
        >
          Relatórios
        </Link>
      </div>
    </div>
  );
}
