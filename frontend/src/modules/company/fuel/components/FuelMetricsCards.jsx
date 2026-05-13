import { memo } from "react";
import { fmtBRL, fmtLitros } from "../services/fuelFormatters";

function FuelMetricsCards({ resumo, mediaPorVeiculo }) {
  if (!resumo) return null;

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:gap-5">
      <article className="fc-card fc-erp-kpi-card border-zinc-800/90 p-4 sm:p-5">
        <p className="fc-erp-eyebrow">Total litros</p>
        <p className="mt-3 text-2xl font-bold tabular-nums text-zinc-100">{fmtLitros(resumo.total_litros)}</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">Volume abastecido no intervalo filtrado.</p>
      </article>
      <article className="fc-card fc-erp-kpi-card border-zinc-800/90 p-4 sm:p-5">
        <p className="fc-erp-eyebrow">Total valor</p>
        <p className="mt-3 text-2xl font-bold tabular-nums text-zinc-100">{fmtBRL(resumo.total_valor)}</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">Soma dos valores registrados.</p>
      </article>
      <article className="fc-card fc-erp-kpi-card border-zinc-800/90 p-4 sm:p-5">
        <p className="fc-erp-eyebrow">Média por veículo</p>
        <p className="mt-3 text-2xl font-bold tabular-nums text-zinc-100">
          {mediaPorVeiculo != null && Number.isFinite(mediaPorVeiculo) ? (
            <>
              {fmtLitros(mediaPorVeiculo)}
              <span className="text-base font-semibold text-zinc-500"> L</span>
            </>
          ) : (
            "—"
          )}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">Litros médios por veículo com consumo no período.</p>
      </article>
    </div>
  );
}

export default memo(FuelMetricsCards);
