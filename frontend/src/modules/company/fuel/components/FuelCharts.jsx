import { memo } from "react";
import { fmtLitros, fmtPct } from "../services/fuelFormatters";

function FuelCharts({ pie }) {
  return (
    <div className="fc-erp-chart-surface min-w-0">
      <h3 className="text-sm font-semibold tracking-tight text-zinc-100">Consumo por veículo</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">Proporção de litros por veículo (diagrama radial).</p>
      <div className="mt-5 flex flex-col items-stretch gap-6 sm:mt-6 sm:flex-row sm:items-center sm:gap-8">
        <div
          className="mx-auto h-48 w-48 shrink-0 rounded-full border-[3px] border-zinc-800/95 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-zinc-700/35 sm:h-52 sm:w-52"
          style={pie.style}
          role="img"
          aria-label="Gráfico de pizza do consumo de combustível por veículo"
        />
        <ul className="min-w-0 flex-1 space-y-2 sm:space-y-2.5">
          {pie.slices.length === 0 ? (
            <li className="text-sm text-zinc-500">Sem litros no período para montar o gráfico.</li>
          ) : (
            pie.slices.map((s, idx) => (
              <li key={`pie-slice-${idx}`} className="flex items-center gap-2.5 text-sm text-zinc-300">
                <span
                  className="h-3 w-3 shrink-0 rounded-[3px] ring-1 ring-white/10"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate" title={s.label}>
                  {s.label}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500">{fmtPct(s.pct)}%</span>
                <span className="shrink-0 tabular-nums font-medium text-zinc-200">{fmtLitros(s.litros)} L</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export default memo(FuelCharts);
