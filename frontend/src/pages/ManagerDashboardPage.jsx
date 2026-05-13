import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractApiErrorMessage } from "../services/api";
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

const COMBUSTIVEL_PIE_COLORS = [
  "#34d399",
  "#2dd4bf",
  "#38bdf8",
  "#818cf8",
  "#c084fc",
  "#fb7185",
  "#fbbf24",
  "#a3e635",
  "#94a3b8",
];

/** Litros por fatia para gráfico pizza (conic-gradient) e legenda. */
const buildConsumoPorVeiculoPie = (rows) => {
  const list = Array.isArray(rows) ? rows.filter((r) => Number(r?.total_litros) > 0) : [];
  const total = list.reduce((s, r) => s + Number(r.total_litros), 0);
  if (total <= 0) {
    return { style: { background: "conic-gradient(#334155 0% 100%)" }, slices: [] };
  }
  const sorted = [...list].sort((a, b) => Number(b.total_litros) - Number(a.total_litros));
  const MAX = 8;
  const head = sorted.slice(0, MAX);
  const tail = sorted.slice(MAX);
  const tailLitros = tail.reduce((s, r) => s + Number(r.total_litros), 0);
  const slicesIn =
    tailLitros > 0
      ? [
          ...head,
          {
            veiculo_id: "__outros__",
            total_litros: tailLitros,
            veiculo_nome: "Outros",
            veiculo_placa: null,
          },
        ]
      : head;
  let acc = 0;
  const slices = slicesIn.map((r, i) => {
    const lit = Number(r.total_litros);
    const pct = (lit / total) * 100;
    const startPct = acc;
    acc += pct;
    return {
      color: COMBUSTIVEL_PIE_COLORS[i % COMBUSTIVEL_PIE_COLORS.length],
      startPct,
      endPct: acc,
      label: veiculoCombustivelLabel(r),
      litros: lit,
      pct,
    };
  });
  const grad = slices.map((p) => `${p.color} ${p.startPct}% ${p.endPct}%`).join(", ");
  return { style: { background: `conic-gradient(${grad})` }, slices };
};

const combustivelSelectClass =
  "mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40";

const PERIODOS_API_COMBUSTIVEL = new Set(["dia", "semana", "mes", "ano"]);

/** Garante query `periodo` válida para /dashboard/combustiveis/resumo (default mês). */
const normalizePeriodoCombustivel = (v) => {
  const p = String(v ?? "mes").trim().toLowerCase();
  return PERIODOS_API_COMBUSTIVEL.has(p) ? p : "mes";
};

