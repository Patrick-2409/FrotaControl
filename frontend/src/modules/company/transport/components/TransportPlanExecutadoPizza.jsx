import { memo, useEffect, useMemo, useRef, useState } from "react";

const GREEN = "#22c55e";
const BLUE = "#3b82f6";

const GLOW =
  "0 0 20px rgba(34,197,94,0.12), 0 0 24px rgba(59,130,246,0.1), 0 0 40px rgba(34,197,94,0.04)";

const fmtTonLegend = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtTonCenter = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/**
 * Donut: distribuição Estéril vs Rocha (toneladas do período).
 * Dados: total_toneladas_esteril / total_toneladas_rocha do resumo de viagens.
 */
function TransportPlanExecutadoPizza({ totalToneladasEsteril, totalToneladasRocha, materialFilter = "todos" }) {
  const { esteril, rocha, total, percentEsteril, percentRocha } = useMemo(() => {
    const e = Math.max(0, Number(totalToneladasEsteril) || 0);
    const r = Math.max(0, Number(totalToneladasRocha) || 0);
    const t = e + r;
    const pe = t > 0 ? (e / t) * 100 : 0;
    const pr = t > 0 ? (r / t) * 100 : 0;
    return { esteril: e, rocha: r, total: t, percentEsteril: pe, percentRocha: pr };
  }, [totalToneladasEsteril, totalToneladasRocha]);

  const [animSlice, setAnimSlice] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const target = total > 0 ? percentEsteril : 0;
    let cancelled = false;
    const start = performance.now();
    const duration = 800;

    setAnimSlice(0);
    cancelAnimationFrame(rafRef.current);

    const tick = (now) => {
      if (cancelled) return;
      const el = Math.min(1, (now - start) / duration);
      setAnimSlice(easeOutCubic(el) * target);
      if (el < 1) {
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
  }, [total, percentEsteril]);

  const donutBackground =
    total > 0
      ? `conic-gradient(${GREEN} 0% ${animSlice}%, ${BLUE} ${animSlice}% 100%)`
      : "conic-gradient(#1f2937 0% 100%)";
  const showEsteril = materialFilter !== "rocha";
  const showRocha = materialFilter !== "esteril";
  const centroLabel =
    materialFilter === "esteril" ? "Estéril" : materialFilter === "rocha" ? "Rocha" : "Total";

  const pctLine = (p) =>
    `${p.toLocaleString("pt-BR", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}%`;

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-4 sm:max-w-none">
      <div
        className="group relative inline-flex shrink-0 flex-col items-center"
        aria-label="Distribuição de toneladas entre estéril e rocha"
      >
        <div className="transition-transform duration-300 ease-out will-change-transform group-hover:scale-[1.03]">
          <div className="relative flex h-[120px] w-[120px] items-center justify-center rounded-full sm:h-[160px] sm:w-[160px]">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: donutBackground,
                boxShadow: total > 0 ? GLOW : "none",
              }}
              aria-hidden
            />
            <div
              className="relative z-[1] flex h-[70%] w-[70%] flex-col items-center justify-center rounded-full bg-[#020617]"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
            >
              <span className="text-center text-xl font-black tabular-nums leading-none tracking-tight text-zinc-50 sm:text-3xl">
                {fmtTonCenter(total)} t
              </span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-xs">
                {centroLabel}
              </span>
            </div>
          </div>
        </div>

        <div
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max min-w-[10rem] -translate-x-1/2 rounded-lg border border-zinc-700/90 bg-zinc-950/95 px-3 py-2.5 text-left text-xs text-zinc-200 opacity-0 shadow-xl backdrop-blur-sm transition-opacity duration-200 ease-out group-hover:opacity-100"
          role="tooltip"
        >
          {showEsteril ? (
            <p className="tabular-nums leading-relaxed">
              <span className="text-zinc-400">Estéril:</span>{" "}
              <span className="font-semibold text-zinc-100">{pctLine(percentEsteril)}</span>
            </p>
          ) : null}
          {showRocha ? (
            <p className={showEsteril ? "mt-1 tabular-nums leading-relaxed" : "tabular-nums leading-relaxed"}>
              <span className="text-zinc-400">Rocha:</span>{" "}
              <span className="font-semibold text-zinc-100">{pctLine(percentRocha)}</span>
            </p>
          ) : null}
        </div>
      </div>

      <ul className="w-full space-y-2.5 text-sm text-zinc-200 sm:max-w-[16rem]">
        {showEsteril ? (
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
              🟢
            </span>
            <span>
              <span className="font-semibold text-zinc-100">Estéril:</span>{" "}
              <span className="tabular-nums text-zinc-300">{fmtTonLegend(esteril)} t</span>
            </span>
          </li>
        ) : null}
        {showRocha ? (
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
              🔵
            </span>
            <span>
              <span className="font-semibold text-zinc-100">Rocha:</span>{" "}
              <span className="tabular-nums text-zinc-300">{fmtTonLegend(rocha)} t</span>
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export default memo(TransportPlanExecutadoPizza);
