import { memo, useMemo } from "react";

function ParteDiariaMotoristaRanking({ ranking, loading }) {
  const max = useMemo(() => {
    if (!ranking?.length) return 1;
    return Math.max(
      1,
      ...ranking.map((r) => {
        const h = Number(r.horas) || 0;
        const c = Number(r.registros) || 0;
        return h > 0 ? h : c * 0.25;
      })
    );
  }, [ranking]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Carregando ranking…</p>;
  }

  if (!ranking?.length) {
    return <p className="text-sm text-zinc-500">Sem dados de motoristas na amostra.</p>;
  }

  return (
    <ol className="space-y-2.5">
      {ranking.map((row, idx) => {
        const h = Number(row.horas) || 0;
        const c = Number(row.registros) || 0;
        const score = h > 0 ? h : c * 0.25;
        const w = Math.round((score / max) * 100);
        return (
          <li key={`${row.motorista}-${idx}`} className="rounded-lg border border-zinc-800/90 bg-zinc-950/40 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium text-zinc-200">
                <span className="mr-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                  {idx + 1}
                </span>
                {row.motorista}
              </span>
              <span className="shrink-0 text-right">
                {h > 0 ? (
                  <span className="tabular-nums font-semibold text-amber-200/95">
                    {h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h
                  </span>
                ) : (
                  <span className="tabular-nums text-sm font-semibold text-zinc-300">{c} reg.</span>
                )}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-1.5 rounded-full bg-amber-500/80" style={{ width: `${w}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default memo(ParteDiariaMotoristaRanking);
