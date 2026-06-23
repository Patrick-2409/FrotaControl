import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import TooltipInfo from "../../shared/components/TooltipInfo";

const trendStyleMap = {
  positive: {
    badge: "border-emerald-400/45 bg-emerald-500/15 text-emerald-200",
    bar: "bg-emerald-400/80",
  },
  negative: {
    badge: "border-rose-400/45 bg-rose-500/15 text-rose-200",
    bar: "bg-rose-400/80",
  },
  neutral: {
    badge: "border-amber-400/45 bg-amber-500/15 text-amber-100",
    bar: "bg-amber-300/80",
  },
};

function MiniSparkline({ points = [], tone = "neutral" }) {
  const usable = points.filter((p) => Number.isFinite(p)).slice(-7);
  if (usable.length < 2) return null;
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const span = max - min || 1;
  const step = usable.length > 1 ? 100 / (usable.length - 1) : 100;
  const plot = usable
    .map((value, idx) => {
      const x = idx * step;
      const y = 100 - ((value - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  const stroke =
    tone === "positive" ? "#34d399" : tone === "negative" ? "#fb7185" : "#fbbf24";
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-7 w-20 overflow-visible opacity-90"
      aria-hidden="true"
    >
      <polyline
        points={plot}
        fill="none"
        stroke={stroke}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ExecutiveModuleCard({
  title,
  to,
  accent = "zinc",
  value,
  trendLabel,
  trendDirection = "neutral",
  trendText = "Sem variação relevante",
  subtitle,
  progress = 0,
  miniSeries = [],
  tooltipText = "",
  children,
}) {
  const accentMap = {
    amber: "fc-module-accent--amber",
    blue: "fc-module-accent--blue",
    emerald: "fc-module-accent--emerald",
    violet: "fc-module-accent--violet",
    zinc: "fc-module-accent--zinc",
  };
  const trendStyle = trendStyleMap[trendDirection] || trendStyleMap.neutral;
  const accentClass = accentMap[accent] || accentMap.zinc;
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  const content = (
    <article
      className={`fc-erp-module-card fc-erp-module-card--interactive fc-card relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border p-4 sm:p-5 ${accentClass}`}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-zinc-100 sm:text-xs">
          <span className="truncate">{title}</span>
          {tooltipText ? <TooltipInfo text={tooltipText} /> : null}
        </h3>
        {to ? (
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-950/70 text-zinc-300 transition group-hover:border-zinc-500 group-hover:text-zinc-50"
            aria-hidden="true"
          >
            <ArrowUpRight className="h-4 w-4" />
          </span>
        ) : (
          <span className="shrink-0 text-right text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Somente leitura
          </span>
        )}
      </header>

      <p className="break-words text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">{value}</p>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${trendStyle.badge}`}>
          {trendText}
        </span>
        <MiniSparkline points={miniSeries} tone={trendDirection} />
      </div>

      <div className="mt-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900/80">
          <div className={`h-full rounded-full transition-all ${trendStyle.bar}`} style={{ width: `${safeProgress}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-zinc-400">{trendLabel}</p>
      </div>

      <p className="mt-2 text-xs text-zinc-400">{subtitle}</p>
      <div className="mt-3 flex flex-1 flex-col gap-2 text-sm text-zinc-300">{children}</div>
    </article>
  );

  if (!to) return content;
  return (
    <Link to={to} className="group block h-full focus-visible:rounded-xl">
      {content}
    </Link>
  );
}
