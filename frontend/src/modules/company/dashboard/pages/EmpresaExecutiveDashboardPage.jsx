import SkeletonRows from "../../../../components/SkeletonRows";
import BIDashboardShell from "../../bi/components/BIDashboardShell";
import ExecutiveModuleCard from "../components/ExecutiveModuleCard";
import ExecutivePeriodoToggle from "../components/ExecutivePeriodoToggle";
import { useEmpresaExecutiveStats } from "../hooks/useEmpresaExecutiveStats";
import { periodoResumoLabel } from "../lib/executivePeriodStorage";

const fmtTon = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const fmtMoney = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtLitros = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function MetricRow({ label, value, highlight = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/50 py-1.5 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`tabular-nums ${highlight ? "text-lg font-bold text-zinc-50" : "font-semibold text-zinc-200"}`}>
        {value}
      </span>
    </div>
  );
}

function PeriodoHeader({ periodo, setPeriodo }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Período: {periodoResumoLabel(periodo)}
      </p>
      <ExecutivePeriodoToggle periodo={periodo} onChange={setPeriodo} />
    </div>
  );
}

export default function EmpresaExecutiveDashboardPage() {
  const { summary, loading, periodo, setPeriodo } = useEmpresaExecutiveStats();

  if (loading) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Executivo" lead="" showRoadmap={false}>
        <PeriodoHeader periodo={periodo} setPeriodo={setPeriodo} />
        <div className="fc-card border-zinc-800/90 p-8">
          <SkeletonRows rows={6} />
        </div>
      </BIDashboardShell>
    );
  }

  if (!summary) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Executivo" lead="" showRoadmap={false}>
        <PeriodoHeader periodo={periodo} setPeriodo={setPeriodo} />
        <p className="text-sm text-rose-400/90">Não foi possível carregar o painel executivo.</p>
      </BIDashboardShell>
    );
  }

  const { transporte, combustivel, parteDiaria, frota, pessoas } = summary;
  const periodoHint = periodoResumoLabel(periodo);

  return (
    <BIDashboardShell
      eyebrow="Indicadores"
      title="Executivo"
      lead="Visão consolidada da operação. Use o filtro global para alterar o período de todos os módulos."
      showRoadmap={false}
    >
      <PeriodoHeader periodo={periodo} setPeriodo={setPeriodo} />

      <section
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        aria-label="Resumo por módulo"
      >
        <ExecutiveModuleCard title="Transporte" to="/empresa/transporte" accent="amber">
          <MetricRow label="Toneladas" value={`${fmtTon(transporte.toneladas)} t`} highlight />
          <MetricRow
            label="Atingimento"
            value={transporte.atingimento != null ? `${fmtPct(transporte.atingimento)}%` : "—"}
            highlight
          />
          {periodo === "semana" && transporte.metaTotal > 0 ? (
            <MetricRow label="Meta ativa" value={`${fmtTon(transporte.metaTotal)} t`} />
          ) : periodo === "semana" ? (
            <p className="text-xs text-amber-200/80">Defina a meta semanal em Transporte.</p>
          ) : (
            <p className="text-xs text-zinc-500">Atingimento disponível no período semanal.</p>
          )}
        </ExecutiveModuleCard>

        <ExecutiveModuleCard title="Combustível" to="/empresa/combustivel" accent="blue">
          <MetricRow label="Valor" value={fmtMoney(combustivel.valor)} highlight />
          <MetricRow label="Litros" value={`${fmtLitros(combustivel.litros)} L`} />
          <MetricRow
            label="Média R$/L"
            value={combustivel.media != null ? fmtMoney(combustivel.media) : "—"}
          />
        </ExecutiveModuleCard>

        <ExecutiveModuleCard title="Parte diária" to="/empresa/parte-diaria" accent="emerald">
          <MetricRow label="Registros" value={fmtInt(parteDiaria.registros)} highlight />
          <p className="text-xs text-zinc-500">Lançamentos de parte diária — {periodoHint.toLowerCase()}.</p>
        </ExecutiveModuleCard>

        <ExecutiveModuleCard title="Frota" to="/empresa/frota" accent="zinc">
          <MetricRow label="Veículos ativos" value={fmtInt(frota.veiculosAtivos)} highlight />
          <p className="text-xs text-zinc-500">Veículos com movimento — {periodoHint.toLowerCase()}.</p>
        </ExecutiveModuleCard>

        <ExecutiveModuleCard title="Pessoas" to="/empresa/pessoas" accent="violet">
          <MetricRow label="Motoristas ativos" value={fmtInt(pessoas.motoristasAtivos)} highlight />
          <p className="text-xs text-zinc-500">Com lançamento — {periodoHint.toLowerCase()}.</p>
        </ExecutiveModuleCard>
      </section>
    </BIDashboardShell>
  );
}
