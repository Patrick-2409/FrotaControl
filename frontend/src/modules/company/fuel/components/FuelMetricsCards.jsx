import { memo } from "react";
import BISparkline from "../../bi/components/BISparkline";
import { fmtBRL, fmtLitros } from "../services/fuelFormatters";
import TooltipInfo from "../../shared/components/TooltipInfo";

const formatDeltaLitrosMensagem = (deltaLitros) => {
  if (!Number.isFinite(deltaLitros) || Math.abs(deltaLitros) < 0.01) {
    return "Sem variação relevante em relação ao histórico";
  }
  const valor = fmtLitros(Math.abs(deltaLitros));
  if (deltaLitros > 0) return `Aumento de ${valor} L em relação ao histórico`;
  return `Redução de ${valor} L em relação ao histórico`;
};

const formatDeltaPct = (value) => {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  const formatted = Math.abs(rounded).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${formatted}%`;
};

const deltaToneClass = (value) => {
  if (!Number.isFinite(value)) return "text-zinc-400";
  if (value <= -3) return "text-emerald-200";
  if (value >= 3) return "text-rose-200";
  return "text-amber-200";
};

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
  const hasHistoricalPrice = Number.isFinite(refHist) && refHist > 0;
  const pricesByVehicle = Array.isArray(resumo.por_veiculo)
    ? resumo.por_veiculo
        .map((row) => Number(row?.preco_medio_litro))
        .filter((price) => Number.isFinite(price) && price > 0)
    : [];
  const avgFleetPrice =
    pricesByVehicle.length > 0
      ? pricesByVehicle.reduce((acc, value) => acc + value, 0) / pricesByVehicle.length
      : null;
  const hasFleetAverage = Number.isFinite(avgFleetPrice) && avgFleetPrice > 0;

  const deltaLitros = Number.isFinite(mediaD) && Number.isFinite(hist) ? mediaD - hist : null;
  const hasCurrentPrice = Number.isFinite(atual) && atual > 0;
  const vsFleetPct = hasCurrentPrice && hasFleetAverage ? ((atual - avgFleetPrice) / avgFleetPrice) * 100 : null;
  const vsHistoricalPct = hasCurrentPrice && hasHistoricalPrice ? ((atual - refHist) / refHist) * 100 : null;

  const cardBase = "rounded-2xl border-2 p-5 sm:p-6";

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-3 lg:gap-5">
      <div className={`${cardBase} border-sky-500/35 bg-sky-950/25`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-200/80">
              <span>Litros no período</span>
              <TooltipInfo text="Quantidade total de combustível abastecido no período filtrado." />
            </p>
            <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-zinc-50 sm:text-4xl">
              {fmtLitros(resumo.total_litros)}
            </p>
            <p className="mt-2 text-xs text-zinc-400">Volume no período</p>
            {deltaLitros != null && Number.isFinite(hist) && hist > 0 ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <span>Vs histórico: {formatDeltaLitrosMensagem(deltaLitros)}</span>
                <TooltipInfo text="Comparação com períodos anteriores. Valores altos indicam aumento significativo no consumo." />
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
          hasCurrentPrice && Number.isFinite(vsFleetPct) && Number.isFinite(vsHistoricalPct)
            ? vsFleetPct <= -3 && vsHistoricalPct <= -3
            ? "border-emerald-500/40 bg-emerald-950/25"
            : vsFleetPct >= 3 || vsHistoricalPct >= 3
              ? "border-rose-500/40 bg-rose-950/20"
              : "border-amber-500/40 bg-amber-950/20"
            : "border-zinc-600 bg-zinc-950/50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <span>Comparação de preço</span>
              <TooltipInfo text={"Este indicador compara o preço médio atual com a média da frota no período e com o histórico da operação. Valores acima indicam aumento de custo."} />
            </p>
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
            {hasCurrentPrice ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-300">
                <span>Preço médio: {fmtBRL(atual)}/L</span>
                <TooltipInfo text="Média do valor pago por litro no período selecionado." />
              </p>
            ) : null}
            <p className={`mt-2 text-xs font-semibold ${deltaToneClass(vsFleetPct)}`}>
              Vs média da frota: {formatDeltaPct(vsFleetPct)}
            </p>
            <p className={`mt-1 text-xs font-semibold ${deltaToneClass(vsHistoricalPct)}`}>
              Vs histórico da operação: {formatDeltaPct(vsHistoricalPct)}
            </p>
          </div>
          {sparkLitros.length >= 2 ? (
            <div className="shrink-0 opacity-90">
              <BISparkline values={sparkLitros} />
            </div>
          ) : null}
        </div>
        {!hasCurrentPrice ? (
          <p className="mt-3 text-xs text-zinc-500">Sem dados de preço para comparar no período atual.</p>
        ) : null}
      </div>
    </div>
  );
}

export default memo(FuelMetricsCards);
