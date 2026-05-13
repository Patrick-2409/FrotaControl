import { memo } from "react";
import { formatOperationalDateTime } from "../services/parteDiariaFormatters";

function ParteDiariaOcorrenciasSection({ ocorrenciasPreview, totalComTexto }) {
  return (
    <section aria-labelledby="pd-ocorrencias-title" className="fc-card border-zinc-800/90 p-5 lg:p-6">
      <h2 id="pd-ocorrencias-title" className="text-lg font-semibold text-zinc-100">
        Ocorrências
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Observações e tempo parado preenchidos nesta página ({totalComTexto} registro(s) com texto).
      </p>
      {ocorrenciasPreview.length === 0 ? (
        <p className="mt-5 text-sm text-zinc-500">Nenhuma ocorrência textual nos registros desta página.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {ocorrenciasPreview.map((o) => (
            <li
              key={o.id}
              className="rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-sm text-zinc-200"
            >
              <p className="text-xs text-zinc-500">
                {formatOperationalDateTime(o.data)} · {o.motorista}
              </p>
              {o.tempo_parado ? (
                <p className="mt-1.5">
                  <span className="font-semibold text-amber-200/90">Parada:</span> {o.tempo_parado}
                </p>
              ) : null}
              {o.observacoes ? (
                <p className="mt-1.5 line-clamp-3">
                  <span className="font-semibold text-zinc-400">Obs.:</span> {o.observacoes}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default memo(ParteDiariaOcorrenciasSection);
