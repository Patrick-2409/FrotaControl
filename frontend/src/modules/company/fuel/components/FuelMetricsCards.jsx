import { memo } from "react";
import { fmtBRL } from "../services/fuelFormatters";
import TooltipInfo from "../../shared/components/TooltipInfo";

const formatDeltaPct = (value) => {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const formatted = Math.abs(rounded).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${formatted}%`;
};

const deltaToneClass = (value) => {
  if (!Number.isFinite(value)) return "text-zinc-400";
  if (value <= -3) return "text-emerald-200";
  if (value >= 3) return "text-rose-200";
  return "text-amber-200";
};

const getFuelHealth = (vsFleetPct, vsHistoricalPct) => {
  const positives = [vsFleetPct, vsHistoricalPct].filter((v) => Number.isFinite(v) && v > 0);
  const maxPositive = positives.length > 0 ? Math.max(...positives) : 0;
  if (maxPositive >= 8) return "critical";
  if (maxPositive >= 3) return "warning";
  return "healthy";
};

const healthMeta = {
  healthy: {
    label: "Saudável",
    emoji: "🟢",
    card: "border-emerald-500/45 bg-emerald-950/20",
    text: "text-emerald-100",
  },
  warning: {
    label: "Atenção",
    emoji: "🟡",
    card: "border-amber-500/45 bg-amber-950/20",
    text: "text-amber-100",
  },
  critical: {
    label: "Crítico",
    emoji: "🔴",
    card: "border-rose-500/45 bg-rose-950/25",
    text: "text-rose-100",
  },
};

const signalLabel = (value, target) => {
  if (!Number.isFinite(value)) return `sem base ${target}`;
  if (value > 2) return `acima ${target}`;
  if (value < -2) return `abaixo ${target}`;
  return `dentro do padrão ${target}`;
};

const buildAutoPhrase = (vsFleetPct, vsHistoricalPct) => {
  const fleet = signalLabel(vsFleetPct, "da frota");
  const hist = signalLabel(vsHistoricalPct, "histórico");

  if (fleet.startsWith("acima") && hist.startsWith("acima")) {
    return "Preço acima da média da frota e do histórico da operação.";
  }
  if (fleet.startsWith("acima") && !hist.startsWith("acima")) {
    return "Preço dentro do padrão histórico, porém acima da média da frota.";
  }
  if (!fleet.startsWith("acima") && hist.startsWith("acima")) {
    return "Preço acima do histórico da operação, mesmo sem pressão da média da frota.";
  }
  if (fleet.startsWith("abaixo") && hist.startsWith("abaixo")) {
    return "Preço abaixo da média da frota e do histórico da operação.";
  }
  return "Preço estável frente à frota e ao histórico da operação.";
};

const buildInsight = (health, vsFleetPct, vsHistoricalPct) => {
  if (health === "critical") {
    return "💡 Insight: custo em alta. Priorize renegociação de preço e revisão dos pontos de abastecimento.";
  }
  if (health === "warning") {
    if (Number.isFinite(vsFleetPct) && vsFleetPct > 0 && Number.isFinite(vsHistoricalPct) && vsHistoricalPct <= 0) {
      return "💡 Insight: desvio pontual frente à frota. Compare fornecedores e motorista/rota do período.";
    }
    if (Number.isFinite(vsHistoricalPct) && vsHistoricalPct > 0) {
      return "💡 Insight: tendência de aumento no tempo. Acompanhe os próximos dias para evitar escalada de custo.";
    }
    return "💡 Insight: atenção preventiva. Mantenha monitoramento diário do preço médio.";
  }
  return "💡 Insight: cenário controlado. Mantenha o padrão atual de abastecimento.";
};

function FuelMetricsCards({ resumo, mediaPorVeiculo }) {
  if (!resumo) return null;

  const intel = resumo.inteligencia || {};

  const atual = Number(resumo.preco_medio_litro);
  const refHist = Number(intel.preco_medio_historico);
  const hasHistoricalPrice = Number.isFinite(refHist) && refHist > 0;
  const pricesByVehicle = Array.isArray(resumo.por_veiculo)
    ? resumo.por_veiculo
        .map((row) => Number(row?.preco_medio_litro))
        .filter((price) => Number.isFinite(price) && price > 0)
    : [];
  const avgFleetPrice =
    pricesByVehicle.length > 0
      ? pricesByVehicle.reduce((acc, value) => acc + value, 0) / pricesByVehicle.length
      : null;
  const hasFleetAverage = Number.isFinite(avgFleetPrice) && avgFleetPrice > 0;

  const hasCurrentPrice = Number.isFinite(atual) && atual > 0;
  const vsFleetPct = hasCurrentPrice && hasFleetAverage ? ((atual - avgFleetPrice) / avgFleetPrice) * 100 : null;
  const vsHistoricalPct = hasCurrentPrice && hasHistoricalPrice ? ((atual - refHist) / refHist) * 100 : null;
  const health = getFuelHealth(vsFleetPct, vsHistoricalPct);
  const meta = healthMeta[health];
  const autoPhrase = buildAutoPhrase(vsFleetPct, vsHistoricalPct);
  const insight = buildInsight(health, vsFleetPct, vsHistoricalPct);

  const metricCardBase = "rounded-xl border p-4";

  return (
    <div className="mt-6 space-y-4">
      <section className={`rounded-2xl border-2 p-4 sm:p-5 ${meta.card}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Saúde do combustível</p>
            <p className={`mt-1 text-lg font-bold ${meta.text}`}>
              {meta.emoji} {meta.label}
            </p>
          </div>
          <p className="max-w-[28rem] text-sm text-zinc-200">{autoPhrase}</p>
        </div>
        <p className="mt-2 text-xs text-zinc-300">{insight}</p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className={`${metricCardBase} border-zinc-700/90 bg-zinc-950/60`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Preço médio</p>
          <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-zinc-50">
            {hasCurrentPrice ? `${fmtBRL(atual)}/L` : "—"}
          </p>
        </article>

        <article className={`${metricCardBase} border-zinc-700/90 bg-zinc-950/60`}>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <span>Vs média da frota</span>
            <TooltipInfo text="Compara o preço médio atual com a média da frota no período." />
          </p>
          <p className={`mt-1 text-2xl font-black tabular-nums tracking-tight ${deltaToneClass(vsFleetPct)}`}>
            {formatDeltaPct(vsFleetPct)}
          </p>
        </article>

        <article className={`${metricCardBase} border-zinc-700/90 bg-zinc-950/60`}>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <span>Vs histórico da operação</span>
            <TooltipInfo text="Compara o preço médio atual com o histórico da operação. Valores acima indicam aumento de custo." />
          </p>
          <p className={`mt-1 text-2xl font-black tabular-nums tracking-tight ${deltaToneClass(vsHistoricalPct)}`}>
            {formatDeltaPct(vsHistoricalPct)}
          </p>
        </article>
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <span>Comparação de preço</span>
          <TooltipInfo text={"Este indicador compara o preço médio atual com: a média da frota no período e o histórico da operação. Valores acima indicam aumento de custo."} />
        </p>
        {!hasCurrentPrice ? (
          <p className="mt-1 text-xs text-zinc-500">Sem dados de preço para comparar no período atual.</p>
        ) : (
          <p className="mt-1 text-xs text-zinc-300">Leitura rápida para decisão de custo em campo.</p>
        )}
      </section>

      {mediaPorVeiculo != null && Number.isFinite(mediaPorVeiculo) ? (
        <p className="text-xs text-zinc-500">
          Média por veículo no período: <span className="font-semibold text-zinc-300">{fmtBRL(mediaPorVeiculo)}/L</span>
        </p>
      ) : null}
    </div>
  );
}

export default memo(FuelMetricsCards);
