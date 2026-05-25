export default function SectionCard({
  title,
  description,
  actions = null,
  children,
  className = "",
  contentClassName = "",
  titleId,
}) {
  return (
    <section className={`fc-card border-zinc-800/90 p-4 sm:p-5 ${className}`.trim()} aria-labelledby={titleId}>
      {(title || description || actions) ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 id={titleId} className="text-base font-semibold tracking-tight text-zinc-100 sm:text-lg">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-1 text-xs text-zinc-500 sm:text-sm">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
