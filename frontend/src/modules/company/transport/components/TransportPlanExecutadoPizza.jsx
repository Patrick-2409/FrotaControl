import { memo, useEffect, useMemo, useRef, useState } from "react";

const GLOW =
  "0 0 20px rgba(34,197,94,0.15), 0 0 40px rgba(34,197,94,0.05)";

const fmtTonTooltip = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/**
 * Donut premium: mesma lógica de percentagem (fatia até 100%); restante = max(meta − exec, 0).
 * Sem dependências externas — conic-gradient + animação leve.
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

  const [animSlice, setAnimSlice] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const target = total > 0 ? percentExec : 0;
    let cancelled = false;
    const start = performance.now();
    const duration = 800;

    setAnimSlice(0);
    cancelAnimationFrame(rafRef.current);

    const tick = (now) => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      setAnimSlice(easeOutCubic(t) * target);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setAnimSlice(target);
        rafRef.current = 0;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [total, percentExec]);

  const donutBackground =
    total > 0 && animSlice > 0.001
      ? `conic-gradient(#22c55e 0%, #4ade80 ${animSlice}%, #1f2937 ${animSlice}% 100%)`
      : total > 0
        ? "conic-gradient(#1f2937 0% 100%)"
        : "conic-gradient(#1f2937 0% 100%)";

  return (
    <div
      className="group relative inline-flex shrink-0 flex-col items-center"
      aria-label="Gráfico executado versus restante da meta"
    >
      <div className="transition-transform duration-300 ease-out will-change-transform group-hover:scale-[1.03]">
        <div className="relative flex h-[120px] w-[120px] items-center justify-center rounded-full sm:h-[160px] sm:w-[160px]">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: donutBackground,
              boxShadow: GLOW,
            }}
            aria-hidden
          />
          <div
            className="relative z-[1] flex h-[70%] w-[70%] flex-col items-center justify-center rounded-full bg-[#020617]"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
          >
            <span className="text-center text-xl font-black tabular-nums leading-none tracking-tight text-zinc-50 sm:text-3xl">
              {labelPct}
            </span>
            <span
              className={`mt-1 text-[10px] font-medium uppercase tracking-wide sm:text-xs ${total > 0 ? "text-zinc-500" : "text-zinc-600"}`}
            >
              Atingido
            </span>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max min-w-[10rem] -translate-x-1/2 rounded-lg border border-zinc-700/90 bg-zinc-950/95 px-3 py-2.5 text-left text-xs text-zinc-200 opacity-0 shadow-xl backdrop-blur-sm transition-opacity duration-200 ease-out group-hover:opacity-100"
        role="tooltip"
      >
        <p className="tabular-nums leading-relaxed">
          <span className="text-zinc-400">Executado:</span>{" "}
          <span className="font-semibold text-zinc-100">{fmtTonTooltip(exec)} t</span>
        </p>
        <p className="mt-1 tabular-nums leading-relaxed">
          <span className="text-zinc-400">Restante:</span>{" "}
          <span className="font-semibold text-zinc-100">{fmtTonTooltip(restante)} t</span>
        </p>
      </div>
    </div>
  );
}

export default memo(TransportPlanExecutadoPizza);
