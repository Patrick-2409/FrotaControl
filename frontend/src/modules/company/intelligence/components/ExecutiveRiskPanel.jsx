import { ExecutiveMioNarrativeBlock } from "./ExecutiveMioPanel";

const RISK_STYLES = {
  CRITICO: "bg-red-100 text-red-800 border-red-200",
  ALTO: "bg-orange-100 text-orange-900 border-orange-200",
  MEDIO: "bg-amber-100 text-amber-900 border-amber-200",
  BAIXO: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function RiskBadge({ classificacao, faixa }) {
  const key = classificacao || "MEDIO";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase ${RISK_STYLES[key] || RISK_STYLES.MEDIO}`}>
      {faixa || classificacao}
    </span>
  );
}

export default function ExecutiveRiskPanel({ topRiscos = [], loading = false }) {
  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />;
  }

  if (!topRiscos.length) {
    return <p className="text-sm text-slate-500">Nenhum risco operacional prioritário identificado no período.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Posição</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Problema</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Risco (0-100)
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Classificação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {topRiscos.map((item) => (
            <tr key={`${item.posicao}-${item.problema}`}>
              <td className="px-4 py-3 font-semibold tabular-nums text-slate-700">{item.posicao}</td>
              <td className="px-4 py-3 text-slate-800">{item.problema}</td>
              <td className="px-4 py-3 font-bold tabular-nums text-slate-900">{item.score}</td>
              <td className="px-4 py-3">
                <RiskBadge classificacao={item.classificacao} faixa={item.faixa} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExecutiveImmediateActionBlock({ acao, loading = false, variant = "light" }) {
  return <ExecutiveMioNarrativeBlock narrativa={acao} loading={loading} variant={variant} />;
}

export function ExecutiveFinancialRiskBlock({ riscoFinanceiro, loading = false, variant = "light" }) {
  if (loading) {
    return <p className={`text-sm ${variant === "dark" ? "text-zinc-400" : "text-slate-500"}`}>Calculando exposição financeira...</p>;
  }
  const mensagem = riscoFinanceiro?.mensagem;
  if (!mensagem) {
    return <p className={`text-sm ${variant === "dark" ? "text-zinc-400" : "text-slate-500"}`}>Estimativa indisponível para o período.</p>;
  }
  return (
    <p className={`text-base font-medium leading-relaxed ${variant === "dark" ? "text-zinc-100" : "text-slate-900"}`}>{mensagem}</p>
  );
}
