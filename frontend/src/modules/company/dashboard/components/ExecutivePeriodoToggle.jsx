import { PERIODO_OPCOES } from "../lib/executivePeriodStorage";

export default function ExecutivePeriodoToggle({ periodo, onChange, className = "" }) {
  return (
    <div
      className={`no-scrollbar flex w-full gap-2 overflow-x-auto pb-1 sm:w-auto sm:justify-end ${className}`.trim()}
      role="group"
      aria-label="Período do painel executivo"
    >
      {PERIODO_OPCOES.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          className={`fc-btn shrink-0 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
            periodo === p.id
              ? "fc-btn-empresa-primary border-sky-400/50 bg-sky-500/20 text-zinc-50 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]"
              : "fc-btn-empresa-secondary border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-500"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
