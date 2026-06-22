import { useCallback, useEffect, useId } from "react";

const TONE_PRESETS = {
  danger: {
    panel: "border-red-500/35",
    iconWrap: "bg-red-950/55 text-red-200 ring-1 ring-red-500/45",
    consequence: "border-red-500/35 bg-red-950/35 text-red-100",
    confirmBtn: "border-red-500/80 bg-red-600 text-white hover:bg-red-500",
    icon: "⚠️",
  },
  warning: {
    panel: "border-amber-500/35",
    iconWrap: "bg-amber-950/55 text-amber-200 ring-1 ring-amber-500/45",
    consequence: "border-amber-500/35 bg-amber-950/35 text-amber-100",
    confirmBtn: "border-amber-500/80 bg-amber-500 text-amber-950 hover:bg-amber-400",
    icon: "⚠️",
  },
  primary: {
    panel: "border-blue-500/35",
    iconWrap: "bg-blue-950/55 text-blue-200 ring-1 ring-blue-500/45",
    consequence: "border-blue-500/35 bg-blue-950/35 text-blue-100",
    confirmBtn: "border-blue-500/80 bg-blue-600 text-white hover:bg-blue-500",
    icon: "ℹ️",
  },
  neutral: {
    panel: "border-slate-600/60",
    iconWrap: "bg-slate-800 text-slate-200 ring-1 ring-slate-600/60",
    consequence: "border-slate-700/60 bg-slate-900/70 text-slate-200",
    confirmBtn: "border-slate-500/75 bg-slate-700 text-slate-100 hover:bg-slate-600",
    icon: "ℹ️",
  },
};

/**
 * Modal de confirmação para ações críticas/destrutivas.
 * Substitui confirms nativos para manter consistência visual e clareza.
 */
export default function ConfirmActionModal({
  open,
  title,
  description,
  consequence,
  confirmLabel = "Confirmar",
  confirmLoadingLabel = "Confirmando...",
  cancelLabel = "Cancelar",
  tone = "danger",
  loading = false,
  confirmDisabled = false,
  secondaryActionLabel = "",
  onSecondaryAction,
  secondaryActionDisabled = false,
  onConfirm,
  onClose,
  children = null,
}) {
  const titleId = useId();
  const tonePreset = TONE_PRESETS[tone] || TONE_PRESETS.neutral;

  const handleClose = useCallback(() => {
    if (loading) return;
    onClose?.();
  }, [loading, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]"
        aria-label="Fechar confirmação"
        onClick={handleClose}
      />
      <div className={`relative z-[1] flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-zinc-950 shadow-2xl ${tonePreset.panel}`}>
        <header className="flex items-start gap-3 border-b border-zinc-800 px-5 py-4">
          <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${tonePreset.iconWrap}`} aria-hidden="true">
            {tonePreset.icon}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Ação crítica</p>
            <h2 id={titleId} className="mt-1 text-base font-semibold text-zinc-100 sm:text-lg">
              {title}
            </h2>
          </div>
        </header>

        <div className="space-y-3 px-5 py-4">
          {description ? <p className="text-sm leading-relaxed text-zinc-200">{description}</p> : null}
          {consequence ? (
            <p className={`rounded-lg border px-3 py-2 text-sm leading-relaxed ${tonePreset.consequence}`}>{consequence}</p>
          ) : null}
          {children}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="fc-btn rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {cancelLabel}
          </button>
          {secondaryActionLabel && onSecondaryAction ? (
            <button
              type="button"
              onClick={onSecondaryAction}
              disabled={loading || secondaryActionDisabled}
              className="fc-btn rounded-lg border border-zinc-500 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {secondaryActionLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            className={`fc-btn rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${tonePreset.confirmBtn}`}
          >
            {loading ? confirmLoadingLabel : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
