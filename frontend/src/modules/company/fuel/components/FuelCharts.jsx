import { memo } from "react";
import { fmtLitros, fmtPct } from "../services/fuelFormatters";

function FuelCharts({ pie }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-white">Consumo por veículo</h3>
      <p className="mt-1 text-xs text-slate-500">Proporção de litros por veículo (gráfico pizza).</p>
      <div className="mt-5 flex flex-col items-stretch gap-6 sm:flex-row sm:items-center">
        <div
          className="mx-auto h-52 w-52 shrink-0 rounded-full border-4 border-slate-700/90 shadow-2xl ring-2 ring-emerald-500/10"
          style={pie.style}
          role="img"
          aria-label="Gráfico de pizza do consumo de combustível por veículo"
        />
        <ul className="min-w-0 flex-1 space-y-2.5">
          {pie.slices.length === 0 ? (
            <li className="text-sm text-slate-500">Sem litros no período para montar o gráfico.</li>
          ) : (
            pie.slices.map((s, idx) => (
              <li key={`pie-slice-${idx}`} className="flex items-center gap-2 text-sm text-slate-200">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-white/10"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate" title={s.label}>
                  {s.label}
                </span>
                <span className="shrink-0 tabular-nums text-slate-400">{fmtPct(s.pct)}%</span>
                <span className="shrink-0 tabular-nums font-medium text-emerald-300/90">{fmtLitros(s.litros)} L</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export default memo(FuelCharts);
