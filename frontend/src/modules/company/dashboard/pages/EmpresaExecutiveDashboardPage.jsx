import { useMemo } from "react";
import { Link } from "react-router-dom";
import SkeletonRows from "../../../../components/SkeletonRows";
import BIDashboardShell from "../../bi/components/BIDashboardShell";
import { useEmpresaExecutiveStats } from "../hooks/useEmpresaExecutiveStats";

const fmtTon = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

function pctStatusClass(pct) {
  const p = Number(pct) || 0;
  if (p >= 100) return "border-emerald-500/40 bg-emerald-950/35 text-emerald-100";
  if (p >= 70) return "border-amber-500/45 bg-amber-950/30 text-amber-100";
  return "border-rose-500/40 bg-rose-950/35 text-rose-100";
}

function pctRingClass(pct) {
  const p = Number(pct) || 0;
  if (p >= 100) return "text-emerald-400";
  if (p >= 70) return "text-amber-400";
  return "text-rose-400";
}

export default function EmpresaExecutiveDashboardPage() {
  const { stats, comparacao, loading } = useEmpresaExecutiveStats();

  const metaTotal = useMemo(() => {
    if (!comparacao) return 0;
    return Number(comparacao.planejado_esteril || 0) + Number(comparacao.planejado_rocha || 0);
  }, [comparacao]);

  const execTotal = useMemo(() => {
    if (!comparacao) return 0;
    return Number(comparacao.executado_esteril || 0) + Number(comparacao.executado_rocha || 0);
  }, [comparacao]);

  const pctAtingido = Number(comparacao?.percentual_total ?? 0);

  if (loading) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Executivo" lead="" showRoadmap={false}>
        <div className="fc-card border-zinc-800/90 p-8">
          <SkeletonRows rows={5} />
        </div>
      </BIDashboardShell>
    );
  }

  if (!stats) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Executivo" lead="" showRoadmap={false}>
        <p className="text-sm text-rose-400/90">Não foi possível carregar o painel executivo.</p>
      </BIDashboardShell>
    );
  }

  return (
    <BIDashboardShell eyebrow="Indicadores" title="Executivo" lead="">
      <section
        className={`fc-card relative overflow-hidden rounded-2xl border-2 p-6 sm:p-8 ${comparacao ? pctStatusClass(pctAtingido) : "border-zinc-700 bg-zinc-950/80"}`}
        aria-labelledby="exec-meta-exec"
      >
        <h2 id="exec-meta-exec" className="sr-only">
          Meta versus execução
        </h2>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Produção (toneladas)</p>
            <p className="text-sm text-zinc-400">Planejado no período ativo frente ao executado nas viagens.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-zinc-500">Meta</p>
                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-zinc-50 sm:text-4xl">
                  {comparacao ? `${fmtTon(metaTotal)} t` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500">Executado</p>
                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-zinc-50 sm:text-4xl">
                  {comparacao ? `${fmtTon(execTotal)} t` : "—"}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 lg:min-w-[200px]">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Atingimento</p>
            <div
              className={`relative flex h-36 w-36 items-center justify-center rounded-full border-4 border-zinc-800/80 bg-zinc-950/60 sm:h-40 sm:w-40 ${comparacao ? pctRingClass(pctAtingido) : ""}`}
              role="img"
              aria-label={`Percentual atingido ${fmtPct(pctAtingido)} por cento`}
            >
              <span className="text-center">
                <span className="block text-4xl font-black tabular-nums leading-none text-zinc-50 sm:text-5xl">
                  {comparacao ? fmtPct(pctAtingido) : "—"}
                </span>
                <span className="mt-1 block text-sm font-semibold text-zinc-400">%</span>
              </span>
            </div>
            {!comparacao ? (
              <p className="max-w-xs text-center text-xs text-zinc-500">Indicador de produção indisponível.</p>
            ) : metaTotal <= 0 ? (
              <p className="max-w-xs text-center text-xs text-amber-200/90">Sem meta ativa para hoje. Defina em Transporte.</p>
            ) : null}
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-2 border-t border-zinc-800/60 pt-6">
          <Link
            to="/empresa/transporte"
            className="fc-btn inline-flex rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
          >
            Transporte
          </Link>
          <Link
            to="/empresa/combustivel"
            className="fc-btn inline-flex rounded-lg border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
          >
            Combustível
          </Link>
          <Link
            to="/empresa/parte-diaria"
            className="fc-btn inline-flex rounded-lg border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
          >
            Parte diária
          </Link>
          <Link
            to="/empresa/frota"
            className="fc-btn inline-flex rounded-lg border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
          >
            Frota
          </Link>
          <Link
            to="/empresa/relatorios"
            className="fc-btn inline-flex rounded-lg border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
          >
            Relatórios
          </Link>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Resumo rápido de lançamentos">
        <div className="fc-card rounded-xl border border-zinc-800/90 p-4">
          <p className="text-xs text-zinc-500">Lançamentos hoje</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">{Number(stats.total_hoje || 0).toLocaleString("pt-BR")}</p>
        </div>
        <div className="fc-card rounded-xl border border-zinc-800/90 p-4">
          <p className="text-xs text-zinc-500">Últimos 7 dias</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">{Number(stats.total_semanal || 0).toLocaleString("pt-BR")}</p>
        </div>
        <div className="fc-card rounded-xl border border-zinc-800/90 p-4">
          <p className="text-xs text-zinc-500">Motoristas ativos (7 dias)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">{Number(stats.motoristas_ativos || 0).toLocaleString("pt-BR")}</p>
        </div>
      </section>
    </BIDashboardShell>
  );
}
