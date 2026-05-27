import SkeletonRows from "../../../../components/SkeletonRows";
import BIDashboardShell from "../../bi/components/BIDashboardShell";
import ExecutiveModuleCard from "../components/ExecutiveModuleCard";
import ExecutivePeriodoToggle from "../components/ExecutivePeriodoToggle";
import { useEmpresaExecutiveStats } from "../hooks/useEmpresaExecutiveStats";
import { periodoResumoLabel } from "../lib/executivePeriodStorage";
import AccordionSection from "../../shared/components/AccordionSection";

const fmtTon = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const fmtMoney = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtLitros = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtDelta = (n) => `${n > 0 ? "+" : ""}${fmtPct(n)}%`;

const getTrendDirection = (value, positiveThreshold = 2, negativeThreshold = -2) => {
  if (!Number.isFinite(value)) return "neutral";
  if (value >= positiveThreshold) return "positive";
  if (value <= negativeThreshold) return "negative";
  return "neutral";
};

const trendArrow = (direction) => {
  if (direction === "positive") return "↑";
  if (direction === "negative") return "↓";
  return "→";
};

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
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Período: {periodoResumoLabel(periodo)}
      </p>
      <ExecutivePeriodoToggle periodo={periodo} onChange={setPeriodo} className="sm:justify-end" />
    </div>
  );
}

