const BLOCKS = [
  { key: "hipotese_provavel", label: "Hipótese provável", tone: "border-blue-200 bg-blue-50/60" },
  { key: "consequencia", label: "Consequência", tone: "border-amber-200 bg-amber-50/60" },
  { key: "risco_futuro", label: "Risco futuro", tone: "border-orange-200 bg-orange-50/60" },
  { key: "acao_recomendada", label: "Ação recomendada", tone: "border-emerald-200 bg-emerald-50/60" },
];

function ComplementBlock({ label, children, tone, dark = false }) {
  if (!children) return null;
  return (
    <article className={`rounded-xl border p-4 ${dark ? "border-zinc-700 bg-zinc-900/60" : tone}`}>
      <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${dark ? "text-zinc-400" : "text-slate-500"}`}>
        {label}
      </p>
      <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-zinc-100" : "text-slate-800"}`}>{children}</p>
    </article>
  );
}

export default function ExecutiveGptComplementBlock({ complemento, loading = false, variant = "light" }) {
  if (loading) {
    return <div className="h-32 animate-pulse rounded-xl bg-slate-100" />;
  }

  if (!complemento) return null;

  const dark = variant === "dark";
  const filled = BLOCKS.filter(({ key }) => complemento[key]);
  if (!filled.length) return null;

  return (
    <div className="space-y-3">
      <p className={`text-xs ${dark ? "text-zinc-400" : "text-slate-500"}`}>
        Complemento interpretativo da IA — não repete números, riscos ou diagnósticos já exibidos pelo motor.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {BLOCKS.map(({ key, label, tone }) => (
          <ComplementBlock key={key} label={label} tone={tone} dark={dark}>
            {complemento[key]}
          </ComplementBlock>
        ))}
      </div>
    </div>
  );
}

export { BLOCKS as GPT_COMPLEMENT_BLOCKS };
