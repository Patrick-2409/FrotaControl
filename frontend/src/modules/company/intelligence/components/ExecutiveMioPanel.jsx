const SCORE_COLORS = {
  EXCELENTE: { stroke: "#059669", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  BOA: { stroke: "#2563eb", text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  ATENCAO: { stroke: "#d97706", text: "text-amber-800", bg: "bg-amber-50", border: "border-amber-200" },
  CRITICA: { stroke: "#dc2626", text: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
};

function ScoreGauge({ label, score, compact = false }) {
  const valor = Number(score?.valor ?? 0);
  const classificacao = score?.classificacao || "ATENCAO";
  const faixa = score?.faixa || "Atenção";
  const palette = SCORE_COLORS[classificacao] || SCORE_COLORS.ATENCAO;
  const angle = Math.max(0, Math.min(180, (valor / 100) * 180));
  const radius = compact ? 42 : 52;
  const cx = 60;
  const cy = 62;
  const start = Math.PI;
  const end = start + (angle * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  const largeArc = angle > 90 ? 1 : 0;

  return (
    <article className={`rounded-2xl border p-4 text-center shadow-sm ${palette.bg} ${palette.border}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mx-auto mt-2 w-[120px]">
        <svg viewBox="0 0 120 78" className="h-auto w-full" role="img" aria-label={`${label}: ${valor} de 100, ${faixa}`}>
          <path d="M 8 62 A 52 52 0 0 1 112 62" fill="none" stroke="#e2e8f0" strokeWidth="10" strokeLinecap="round" />
          {valor > 0 ? (
            <path
              d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none"
              stroke={palette.stroke}
              strokeWidth="10"
              strokeLinecap="round"
            />
          ) : null}
          <text x="60" y="58" textAnchor="middle" className="fill-slate-900 text-[22px] font-bold">
            {valor}
          </text>
        </svg>
      </div>
      <p className={`text-sm font-semibold ${palette.text}`}>{faixa}</p>
    </article>
  );
}

export default function ExecutiveMioPanel({ painelExecutivo, loading = false }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
    );
  }

  if (!painelExecutivo) {
    return (
      <p className="text-sm text-slate-500">Scores executivos indisponíveis para o recorte selecionado.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ScoreGauge label="Score Geral" score={painelExecutivo.score_geral} />
      <ScoreGauge label="Score Operacional" score={painelExecutivo.score_operacional} compact />
      <ScoreGauge label="Score Financeiro" score={painelExecutivo.score_financeiro} compact />
      <ScoreGauge label="Confiabilidade" score={painelExecutivo.score_confiabilidade} compact />
    </div>
  );
}

export function ExecutiveMioNarrativeBlock({ narrativa, loading = false, variant = "light" }) {
  if (loading) {
    return <p className={`text-sm ${variant === "dark" ? "text-zinc-400" : "text-slate-500"}`}>Gerando narrativa executiva...</p>;
  }
  if (!narrativa) {
    return <p className={`text-sm ${variant === "dark" ? "text-zinc-400" : "text-slate-500"}`}>Narrativa executiva indisponível.</p>;
  }
  return (
    <p className={`text-base leading-relaxed ${variant === "dark" ? "text-zinc-100" : "text-slate-800"}`}>{narrativa}</p>
  );
}