export default function EmpresaExecutiveDashboardPage() {
  const { summary, loading, periodo, setPeriodo, statsError } = useEmpresaExecutiveStats();

  if (loading) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Executivo" lead="">
        <PeriodoHeader periodo={periodo} setPeriodo={setPeriodo} />
        <div className="fc-card border-zinc-800/90 p-8">
          <SkeletonRows rows={6} />
        </div>
      </BIDashboardShell>
    );
  }

  if (!summary) {
    return (
      <BIDashboardShell eyebrow="Indicadores" title="Executivo" lead="">
        <PeriodoHeader periodo={periodo} setPeriodo={setPeriodo} />
        <p className="text-sm text-rose-400/90">Não foi possível carregar o painel executivo.</p>
      </BIDashboardShell>
    );
  }

  const { transporte, combustivel, parteDiaria, frota, pessoas } = summary;
  const periodoHint = periodoResumoLabel(periodo);
  const transporteDelta = (transporte.atingimento ?? 100) - 100;
  const transporteTrend = getTrendDirection(transporteDelta, 4, -4);
  const transporteProgress = Number.isFinite(transporte.atingimento)
    ? transporte.atingimento
    : transporte.metaTotal > 0
      ? (transporte.toneladas / transporte.metaTotal) * 100
      : 50;

  const combLitros = Number(combustivel.litros || 0);
  const combMedia = Number(combustivel.media || 0);
  const valorPorLitro = combLitros > 0 ? combustivel.valor / combLitros : 0;
  const combDeltaBase = combMedia > 0 ? ((valorPorLitro - combMedia) / combMedia) * 100 : 0;
  const combustivelDelta = Number.isFinite(combDeltaBase) ? -combDeltaBase : 0;
  const combustivelTrend = getTrendDirection(combustivelDelta, 1.5, -1.5);
  const combustivelProgress = combMedia > 0
    ? Math.max(0, Math.min(100, (combMedia / Math.max(valorPorLitro, 0.01)) * 100))
    : 48;

  const lancamentosPorMotorista = pessoas.motoristasAtivos > 0
    ? (parteDiaria.registros / pessoas.motoristasAtivos) * 100
    : 0;
  const parteDiariaDelta = lancamentosPorMotorista - 100;
  const parteDiariaTrend = getTrendDirection(parteDiariaDelta, 10, -15);

  const frotaDeltaBase = frota.veiculosAtivos > 0
    ? ((frota.veiculosAtivos - pessoas.motoristasAtivos) / frota.veiculosAtivos) * 100
    : 0;
  const frotaTrend = getTrendDirection(frotaDeltaBase, 8, -8);

  const pessoasDeltaBase = pessoas.motoristasAtivos > 0
    ? ((pessoas.motoristasAtivos - frota.veiculosAtivos) / pessoas.motoristasAtivos) * 100
    : 0;
  const pessoasTrend = getTrendDirection(pessoasDeltaBase, 8, -8);

  return (
    <BIDashboardShell
      eyebrow="Indicadores"
      title="Executivo"
      lead="Visão consolidada e acionável por módulo. Toque em qualquer card para abrir a área correspondente."
    >
      <PeriodoHeader periodo={periodo} setPeriodo={setPeriodo} />

      {statsError ? (
        <p className="mb-4 text-sm text-amber-400/90" role="status">
          {statsError} Os demais indicadores podem estar incompletos.
        </p>
      ) : null}

      <AccordionSection
        id="exec-resumo-modulos"
        title="Dashboard rápido por módulo"
        description="Toque no card para abrir o módulo correspondente."
        defaultOpenDesktop
        defaultOpenMobile={false}
      >
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Resumo por módulo">
        <ExecutiveModuleCard
          title="Transporte"
          to="/empresa/transporte"
          accent="amber"
          tooltipText="Mostra o volume total transportado no período. É calculado pela soma das toneladas de estéril e rocha. Quanto maior, melhor o ritmo frente à meta."
          value={`${fmtTon(transporte.toneladas)} t`}
          trendDirection={transporteTrend}
          trendText={transporte.atingimento != null ? `${trendArrow(transporteTrend)} ${fmtDelta(transporteDelta)}` : "→ sem meta"}
          trendLabel={periodo === "semana" ? "Comparativo com meta semanal" : "Faixa operacional"}
          subtitle={periodo === "semana" ? "Produção acumulada no período" : `Produção de ${periodoHint.toLowerCase()}`}
          progress={transporteProgress}
          miniSeries={[
            transporte.metaTotal || 0,
            transporte.toneladas || 0,
            Math.max(transporte.toneladas || 0, transporte.metaTotal || 0) * 0.85,
          ]}
        >
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

        <ExecutiveModuleCard
          title="Combustível"
          to="/empresa/combustivel"
          accent="blue"
          tooltipText="Representa o custo total de combustível no período e a eficiência por litro. Valor muito alto indica pressão de custo e necessidade de revisão de consumo/preço."
          value={fmtMoney(combustivel.valor)}
          trendDirection={combustivelTrend}
          trendText={`${trendArrow(combustivelTrend)} ${fmtDelta(combustivelDelta)}`}
          trendLabel="Eficiência estimada por litro no período"
          subtitle="Menor custo por litro mantém operação saudável"
          progress={combustivelProgress}
          miniSeries={[combustivel.litros || 0, combustivel.valor || 0, valorPorLitro || 0]}
        >
          <MetricRow label="Valor" value={fmtMoney(combustivel.valor)} highlight />
          <MetricRow label="Litros" value={`${fmtLitros(combustivel.litros)} L`} />
          <MetricRow
            label="Média R$/L"
            value={combustivel.media != null ? fmtMoney(combustivel.media) : "—"}
          />
        </ExecutiveModuleCard>

        <ExecutiveModuleCard
          title="Parte diária"
          to="/empresa/parte-diaria"
          accent="emerald"
          tooltipText="Quantidade de lançamentos de parte diária no período. É comparada com motoristas ativos para medir cobertura operacional. Valor baixo pode indicar falha de registro."
          value={fmtInt(parteDiaria.registros)}
          trendDirection={parteDiariaTrend}
          trendText={`${trendArrow(parteDiariaTrend)} ${fmtDelta(parteDiariaDelta)}`}
          trendLabel="Cobertura de lançamentos por motorista"
          subtitle={`Lançamentos de ${periodoHint.toLowerCase()}`}
          progress={lancamentosPorMotorista}
          miniSeries={[
            pessoas.motoristasAtivos || 0,
            parteDiaria.registros || 0,
            Math.max(parteDiaria.registros || 0, pessoas.motoristasAtivos || 0),
          ]}
        >
          <MetricRow label="Registros" value={fmtInt(parteDiaria.registros)} highlight />
          <p className="text-xs text-zinc-500">Lançamentos de parte diária — {periodoHint.toLowerCase()}.</p>
        </ExecutiveModuleCard>

        <ExecutiveModuleCard
          title="Frota"
          to="/empresa/frota"
          accent="zinc"
          tooltipText="Total de veículos com movimento no período. O indicador cruza atividade da frota com equipe ativa. Valor baixo pode sinalizar ociosidade ou indisponibilidade."
          value={fmtInt(frota.veiculosAtivos)}
          trendDirection={frotaTrend}
          trendText={`${trendArrow(frotaTrend)} ${fmtDelta(frotaDeltaBase)}`}
          trendLabel="Relação entre veículos ativos e equipe"
          subtitle={`Atividade da frota em ${periodoHint.toLowerCase()}`}
          progress={frota.veiculosAtivos > 0 ? (Math.min(pessoas.motoristasAtivos, frota.veiculosAtivos) / frota.veiculosAtivos) * 100 : 0}
          miniSeries={[frota.veiculosAtivos || 0, pessoas.motoristasAtivos || 0, parteDiaria.registros || 0]}
        >
          <MetricRow label="Veículos ativos" value={fmtInt(frota.veiculosAtivos)} highlight />
          <p className="text-xs text-zinc-500">Veículos com movimento — {periodoHint.toLowerCase()}.</p>
        </ExecutiveModuleCard>

        <ExecutiveModuleCard
          title="Pessoas"
          to="/empresa/pessoas"
          accent="violet"
          tooltipText="Motoristas com lançamentos no período. É calculado por usuários ativos com registro operacional. Valor baixo reduz capacidade de execução da frota."
          value={fmtInt(pessoas.motoristasAtivos)}
          trendDirection={pessoasTrend}
          trendText={`${trendArrow(pessoasTrend)} ${fmtDelta(pessoasDeltaBase)}`}
          trendLabel="Disponibilidade frente aos ativos da frota"
          subtitle={`Motoristas com atividade em ${periodoHint.toLowerCase()}`}
          progress={pessoas.motoristasAtivos > 0 ? (Math.min(frota.veiculosAtivos, pessoas.motoristasAtivos) / pessoas.motoristasAtivos) * 100 : 0}
          miniSeries={[pessoas.motoristasAtivos || 0, frota.veiculosAtivos || 0, transporte.toneladas || 0]}
        >
          <MetricRow label="Motoristas ativos" value={fmtInt(pessoas.motoristasAtivos)} highlight />
          <p className="text-xs text-zinc-500">Com lançamento — {periodoHint.toLowerCase()}.</p>
        </ExecutiveModuleCard>
        </section>
      </AccordionSection>
    </BIDashboardShell>
  );
}
