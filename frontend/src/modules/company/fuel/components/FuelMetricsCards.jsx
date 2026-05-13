import { memo } from "react";
import BISparkline from "../../bi/components/BISparkline";
import { fmtBRL, fmtLitros } from "../services/fuelFormatters";
import { growthPercent } from "../../bi/utils/chartMath";

function FuelMetricsCards({ resumo, mediaPorVeiculo }) {
  if (!resumo) return null;

  const intel = resumo.inteligencia || {};
  const hist = Number(intel.historico_media_diaria_litros);
  const mediaD = Number(intel.media_diaria_litros);
  let sparkLitros = [];
  if (Number.isFinite(hist) && Number.isFinite(mediaD)) sparkLitros = [hist * 0.85, hist, mediaD];
  else if (Number.isFinite(mediaD)) sparkLitros = [mediaD * 0.9, mediaD];

  const atual = Number(resumo.preco_medio_litro);
  const refHist = Number(intel.preco_medio_historico);
  const pctPreco =
    Number.isFinite(atual) && atual > 0 && Number.isFinite(refHist) && refHist > 0
      ? Math.min(100, Math.round((refHist / atual) * 100))
      : null;

  const gLitros = growthPercent(mediaD, hist);
  const precoOk = pctPreco != null && pctPreco >= 85;
  const precoWarn = pctPreco != null && pctPreco >= 60 && !precoOk;

  const cardBase = "rounded-2xl border-2 p-5 sm:p-6";

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-3 lg:gap-5">
      <div className={`${cardBase} border-sky-500/35 bg-sky-950/25`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/80">Litros</p>
            <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-zinc-50 sm:text-4xl">
              {fmtLitros(resumo.total_litros)}
            </p>
            <p className="mt-2 text-xs text-zinc-400">Volume no período</p>
            {gLitros != null && Number.isFinite(hist) && hist > 0 ? (
              <p className="mt-2 text-xs font-medium text-zinc-300">
                Vs. histórico: {gLitros >= 0 ? "+" : ""}
                {gLitros.toFixed(1)}%
              </p>
            ) : null}
          </div>
          {sparkLitros.length >= 2 ? (
            <div className="shrink-0 opacity-90">
              <BISparkline values={sparkLitros} />
            </div>
          ) : null}
        </div>
      </div>

      <div className={`${cardBase} border-amber-500/35 bg-amber-950/20`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/85">Custo</p>
        <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-zinc-50 sm:text-4xl">{fmtBRL(resumo.total_valor)}</p>
        <p className="mt-2 text-xs text-zinc-400">Soma no período</p>
      </div>

      <div
        className={`${cardBase} ${
          precoOk
            ? "border-emerald-500/40 bg-emerald-950/25"
            : precoWarn
              ? "border-amber-500/40 bg-amber-950/20"
              : "border-zinc-600 bg-zinc-950/50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Média / veículo</p>
            <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-zinc-50 sm:text-4xl">
              {mediaPorVeiculo != null && Number.isFinite(mediaPorVeiculo) ? (
                <>
                  {fmtLitros(mediaPorVeiculo)}
                  <span className="text-xl font-bold text-zinc-500"> L</span>
                </>
              ) : (
                "—"
              )}
            </p>
            {intel.preco_medio_historico != null ? (
              <p className="mt-2 text-xs text-zinc-400">Ref. preço: {fmtBRL(intel.preco_medio_historico)}/L</p>
            ) : null}
          </div>
          {sparkLitros.length >= 2 ? (
            <div className="shrink-0 opacity-90">
              <BISparkline values={sparkLitros} />
            </div>
          ) : null}
        </div>
        {pctPreco != null ? (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              <span>Preço vs. referência</span>
              <span className={`tabular-nums ${precoOk ? "text-emerald-300" : precoWarn ? "text-amber-200" : "text-rose-300"}`}>
                {pctPreco}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-2 rounded-full transition-[width] duration-500 ${
                  precoOk ? "bg-gradient-to-r from-emerald-800 to-emerald-500" : precoWarn ? "bg-gradient-to-r from-amber-800 to-amber-500" : "bg-gradient-to-r from-rose-800 to-rose-500"
                }`}
                style={{ width: `${pctPreco}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default memo(FuelMetricsCards);
