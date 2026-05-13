import { memo } from "react";

const mini =
  "rounded-xl border border-indigo-500/25 bg-gradient-to-b from-indigo-950/30 to-slate-950/80 p-4 ring-1 ring-indigo-500/10";

function ParteDiariaHorimetroSection({ aggregates }) {
  const { fmtMediaHoras, fmtMaxHoras, fmtMediaDelta, horimetroDeltaCount } = aggregates;

  return (
    <section aria-labelledby="pd-horimetro-title" className="fc-card border-indigo-500/25 p-5 ring-1 ring-indigo-500/15">
      <h2 id="pd-horimetro-title" className="text-lg font-semibold text-white">
        Horímetro e jornada
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Resumo calculado sobre os registros desta página: horas declaradas e diferença início → fim do horímetro.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className={mini}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200/80">Média total horas</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-indigo-100">{fmtMediaHoras}</p>
        </article>
        <article className={mini}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200/80">Maior jornada (horas)</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-indigo-100">{fmtMaxHoras}</p>
        </article>
        <article className={mini}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200/80">Δ horímetro médio</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-indigo-100">{fmtMediaDelta}</p>
          <p className="mt-1 text-xs text-slate-500">
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
