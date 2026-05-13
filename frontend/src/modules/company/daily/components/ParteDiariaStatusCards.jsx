const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const cardBase =
  "rounded-xl border bg-slate-950/60 p-4 shadow-inner ring-1 ring-inset ring-white/5";

export default function ParteDiariaStatusCards({ total, rowsOnPage, aggregates }) {
  const { statusOperacional, ultimaAtualizacao, comClima, comProducao } = aggregates;

  const statusLabel =
    statusOperacional === "sem_dados"
      ? "Sem registros nesta página"
      : statusOperacional === "atencao_checklist"
        ? "Atenção: pendências no checklist"
        : statusOperacional === "ocorrencias_texto"
          ? "Há observações ou paradas registradas"
          : "Operação regular (página atual)";

  const statusTone =
    statusOperacional === "sem_dados"
      ? "border-slate-600 text-slate-300"
      : statusOperacional === "atencao_checklist"
        ? "border-amber-500/40 text-amber-100"
        : statusOperacional === "ocorrencias_texto"
          ? "border-sky-500/35 text-sky-100"
          : "border-emerald-500/35 text-emerald-100";

  const ultima =
    ultimaAtualizacao == null
      ? "—"
      : new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(ultimaAtualizacao);

  return (
    <section aria-labelledby="pd-status-title" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <h2 id="pd-status-title" className="sr-only">
        Status operacional
      </h2>
      <article className={`${cardBase} border-violet-500/30`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/90">Total no período</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-white">{fmtInt(total)}</p>
        <p className="mt-1 text-xs text-slate-500">Registros de parte diária que batem com o filtro (todas as páginas).</p>
      </article>
      <article className={`${cardBase} border-slate-600`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nesta página</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-slate-100">{fmtInt(rowsOnPage)}</p>
        <p className="mt-1 text-xs text-slate-500">Lotes exibidos na tabela abaixo (paginação).</p>
      </article>
      <article className={`${cardBase} ${statusTone}`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">Status (página)</p>
        <p className="mt-2 text-sm font-semibold leading-snug">{statusLabel}</p>
      </article>
      <article className={`${cardBase} border-slate-600`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Última atualização</p>
        <p className="mt-2 text-lg font-semibold tabular-nums text-slate-100">{ultima}</p>
        <p className="mt-1 text-xs text-slate-500">
          Maior <code className="text-slate-400">updated_at</code> entre os registros desta página. Clima informado:{" "}
          <strong className="text-slate-300">{fmtInt(comClima)}</strong> · Produção preenchida:{" "}
          <strong className="text-slate-300">{fmtInt(comProducao)}</strong>
        </p>
      </article>
    </section>
  );
}
