/**
 * Painel de falha de módulo (ERP): ação clara de repetir, sem mensagem genérica solta.
 */
function AlertGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 8v5M12 17h.01M10.3 4.3h3.4L20 17H4l5.7-12.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function EmpresaModuleErrorPanel({
  title = "Indisponível no momento",
  description = "Não foi possível concluir o pedido ao servidor. Verifique a ligação e tente novamente.",
  onRetry,
  retryLabel = "Tentar novamente",
}) {
  return (
    <div
      className="fc-erp-alert-panel fc-erp-alert-panel--critical flex gap-4 p-5 sm:p-6"
      role="alert"
    >
      <div className="mt-0.5 shrink-0 rounded-md border border-zinc-700/80 bg-zinc-900/60 p-2 text-zinc-500">
        <AlertGlyph className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="fc-erp-eyebrow text-amber-200/85">Operação</p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-zinc-50">{title}</h3>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-400">{description}</p>
        {typeof onRetry === "function" ? (
          <button
            type="button"
            className="fc-btn mt-5 inline-flex rounded-md border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:border-amber-500/40 hover:bg-zinc-800"
            onClick={onRetry}
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
