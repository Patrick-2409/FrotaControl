import { memo } from "react";

const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const cardBase =
  "rounded-md border bg-zinc-950/50 p-4 shadow-inner ring-1 ring-inset ring-zinc-800/40";

function ParteDiariaStatusCards({ total, rowsOnPage, aggregates }) {
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
      ? "border-zinc-700 text-zinc-300"
      : statusOperacional === "atencao_checklist"
        ? "border-amber-500/40 text-amber-100"
        : statusOperacional === "ocorrencias_texto"
          ? "border-zinc-600 text-zinc-200"
          : "border-zinc-600 text-zinc-200";

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
      <article className={`${cardBase} border-zinc-700/90`}>
        <p className="fc-erp-eyebrow">Total no período</p>
        <p className="mt-3 text-2xl font-bold tabular-nums text-zinc-100">{fmtInt(total)}</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">Registros de parte diária que batem com o filtro (todas as páginas).</p>
      </article>
      <article className={`${cardBase} border-zinc-700/90`}>
        <p className="fc-erp-eyebrow">Nesta página</p>
        <p className="mt-3 text-2xl font-bold tabular-nums text-zinc-100">{fmtInt(rowsOnPage)}</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">Lotes exibidos na tabela abaixo (paginação).</p>
      </article>
      <article className={`${cardBase} ${statusTone}`}>
        <p className="fc-erp-eyebrow opacity-95">Status (página)</p>
        <p className="mt-3 text-sm font-semibold leading-snug">{statusLabel}</p>
      </article>
      <article className={`${cardBase} border-zinc-700/90`}>
        <p className="fc-erp-eyebrow">Última atualização</p>
        <p className="mt-3 text-lg font-semibold tabular-nums text-zinc-100">{ultima}</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Maior <code className="text-zinc-400">updated_at</code> entre os registros desta página. Clima informado:{" "}
          <strong className="text-zinc-300">{fmtInt(comClima)}</strong> · Produção preenchida:{" "}
          <strong className="text-zinc-300">{fmtInt(comProducao)}</strong>
        </p>
      </article>
    </section>
  );
}

export default memo(ParteDiariaStatusCards);
