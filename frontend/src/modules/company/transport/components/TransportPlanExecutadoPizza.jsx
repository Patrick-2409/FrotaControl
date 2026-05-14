import { memo, useMemo } from "react";

const GREEN = "#16a34a";
const GRAY = "#e5e7eb";

/**
 * Donut principal: executado (#16a34a) vs restante da meta (#e5e7eb), conic-gradient sem bibliotecas.
 */
function TransportPlanExecutadoPizza({ metaTotal, executadoTotal }) {
  const { total, percentExec, labelPct } = useMemo(() => {
    const totalN = Math.max(0, Number(metaTotal) || 0);
    const execN = Math.max(0, Number(executadoTotal) || 0);
    const rawPct = totalN > 0 ? (execN / totalN) * 100 : 0;
    const pctSlice = Math.min(100, Math.max(0, rawPct));
    const label =
      totalN > 0
        ? `${rawPct.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`
        : "—";
    return { total: totalN, percentExec: pctSlice, labelPct: label };
  }, [metaTotal, executadoTotal]);

  const pieBackground =
    total > 0
      ? `conic-gradient(${GREEN} 0% ${percentExec}%, ${GRAY} ${percentExec}% 100%)`
      : `conic-gradient(${GRAY} 0% 100%)`;

  return (
    <div
      className="relative flex h-[160px] w-[160px] shrink-0 items-center justify-center"
      aria-label="Gráfico executado versus restante da meta"
    >
      <div
        className="absolute inset-0 rounded-full shadow-inner"
        style={{ background: pieBackground }}
        aria-hidden
      />
      <div
        className="relative z-[1] flex h-[100px] w-[100px] flex-col items-center justify-center rounded-full border border-zinc-700/90 bg-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        <span className="text-center text-xl font-black tabular-nums leading-none tracking-tight text-zinc-50 sm:text-2xl">
          {labelPct}
        </span>
      </div>
    </div>
  );
}

export default memo(TransportPlanExecutadoPizza);
