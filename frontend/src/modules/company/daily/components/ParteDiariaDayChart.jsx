import { memo, useMemo } from "react";

function fmtDiaBr(ymd) {
  if (!ymd || typeof ymd !== "string") return "—";
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function ParteDiariaDayChart({ daySeries, loading }) {
  const max = useMemo(() => {
    if (!daySeries?.length) return 1;
    return Math.max(1, ...daySeries.map((d) => d.count));
  }, [daySeries]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Carregando gráfico…</p>;
  }

  if (!daySeries?.length) {
    return <p className="text-sm text-zinc-500">Sem dados por dia na amostra atual.</p>;
  }

  return (
    <div className="space-y-3" role="img" aria-label="Registros por dia">
      {daySeries.map((row) => {
        const w = Math.round((row.count / max) * 100);
        return (
          <div key={row.dia} className="flex items-center gap-3 text-sm">
            <span className="w-20 shrink-0 tabular-nums text-zinc-400">{fmtDiaBr(row.dia)}</span>
            <div className="min-w-0 flex-1">
              <div className="h-3 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-3 rounded-full bg-sky-500/85" style={{ width: `${w}%` }} />
              </div>
            </div>
            <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-zinc-200">{row.count}</span>
          </div>
        );
      })}
      <p className="text-[11px] text-zinc-500">Base: até 100 registros mais recentes no filtro (amostra).</p>
    </div>
  );
}

export default memo(ParteDiariaDayChart);
