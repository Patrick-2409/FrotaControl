import { useEffect, useState } from "react";
import SectionCard from "./SectionCard";

function Chevron({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AccordionSection({
  id,
  title,
  description,
  children,
  actions = null,
  className = "",
  contentClassName = "",
  defaultOpenDesktop = true,
  defaultOpenMobile = false,
}) {
  const [open, setOpen] = useState(defaultOpenMobile);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    setOpen(isDesktop ? defaultOpenDesktop : defaultOpenMobile);
  }, [defaultOpenDesktop, defaultOpenMobile]);

  return (
    <SectionCard
      titleId={id}
      className={className}
      contentClassName={contentClassName}
      title={null}
      description={null}
      actions={null}
    >
      <button
        type="button"
        className="fc-btn fc-btn-empresa-secondary -mx-1 mb-3 flex min-h-[48px] w-[calc(100%+0.5rem)] items-center justify-between rounded-lg border border-zinc-700/85 px-3 py-2 text-left"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={`${id}-content`}
      >
        <span className="min-w-0">
          <span id={id} className="block truncate text-sm font-semibold text-zinc-100 sm:text-base">
            {title}
          </span>
          {description ? <span className="mt-0.5 block text-xs text-zinc-500 sm:text-sm">{description}</span> : null}
        </span>
        <span className="ml-3 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/80 text-zinc-400">
          <Chevron open={open} />
        </span>
      </button>

      {actions ? <div className="mb-3 flex flex-wrap items-center gap-2">{actions}</div> : null}

      <div id={`${id}-content`} className={open ? "block" : "hidden"}>
        {children}
      </div>
    </SectionCard>
  );
}
