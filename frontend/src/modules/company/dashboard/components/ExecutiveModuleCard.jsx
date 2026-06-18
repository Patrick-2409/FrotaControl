import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { EmpresaMenuIcon } from "../../../../components/empresaSidebarConstants";
import TooltipInfo from "../../shared/components/TooltipInfo";

const trendStyleMap = {
  positive: {
    icon: "↑",
    badge: "border-emerald-400/45 bg-emerald-500/15 text-emerald-200",
    bar: "bg-emerald-400/80",
  },
  negative: {
    icon: "↓",
    badge: "border-rose-400/45 bg-rose-500/15 text-rose-200",
    bar: "bg-rose-400/80",
  },
  neutral: {
    icon: "→",
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
  iconType = "",
  children,
}) {
  const accentMap = {
    amber: "border-amber-500/35 bg-amber-950/20",
    blue: "border-sky-500/35 bg-sky-950/20",
    emerald: "border-emerald-500/35 bg-emerald-950/20",
    violet: "border-violet-500/35 bg-violet-950/20",
    zinc: "border-zinc-700/90 bg-zinc-950/70",
  };
  const trendStyle = trendStyleMap[trendDirection] || trendStyleMap.neutral;
  const accentClass = accentMap[accent] || accentMap.zinc;
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  const content = (
    <article
      className={`fc-erp-module-card fc-erp-module-card--interactive fc-card flex h-full flex-col rounded-lg border p-4 sm:p-5 ${accentClass}`}
    >
      <header className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-100">
          {iconType ? (
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-700/70 bg-zinc-950/55 text-zinc-300">
              <EmpresaMenuIcon type={iconType} />
            </span>
          ) : null}
          <span className="min-w-0 truncate">{title}</span>
          {tooltipText ? <TooltipInfo text={tooltipText} /> : null}
        </h3>
        {to ? (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-950/60 text-zinc-400 transition group-hover:border-zinc-500 group-hover:text-zinc-100">
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Abrir {title}</span>
          </span>
        ) : null}
      </header>

      <p className="break-words text-xl font-bold tracking-tight text-zinc-50 sm:text-3xl">{value}</p>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${trendStyle.badge}`}>
          <span aria-hidden>{trendStyle.icon}</span>
          {trendText}
        </span>
        <MiniSparkline points={miniSeries} tone={trendDirection} />
      </div>

      <div className="mt-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
          <div className={`h-full rounded-full transition-all ${trendStyle.bar}`} style={{ width: `${safeProgress}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">{trendLabel}</p>
      </div>

      <p className="mt-2 text-xs text-zinc-400">{subtitle}</p>
      <div className="mt-3 flex flex-1 flex-col gap-2 text-sm text-zinc-300">{children}</div>
    </article>
  );

  if (!to) return content;
  return (
    <Link to={to} className="group block h-full focus-visible:rounded-lg">
      {content}
    </Link>
  );
}
