import { memo, useMemo } from "react";

const GREEN = "#16a34a";
const GRAY = "#e5e7eb";

const fmtTonLegend = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

/**
 * Pizza / donut: executado (verde) vs restante da meta (cinza), sem bibliotecas.
 */
function TransportPlanExecutadoPizza({ metaTotal, executadoTotal }) {
  const { total, exec, restante, percentExec, labelPct } = useMemo(() => {
    const totalN = Math.max(0, Number(metaTotal) || 0);
    const execN = Math.max(0, Number(executadoTotal) || 0);
    const rest = Math.max(totalN - execN, 0);
    const rawPct = totalN > 0 ? (execN / totalN) * 100 : 0;
    const pctSlice = Math.min(100, Math.max(0, rawPct));
    const label =
      totalN > 0
        ? `${rawPct.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`
        : "—";
    return { total: totalN, exec: execN, restante: rest, percentExec: pctSlice, labelPct: label };
  }, [metaTotal, executadoTotal]);

  const pieBackground =
    total > 0
      ? `conic-gradient(${GREEN} 0% ${percentExec}%, ${GRAY} ${percentExec}% 100%)`
      : `conic-gradient(${GRAY} 0% 100%)`;

  return (
    <div
      className="flex w-full max-w-md flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-center sm:gap-8 md:max-w-none"
      aria-label="Gráfico executado versus restante da meta"
    >
      <div className="relative flex h-[140px] w-[140px] shrink-0 items-center justify-center sm:h-[150px] sm:w-[150px]">
        <div
          className="absolute inset-0 rounded-full shadow-inner"
          style={{ background: pieBackground }}
          aria-hidden
        />
        <div
          className="relative z-[1] flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full border border-zinc-700/90 bg-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:h-[94px] sm:w-[94px]"
        >
          <span className="text-center text-lg font-black tabular-nums leading-none tracking-tight text-zinc-50 sm:text-xl">
            {labelPct}
          </span>
        </div>
      </div>

      <ul className="w-full space-y-3 text-sm text-zinc-200 sm:w-auto sm:min-w-[200px]">
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
            🟢
          </span>
          <span>
            <span className="font-semibold text-zinc-100">Executado:</span>{" "}
            <span className="tabular-nums text-zinc-300">{fmtTonLegend(exec)} t</span>
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
            ⚪
          </span>
          <span>
            <span className="font-semibold text-zinc-100">Restante:</span>{" "}
            <span className="tabular-nums text-zinc-300">{fmtTonLegend(restante)} t</span>
          </span>
        </li>
      </ul>
    </div>
  );
}

export default memo(TransportPlanExecutadoPizza);
