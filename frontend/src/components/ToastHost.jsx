import { memo } from "react";

function ToastHost({ toasts, onClose }) {
  const toneClass = (type) => {
    if (type === "error") return "border-red-700 bg-red-900/90 text-red-100";
    if (type === "warning") return "border-amber-600 bg-amber-900/85 text-amber-100";
    return "border-emerald-700 bg-emerald-900/90 text-emerald-100";
  };

  return (
    <div
      className="pointer-events-none fixed z-50 w-[calc(100vw-1.5rem)] max-w-[28rem] space-y-2"
      style={{
        top: "max(0.75rem, env(safe-area-inset-top, 0px))",
        right: "max(0.75rem, env(safe-area-inset-right, 0px))",
      }}
      role="region"
      aria-label="Notificacoes"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`fc-page pointer-events-auto w-full rounded-xl border px-4 py-3 text-sm shadow-xl ${toneClass(toast.type)}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-relaxed">{toast.message}</p>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {toast.actionLabel && typeof toast.onAction === "function" ? (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      toast.onAction();
                    } finally {
                      onClose(toast.id);
                    }
                  }}
                  className="text-xs font-semibold uppercase tracking-wide underline decoration-current/70 underline-offset-2 opacity-95 hover:opacity-100"
                >
                  {toast.actionLabel}
                </button>
              ) : null}
              <button type="button" onClick={() => onClose(toast.id)} className="text-xs underline opacity-90 hover:opacity-100">
                fechar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default memo(ToastHost);
