import { memo, useEffect, useMemo, useRef, useState } from "react";

const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const PURPLE = "#a855f7";

const GLOW =
  "0 0 20px rgba(34,197,94,0.12), 0 0 24px rgba(245,158,11,0.1), 0 0 24px rgba(168,85,247,0.1)";

const fmtTonLegend = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtTonCenter = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

const isMaterialVisible = (filter, id) => filter === "todos" || filter === id;

function centroLabelByFilter(materialFilter) {
  if (materialFilter === "esteril") return "Estéril";
  if (materialFilter === "rocha_pulmao") return "Rocha Pulmão";
  if (materialFilter === "rocha_armacao") return "Rocha Amarração";
  return "Total";
}

function isCentroLabelLong(materialFilter) {
  return materialFilter === "rocha_armacao";
}

/**
 * Donut: distribuição Estéril vs Rocha Pulmão vs Rocha Amarração (toneladas do período).
 */
function TransportPlanExecutadoPizza({
  totalToneladasEsteril,
  totalToneladasRochaPulmao,
  totalToneladasRochaArmacao,
  materialFilter = "todos",
}) {
  const { esteril, rochaPulmao, rochaArmacao, total, percentEsteril, percentRochaPulmao, percentRochaArmacao } =
    useMemo(() => {
      const e = Math.max(0, Number(totalToneladasEsteril) || 0);
      const rp = Math.max(0, Number(totalToneladasRochaPulmao) || 0);
      const ra = Math.max(0, Number(totalToneladasRochaArmacao) || 0);
      const t = e + rp + ra;
      return {
        esteril: e,
        rochaPulmao: rp,
        rochaArmacao: ra,
        total: t,
        percentEsteril: t > 0 ? (e / t) * 100 : 0,
        percentRochaPulmao: t > 0 ? (rp / t) * 100 : 0,
        percentRochaArmacao: t > 0 ? (ra / t) * 100 : 0,
      };
    }, [totalToneladasEsteril, totalToneladasRochaPulmao, totalToneladasRochaArmacao]);

  const [animProgress, setAnimProgress] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const start = performance.now();
    const duration = 800;

    setAnimProgress(0);
    cancelAnimationFrame(rafRef.current);

    const tick = (now) => {
      if (cancelled) return;
      const elapsed = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(elapsed);
      setAnimProgress(eased);
      if (elapsed < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setAnimProgress(1);
        rafRef.current = 0;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [total, percentEsteril, percentRochaPulmao, percentRochaArmacao]);

  const animatedEsteril = percentEsteril * animProgress;
  const animatedPulmao = percentRochaPulmao * animProgress;
  const animatedArmacao = percentRochaArmacao * animProgress;
  const limitPulmao = animatedEsteril + animatedPulmao;
  const limitArmacao = limitPulmao + animatedArmacao;
  const donutBackground =
    total > 0
      ? `conic-gradient(${GREEN} 0% ${animatedEsteril}%, ${AMBER} ${animatedEsteril}% ${limitPulmao}%, ${PURPLE} ${limitPulmao}% ${limitArmacao}%, #1f2937 ${limitArmacao}% 100%)`
      : "conic-gradient(#1f2937 0% 100%)";
  const showEsteril = isMaterialVisible(materialFilter, "esteril");
  const showRochaPulmao = isMaterialVisible(materialFilter, "rocha_pulmao");
  const showRochaArmacao = isMaterialVisible(materialFilter, "rocha_armacao");
  const centroLabel = centroLabelByFilter(materialFilter);
  const centroLabelLong = isCentroLabelLong(materialFilter);
  const centroValor =
    materialFilter === "esteril"
      ? esteril
      : materialFilter === "rocha_pulmao"
        ? rochaPulmao
        : materialFilter === "rocha_armacao"
          ? rochaArmacao
          : total;

  const pctLine = (p) =>
    `${p.toLocaleString("pt-BR", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}%`;

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-4 sm:max-w-none">
      <div
        className="group relative inline-flex shrink-0 flex-col items-center"
        aria-label="Distribuição de toneladas por material"
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
                {fmtTonCenter(centroValor)} t
              </span>
              <span
                className={`mt-1 text-center font-medium text-zinc-500 ${
                  centroLabelLong
                    ? "max-w-[4.9rem] text-[9px] leading-tight tracking-[0.01em] sm:max-w-[6.5rem] sm:text-[11px]"
                    : "text-[10px] uppercase tracking-wide sm:text-xs"
                }`}
              >
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
          {showRochaPulmao ? (
            <p className={showEsteril ? "mt-1 tabular-nums leading-relaxed" : "tabular-nums leading-relaxed"}>
              <span className="text-zinc-400">Rocha Pulmão:</span>{" "}
              <span className="font-semibold text-zinc-100">{pctLine(percentRochaPulmao)}</span>
            </p>
          ) : null}
          {showRochaArmacao ? (
            <p
              className={
                showEsteril || showRochaPulmao ? "mt-1 tabular-nums leading-relaxed" : "tabular-nums leading-relaxed"
              }
            >
              <span className="text-zinc-400">Rocha Amarração:</span>{" "}
              <span className="font-semibold text-zinc-100">{pctLine(percentRochaArmacao)}</span>
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
        {showRochaPulmao ? (
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
              🟠
            </span>
            <span>
              <span className="font-semibold text-zinc-100">Rocha Pulmão:</span>{" "}
              <span className="tabular-nums text-zinc-300">{fmtTonLegend(rochaPulmao)} t</span>
            </span>
          </li>
        ) : null}
        {showRochaArmacao ? (
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
              🟣
            </span>
            <span>
              <span className="font-semibold text-zinc-100">Rocha Amarração:</span>{" "}
              <span className="tabular-nums text-zinc-300">{fmtTonLegend(rochaArmacao)} t</span>
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export default memo(TransportPlanExecutadoPizza);
