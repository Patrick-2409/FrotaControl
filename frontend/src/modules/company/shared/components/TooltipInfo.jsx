import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.3v6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

export default function TooltipInfo({ text, className = "", panelClassName = "" }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const ref = useRef(null);
  const pointerOpenRef = useRef(false);
  const tipId = useId();

  const updatePosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
    const margin = 12;
    const maxPanelWidth = Math.min(288, Math.max(160, viewportW - margin * 2));
    const half = maxPanelWidth / 2;
    const center = rect.left + rect.width / 2;
    const left = Math.min(Math.max(center, margin + half), Math.max(margin + half, viewportW - margin - half));
    const hasRoomBelow = rect.bottom + 128 < viewportH;
    const placement = hasRoomBelow || rect.top < 150 ? "bottom" : "top";
    const top = placement === "bottom" ? rect.bottom + 8 : rect.top - 8;
    setPosition({ left, top, placement, maxPanelWidth });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const onDocClick = (ev) => {
      if (!ref.current?.contains(ev.target)) setOpen(false);
    };
    const onKeyDown = (ev) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const show = () => {
    setOpen(true);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame?.(updatePosition);
    }
  };

  const tooltipPanel =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <span
            id={tipId}
            role="tooltip"
            className={`fc-tooltip-panel pointer-events-none fixed z-[90] rounded-md border border-zinc-700/85 bg-zinc-950/95 px-2.5 py-1.5 text-[11px] leading-snug text-zinc-100 shadow-2xl ring-1 ring-black/30 transition ${
              open ? "scale-100 opacity-100" : "scale-95 opacity-0"
            } ${panelClassName}`.trim()}
            style={{
              left: position.left,
              top: position.top,
              maxWidth: position.maxPanelWidth,
              width: "max-content",
              transform:
                position.placement === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
            }}
          >
            {text}
          </span>,
          document.body
        )
      : null;

  return (
    <span
      ref={ref}
      className={`inline-flex items-center align-middle ${className}`.trim()}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        className="fc-tooltip-trigger inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-900/90 text-zinc-400 transition hover:border-sky-400/70 hover:text-sky-200 focus-visible:border-sky-400 focus-visible:text-sky-100"
        aria-label="Mostrar explicação"
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onPointerDown={() => {
          pointerOpenRef.current = open;
        }}
        onClick={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const next = !pointerOpenRef.current;
          setOpen(next);
          if (next && typeof window !== "undefined") {
            window.requestAnimationFrame?.(updatePosition);
          }
        }}
      >
        <InfoIcon />
      </button>
      {tooltipPanel}
    </span>
  );
}
