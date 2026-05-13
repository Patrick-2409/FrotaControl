import { fmtBRL, fmtLitros } from "./fuelFormatters";

export default function FuelMetricsCards({ resumo, mediaPorVeiculo }) {
  if (!resumo) return null;

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <article className="rounded-xl border border-emerald-500/35 bg-slate-950/60 p-4 shadow-inner">
        <p className="text-xs uppercase tracking-wider text-slate-400">Total litros</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-300">{fmtLitros(resumo.total_litros)}</p>
        <p className="mt-1 text-xs text-slate-500">Volume abastecido no intervalo filtrado.</p>
      </article>
      <article className="rounded-xl border border-emerald-500/35 bg-slate-950/60 p-4 shadow-inner">
        <p className="text-xs uppercase tracking-wider text-slate-400">Total valor</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-white">{fmtBRL(resumo.total_valor)}</p>
        <p className="mt-1 text-xs text-slate-500">Soma dos valores registrados.</p>
      </article>
      <article className="rounded-xl border border-emerald-500/35 bg-slate-950/60 p-4 shadow-inner">
        <p className="text-xs uppercase tracking-wider text-slate-400">Média por veículo</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-200">
          {mediaPorVeiculo != null && Number.isFinite(mediaPorVeiculo) ? (
            <>
              {fmtLitros(mediaPorVeiculo)}
              <span className="text-base font-semibold text-slate-400"> L</span>
            </>
          ) : (
            "—"
          )}
        </p>
        <p className="mt-1 text-xs text-slate-500">Litros médios por veículo com consumo no período.</p>
      </article>
    </div>
  );
}
