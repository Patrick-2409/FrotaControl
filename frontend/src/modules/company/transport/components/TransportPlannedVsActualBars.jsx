import { memo, useMemo } from "react";

const fmtTon = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/**
 * Barras horizontais: planejado (fundo) vs executado (sobreposição), por material e total.
 */
function TransportPlannedVsActualBars({ comparacao }) {
  const rows = useMemo(() => {
    if (!comparacao) return [];
    const pe = Number(comparacao.planejado_esteril || 0);
    const pr = Number(comparacao.planejado_rocha || 0);
    const ee = Number(comparacao.executado_esteril || 0);
    const er = Number(comparacao.executado_rocha || 0);
    return [
      { key: "esteril", label: "Estéril", plan: pe, exec: ee, pct: Number(comparacao.percentual_esteril || 0) },
      { key: "rocha", label: "Rocha", plan: pr, exec: er, pct: Number(comparacao.percentual_rocha || 0) },
      {
        key: "total",
        label: "Total",
        plan: pe + pr,
        exec: ee + er,
        pct: Number(comparacao.percentual_total || 0),
      },
    ];
  }, [comparacao]);

  if (!comparacao) return null;

  return (
    <div className="space-y-5" role="group" aria-label="Planejado versus executado por material">
      {rows.map((row) => {
        const max = Math.max(row.plan, row.exec, 1);
        const wPlan = Math.min(100, (row.plan / max) * 100);
        const wExec = Math.min(100, (row.exec / max) * 100);
        const tone =
          row.pct >= 100 ? "bg-emerald-500" : row.pct >= 70 ? "bg-amber-500" : "bg-rose-500";
        return (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-zinc-200">{row.label}</span>
              <span className={`tabular-nums text-xs font-bold ${row.pct >= 100 ? "text-emerald-300" : row.pct >= 70 ? "text-amber-200" : "text-rose-300"}`}>
                {row.pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
              </span>
            </div>
            <div className="mt-2 grid gap-1 text-[11px] text-zinc-500 sm:grid-cols-2">
              <span>Planejado {fmtTon(row.plan)} t</span>
              <span className="sm:text-right">Executado {fmtTon(row.exec)} t</span>
            </div>
            <div className="relative mt-1.5 h-4 w-full overflow-hidden rounded-md bg-zinc-800">
              <div
                className="absolute left-0 top-0 h-full rounded-md bg-zinc-600/90"
                style={{ width: `${wPlan}%` }}
                title={`Planejado ${fmtTon(row.plan)} t`}
              />
              <div
                className={`absolute left-0 top-0 h-full rounded-md ${tone} opacity-95`}
                style={{ width: `${wExec}%` }}
                title={`Executado ${fmtTon(row.exec)} t`}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Barra cinza: meta. Cor: executado (verde ≥100%, âmbar ≥70%, vermelho abaixo de 70%).
      </p>
    </div>
  );
}

export default memo(TransportPlannedVsActualBars);
