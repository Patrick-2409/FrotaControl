import { memo } from "react";

const TONE_BORDER = {
  critical: "border-rose-500/35 shadow-[0_0_18px_-10px_rgba(244,63,94,0.4)]",
  warning: "border-amber-500/35 shadow-[0_0_18px_-10px_rgba(245,158,11,0.25)]",
  ok: "border-emerald-500/30",
  neutral: "border-zinc-800/90",
};

const TONE_VALUE = {
  critical: "text-rose-100",
  warning: "text-amber-100",
  ok: "text-emerald-200",
  neutral: "text-zinc-50",
};

/**
 * KPI compacto para dashboard executivo: altura fixa, hierarquia clara, pouco texto.
 */
function ExecutiveKpiCard({
  icon,
  label,
  value,
  subtitle,
  tone = "neutral",
  tooltip,
  footer,
  className = "",
}) {
  return (
    <article
      className={`fc-card fc-erp-kpi-card flex min-h-[168px] flex-col justify-between p-4 sm:p-4 ${TONE_BORDER[tone] ?? TONE_BORDER.neutral} ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {icon ? (
            <span className="text-sm leading-none" aria-hidden>
              {icon}
            </span>
          ) : null}
          <span className="truncate">{label}</span>
          {tooltip ? (
            <button
              type="button"
              className="ml-auto inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-800/80 text-[10px] font-bold leading-none text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              title={tooltip}
              aria-label={tooltip}
            >
              ?
            </button>
          ) : null}
        </p>
        <p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl ${TONE_VALUE[tone] ?? TONE_VALUE.neutral}`}>
          {value}
        </p>
        {subtitle ? <p className="mt-1 text-xs leading-snug text-zinc-500">{subtitle}</p> : null}
      </div>
      {footer ? <div className="mt-3 shrink-0 border-t border-zinc-800/80 pt-2">{footer}</div> : null}
    </article>
  );
}

export default memo(ExecutiveKpiCard);
