import { Link } from "react-router-dom";

export default function ExecutiveModuleCard({ title, to, accent = "zinc", children, footer }) {
  const accentMap = {
    amber: "border-amber-500/35 bg-amber-950/20",
    blue: "border-sky-500/35 bg-sky-950/20",
    emerald: "border-emerald-500/35 bg-emerald-950/20",
    violet: "border-violet-500/35 bg-violet-950/20",
    zinc: "border-zinc-700/90 bg-zinc-950/70",
  };
  const accentClass = accentMap[accent] || accentMap.zinc;

  return (
    <article className={`fc-card flex h-full flex-col rounded-xl border p-4 ${accentClass}`}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-100">{title}</h3>
        {to ? (
          <Link to={to} className="shrink-0 text-xs font-semibold text-amber-300/90 hover:text-amber-200">
            Abrir
          </Link>
        ) : null}
      </header>
      <div className="flex flex-1 flex-col gap-2 text-sm text-zinc-300">{children}</div>
      {footer ? <p className="mt-3 border-t border-zinc-800/70 pt-2 text-xs text-zinc-500">{footer}</p> : null}
    </article>
  );
}
