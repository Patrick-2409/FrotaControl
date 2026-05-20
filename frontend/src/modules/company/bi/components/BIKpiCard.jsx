import { memo } from "react";
import BISparkline from "./BISparkline";

function trendClass(dir) {
  if (dir === "up") return "fc-kpi-trend-up";
  if (dir === "down") return "fc-kpi-trend-down";
  if (dir === "neutral") return "fc-kpi-trend-neutral";
  return "text-zinc-500";
}

/**
 * Cartão KPI estilo BI: tendência, variação, comparação, meta (barra), micro-série.
 */
function BIKpiCard({
  label,
  labelNode,
  value,
  valueNode,
  hint,
  trendDirection,
  deltaLabel,
  comparisonLabel,
  growthLabel,
  targetPct,
  targetLabel = "Meta / execução",
  sparklineValues,
  className = "",
}) {
  const pct =
    targetPct != null && Number.isFinite(Number(targetPct))
      ? Math.max(0, Math.min(100, Math.round(Number(targetPct))))
      : null;

  return (
    <article className={`fc-bi-kpi-card fc-card fc-erp-kpi-card border-zinc-800/90 p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {labelNode ?? (label ? <p className="fc-erp-eyebrow">{label}</p> : null)}
          <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-50 sm:text-3xl">
            {valueNode != null ? valueNode : value}
          </div>
        </div>
        {sparklineValues?.length >= 2 ? (
          <div className="shrink-0 opacity-95">
            <BISparkline values={sparklineValues} />
          </div>
        ) : null}
      </div>

      {hint ? <p className="mt-2 text-xs leading-relaxed text-zinc-500">{hint}</p> : null}

      {deltaLabel && trendDirection ? (
        <p className={`mt-2 text-xs font-semibold ${trendClass(trendDirection)}`}>{deltaLabel}</p>
      ) : null}
      {comparisonLabel ? <p className="mt-1 text-xs text-zinc-500">{comparisonLabel}</p> : null}
      {growthLabel ? <p className="mt-1 text-[11px] font-medium text-zinc-400">{growthLabel}</p> : null}

      {pct != null ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            <span>{targetLabel}</span>
            <span className="tabular-nums text-zinc-400">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-900/90 to-amber-400/90 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default memo(BIKpiCard);
