import { memo } from "react";
import { inputClass } from "../../components/FormField";

export const ApontadorRegistradoFlash = memo(function ApontadorRegistradoFlash({ open, visibleIn }) {
  if (!open) return null;
  return (
    <output
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[100] -translate-x-1/2 whitespace-nowrap rounded-2xl border border-emerald-400/60 bg-emerald-950/95 px-8 py-3.5 text-xl font-bold text-emerald-50 shadow-2xl shadow-black/50 transition-all duration-200 ease-out motion-reduce:transition-none ${
        visibleIn ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      Registrado ✅
    </output>
  );
});

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
        <div className={`${inputClass} flex h-14 items-center justify-center px-3 text-base text-slate-400`}>
          Carregando…
        </div>
      ) : (
        <select
          id="apontador-veiculo"
          className={`${inputClass} mx-auto block h-14 w-full max-w-sm text-base`}
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
  return (
    <div className="flex w-full flex-col items-center gap-5 sm:gap-6">
      {avisoInvalido ? (
        <p
          className="w-full max-w-sm rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-base font-semibold text-amber-100"
          role="alert"
        >
          Selecione veículo válido
        </p>
      ) : null}
      <button
        type="button"
        disabled={!podeRegistrar}
        aria-disabled={!podeRegistrar}
        onClick={onEsteril}
        className="fc-btn flex w-full min-h-[88px] max-w-sm items-center justify-center rounded-2xl border-2 border-blue-500/70 bg-blue-600/35 px-4 py-5 text-2xl font-extrabold tracking-wide text-white shadow-xl shadow-blue-950/50 transition enabled:hover:border-sky-400 enabled:hover:bg-blue-500/45 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[96px] sm:text-3xl"
      >
        [ + ESTÉRIL ]
      </button>
      <button
        type="button"
        disabled={!podeRegistrar}
        aria-disabled={!podeRegistrar}
        onClick={onRocha}
        className="fc-btn flex w-full min-h-[88px] max-w-sm items-center justify-center rounded-2xl border-2 border-orange-500/70 bg-gradient-to-b from-orange-600/40 to-red-700/35 px-4 py-5 text-2xl font-extrabold tracking-wide text-orange-50 shadow-xl shadow-orange-950/40 transition enabled:hover:border-orange-400 enabled:hover:from-orange-500/50 enabled:hover:to-red-600/40 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[96px] sm:text-3xl"
      >
        [ + ROCHA ]
      </button>
    </div>
  );
});

export const ApontadorHojeResumo = memo(function ApontadorHojeResumo({ esteril, rocha }) {
  return (
    <section
      className="mx-auto w-full max-w-sm rounded-2xl border border-slate-700/90 bg-slate-900/80 px-4 py-5 shadow-inner shadow-black/20"
      aria-label="Produção de hoje"
    >
      <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Hoje</p>
      <div className="mt-3 grid grid-cols-2 gap-4" role="status" aria-live="polite" aria-atomic="true">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Estéril</p>
          <p className="mt-1 text-5xl font-black tabular-nums leading-none text-cyan-300 sm:text-6xl">{esteril}</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rocha</p>
          <p className="mt-1 text-5xl font-black tabular-nums leading-none text-amber-300 sm:text-6xl">{rocha}</p>
        </div>
      </div>
    </section>
  );
});
