import { memo } from "react";

const mini =
  "rounded-md border border-zinc-800 bg-zinc-950/60 p-4 shadow-inner";

function ParteDiariaHorimetroSection({ aggregates }) {
  const { fmtMediaHoras, fmtMaxHoras, fmtMediaDelta, horimetroDeltaCount } = aggregates;

  return (
    <section aria-labelledby="pd-horimetro-title" className="fc-card border-zinc-800/90 p-5 lg:p-6">
      <h2 id="pd-horimetro-title" className="text-lg font-semibold text-zinc-100">
        Horímetro e jornada
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Resumo calculado sobre os registros desta página: horas declaradas e diferença início → fim do horímetro.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <article className={mini}>
          <p className="fc-erp-eyebrow">Média total horas</p>
          <p className="mt-3 text-xl font-bold tabular-nums text-zinc-100">{fmtMediaHoras}</p>
        </article>
        <article className={mini}>
          <p className="fc-erp-eyebrow">Maior jornada (horas)</p>
          <p className="mt-3 text-xl font-bold tabular-nums text-zinc-100">{fmtMaxHoras}</p>
        </article>
        <article className={mini}>
          <p className="fc-erp-eyebrow">Δ horímetro médio</p>
          <p className="mt-3 text-xl font-bold tabular-nums text-zinc-100">{fmtMediaDelta}</p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            {horimetroDeltaCount > 0
              ? `Com base em ${horimetroDeltaCount} registro(s) com início e fim válidos.`
              : "Nenhum par início/fim válido nesta página."}
          </p>
        </article>
      </div>
    </section>
  );
}

export default memo(ParteDiariaHorimetroSection);
