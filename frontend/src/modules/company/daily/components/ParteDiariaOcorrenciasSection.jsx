import { memo } from "react";
import { formatOperationalDateTime } from "../services/parteDiariaFormatters";

function ParteDiariaOcorrenciasSection({ ocorrenciasPreview, totalComTexto }) {
  return (
    <section aria-labelledby="pd-ocorrencias-title" className="fc-card border-rose-500/25 p-5 ring-1 ring-rose-500/15">
      <h2 id="pd-ocorrencias-title" className="text-lg font-semibold text-white">
        Ocorrências
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Observações e tempo parado preenchidos nesta página ({totalComTexto} registro(s) com texto).
      </p>
      {ocorrenciasPreview.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nenhuma ocorrência textual nos registros desta página.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {ocorrenciasPreview.map((o) => (
            <li
              key={o.id}
              className="rounded-lg border border-slate-700/80 bg-slate-900/50 px-3 py-2 text-sm text-slate-200"
            >
              <p className="text-xs text-slate-500">
                {formatOperationalDateTime(o.data)} · {o.motorista}
              </p>
              {o.tempo_parado ? (
                <p className="mt-1">
                  <span className="font-semibold text-rose-200/90">Parada:</span> {o.tempo_parado}
                </p>
              ) : null}
              {o.observacoes ? (
                <p className="mt-1 line-clamp-3">
                  <span className="font-semibold text-slate-300">Obs.:</span> {o.observacoes}
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
