import { memo, useMemo } from "react";

const fmtTon = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/**
 * Cor da fatia “executado” nas barras: vermelho abaixo de 70%, âmbar 70–99%, verde (#16a34a) ≥100%.
 * Quando não há meta (plan=0) e não há execução, usa cinza neutro (evita falso “crítico”).
 */
function execBarClass(plan, exec, apiPct) {
  const api = Number(apiPct);
  if (plan > 0) {
    const ratio = (exec / plan) * 100;
    const p = Number.isFinite(ratio) ? ratio : api;
    if (p >= 100) return "bg-[#16a34a]";
    if (p >= 70) return "bg-amber-500";
    return "bg-red-600";
  }
  if (exec > 0) return "bg-[#16a34a]";
  return "bg-zinc-500";
}

function labelPctClass(plan, exec, apiPct) {
  const api = Number(apiPct);
  if (plan > 0) {
    const ratio = (exec / plan) * 100;
    const p = Number.isFinite(ratio) ? ratio : api;
    if (p >= 100) return "text-emerald-300";
    if (p >= 70) return "text-amber-200";
    return "text-red-300";
  }
  if (exec > 0) return "text-emerald-300";
  return "text-zinc-400";
}

/**
 * Barras horizontais: planejado (fundo) vs executado (sobreposição), por material e total.
 */
function TransportPlannedVsActualBars({ comparacao, materialFilter = "todos" }) {
  const rows = useMemo(() => {
    if (!comparacao) return [];
    const pe = Number(comparacao.planejado_esteril || 0);
    const pr = Number(comparacao.planejado_rocha || 0);
    const ee = Number(comparacao.executado_esteril || 0);
    const erp = Number(comparacao.executado_rocha_pulmao || 0);
    const era = Number(comparacao.executado_rocha_armacao || 0);
    const er = Number(comparacao.executado_rocha || 0);
    const baseRows = [
      { key: "esteril", label: "Estéril", plan: pe, exec: ee, pct: Number(comparacao.percentual_esteril ?? 0) },
      {
        key: "rocha_pulmao",
        label: "Rocha Pulmão",
        plan: pr,
        exec: erp,
        pct: Number(comparacao.percentual_rocha_pulmao ?? 0),
      },
      {
        key: "rocha_armacao",
        label: "Rocha Armação",
        plan: pr,
        exec: era,
        pct: Number(comparacao.percentual_rocha_armacao ?? 0),
      },
      {
        key: "total",
        label: "Total",
        plan: pe + pr,
        exec: ee + er,
        pct: Number(comparacao.percentual_total ?? 0),
      },
    ];
    if (materialFilter === "esteril") return baseRows.filter((row) => row.key === "esteril");
    if (materialFilter === "rocha_pulmao") return baseRows.filter((row) => row.key === "rocha_pulmao");
    if (materialFilter === "rocha_armacao") return baseRows.filter((row) => row.key === "rocha_armacao");
    return baseRows;
  }, [comparacao, materialFilter]);

  if (!comparacao) return null;

  return (
    <div className="space-y-5" role="group" aria-label="Planejado versus executado por material">
      {rows.map((row) => {
        const max = Math.max(row.plan, row.exec, 1);
        const wPlan = Math.min(100, (row.plan / max) * 100);
        const wExec = Math.min(100, (row.exec / max) * 100);
        const execClass = execBarClass(row.plan, row.exec, row.pct);
        const pctLabelClass = labelPctClass(row.plan, row.exec, row.pct);
        return (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-zinc-200">{row.label}</span>
              <span className={`tabular-nums text-xs font-bold ${pctLabelClass}`}>
                {row.pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-zinc-500">
              <span>{fmtTon(row.plan)} t</span>
              <span className="text-zinc-600">·</span>
              <span>{fmtTon(row.exec)} t</span>
            </div>
            <div className="relative mt-2 h-4 w-full overflow-hidden rounded-md bg-zinc-800">
              <div
                className="absolute left-0 top-0 h-full rounded-md bg-zinc-600/90"
                style={{ width: `${wPlan}%` }}
                title={`Planejado ${fmtTon(row.plan)} t`}
              />
              <div
                className={`absolute left-0 top-0 h-full rounded-md opacity-95 ${execClass}`}
                style={{ width: `${wExec}%` }}
                title={`Executado ${fmtTon(row.exec)} t`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(TransportPlannedVsActualBars);
