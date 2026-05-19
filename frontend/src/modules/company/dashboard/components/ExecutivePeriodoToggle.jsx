import { PERIODO_OPCOES } from "../lib/executivePeriodStorage";

export default function ExecutivePeriodoToggle({ periodo, onChange, className = "" }) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`.trim()}
      role="group"
      aria-label="Período do painel executivo"
    >
      {PERIODO_OPCOES.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          className={`fc-btn rounded-md border px-3 py-2 text-sm font-medium transition ${
            periodo === p.id
              ? "border-amber-500/50 bg-zinc-800/80 text-zinc-50 shadow-inner"
              : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-600"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
