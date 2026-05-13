import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractApiErrorMessage } from "../../services/api";
import SkeletonRows from "../../components/SkeletonRows";
import { emitToast } from "../../services/uiEvents";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtTon = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const fmtBRL = (n) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmtLitros = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const veiculoCombustivelLabel = (row) => {
  const nome = String(row?.veiculo_nome ?? "").trim();
  const placa = String(row?.veiculo_placa ?? "").trim();
  if (nome && placa) return `${nome} — ${placa}`;
  if (nome) return nome;
  if (placa) return placa;
  if (row?.veiculo_id != null) return `Veículo #${row.veiculo_id}`;
  return "Sem veículo";
};

const shortcutClass =
  "group flex flex-col gap-1 rounded-xl border border-slate-700/80 bg-slate-900/50 p-4 transition hover:border-blue-500/40 hover:bg-slate-900/80";

export default function EmpresaExecutiveDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viagensResumo, setViagensResumo] = useState(null);
  const [viagensLoading, setViagensLoading] = useState(true);
  const [comparacao, setComparacao] = useState(null);
  const [comparLoading, setComparLoading] = useState(true);
  const [combustivelResumo, setCombustivelResumo] = useState(null);
  const [combustivelLoading, setCombustivelLoading] = useState(true);
  const [alertas, setAlertas] = useState({
    veiculos_sem_capacidade: 0,
    custo_alto: false,
    meta_risco: false,
  });

  const loadViagensResumo = useCallback(async () => {
    setViagensLoading(true);
    try {
      const { data } = await api.get("/dashboard/viagens/resumo", { params: { periodo: "semana" } });
      setViagensResumo({
        total_toneladas_esteril: data?.total_toneladas_esteril ?? 0,
        total_toneladas_rocha: data?.total_toneladas_rocha ?? 0,
      });
    } catch {
      setViagensResumo(null);
      emitToast("Não foi possível carregar o resumo de transporte.", "warning");
    } finally {
      setViagensLoading(false);
    }
  }, []);

  const loadCombustivelResumo = useCallback(async () => {
    setCombustivelLoading(true);
    try {
      const { data } = await api.get("/dashboard/combustiveis/resumo", {
        params: { periodo: "mes", group_by: "veiculo" },
      });
      setCombustivelResumo({
        total_litros: data?.total_litros ?? 0,
        total_valor: data?.total_valor ?? 0,
        preco_medio_litro: data?.preco_medio_litro,
        alertas_combustivel: {
          consumo_elevado: Array.isArray(data?.alertas_combustivel?.consumo_elevado)
            ? data.alertas_combustivel.consumo_elevado
            : [],
          preco_acima_media: Boolean(data?.alertas_combustivel?.preco_acima_media),
          consumo_alto_periodo: Boolean(data?.alertas_combustivel?.consumo_alto_periodo),
          preco_fora_media_historico: Boolean(data?.alertas_combustivel?.preco_fora_media_historico),
        },
      });
    } catch (err) {
      setCombustivelResumo(null);
      emitToast(extractApiErrorMessage(err) || "Não foi possível carregar o resumo de combustível.", "warning");
    } finally {
      setCombustivelLoading(false);
    }
  }, []);

  const loadAlertas = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/alertas", { params: { periodo: "semana" } });
      setAlertas({
        veiculos_sem_capacidade: Number(data?.veiculos_sem_capacidade ?? 0),
        custo_alto: Boolean(data?.custo_alto),
        meta_risco: Boolean(data?.meta_risco),
      });
    } catch {
      setAlertas({ veiculos_sem_capacidade: 0, custo_alto: false, meta_risco: false });
    }
  }, []);

  const loadComparacao = useCallback(async () => {
    setComparLoading(true);
    try {
      const { data } = await api.get("/dashboard/viagens/comparacao");
      setComparacao({
        planejado_esteril: data?.planejado_esteril ?? 0,
        planejado_rocha: data?.planejado_rocha ?? 0,
        executado_esteril: data?.executado_esteril ?? 0,
        executado_rocha: data?.executado_rocha ?? 0,
        percentual_esteril: data?.percentual_esteril ?? 0,
        percentual_rocha: data?.percentual_rocha ?? 0,
        percentual_total: data?.percentual_total ?? 0,
      });
    } catch {
      setComparacao(null);
      emitToast("Não foi possível carregar meta vs executado.", "warning");
    } finally {
      setComparLoading(false);
    }
  }, []);

  useEffect(() => {
    api
      .get("/dashboard/stats")
      .then(({ data }) => setStats(data))
      .catch(() => emitToast("Não foi possível carregar o painel executivo.", "warning"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    void loadViagensResumo();
    void loadCombustivelResumo();
    void loadAlertas();
    void loadComparacao();
  }, [loading, loadViagensResumo, loadCombustivelResumo, loadAlertas, loadComparacao]);

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

  const temAlertasDashboard = useMemo(
    () => alertas.veiculos_sem_capacidade > 0 || alertas.meta_risco || alertas.custo_alto,
    [alertas]
  );

  const temAlertasCombustivel = useMemo(() => {
    if (combustivelLoading || !combustivelResumo?.alertas_combustivel) return false;
    const a = combustivelResumo.alertas_combustivel;
    return (
      (a.consumo_elevado?.length ?? 0) > 0 ||
      Boolean(a.preco_acima_media) ||
      Boolean(a.consumo_alto_periodo) ||
      Boolean(a.preco_fora_media_historico)
    );
  }, [combustivelLoading, combustivelResumo]);

  const mostrarBarraAlertas = temAlertasDashboard || temAlertasCombustivel;

  const metaPlanejadaTotal = comparacao
    ? Number(comparacao.planejado_esteril || 0) + Number(comparacao.planejado_rocha || 0)
    : 0;
  const executadoTotal = comparacao
    ? Number(comparacao.executado_esteril || 0) + Number(comparacao.executado_rocha || 0)
    : 0;
  const barWidthPct = Math.min(100, Math.max(0, Number(comparacao?.percentual_total ?? 0)));

  const planVsExecPieStyle = useMemo(() => {
    if (!comparacao) return { background: "conic-gradient(#334155 0% 100%)" };
    const plan = Math.max(0, metaPlanejadaTotal);
    const exec = Math.max(0, executadoTotal);
    if (plan <= 0 && exec <= 0) return { background: "conic-gradient(#334155 0% 100%)" };
    if (plan <= 0) {
      return { background: "conic-gradient(#22c55e 0 100%)" };
    }
    const pctExec = Math.min(100, (exec / plan) * 100);
    return {
      background: `conic-gradient(#22c55e 0 ${pctExec}%, #475569 ${pctExec}% 100%)`,
    };
  }, [comparacao, metaPlanejadaTotal, executadoTotal]);

  const parteDiariaRegistros = useMemo(() => {
    const arr = stats?.por_tipo || [];
    const hit = arr.find((x) => String(x.tipo || "").toLowerCase() === "parte_diaria");
    return Number(hit?.total ?? 0);
  }, [stats]);

  const tonTotaisSemana = useMemo(() => {
    if (!viagensResumo) return 0;
    return Number(viagensResumo.total_toneladas_esteril || 0) + Number(viagensResumo.total_toneladas_rocha || 0);
  }, [viagensResumo]);

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
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Painel executivo</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Visão consolidada</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Indicadores sintéticos da operação. Detalhes, filtros e tabelas permanecem nas rotas modulares e na visão
          operacional completa.
        </p>
      </header>

      {mostrarBarraAlertas ? (
        <div
          role="status"
          className="rounded-lg border-l-4 border-amber-500 bg-amber-950/25 px-4 py-3 text-sm text-amber-50 shadow-sm"
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">Alertas operacionais</p>
          <ul className="space-y-2">
            {alertas.veiculos_sem_capacidade > 0 ? (
              <li className="flex gap-2 font-medium">
                <span aria-hidden>⚠️</span>
                <span>
                  {alertas.veiculos_sem_capacidade === 1
                    ? "1 veículo sem capacidade definida"
                    : `${fmtInt(alertas.veiculos_sem_capacidade)} veículos sem capacidade definida`}
                </span>
              </li>
            ) : null}
            {alertas.custo_alto ? (
              <li className="flex gap-2 font-medium">
                <span aria-hidden>⚠️</span>
                <span>Custo operacional acima do esperado</span>
              </li>
            ) : null}
            {alertas.meta_risco ? (
              <li className="flex gap-2 font-medium">
                <span aria-hidden>⚠️</span>
                <span>Produção abaixo da meta planejada</span>
              </li>
            ) : null}
            {!combustivelLoading && combustivelResumo?.alertas_combustivel?.consumo_elevado?.length
              ? combustivelResumo.alertas_combustivel.consumo_elevado.map((row) => (
                  <li key={`comb-${row.veiculo_id ?? "x"}`} className="flex gap-2 font-medium">
                    <span aria-hidden>⚠️</span>
                    <span>Consumo elevado — {veiculoCombustivelLabel(row)}</span>
                  </li>
                ))
              : null}
            {!combustivelLoading && combustivelResumo?.alertas_combustivel?.preco_acima_media ? (
              <li className="flex gap-2 font-medium">
                <span aria-hidden>⚠️</span>
                <span>Preço do combustível acima da média</span>
              </li>
            ) : null}
            {!combustivelLoading && combustivelResumo?.alertas_combustivel?.consumo_alto_periodo ? (
              <li className="flex gap-2 font-medium">
                <span aria-hidden>⚠️</span>
                <span>Ritmo de consumo acima da média histórica</span>
              </li>
            ) : null}
            {!combustivelLoading && combustivelResumo?.alertas_combustivel?.preco_fora_media_historico ? (
              <li className="flex gap-2 font-medium">
                <span aria-hidden>⚠️</span>
                <span>Preço fora da média histórica</span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

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
            <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-500/90">Transporte · semana</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-white">
              {viagensLoading ? "—" : `${fmtTon(tonTotaisSemana)} t`}
            </p>
            <p className="mt-2 text-xs text-slate-500">Toneladas movimentadas na semana (com capacidade informada).</p>
          </div>
        </article>

        <article className="fc-card flex flex-col justify-between border-emerald-900/40 bg-gradient-to-b from-slate-950/90 to-slate-950/50 p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500/90">Combustível · mês</p>
            {combustivelLoading ? (
              <p className="mt-3 text-lg text-slate-500">Carregando…</p>
            ) : combustivelResumo ? (
              <>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-white">{fmtLitros(combustivelResumo.total_litros)} L</p>
                <p className="mt-1 text-lg font-medium tabular-nums text-emerald-200/90">{fmtBRL(combustivelResumo.total_valor)}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Preço médio{" "}
                  {combustivelResumo.preco_medio_litro != null && Number.isFinite(Number(combustivelResumo.preco_medio_litro))
                    ? fmtBRL(combustivelResumo.preco_medio_litro)
                    : "—"}{" "}
                  / L
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Indisponível</p>
            )}
          </div>
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

        <article className="fc-card border-slate-700/70 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Meta vs. executado</p>
          {comparLoading ? (
            <div className="mt-6">
              <SkeletonRows rows={2} />
            </div>
          ) : comparacao ? (
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="h-28 w-28 shrink-0 rounded-full border-2 border-slate-700 shadow-inner"
                  style={planVsExecPieStyle}
                  role="img"
                  aria-label="Executado em relação à meta"
                />
                <div className="text-sm text-slate-300">
                  <p className="tabular-nums text-lg font-semibold text-white">{fmtPct(comparacao.percentual_total)}%</p>
                  <p className="text-xs text-slate-500">atingimento total</p>
                </div>
              </div>
              <div className="w-full min-w-0 flex-1 space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Executado</span>
                  <span className="tabular-nums text-slate-300">{fmtTon(executadoTotal)} t</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-800"
                  role="progressbar"
                  aria-valuenow={Math.round(barWidthPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-[width]"
                    style={{ width: `${barWidthPct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">Meta planejada {fmtTon(metaPlanejadaTotal)} t</p>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-500">Indicador indisponível.</p>
          )}
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
            <span className="text-xs text-slate-500">Módulo em expansão</span>
          </Link>
          <Link to="/empresa/combustivel" className={shortcutClass}>
            <span className="text-sm font-semibold text-white">Combustível</span>
            <span className="text-xs text-slate-500">Análise detalhada</span>
          </Link>
          <Link to="/empresa/parte-diaria" className={shortcutClass}>
            <span className="text-sm font-semibold text-white">Parte diária</span>
            <span className="text-xs text-slate-500">Documentação operacional</span>
          </Link>
          <Link to="/dashboard" className={shortcutClass}>
            <span className="text-sm font-semibold text-white">Visão operacional completa</span>
            <span className="text-xs text-slate-500">Painel legado com todos os blocos</span>
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
