import { memo } from "react";

function PeopleRoleFilter({ value, options, onChange, disabled = false }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por papel">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value || "all"}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? "border-amber-500/60 bg-amber-500/15 text-amber-50"
                : "border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default memo(PeopleRoleFilter);
