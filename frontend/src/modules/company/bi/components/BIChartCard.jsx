import { memo } from "react";

/**
 * Invólucro padronizado para gráficos: legenda, toolbar (ex.: reset zoom), área responsiva.
 */
function BIChartCard({
  title,
  subtitle,
  legend,
  toolbar,
  children,
  className = "",
  bodyClassName = "min-h-[12rem]",
}) {
  return (
    <section className={`fc-bi-chart-card fc-card border-zinc-800/90 ${className}`}>
      <div className="fc-bi-chart-card__head flex flex-col gap-3 border-b border-zinc-800/70 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-4">
        <div className="min-w-0">
          {title ? <h2 className="text-sm font-semibold tracking-tight text-zinc-100">{title}</h2> : null}
          {subtitle ? <p className="mt-1 text-xs leading-relaxed text-zinc-500">{subtitle}</p> : null}
          {legend ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-400">{legend}</div> : null}
        </div>
        {toolbar ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-zinc-400">{toolbar}</div>
        ) : null}
      </div>
      <div className={`fc-bi-chart-card__body px-3 py-4 sm:px-5 sm:py-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export default memo(BIChartCard);
