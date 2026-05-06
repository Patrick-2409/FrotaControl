export function InlineSpinner({ label }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-300" role="status" aria-live="polite">
      <span className="fc-spinner" aria-hidden="true" />
      {label || "Carregando..."}
    </span>
  );
}

export function CenteredSpinner({ label = "Processando..." }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-content-center bg-slate-950/60 backdrop-blur-sm" role="status" aria-live="assertive" aria-busy="true">
      <div className="fc-card flex items-center gap-3 px-5 py-4">
        <span className="fc-spinner" aria-hidden="true" />
        <span className="text-sm text-slate-100">{label}</span>
      </div>
    </div>
  );
}
