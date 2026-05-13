import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import SkeletonRows from "../components/SkeletonRows";
import { emitToast } from "../services/uiEvents";

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

/** Faixas heurísticas em R$/t (menor = melhor eficiência de combustível por tonelada transportada). */
const custoPorToneladaTier = (custoPorTonelada) => {
  if (custoPorTonelada == null || !Number.isFinite(Number(custoPorTonelada))) return "neutral";
  const v = Number(custoPorTonelada);
  if (v <= 0) return "neutral";
  if (v < 120) return "low";
  if (v < 280) return "medium";
  return "high";
};

/** Segunda a domingo (data local) em YYYY-MM-DD. */
const defaultWeekRangeLocal = () => {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { data_inicio: ymd(monday), data_fim: ymd(sunday) };
};

const PERIODOS_API_COMBUSTIVEL = new Set(["dia", "semana", "mes", "ano"]);

/** Garante query `periodo` válida para /dashboard/combustiveis/resumo (default semana). */
const normalizePeriodoCombustivel = (v) => {
  const p = String(v ?? "semana").trim().toLowerCase();
  return PERIODOS_API_COMBUSTIVEL.has(p) ? p : "semana";
};

export default function ManagerDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viagensResumo, setViagensResumo] = useState(null);
  const [viagensLoading, setViagensLoading] = useState(true);
  const [periodoViagens, setPeriodoViagens] = useState("semana");
  const [comparacao, setComparacao] = useState(null);
  const [comparLoading, setComparLoading] = useState(true);
  const [planForm, setPlanForm] = useState(() => ({
    ...defaultWeekRangeLocal(),
    meta_esteril_ton: "",
    meta_rocha_ton: "",
  }));
  const [planSaving, setPlanSaving] = useState(false);
  const [custoOp, setCustoOp] = useState(null);
  const [custoOpLoading, setCustoOpLoading] = useState(true);
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
      const { data } = await api.get("/dashboard/viagens/resumo", {
        params: { periodo: periodoViagens },
      });
      setViagensResumo({
        total_viagens_esteril: data?.total_viagens_esteril ?? 0,
        total_viagens_rocha: data?.total_viagens_rocha ?? 0,
        total_toneladas_esteril: data?.total_toneladas_esteril ?? 0,
        total_toneladas_rocha: data?.total_toneladas_rocha ?? 0,
      });
    } catch {
      setViagensResumo(null);
      emitToast("Não foi possível carregar o resumo de viagens.", "warning");
    } finally {
      setViagensLoading(false);
    }
  }, [periodoViagens]);

  const loadCustoOperacional = useCallback(async () => {
    setCustoOpLoading(true);
    try {
      const { data } = await api.get("/dashboard/custo-operacional", {
        params: { periodo: periodoViagens },
      });
      setCustoOp({
        custo_total: data?.custo_total ?? 0,
        toneladas_total: data?.toneladas_total ?? 0,
        custo_por_tonelada: data?.custo_por_tonelada,
      });
    } catch {
      setCustoOp(null);
      emitToast("Não foi possível carregar o custo operacional.", "warning");
    } finally {
      setCustoOpLoading(false);
    }
  }, [periodoViagens]);

  const loadCombustivelResumo = useCallback(async () => {
    setCombustivelLoading(true);
    const periodo = normalizePeriodoCombustivel(periodoViagens);
    try {
      const { data } = await api.get("/dashboard/combustiveis/resumo", {
        params: { periodo, group_by: "veiculo" },
      });
      setCombustivelResumo({
        total_litros: data?.total_litros ?? 0,
        total_valor: data?.total_valor ?? 0,
        preco_medio_litro: data?.preco_medio_litro,
        por_veiculo: Array.isArray(data?.por_veiculo) ? data.por_veiculo : [],
        alertas_combustivel: {
          consumo_elevado: Array.isArray(data?.alertas_combustivel?.consumo_elevado)
            ? data.alertas_combustivel.consumo_elevado
            : [],
          preco_acima_media: Boolean(data?.alertas_combustivel?.preco_acima_media),
        },
      });
    } catch {
      setCombustivelResumo(null);
      emitToast("Sem dados de combustível no período", "warning");
    } finally {
      setCombustivelLoading(false);
    }
  }, [periodoViagens]);

  const loadAlertas = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/alertas", {
        params: { periodo: periodoViagens },
      });
      setAlertas({
        veiculos_sem_capacidade: Number(data?.veiculos_sem_capacidade ?? 0),
        custo_alto: Boolean(data?.custo_alto),
        meta_risco: Boolean(data?.meta_risco),
      });
    } catch {
      setAlertas({ veiculos_sem_capacidade: 0, custo_alto: false, meta_risco: false });
    }
  }, [periodoViagens]);

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
      emitToast("Não foi possível carregar planejado vs executado.", "warning");
    } finally {
      setComparLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get("/dashboard/stats")
      .then(({ data }) => setStats(data))
      .catch(() => emitToast("Não foi possível carregar o dashboard agora.", "warning"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    void loadViagensResumo();
  }, [loading, loadViagensResumo]);

  useEffect(() => {
    if (loading) return;
    void loadCustoOperacional();
  }, [loading, loadCustoOperacional]);

  useEffect(() => {
    if (loading) return;
    void loadCombustivelResumo();
  }, [loading, loadCombustivelResumo]);

  useEffect(() => {
    if (loading) return;
    void loadAlertas();
  }, [loading, loadAlertas]);

  useEffect(() => {
    if (loading) return;
    void loadComparacao();
  }, [loading, loadComparacao]);

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

  const temAlertasDashboard = useMemo(
    () =>
      alertas.veiculos_sem_capacidade > 0 || alertas.custo_alto || alertas.meta_risco,
    [alertas]
  );

  const temAlertasCombustivel = useMemo(() => {
    if (combustivelLoading || !combustivelResumo?.alertas_combustivel) return false;
    const a = combustivelResumo.alertas_combustivel;
    return (a.consumo_elevado?.length ?? 0) > 0 || Boolean(a.preco_acima_media);
  }, [combustivelLoading, combustivelResumo]);

  const mostrarBarraAlertas = temAlertasDashboard || temAlertasCombustivel;

  const metaPlanejadaTotal = comparacao
    ? Number(comparacao.planejado_esteril || 0) + Number(comparacao.planejado_rocha || 0)
    : 0;
  const executadoTotal = comparacao
    ? Number(comparacao.executado_esteril || 0) + Number(comparacao.executado_rocha || 0)
    : 0;
  const barWidthPct = Math.min(100, Math.max(0, Number(comparacao?.percentual_total ?? 0)));

  const custoTier = useMemo(
    () => custoPorToneladaTier(custoOp?.custo_por_tonelada),
    [custoOp?.custo_por_tonelada]
  );
  const custoCardStyles = useMemo(() => {
    if (custoTier === "low") {
      return {
        wrap: "border-emerald-500/45 bg-gradient-to-br from-emerald-950/35 to-slate-900/80 shadow-emerald-900/20",
        accent: "text-emerald-300",
        pill: "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30",
      };
    }
    if (custoTier === "medium") {
      return {
        wrap: "border-amber-500/45 bg-gradient-to-br from-amber-950/25 to-slate-900/80 shadow-amber-900/15",
        accent: "text-amber-200",
        pill: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/35",
      };
    }
    if (custoTier === "high") {
      return {
        wrap: "border-red-500/45 bg-gradient-to-br from-red-950/30 to-slate-900/80 shadow-red-900/20",
        accent: "text-red-300",
        pill: "bg-red-500/20 text-red-100 ring-1 ring-red-500/35",
      };
    }
    return {
      wrap: "border-slate-600/60 bg-slate-950/70",
      accent: "text-slate-200",
      pill: "bg-slate-800/80 text-slate-300 ring-1 ring-slate-600/50",
    };
  }, [custoTier]);

  const pieStyle = useMemo(() => {
    if (!viagensResumo) return { background: "conic-gradient(#334155 0% 100%)" };
    const te = Number(viagensResumo.total_toneladas_esteril || 0);
    const tr = Number(viagensResumo.total_toneladas_rocha || 0);
    const sumT = te + tr;
    const ve = Number(viagensResumo.total_viagens_esteril || 0);
    const vr = Number(viagensResumo.total_viagens_rocha || 0);
    const useTons = sumT > 0;
    const a = useTons ? te : ve;
    const b = useTons ? tr : vr;
    const total = a + b;
    if (total <= 0) return { background: "conic-gradient(#334155 0% 100%)" };
    const pct = (a / total) * 100;
    return {
      background: `conic-gradient(#06b6d4 0 ${pct}%, #f59e0b ${pct}% 100%)`,
    };
  }, [viagensResumo]);

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
      {mostrarBarraAlertas ? (
        <div
          role="status"
          className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/35 p-4 text-sm text-amber-50 shadow-md shadow-black/20"
        >
          {alertas.veiculos_sem_capacidade > 0 ? (
            <p className="flex items-start gap-2 font-medium">
              <span className="shrink-0" aria-hidden>
                ⚠️
              </span>
              <span>
                {alertas.veiculos_sem_capacidade === 1
                  ? "1 veículo sem capacidade definida"
                  : `${fmtInt(alertas.veiculos_sem_capacidade)} veículos sem capacidade definida`}
              </span>
            </p>
          ) : null}
          {alertas.custo_alto ? (
            <p className="flex items-start gap-2 font-medium">
              <span className="shrink-0" aria-hidden>
                ⚠️
              </span>
              <span>Custo operacional alto no período selecionado</span>
            </p>
          ) : null}
          {alertas.meta_risco ? (
            <p className="flex items-start gap-2 font-medium">
              <span className="shrink-0" aria-hidden>
                ⚠️
              </span>
              <span>Produção abaixo da meta</span>
            </p>
          ) : null}
          {!combustivelLoading && combustivelResumo?.alertas_combustivel?.consumo_elevado?.length
            ? combustivelResumo.alertas_combustivel.consumo_elevado.map((row) => (
                <p key={`comb-consumo-${row.veiculo_id ?? "x"}`} className="flex items-start gap-2 font-medium">
                  <span>⚠️ Consumo elevado no veículo {veiculoCombustivelLabel(row)}</span>
                </p>
              ))
            : null}
          {!combustivelLoading && combustivelResumo?.alertas_combustivel?.preco_acima_media ? (
            <p className="flex items-start gap-2 font-medium">
              <span>⚠️ Preço do combustível acima da média</span>
            </p>
          ) : null}
        </div>
      ) : null}

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

      <section className="fc-card border-emerald-500/25 p-5" aria-labelledby="consumo-combustivel-title">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-emerald-200/90">Abastecimentos</p>
            <h2 id="consumo-combustivel-title" className="mt-1 text-lg font-semibold text-white">
              Consumo de Combustível
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Mesmo período que <span className="text-slate-300">Produção de Transporte</span> (
              {periodoViagens === "dia" ? "Dia" : periodoViagens === "mes" ? "Mês" : "Semana"}).
            </p>
          </div>
        </div>
        {combustivelLoading ? (
          <div className="mt-2">
            <SkeletonRows rows={2} />
          </div>
        ) : combustivelResumo ? (
          <>
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              <article className="rounded-xl border border-emerald-500/30 bg-slate-950/55 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Total litros</p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">{fmtLitros(combustivelResumo.total_litros)}</p>
                <p className="mt-1 text-xs text-slate-500">Litros abastecidos no período.</p>
              </article>
              <article className="rounded-xl border border-emerald-500/30 bg-slate-950/55 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Total valor (R$)</p>
                <p className="mt-2 text-2xl font-bold text-white">{fmtBRL(combustivelResumo.total_valor)}</p>
                <p className="mt-1 text-xs text-slate-500">Soma dos valores registrados.</p>
              </article>
              <article className="rounded-xl border border-emerald-500/30 bg-slate-950/55 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Preço médio por litro</p>
                <p className="mt-2 text-2xl font-bold text-emerald-200">
                  {combustivelResumo.preco_medio_litro != null &&
                  Number.isFinite(Number(combustivelResumo.preco_medio_litro)) ? (
                    <>
                      {fmtBRL(combustivelResumo.preco_medio_litro)}
                      <span className="text-base font-semibold text-slate-400"> / L</span>
                    </>
                  ) : (
                    "—"
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">Quando não há litros no período, não há média.</p>
              </article>
            </div>

            {combustivelResumo.por_veiculo?.length ? (
              <div className="mt-8 border-t border-emerald-500/20 pt-6">
                <h3 className="text-sm font-semibold text-white">Consumo por veículo (top 5)</h3>
                <p className="mt-1 text-xs text-slate-500">Ordenado pelo maior volume de litros no período.</p>
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-700/80">
                  <table className="w-full min-w-[480px] text-left text-sm text-slate-200">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-950/80 text-xs font-medium uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-2.5">Veículo</th>
                        <th className="px-3 py-2.5">Litros</th>
                        <th className="px-3 py-2.5">Valor</th>
                        <th className="px-3 py-2.5">R$/litro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combustivelResumo.por_veiculo.map((row) => (
                        <tr key={`cv-${row.veiculo_id ?? "x"}`} className="border-b border-slate-800/90 last:border-b-0">
                          <td className="px-3 py-2.5 font-medium text-slate-100">{veiculoCombustivelLabel(row)}</td>
                          <td className="px-3 py-2.5 tabular-nums">{fmtLitros(row.total_litros)}</td>
                          <td className="px-3 py-2.5 tabular-nums">{fmtBRL(row.total_valor)}</td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {row.preco_medio_litro != null && Number.isFinite(Number(row.preco_medio_litro))
                              ? fmtBRL(row.preco_medio_litro)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Sem dados de combustível no período</p>
        )}
      </section>

      <section
        className={`fc-card p-6 shadow-lg ring-1 ring-black/20 transition-colors ${custoCardStyles.wrap}`}
        aria-labelledby="custo-por-tonelada-title"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Indicador de eficiência operacional
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="custo-por-tonelada-title" className="text-xl font-semibold text-white md:text-2xl">
              Custo por tonelada
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Mesmo período do resumo de viagens (Dia / Semana / Mês) selecionado na secção{" "}
              <span className="text-slate-300">Produção de Transporte</span> abaixo.
            </p>
          </div>
          <span
            className={`inline-flex w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${custoCardStyles.pill}`}
          >
            {custoTier === "low"
              ? "Custo baixo"
              : custoTier === "medium"
              ? "Custo médio"
              : custoTier === "high"
              ? "Custo alto"
              : "Sem referência"}
          </span>
        </div>

        {custoOpLoading ? (
          <div className="mt-6">
            <SkeletonRows rows={2} />
          </div>
        ) : custoOp ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <article className="rounded-xl border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-wider text-slate-400">Custo total</p>
              <p className="mt-2 text-2xl font-bold text-white">{fmtBRL(custoOp.custo_total)}</p>
            </article>
            <article className="rounded-xl border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-wider text-slate-400">Toneladas total</p>
              <p className="mt-2 text-2xl font-bold text-white">{fmtTon(custoOp.toneladas_total)} t</p>
            </article>
            <article className="rounded-xl border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-wider text-slate-400">Custo por tonelada</p>
              <p className={`mt-2 text-2xl font-bold ${custoCardStyles.accent}`}>
                {custoOp.custo_por_tonelada != null && Number.isFinite(Number(custoOp.custo_por_tonelada)) ? (
                  <>
                    {fmtBRL(custoOp.custo_por_tonelada)}
                    <span className="text-base font-semibold text-slate-400"> / t</span>
                  </>
                ) : (
                  "—"
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">R$/t quando há toneladas no período.</p>
            </article>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Indicador de custo operacional indisponível.</p>
        )}
      </section>

      <section className="fc-card border-blue-500/20 p-5" aria-labelledby="producao-transporte-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-blue-200">Viagens apontadas</p>
            <h2 id="producao-transporte-title" className="mt-1 text-lg font-semibold text-white">
              Produção de Transporte
            </h2>
            <p className="mt-1 text-sm text-slate-400">Resumo por período (mesma base do relatório de viagens).</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2" role="group" aria-label="Período do resumo">
            {[
              { id: "dia", label: "Dia" },
              { id: "semana", label: "Semana" },
              { id: "mes", label: "Mês" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodoViagens(p.id)}
                className={`fc-btn rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  periodoViagens === p.id
                    ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                    : "border-slate-600 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {viagensLoading ? (
          <div className="mt-6">
            <SkeletonRows rows={3} />
          </div>
        ) : viagensResumo ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-cyan-500/25 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Total viagens estéril</p>
                <p className="mt-2 text-2xl font-bold text-cyan-300">{fmtInt(viagensResumo.total_viagens_esteril)}</p>
              </article>
              <article className="rounded-xl border border-amber-500/25 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Total viagens rocha</p>
                <p className="mt-2 text-2xl font-bold text-amber-300">{fmtInt(viagensResumo.total_viagens_rocha)}</p>
              </article>
              <article className="rounded-xl border border-cyan-500/20 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Total toneladas estéril</p>
                <p className="mt-2 text-2xl font-bold text-cyan-200">{fmtTon(viagensResumo.total_toneladas_esteril)} t</p>
              </article>
              <article className="rounded-xl border border-amber-500/20 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Total toneladas rocha</p>
                <p className="mt-2 text-2xl font-bold text-amber-200">{fmtTon(viagensResumo.total_toneladas_rocha)} t</p>
              </article>
            </div>

            <div className="mt-8 flex flex-col items-center gap-6 border-t border-slate-800/80 pt-6 md:flex-row md:items-center md:justify-center md:gap-10">
              <div
                className="h-40 w-40 shrink-0 rounded-full border-4 border-slate-800 shadow-lg shadow-black/30"
                style={pieStyle}
                role="img"
                aria-label="Distribuição estéril versus rocha"
              />
              <ul className="space-y-3 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-cyan-500" aria-hidden />
                  <span>
                    <span className="font-semibold text-white">Estéril</span> — {fmtInt(viagensResumo.total_viagens_esteril)}{" "}
                    viagens · {fmtTon(viagensResumo.total_toneladas_esteril)} t
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-amber-500" aria-hidden />
                  <span>
                    <span className="font-semibold text-white">Rocha</span> — {fmtInt(viagensResumo.total_viagens_rocha)}{" "}
                    viagens · {fmtTon(viagensResumo.total_toneladas_rocha)} t
                  </span>
                </li>
                <li className="pt-1 text-xs text-slate-500">
                  A fatia da pizza reflete toneladas; se não houver capacidade cadastrada, usa a contagem de viagens.
                </li>
              </ul>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Resumo de viagens indisponível.</p>
        )}
      </section>

      <section className="fc-card border-blue-500/20 p-5" aria-labelledby="planejado-executado-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-blue-200">Metas da semana</p>
            <h2 id="planejado-executado-title" className="mt-1 text-lg font-semibold text-white">
              Planejado vs Executado
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Compara metas do planejamento vigente (hoje dentro do período) com toneladas executadas nas viagens.
            </p>
          </div>
        </div>

        {comparLoading ? (
          <div className="mt-6">
            <SkeletonRows rows={2} />
          </div>
        ) : comparacao ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <article className="rounded-xl border border-slate-600/40 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Meta total</p>
                <p className="mt-2 text-2xl font-bold text-white">{fmtTon(metaPlanejadaTotal)} t</p>
              </article>
              <article className="rounded-xl border border-emerald-500/25 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">Executado total</p>
                <p className="mt-2 text-2xl font-bold text-emerald-300">{fmtTon(executadoTotal)} t</p>
              </article>
              <article className="rounded-xl border border-violet-500/25 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400">% atingido (total)</p>
                <p className="mt-2 text-2xl font-bold text-violet-300">{fmtPct(comparacao.percentual_total)}%</p>
              </article>
            </div>

            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Planejado vs executado</p>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(barWidthPct)}>
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-[width] duration-500"
                  style={{ width: `${barWidthPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Estéril {fmtPct(comparacao.percentual_esteril)}% · Rocha {fmtPct(comparacao.percentual_rocha)}%
              </p>
            </div>

            {metaPlanejadaTotal <= 0 ? (
              <p className="mt-4 text-sm text-amber-200/90">
                Não há planejamento ativo para hoje ou as metas estão zeradas. Cadastre um período que inclua a data
                atual e defina as metas abaixo.
              </p>
            ) : null}

            <form
              className="mt-6 grid max-w-2xl gap-3 border-t border-slate-800/80 pt-6 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setPlanSaving(true);
                try {
                  await api.post("/dashboard/planejamento", {
                    data_inicio: planForm.data_inicio,
                    data_fim: planForm.data_fim,
                    meta_esteril_ton: Number(planForm.meta_esteril_ton) || 0,
                    meta_rocha_ton: Number(planForm.meta_rocha_ton) || 0,
                  });
                  emitToast("Planejamento salvo.", "success");
                  await loadComparacao();
                } catch (err) {
                  const msg = err?.response?.data?.message || "Não foi possível salvar o planejamento.";
                  emitToast(msg, "warning");
                } finally {
                  setPlanSaving(false);
                }
              }}
            >
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                <span className="text-xs text-slate-500">Início</span>
                <input
                  type="date"
                  required
                  className="fc-input rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                  value={planForm.data_inicio}
                  onChange={(ev) => setPlanForm((p) => ({ ...p, data_inicio: ev.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                <span className="text-xs text-slate-500">Fim</span>
                <input
                  type="date"
                  required
                  className="fc-input rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                  value={planForm.data_fim}
                  onChange={(ev) => setPlanForm((p) => ({ ...p, data_fim: ev.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                <span className="text-xs text-slate-500">Meta estéril (t)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="fc-input rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                  value={planForm.meta_esteril_ton}
                  onChange={(ev) => setPlanForm((p) => ({ ...p, meta_esteril_ton: ev.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                <span className="text-xs text-slate-500">Meta rocha (t)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="fc-input rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                  value={planForm.meta_rocha_ton}
                  onChange={(ev) => setPlanForm((p) => ({ ...p, meta_rocha_ton: ev.target.value }))}
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={planSaving}
                  className="fc-btn rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {planSaving ? "Salvando…" : "Salvar planejamento da semana"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Indicadores de planejamento indisponíveis.</p>
        )}
      </section>

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
