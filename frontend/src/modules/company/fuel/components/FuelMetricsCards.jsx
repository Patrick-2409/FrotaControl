import { memo } from "react";
import BISparkline from "../../bi/components/BISparkline";
import { fmtBRL, fmtLitros } from "../services/fuelFormatters";

const formatDeltaLitrosMensagem = (deltaLitros) => {
  if (!Number.isFinite(deltaLitros) || Math.abs(deltaLitros) < 0.01) {
    return "Sem variação relevante em relação ao histórico";
  }
  const valor = fmtLitros(Math.abs(deltaLitros));
  if (deltaLitros > 0) return `Aumento de ${valor} L em relação ao histórico`;
  return `Redução de ${valor} L em relação ao histórico`;
};

const getPrecoInterpretacao = ({ comparacaoPreco, hasHistorical }) => {
  if (!hasHistorical) return "Sem histórico suficiente para comparação";
  if (comparacaoPreco === "acima") return "Acima da média";
  if (comparacaoPreco === "abaixo") return "Abaixo da média";
  return "Dentro do padrão";
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
  const pctPreco =
    Number.isFinite(atual) && atual > 0 && hasHistoricalPrice
      ? Math.min(100, Math.round((refHist / atual) * 100))
      : null;

  const deltaLitros = Number.isFinite(mediaD) && Number.isFinite(hist) ? mediaD - hist : null;
  const hasCurrentPrice = Number.isFinite(atual) && atual > 0;
  const comparacaoPreco =
    hasCurrentPrice && hasHistoricalPrice
      ? atual > refHist * 1.03
        ? "acima"
        : atual < refHist * 0.97
          ? "abaixo"
          : "padrao"
      : "sem-base";
  const interpretacaoPreco = getPrecoInterpretacao({
    comparacaoPreco,
    hasHistorical: hasHistoricalPrice,
  });

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
            {deltaLitros != null && Number.isFinite(hist) && hist > 0 ? (
              <p className="mt-2 text-xs font-medium text-zinc-300">{formatDeltaLitrosMensagem(deltaLitros)}</p>
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
            {hasCurrentPrice ? (
              <p className="mt-2 text-xs text-zinc-300">Preço médio: {fmtBRL(atual)}/L</p>
            ) : null}
            {hasHistoricalPrice ? (
              <p className="mt-1 text-xs text-zinc-400">Média histórica: {fmtBRL(refHist)}/L</p>
            ) : null}
          </div>
          {sparkLitros.length >= 2 ? (
            <div className="shrink-0 opacity-90">
              <BISparkline values={sparkLitros} />
            </div>
          ) : null}
        </div>
        <p
          className={`mt-3 text-xs font-medium ${
            comparacaoPreco === "abaixo"
              ? "text-emerald-200"
              : comparacaoPreco === "acima"
                ? "text-amber-200"
                : "text-zinc-300"
          }`}
        >
          {interpretacaoPreco}
        </p>
      </div>
    </div>
  );
}

export default memo(FuelMetricsCards);
