const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function ParteDiariaChecklistSection({ aggregates }) {
  const {
    checklistRegistrosOk,
    checklistRegistrosPendencia,
    checklistRegistrosSemItens,
    totalPendenciasItens,
  } = aggregates;
  const totalLinhas = checklistRegistrosOk + checklistRegistrosPendencia + checklistRegistrosSemItens;

  return (
    <section aria-labelledby="pd-checklist-title" className="fc-card border-fuchsia-500/25 p-5 ring-1 ring-fuchsia-500/15">
      <h2 id="pd-checklist-title" className="text-lg font-semibold text-white">
        Checklist
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Classificação por registro: sem itens no JSON, todos OK, ou com pelo menos um item diferente de OK.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200/90">Checklist OK</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-emerald-100">{fmtInt(checklistRegistrosOk)}</dd>
        </div>
        <div className="rounded-lg border border-amber-500/35 bg-amber-950/25 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-amber-100/90">Com pendência</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-amber-50">{fmtInt(checklistRegistrosPendencia)}</dd>
          <p className="mt-1 text-xs text-amber-200/80">{fmtInt(totalPendenciasItens)} itens não OK (soma)</p>
        </div>
        <div className="rounded-lg border border-slate-600 bg-slate-900/60 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sem itens</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-200">{fmtInt(checklistRegistrosSemItens)}</dd>
        </div>
      </dl>
      {totalLinhas > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Base: {fmtInt(totalLinhas)} registro(s) nesta página. Indicadores globais do período exigiriam agregação no servidor.
        </p>
      ) : null}
    </section>
  );
}
