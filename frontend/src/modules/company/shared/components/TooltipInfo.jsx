import { useEffect, useId, useRef, useState } from "react";

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
  const ref = useRef(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (ev) => {
      if (!ref.current?.contains(ev.target)) setOpen(false);
    };
    const onKeyDown = (ev) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center align-middle ${className}`.trim()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="fc-tooltip-trigger inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-900/90 text-zinc-400 transition hover:border-sky-400/70 hover:text-sky-200 focus-visible:border-sky-400 focus-visible:text-sky-100"
        aria-label="Mostrar explicação"
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <InfoIcon />
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={`fc-tooltip-panel pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-[18rem] -translate-x-1/2 rounded-md border border-zinc-700/85 bg-zinc-950/95 px-2.5 py-1.5 text-[11px] leading-snug text-zinc-100 shadow-xl transition ${
          open ? "scale-100 opacity-100" : "scale-95 opacity-0"
        } ${panelClassName}`.trim()}
      >
        {text}
      </span>
    </span>
  );
}
