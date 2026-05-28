import { CHART_GUIDES } from "../utils/chartGuides";

export function ColorLegend({ title = "Legenda", items = [] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li
            key={`${item.label}-${item.value || ""}`}
            className="grid grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-2 text-xs"
          >
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-sm border border-slate-200"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span className="truncate font-medium text-slate-800" title={item.label}>
              {item.label}
            </span>
            {item.value ? <span className="tabular-nums text-slate-600">{item.value}</span> : <span />}
            {item.detail ? <span className="tabular-nums font-semibold text-slate-500">{item.detail}</span> : <span />}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StaticLegend({ title = "Legenda", items = [] }) {
  return <ColorLegend title={title} items={items.map((item) => ({ ...item, value: item.value || "", detail: item.detail || "" }))} />;
}

export function ChartDiscussion({ title = "Leitura dos resultados", points = [] }) {
  if (!points.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-800">{title}</p>
      <ul className="mt-2 space-y-2">
        {points.map((point) => (
          <li key={point} className="flex gap-2 text-sm leading-relaxed text-slate-800">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartGuideBlock({ guideKey }) {
  const guide = CHART_GUIDES[guideKey];
  if (!guide) return null;
  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">O que mostra</p>
        <p className="mt-1 text-sm text-slate-700">{guide.oQue}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Como interpretar</p>
        <p className="mt-1 text-sm text-slate-700">{guide.como}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Impacto</p>
        <p className="mt-1 text-sm text-slate-700">{guide.impacto}</p>
      </div>
    </div>
  );
}

export function ReportChartCard({ title, subtitle, children, guideKey, legend, discussion, className = "" }) {
  return (
    <article className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <header>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </header>
      <div className="mt-4 h-[320px] w-full">{children}</div>
      {legend}
      <ChartDiscussion points={discussion} />
      <ChartGuideBlock guideKey={guideKey} />
    </article>
  );
}
