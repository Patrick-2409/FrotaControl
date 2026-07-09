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

const formatCapacidadeTon = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
};

const formatLancamentoVeiculo = (item) => {
  const codigo = String(item?.veiculo_codigo ?? "").trim();
  if (codigo) return `#${codigo}`;
  const id = Number(item?.veiculo_id);
  return Number.isFinite(id) && id > 0 ? `ID ${id}` : "ID --";
};

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
      : variant === "pulmao"
        ? "0 0 38px 4px rgba(251, 146, 60, 0.52)"
        : "0 0 38px 4px rgba(168, 85, 247, 0.5)";
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
  codigoVeiculo,
  veiculoSelecionado,
  codigoVeiculoInvalido,
  codigoSugestoes = [],
  onChangeVeiculo,
  onChangeCodigoVeiculo,
}) {
  const veiculoSelecionadoLabel = veiculoSelecionado
    ? [
        veiculoSelecionado.codigoLabel ? `#${veiculoSelecionado.codigoLabel}` : null,
        [veiculoSelecionado.placa, veiculoSelecionado.nome].filter(Boolean).join(" — "),
        veiculoSelecionado.motorista?.nome,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="space-y-3">
      <div className="mx-auto w-full max-w-sm">
        <label htmlFor="apontador-codigo-veiculo" className="mb-2 block text-center text-sm font-medium text-slate-300">
          Código do veículo
        </label>
        <input
          id="apontador-codigo-veiculo"
          className={`${inputClass} fc-apontador-select block w-full text-center text-3xl font-black tracking-[0.14em] tabular-nums sm:text-4xl`}
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={4}
          placeholder="01"
          value={codigoVeiculo}
          onChange={(e) => onChangeCodigoVeiculo(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          disabled={loadingVeiculos || veiculos.length === 0}
          aria-describedby={veiculoSelecionadoLabel ? "apontador-veiculo-selecionado" : undefined}
        />
        {veiculoSelecionadoLabel ? (
          <p
            id="apontador-veiculo-selecionado"
            className="mt-2 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-center text-sm font-semibold text-emerald-50"
          >
            {veiculoSelecionadoLabel}
          </p>
        ) : codigoVeiculoInvalido ? (
          <p className="mt-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-center text-xs font-semibold text-amber-100">
            ID não encontrado na relação de veículos.
          </p>
        ) : (
          <p className="mt-2 text-center text-xs text-slate-500">
            Digite o número da relação ou selecione pela lista.
          </p>
        )}
      </div>

      {codigoSugestoes.length > 0 ? (
        <div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-700/70 bg-slate-900/65 p-2">
          <p className="px-2 pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Toque para selecionar
          </p>
          <div className="space-y-2">
            {codigoSugestoes.map((v) => (
              <button
                type="button"
                key={v.opcaoId || `${v.id}:${v.motorista?.id || "sem-motorista"}`}
                onClick={() => onChangeVeiculo(v.opcaoId || v.id)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-left transition hover:border-emerald-400/55 hover:bg-emerald-500/10"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-lg font-black tabular-nums text-amber-100">#{v.codigoLabel}</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-slate-100">
                    {v.placa} — {v.nome}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-slate-400">{v.motorista?.nome || "Sem motorista vinculado"}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <details className="mx-auto w-full max-w-sm rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2">
        <summary className="cursor-pointer text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
          Seleção manual
        </summary>
        <div className="pt-3">
          {loadingVeiculos ? (
            <div
              className={`${inputClass} fc-apontador-select mx-auto flex min-h-[3.75rem] w-full items-center justify-center px-5 text-base text-slate-400`}
            >
              Carregando…
            </div>
          ) : (
            <select
              id="apontador-veiculo"
              className={`${inputClass} fc-apontador-select mx-auto block w-full text-base`}
              value={veiculoId}
              onChange={(e) => onChangeVeiculo(e.target.value)}
              disabled={veiculos.length === 0}
            >
              <option value="">Selecionar</option>
              {veiculos.map((v) => {
                const capacidadeEsteril = formatCapacidadeTon(v.capacidadeEsterilTon);
                const capacidadeRochaPulmao = formatCapacidadeTon(v.capacidadeRochaPulmaoTon);
                const capacidadeRochaArmacao = formatCapacidadeTon(v.capacidadeRochaArmacaoTon);
                const capacidades = [
                  capacidadeEsteril ? `Estéril ${capacidadeEsteril}` : null,
                  capacidadeRochaPulmao ? `Rocha Pulmão ${capacidadeRochaPulmao}` : null,
                  capacidadeRochaArmacao ? `Rocha Amarração ${capacidadeRochaArmacao}` : null,
                ].filter(Boolean);
                const codigo = v.codigoLabel ? `#${v.codigoLabel} · ` : "";
                return (
                  <option key={v.opcaoId || `${v.id}:${v.motorista?.id || "sem-motorista"}`} value={String(v.opcaoId || v.id)}>
                    {codigo}
                    {v.placa} — {v.nome}
                    {v.motorista?.nome ? ` · ${v.motorista.nome}` : ""}
                    {capacidades.length ? ` · ${capacidades.join(" · ")}` : ""}
                  </option>
                );
              })}
            </select>
          )}
        </div>
      </details>
    </div>
  );
});

export const ApontadorTipoButtons = memo(function ApontadorTipoButtons({
  podeRegistrar,
  onEsteril,
  onRochaPulmao,
  onRochaArmacao,
  avisoInvalido,
  avisoMensagem,
  capacidadeEsterilTon,
  capacidadeRochaPulmaoTon,
  capacidadeRochaArmacaoTon,
}) {
  const esterilDisponivel = podeRegistrar && Number(capacidadeEsterilTon) > 0;
  const rochaPulmaoDisponivel = podeRegistrar && Number(capacidadeRochaPulmaoTon) > 0;
  const rochaArmacaoDisponivel = podeRegistrar && Number(capacidadeRochaArmacaoTon) > 0;
  const capacidadeEsterilLabel = formatCapacidadeTon(capacidadeEsterilTon);
  const capacidadeRochaPulmaoLabel = formatCapacidadeTon(capacidadeRochaPulmaoTon);
  const capacidadeRochaArmacaoLabel = formatCapacidadeTon(capacidadeRochaArmacaoTon);
  const esterilLabel = capacidadeEsterilLabel ? `${capacidadeEsterilLabel} por viagem` : "Não transporta estéril";
  const rochaPulmaoLabel = capacidadeRochaPulmaoLabel
    ? `${capacidadeRochaPulmaoLabel} por viagem`
    : "Não transporta rocha pulmão";
  const rochaArmacaoLabel = capacidadeRochaArmacaoLabel
    ? `${capacidadeRochaArmacaoLabel} por viagem`
    : "Não transporta rocha amarração";
  const pressEsteril = useCallback(
    (e) => {
      if (!esterilDisponivel) return;
      playTipoButtonTap(e.currentTarget, "esteril");
      onEsteril();
    },
    [esterilDisponivel, onEsteril]
  );

  const pressRochaPulmao = useCallback(
    (e) => {
      if (!rochaPulmaoDisponivel) return;
      playTipoButtonTap(e.currentTarget, "pulmao");
      onRochaPulmao();
    },
    [rochaPulmaoDisponivel, onRochaPulmao]
  );

  const pressRochaArmacao = useCallback(
    (e) => {
      if (!rochaArmacaoDisponivel) return;
      playTipoButtonTap(e.currentTarget, "armacao");
      onRochaArmacao();
    },
    [rochaArmacaoDisponivel, onRochaArmacao]
  );

  return (
    <div className="flex w-full flex-col items-center gap-5 sm:gap-6">
      {avisoInvalido ? (
        <p
          className="w-full max-w-sm rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-base font-semibold text-amber-100"
          role="alert"
        >
          {avisoMensagem || "Selecione um veículo para iniciar"}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!esterilDisponivel}
        aria-disabled={!esterilDisponivel}
        onClick={pressEsteril}
        className="fc-btn fc-apontador-tipo-btn flex w-full min-h-[96px] max-w-sm items-center justify-center gap-2.5 rounded-2xl border-2 border-cyan-400/85 bg-blue-600/60 px-4 py-5 text-2xl font-extrabold tracking-wide text-white shadow-xl shadow-cyan-950/45 ring-1 ring-white/10 transition enabled:hover:border-cyan-300 enabled:hover:bg-blue-500/75 enabled:hover:ring-white/15 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[104px] sm:gap-3 sm:text-3xl"
      >
        <IconEsteril className="h-5 w-5 shrink-0 text-cyan-100/90 sm:h-6 sm:w-6" />
        <span className="flex min-w-0 flex-col items-center leading-tight drop-shadow-sm">
          <span>[ + ESTÉRIL ]</span>
          <span className="mt-1 text-xs font-semibold normal-case tracking-normal text-cyan-100/85 sm:text-sm">
            {esterilLabel}
          </span>
        </span>
      </button>
      <button
        type="button"
        disabled={!rochaPulmaoDisponivel}
        aria-disabled={!rochaPulmaoDisponivel}
        onClick={pressRochaPulmao}
        className="fc-btn fc-apontador-tipo-btn flex w-full min-h-[96px] max-w-sm items-center justify-center gap-2.5 rounded-2xl border-2 border-orange-300/85 bg-gradient-to-b from-orange-500/55 to-orange-700/45 px-4 py-5 text-2xl font-extrabold tracking-wide text-orange-50 shadow-xl shadow-orange-950/40 ring-1 ring-orange-200/15 transition enabled:hover:border-amber-300 enabled:hover:from-orange-500/70 enabled:hover:to-orange-700/60 enabled:hover:ring-orange-100/20 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[104px] sm:gap-3 sm:text-3xl"
      >
        <IconRocha className="h-5 w-5 shrink-0 text-orange-100/90 sm:h-6 sm:w-6" />
        <span className="flex min-w-0 flex-col items-center leading-tight drop-shadow-sm">
          <span>[ + ROCHA PULMÃO ]</span>
          <span className="mt-1 text-xs font-semibold normal-case tracking-normal text-orange-100/85 sm:text-sm">
            {rochaPulmaoLabel}
          </span>
        </span>
      </button>
      <button
        type="button"
        disabled={!rochaArmacaoDisponivel}
        aria-disabled={!rochaArmacaoDisponivel}
        onClick={pressRochaArmacao}
        className="fc-btn fc-apontador-tipo-btn flex w-full min-h-[96px] max-w-sm items-center justify-center gap-2.5 rounded-2xl border-2 border-fuchsia-300/80 bg-gradient-to-b from-fuchsia-500/45 to-violet-700/40 px-4 py-5 text-2xl font-extrabold tracking-wide text-fuchsia-50 shadow-xl shadow-fuchsia-950/40 ring-1 ring-fuchsia-200/20 transition enabled:hover:border-fuchsia-200 enabled:hover:from-fuchsia-500/65 enabled:hover:to-violet-700/60 enabled:hover:ring-fuchsia-100/30 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[104px] sm:gap-3 sm:text-3xl"
      >
        <IconRocha className="h-5 w-5 shrink-0 text-fuchsia-100/90 sm:h-6 sm:w-6" />
        <span className="flex min-w-0 flex-col items-center leading-tight drop-shadow-sm">
          <span>[ + ROCHA AMARRAÇÃO ]</span>
          <span className="mt-1 text-xs font-semibold normal-case tracking-normal text-fuchsia-100/85 sm:text-sm">
            {rochaArmacaoLabel}
          </span>
        </span>
      </button>
    </div>
  );
});

export const ApontadorHojeResumo = memo(function ApontadorHojeResumo({
  esteril,
  rochaPulmao,
  rochaArmacao,
  tonTotal,
  onLimparDia,
  onDesfazerLancamento,
  desfazendoLancamentoId,
  ultimosLancamentos = [],
}) {
  const totalViagens = (Number(esteril) || 0) + (Number(rochaPulmao) || 0) + (Number(rochaArmacao) || 0);
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
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4"
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
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Rocha Pulmão</p>
          <p className="mt-1 text-4xl font-black tabular-nums leading-none text-amber-300 sm:text-5xl sm:leading-none md:text-6xl">
            {rochaPulmao}
          </p>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Rocha Amarração</p>
          <p className="mt-1 text-4xl font-black tabular-nums leading-none text-fuchsia-300 sm:text-5xl sm:leading-none md:text-6xl">
            {rochaArmacao}
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
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-600/35 bg-slate-900/45 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
                  <span className="shrink-0 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-100">
                    {formatLancamentoVeiculo(item)}
                  </span>
                  <span className="shrink-0 font-medium text-slate-200">{item.hora}</span>
                  <span
                    className={`min-w-0 truncate font-semibold ${
                      item.tipo === "esteril"
                        ? "text-cyan-300"
                        : item.tipo === "rocha_pulmao"
                          ? "text-amber-300"
                          : "text-fuchsia-300"
                    }`}
                  >
                    {item.tipo === "esteril"
                      ? "Estéril"
                      : item.tipo === "rocha_pulmao"
                        ? "Rocha Pulmão"
                        : "Rocha Amarração"}
                  </span>
                </div>
                {typeof onDesfazerLancamento === "function" ? (
                  <button
                    type="button"
                    disabled={String(desfazendoLancamentoId || "") === String(item.id)}
                    onClick={() => onDesfazerLancamento(item)}
                    className="fc-btn shrink-0 rounded-md border border-rose-300/35 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-100 transition hover:border-rose-200/60 hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-55"
                  >
                    {String(desfazendoLancamentoId || "") === String(item.id) ? "..." : "Desfazer"}
                  </button>
                ) : null}
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