export default function ManagerDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [combustivelResumo, setCombustivelResumo] = useState(null);
  const [combustivelLoading, setCombustivelLoading] = useState(true);
  const [periodoCombustivel, setPeriodoCombustivel] = useState("mes");
  const [combustivelFiltroVeiculo, setCombustivelFiltroVeiculo] = useState("");
  const [combustivelFiltroMotorista, setCombustivelFiltroMotorista] = useState("");
  const [combustivelVeiculosOpt, setCombustivelVeiculosOpt] = useState([]);
  const [combustivelMotoristasOpt, setCombustivelMotoristasOpt] = useState([]);
  /** Referência: soma de valor_total no ano civil atual (GET resumo periodo=ano, sem filtros de veículo/motorista). */
  const [combustivelTotalGeralAno, setCombustivelTotalGeralAno] = useState(null);

  const loadCombustivelResumo = useCallback(async () => {
    setCombustivelLoading(true);
    const periodo = normalizePeriodoCombustivel(periodoCombustivel);
    const vid = combustivelFiltroVeiculo === "" ? null : Number(combustivelFiltroVeiculo);
    const mid = combustivelFiltroMotorista === "" ? null : Number(combustivelFiltroMotorista);
    const params = {
      periodo,
      group_by: "veiculo",
      ...(Number.isFinite(vid) && vid > 0 ? { veiculo_id: vid } : {}),
      ...(Number.isFinite(mid) && mid > 0 ? { motorista_id: mid } : {}),
    };
    try {
      const { data } = await api.get("/dashboard/combustiveis/resumo", {
        params,
      });
      setCombustivelResumo({
        total_litros: data?.total_litros ?? 0,
        total_valor: data?.total_valor ?? 0,
        preco_medio_litro: data?.preco_medio_litro,
        por_veiculo: Array.isArray(data?.por_veiculo) ? data.por_veiculo : [],
        inteligencia: {
          dias_no_periodo: Number(data?.inteligencia?.dias_no_periodo) || 1,
          media_diaria_litros: Number(data?.inteligencia?.media_diaria_litros) || 0,
          media_mensal_litros: Number(data?.inteligencia?.media_mensal_litros) || 0,
          preco_medio_historico:
            data?.inteligencia?.preco_medio_historico != null &&
            Number.isFinite(Number(data.inteligencia.preco_medio_historico))
              ? Number(data.inteligencia.preco_medio_historico)
              : null,
          historico_media_diaria_litros: Number(data?.inteligencia?.historico_media_diaria_litros) || 0,
        },
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
      emitToast(
        extractApiErrorMessage(err) || "Não foi possível carregar o resumo de combustível.",
        "warning"
      );
    } finally {
      setCombustivelLoading(false);
    }
  }, [periodoCombustivel, combustivelFiltroVeiculo, combustivelFiltroMotorista]);

  useEffect(() => {
    api.get("/dashboard/stats")
      .then(({ data }) => setStats(data))
      .catch(() => emitToast("Não foi possível carregar o dashboard agora.", "warning"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    void loadCombustivelResumo();
  }, [loading, loadCombustivelResumo]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      try {
        const [vRes, uRes] = await Promise.all([
          api.get("/dashboard/manage/vehicles", { params: { page: 1, limit: 500, search: "" } }),
          api.get("/dashboard/manage/users", { params: { page: 1, limit: 500, search: "" } }),
        ]);
        if (cancelled) return;
        setCombustivelVeiculosOpt(Array.isArray(vRes.data?.items) ? vRes.data.items : []);
        const items = Array.isArray(uRes.data?.items) ? uRes.data.items : [];
        setCombustivelMotoristasOpt(items.filter((u) => u.role === "MOTORISTA"));
      } catch {
        if (!cancelled) {
          setCombustivelVeiculosOpt([]);
          setCombustivelMotoristasOpt([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    api
      .get("/dashboard/combustiveis/resumo", { params: { periodo: "ano" } })
      .then(({ data }) => {
        if (cancelled) return;
        const v = data?.total_valor;
        setCombustivelTotalGeralAno(v != null && Number.isFinite(Number(v)) ? Number(v) : 0);
      })
      .catch(() => {
        if (!cancelled) setCombustivelTotalGeralAno(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loading]);

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

  const combustivelMediaPorVeiculo = useMemo(() => {
    if (!combustivelResumo?.por_veiculo?.length) return null;
    const rows = combustivelResumo.por_veiculo.filter((r) => Number(r.total_litros) > 0);
    if (!rows.length) return null;
    const tl = Number(combustivelResumo.total_litros) || 0;
    return tl / rows.length;
  }, [combustivelResumo]);

  const parteDiariaRegistros = useMemo(() => {
    const arr = stats?.por_tipo || [];
    const hit = arr.find((x) => String(x.tipo || "").toLowerCase() === "parte_diaria");
    return Number(hit?.total ?? 0);
  }, [stats]);

  const combustivelPie = useMemo(
    () => buildConsumoPorVeiculoPie(combustivelResumo?.por_veiculo),
    [combustivelResumo?.por_veiculo]
  );

  const semAbastecimentosNoPeriodo = useMemo(() => {
    if (!combustivelResumo || combustivelLoading) return false;
    return Number(combustivelResumo.total_litros) === 0 && Number(combustivelResumo.total_valor) === 0;
  }, [combustivelResumo, combustivelLoading]);

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
      {temAlertasCombustivel ? (
        <div
          role="status"
          className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/35 p-4 text-sm text-amber-50 shadow-md shadow-black/20"
        >
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
          {!combustivelLoading && combustivelResumo?.alertas_combustivel?.consumo_alto_periodo ? (
            <p className="flex items-start gap-2 font-medium">
              <span>⚠️ Consumo alto: ritmo diário acima da média dos últimos 12 meses</span>
            </p>
          ) : null}
          {!combustivelLoading && combustivelResumo?.alertas_combustivel?.preco_fora_media_historico ? (
            <p className="flex items-start gap-2 font-medium">
              <span>⚠️ Preço fora da média: acima do preço médio histórico</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="fc-card border-blue-500/20 bg-gradient-to-r from-blue-950/40 to-slate-900/70 p-5">
        <p className="text-xs uppercase tracking-wider text-blue-200">Visão operacional</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Painel da empresa</h2>
        <p className="mt-2 text-sm text-slate-300">
          Combustível e parte diária continuam nesta página. Toneladas, estéril/rocha, metas, planejado x executado,
          gráficos de produção e produtividade foram movidos para o módulo Transporte.
        </p>
        <Link
          to="/empresa/transporte"
          className="fc-btn mt-4 inline-flex w-fit rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Abrir módulo Transporte
        </Link>
      </section>

      <section
        className="fc-card border-emerald-500/30 bg-gradient-to-b from-emerald-950/25 via-slate-950/50 to-slate-950/80 p-6 shadow-lg ring-1 ring-emerald-500/20"
        aria-labelledby="gestao-combustivel-title"
      >
        <div className="border-b border-emerald-500/20 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-300/90">Abastecimento</p>
              <h2 id="gestao-combustivel-title" className="mt-1 text-xl font-semibold tracking-tight text-white">
                Gestão de Combustível
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                Indicadores e distribuição por veículo. Filtros próprios; não misturados com transporte ou custo de
                produção.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2" role="group" aria-label="Período do resumo de combustível">
              {[
                { id: "dia", label: "Dia" },
                { id: "semana", label: "Semana" },
                { id: "mes", label: "Mês" },
                { id: "ano", label: "Ano" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodoCombustivel(p.id)}
                  className={`fc-btn rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    periodoCombustivel === p.id
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                      : "border-slate-600 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Veículo
              <select
                className={combustivelSelectClass}
                value={combustivelFiltroVeiculo}
                onChange={(e) => setCombustivelFiltroVeiculo(e.target.value)}
              >
                <option value="">Todos os veículos</option>
                {combustivelVeiculosOpt.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {v.nome}
                    {v.placa ? ` — ${v.placa}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Motorista
              <select
                className={combustivelSelectClass}
                value={combustivelFiltroMotorista}
                onChange={(e) => setCombustivelFiltroMotorista(e.target.value)}
              >
                <option value="">Todos os motoristas</option>
                {combustivelMotoristasOpt.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-2">
              <button
                type="button"
                className="fc-btn rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 hover:border-emerald-500/40 hover:text-white"
                onClick={() => {
                  setCombustivelFiltroVeiculo("");
                  setCombustivelFiltroMotorista("");
                }}
              >
                Limpar filtros de veículo e motorista
              </button>
            </div>
          </div>
        </div>

        {combustivelLoading ? (
          <div className="mt-6">
            <SkeletonRows rows={3} />
          </div>
        ) : combustivelResumo ? (
          <>
            {semAbastecimentosNoPeriodo ? (
              <div className="mt-6 rounded-xl border border-emerald-500/35 bg-slate-900/75 p-4 ring-1 ring-emerald-500/15">
                <p className="text-base font-medium text-emerald-100">
                  Sem abastecimentos neste período selecionado
                </p>
                <p className="mt-3 text-sm text-slate-200">
                  Total geral acumulado:{" "}
                  <strong className="tabular-nums text-white">
                    {combustivelTotalGeralAno == null ? "—" : fmtBRL(combustivelTotalGeralAno)}
                  </strong>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Valor somado no ano civil atual, considerando todos os abastecimentos da empresa (referência).
                </p>
                <button
                  type="button"
                  className="fc-btn mt-4 inline-flex rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25"
                  onClick={() => setPeriodoCombustivel("mes")}
                >
                  Ver mês
                </button>
              </div>
            ) : null}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <article className="rounded-xl border border-emerald-500/35 bg-slate-950/60 p-4 shadow-inner">
                <p className="text-xs uppercase tracking-wider text-slate-400">Total litros</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-300">
                  {fmtLitros(combustivelResumo.total_litros)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Volume abastecido no intervalo filtrado.</p>
              </article>
              <article className="rounded-xl border border-emerald-500/35 bg-slate-950/60 p-4 shadow-inner">
                <p className="text-xs uppercase tracking-wider text-slate-400">Total valor</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-white">{fmtBRL(combustivelResumo.total_valor)}</p>
                <p className="mt-1 text-xs text-slate-500">Soma dos valores registrados.</p>
              </article>
              <article className="rounded-xl border border-emerald-500/35 bg-slate-950/60 p-4 shadow-inner">
                <p className="text-xs uppercase tracking-wider text-slate-400">Média por veículo</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-200">
                  {combustivelMediaPorVeiculo != null && Number.isFinite(combustivelMediaPorVeiculo) ? (
                    <>
                      {fmtLitros(combustivelMediaPorVeiculo)}
                      <span className="text-base font-semibold text-slate-400"> L</span>
                    </>
                  ) : (
                    "—"
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">Litros médios por veículo com consumo no período.</p>
              </article>
            </div>

            <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-start">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">Consumo por veículo</h3>
                <p className="mt-1 text-xs text-slate-500">Proporção de litros por veículo (gráfico pizza).</p>
                <div className="mt-5 flex flex-col items-stretch gap-6 sm:flex-row sm:items-center">
                  <div
                    className="mx-auto h-52 w-52 shrink-0 rounded-full border-4 border-slate-700/90 shadow-2xl ring-2 ring-emerald-500/10"
                    style={combustivelPie.style}
                    role="img"
                    aria-label="Gráfico de pizza do consumo de combustível por veículo"
                  />
                  <ul className="min-w-0 flex-1 space-y-2.5">
                    {combustivelPie.slices.length === 0 ? (
                      <li className="text-sm text-slate-500">Sem litros no período para montar o gráfico.</li>
                    ) : (
                      combustivelPie.slices.map((s, idx) => (
                        <li key={`pie-slice-${idx}`} className="flex items-center gap-2 text-sm text-slate-200">
                          <span
                            className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-white/10"
                            style={{ backgroundColor: s.color }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate" title={s.label}>
                            {s.label}
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-400">{fmtPct(s.pct)}%</span>
                          <span className="shrink-0 tabular-nums font-medium text-emerald-300/90">
                            {fmtLitros(s.litros)} L
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">Detalhe por veículo</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Ordenado pelo maior volume de litros. Coluna R$/L = preço médio no período.
                </p>
                <div className="mt-3 max-h-[min(28rem,60vh)] overflow-auto rounded-lg border border-slate-700/80">
                  <table className="w-full min-w-[420px] text-left text-sm text-slate-200">
                    <thead className="sticky top-0 z-[1] bg-slate-950/95 backdrop-blur-sm">
                      <tr className="border-b border-slate-700 text-xs font-medium uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-2.5">Veículo</th>
                        <th className="px-3 py-2.5">Litros</th>
                        <th className="px-3 py-2.5">Valor</th>
                        <th className="px-3 py-2.5">R$/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combustivelResumo.por_veiculo?.length ? (
                        combustivelResumo.por_veiculo.map((row) => (
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
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                            Nenhum abastecimento por veículo no período e filtros atuais.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-xl border border-slate-600 bg-slate-900/70 p-4">
            <p className="text-base font-medium text-slate-200">
              Não foi possível carregar o resumo de combustível para este período.
            </p>
            <p className="mt-3 text-sm text-slate-200">
              Total geral acumulado:{" "}
              <strong className="tabular-nums text-white">
                {combustivelTotalGeralAno == null ? "—" : fmtBRL(combustivelTotalGeralAno)}
              </strong>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Referência do ano civil atual (todos os abastecimentos da empresa), quando disponível.
            </p>
            <button
              type="button"
              className="fc-btn mt-4 inline-flex rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25"
              onClick={() => setPeriodoCombustivel("mes")}
            >
              Ver mês
            </button>
          </div>
        )}
      </section>

      <section
        className="fc-card border-violet-500/30 bg-gradient-to-br from-violet-950/20 to-slate-950/80 p-6 ring-1 ring-violet-500/15"
        aria-labelledby="parte-diaria-admin-title"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-violet-200/90">Documentação operacional</p>
        <h2 id="parte-diaria-admin-title" className="mt-1 text-xl font-semibold text-white">
          Parte diária
        </h2>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          Bloco separado do transporte e do combustível: total de registros classificados como parte diária no
          consolidado da empresa.
        </p>
        <article className="mt-6 max-w-md rounded-xl border border-violet-500/30 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Registros (parte diária)</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-violet-200">{fmtInt(parteDiariaRegistros)}</p>
        </article>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link to="/empresa/transporte" className="fc-btn inline-flex rounded-xl border border-cyan-500/50 px-4 py-3 text-center font-semibold text-cyan-100">
          Módulo Transporte
        </Link>
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
