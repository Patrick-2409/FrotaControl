import { memo } from "react";
import BIKpiCard from "../../bi/components/BIKpiCard";
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

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:gap-5">
      <BIKpiCard
        label="Total litros"
        value={fmtLitros(resumo.total_litros)}
        hint="Volume abastecido no intervalo filtrado."
        sparklineValues={sparkLitros}
        growthLabel={
          gLitros != null && Number.isFinite(hist) && hist > 0
            ? `Ritmo vs. histórico: ${gLitros >= 0 ? "+" : ""}${gLitros.toFixed(1)}%`
            : undefined
        }
      />
      <BIKpiCard
        label="Total valor"
        value={fmtBRL(resumo.total_valor)}
        hint="Soma dos valores registrados."
      />
      <BIKpiCard
        label="Média por veículo"
        valueNode={
          mediaPorVeiculo != null && Number.isFinite(mediaPorVeiculo) ? (
            <>
              {fmtLitros(mediaPorVeiculo)}
              <span className="text-base font-semibold text-zinc-500"> L</span>
            </>
          ) : (
            "—"
          )
        }
        hint="Litros médios por veículo com consumo no período."
        comparisonLabel={
          intel.preco_medio_historico != null
            ? `Preço médio histórico ref.: ${fmtBRL(intel.preco_medio_historico)}/L`
            : undefined
        }
        targetPct={pctPreco}
        targetLabel="Preço vs. histórico"
        sparklineValues={sparkLitros}
      />
    </div>
  );
}

export default memo(FuelMetricsCards);
