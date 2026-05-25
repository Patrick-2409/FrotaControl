import { memo, useCallback } from "react";
import { inputClass } from "../../components/FormField";

function IconEsteril({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 6 10 12 21 18 10 12 3.5z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path d="M12 8v8" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}

function IconRocha({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 17.5 8 10 11.5 13 14.5 10.5 19.5 17"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 18.5h18" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  );
}

export const ApontadorRegistradoFlash = memo(function ApontadorRegistradoFlash({ open, visibleIn, message }) {
  if (!open) return null;
  const text = typeof message === "string" && message.trim() ? message.trim() : "+1 ✔";
  return (
    <output
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[100] max-w-[min(92vw,22rem)] -translate-x-1/2 rounded-2xl border border-emerald-400/60 bg-emerald-950/95 px-6 py-3.5 text-center text-xl font-bold leading-tight text-emerald-50 shadow-2xl shadow-black/50 transition-all duration-200 ease-out motion-reduce:transition-none ${
        visibleIn ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      {text}
    </output>
  );
});

function playTipoButtonTap(el, variant) {
  if (!el || typeof el.animate !== "function") return;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch {
    /* ignorar */
  }
  const glow =
    variant === "esteril"
      ? "0 0 38px 4px rgba(34, 211, 238, 0.5)"
      : "0 0 38px 4px rgba(251, 146, 60, 0.52)";
  el.animate(
    [
      { transform: "scale(0.95)", filter: "brightness(1)", boxShadow: "0 0 0 0 rgba(0,0,0,0)" },
      { transform: "scale(1)", filter: "brightness(1.3)", boxShadow: glow },
      { transform: "scale(1)", filter: "brightness(1)", boxShadow: "0 0 0 0 rgba(0,0,0,0)" },
    ],
    { duration: 360, easing: "cubic-bezier(0.34, 1.45, 0.64, 1)" }
  );
}

export const ApontadorVeiculoField = memo(function ApontadorVeiculoField({
  loadingVeiculos,
  veiculos,
  veiculoId,
  onChangeVeiculo,
}) {
  return (
    <div>
      <label htmlFor="apontador-veiculo" className="mb-2 block text-center text-sm font-medium text-slate-400">
        Veículo
      </label>
      {loadingVeiculos ? (
        <div
          className={`${inputClass} fc-apontador-select mx-auto flex min-h-[3.75rem] w-full max-w-sm items-center justify-center px-5 text-base text-slate-400`}
        >
          Carregando…
        </div>
      ) : (
        <select
          id="apontador-veiculo"
          className={`${inputClass} fc-apontador-select mx-auto block w-full max-w-sm text-base`}
          value={veiculoId}
          onChange={(e) => onChangeVeiculo(e.target.value)}
          disabled={veiculos.length === 0}
        >
          <option value="">Selecionar</option>
          {veiculos.map((v) => (
            <option key={v.id} value={String(v.id)}>
              {v.placa} — {v.nome}
            </option>
          ))}
        </select>
      )}
    </div>
  );
});

export const ApontadorTipoButtons = memo(function ApontadorTipoButtons({ podeRegistrar, onEsteril, onRocha, avisoInvalido }) {
  const pressEsteril = useCallback(
    (e) => {
      if (!podeRegistrar) return;
      playTipoButtonTap(e.currentTarget, "esteril");
      onEsteril();
    },
    [podeRegistrar, onEsteril]
  );

  const pressRocha = useCallback(
    (e) => {
      if (!podeRegistrar) return;
      playTipoButtonTap(e.currentTarget, "rocha");
      onRocha();
    },
    [podeRegistrar, onRocha]
  );

  return (
    <div className="flex w-full flex-col items-center gap-5 sm:gap-6">
      {avisoInvalido ? (
        <p
          className="w-full max-w-sm rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-base font-semibold text-amber-100"
          role="alert"
        >
          Selecione um veículo para iniciar
        </p>
      ) : null}
      <button
        type="button"
        disabled={!podeRegistrar}
        aria-disabled={!podeRegistrar}
        onClick={pressEsteril}
        className="fc-btn fc-apontador-tipo-btn flex w-full min-h-[88px] max-w-sm items-center justify-center gap-2.5 rounded-2xl border-2 border-cyan-400/85 bg-blue-600/60 px-4 py-5 text-2xl font-extrabold tracking-wide text-white shadow-xl shadow-cyan-950/45 ring-1 ring-white/10 transition enabled:hover:border-cyan-300 enabled:hover:bg-blue-500/75 enabled:hover:ring-white/15 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[96px] sm:gap-3 sm:text-3xl"
      >
        <IconEsteril className="h-5 w-5 shrink-0 text-cyan-100/90 sm:h-6 sm:w-6" />
        <span className="drop-shadow-sm">[ + ESTÉRIL ]</span>
      </button>
      <button
        type="button"
        disabled={!podeRegistrar}
        aria-disabled={!podeRegistrar}
        onClick={pressRocha}
        className="fc-btn fc-apontador-tipo-btn flex w-full min-h-[88px] max-w-sm items-center justify-center gap-2.5 rounded-2xl border-2 border-orange-300/85 bg-gradient-to-b from-orange-500/55 to-orange-700/45 px-4 py-5 text-2xl font-extrabold tracking-wide text-orange-50 shadow-xl shadow-orange-950/40 ring-1 ring-orange-200/15 transition enabled:hover:border-amber-300 enabled:hover:from-orange-500/70 enabled:hover:to-orange-700/60 enabled:hover:ring-orange-100/20 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[96px] sm:gap-3 sm:text-3xl"
      >
        <IconRocha className="h-5 w-5 shrink-0 text-orange-100/90 sm:h-6 sm:w-6" />
        <span className="drop-shadow-sm">[ + ROCHA ]</span>
      </button>
    </div>
  );
});

export const ApontadorHojeResumo = memo(function ApontadorHojeResumo({
  esteril,
  rocha,
  tonTotal,
  onLimparDia,
  ultimosLancamentos = [],
}) {
  const totalViagens = (Number(esteril) || 0) + (Number(rocha) || 0);
  const ton = Number(tonTotal);
  const mostrarToneladas = Number.isFinite(ton) && ton > 0;
  const tonArred = Math.round(ton);

  return (
    <section
      className="mx-auto w-full max-w-lg rounded-2xl border border-slate-500/35 bg-slate-800/72 px-3 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] shadow-black/25 sm:px-5"
      aria-label="Produção de hoje"
    >
      <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Hoje</p>
      <div
        className="mt-4 grid grid-cols-3 gap-2 sm:gap-4"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Estéril</p>
          <p className="mt-1 text-4xl font-black tabular-nums leading-none text-cyan-300 sm:text-5xl sm:leading-none md:text-6xl">
            {esteril}
          </p>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Rocha</p>
          <p className="mt-1 text-4xl font-black tabular-nums leading-none text-amber-300 sm:text-5xl sm:leading-none md:text-6xl">
            {rocha}
          </p>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Total</p>
          <p className="mt-1 text-4xl font-black tabular-nums leading-none text-slate-100 sm:text-5xl sm:leading-none md:text-6xl">
            {totalViagens}
          </p>
        </div>
      </div>
      {mostrarToneladas ? (
        <p className="mt-4 text-center text-base font-semibold tabular-nums text-emerald-200/95 sm:text-lg md:text-xl">
          ≈ {tonArred} t movimentadas
        </p>
      ) : null}
      {typeof onLimparDia === "function" ? (
        <div className="mt-4 flex justify-center border-t border-slate-500/25 pt-3">
          <button
            type="button"
            onClick={onLimparDia}
            className="text-[11px] font-medium text-slate-500 underline decoration-slate-600 underline-offset-2 transition hover:text-slate-400"
          >
            Resetar dia…
          </button>
        </div>
      ) : null}
      <div className="mt-4 border-t border-slate-500/25 pt-3">
        <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Últimos lançamentos</p>
        {Array.isArray(ultimosLancamentos) && ultimosLancamentos.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {ultimosLancamentos.slice(0, 5).map((item) => (
              <div
                key={String(item.id)}
                className="flex items-center justify-between rounded-lg border border-slate-600/35 bg-slate-900/45 px-3 py-2 text-xs"
              >
                <span className="font-medium text-slate-200">{item.hora}</span>
                <span className={`font-semibold ${item.tipo === "esteril" ? "text-cyan-300" : "text-amber-300"}`}>
                  {item.tipo === "esteril" ? "Estéril" : "Rocha"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-center text-xs text-slate-400">Sem lançamentos hoje.</p>
        )}
      </div>
    </section>
  );
});
