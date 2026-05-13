import { memo } from "react";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function ParteDiariaChecklistSection({ aggregates }) {
  const {
    checklistRegistrosOk,
    checklistRegistrosPendencia,
    checklistRegistrosSemItens,
    totalPendenciasItens,
  } = aggregates;
  const totalLinhas = checklistRegistrosOk + checklistRegistrosPendencia + checklistRegistrosSemItens;

  return (
    <section aria-labelledby="pd-checklist-title" className="fc-card border-zinc-800/90 p-5 lg:p-6">
      <h2 id="pd-checklist-title" className="text-lg font-semibold text-zinc-100">
        Checklist
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Classificação por registro: sem itens no JSON, todos OK, ou com pelo menos um item diferente de OK.
      </p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3 shadow-inner">
          <dt className="fc-erp-eyebrow">Checklist OK</dt>
          <dd className="mt-2 text-2xl font-bold tabular-nums text-zinc-100">{fmtInt(checklistRegistrosOk)}</dd>
        </div>
        <div className="rounded-md border border-amber-500/35 bg-amber-950/20 p-3">
          <dt className="fc-erp-eyebrow text-amber-200/90">Com pendência</dt>
          <dd className="mt-2 text-2xl font-bold tabular-nums text-zinc-50">{fmtInt(checklistRegistrosPendencia)}</dd>
          <p className="mt-2 text-xs text-amber-200/75">{fmtInt(totalPendenciasItens)} itens não OK (soma)</p>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
          <dt className="fc-erp-eyebrow">Sem itens</dt>
          <dd className="mt-2 text-2xl font-bold tabular-nums text-zinc-100">{fmtInt(checklistRegistrosSemItens)}</dd>
        </div>
      </dl>
      {totalLinhas > 0 ? (
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          Base: {fmtInt(totalLinhas)} registro(s) nesta página. Indicadores globais do período exigiriam agregação no servidor.
        </p>
      ) : null}
    </section>
  );
}

export default memo(ParteDiariaChecklistSection);
