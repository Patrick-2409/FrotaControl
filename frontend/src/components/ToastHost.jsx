import { memo } from "react";

function ToastHost({ toasts, onClose }) {
  const toneClass = (type) => {
    if (type === "error") return "border-red-700 bg-red-900/90 text-red-100";
    if (type === "warning") return "border-amber-600 bg-amber-900/85 text-amber-100";
    return "border-emerald-700 bg-emerald-900/90 text-emerald-100";
  };

  return (
    <div
      className="pointer-events-none fixed right-3 top-3 z-50 space-y-2"
      role="region"
      aria-label="Notificacoes"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`fc-page pointer-events-auto min-w-64 rounded-xl border px-4 py-3 text-sm shadow-xl ${toneClass(toast.type)}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="max-w-[220px]">{toast.message}</p>
            <button onClick={() => onClose(toast.id)} className="text-xs underline opacity-90 hover:opacity-100">
              fechar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default memo(ToastHost);
