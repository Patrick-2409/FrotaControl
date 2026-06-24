import { SourceBadge } from "./ChartReportBlocks";

const TONE_STYLES = {
  default: "border-slate-200 bg-white",
  critical: "border-red-200 bg-red-50/40",
  warning: "border-amber-200 bg-amber-50/40",
  action: "border-blue-200 bg-blue-50/40",
  finance: "border-emerald-200 bg-emerald-50/40",
};

export function ExecutiveReportSection({
  id,
  icon,
  title,
  subtitle,
  source,
  tone = "default",
  children,
  className = "",
  emptyMessage,
  isEmpty = false,
}) {
  return (
    <section
      id={id}
      className={`fc-report-section scroll-mt-6 rounded-2xl border p-6 shadow-sm sm:p-7 ${TONE_STYLES[tone] || TONE_STYLES.default} ${className}`.trim()}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            {icon ? <span className="fc-report-section-marker" aria-hidden="true" /> : null}
            <span>{title}</span>
          </h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        {source ? <SourceBadge type={source} /> : null}
      </header>
      {isEmpty ? (
        <p className="text-sm text-slate-500">{emptyMessage || "Sem informações para este bloco no período."}</p>
      ) : (
        children
      )}
    </section>
  );
}

export function ExecutiveReportIndex({ sections = [] }) {
  const items = sections.filter((item) => item?.id && item?.label);
  if (!items.length) return null;

  return (
    <nav
      aria-label="Índice do relatório executivo"
      className="fc-report-export-skip print:hidden mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Índice executivo</p>
      <ol className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm text-slate-700 transition hover:border-slate-200 hover:bg-white"
            >
              <span className="fc-report-section-marker !h-2 !w-2" aria-hidden="true" />
              <span>
                {index + 1}. {item.label}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
