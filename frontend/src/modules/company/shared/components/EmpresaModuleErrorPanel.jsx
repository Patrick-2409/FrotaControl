/**
 * Painel de falha de módulo (ERP): ação clara de repetir, sem mensagem genérica solta.
 */
export default function EmpresaModuleErrorPanel({
  title = "Indisponível no momento",
  description = "Não foi possível concluir o pedido ao servidor. Verifique a ligação e tente novamente.",
  onRetry,
  retryLabel = "Tentar novamente",
}) {
  return (
    <div
      className="rounded-md border border-zinc-700 bg-zinc-950/70 p-6 shadow-inner ring-1 ring-inset ring-zinc-800/60"
      role="alert"
    >
      <p className="fc-erp-eyebrow text-amber-200/90">Operação</p>
      <h3 className="mt-2 text-lg font-semibold tracking-tight text-zinc-100">{title}</h3>
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
  );
}
