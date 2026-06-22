/* eslint-disable react-refresh/only-export-components */
function VerdictBadge({ label, value, loading = false, positiveWhenTrue = true }) {
  const hasValue = value ? true : false;
  const isGood = positiveWhenTrue ? hasValue : !hasValue;
  const styles = isGood
    ? { wrap: "border-emerald-200 bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-900" }
    : { wrap: "border-red-200 bg-red-50", dot: "bg-red-500", text: "text-red-900" };

  return (
    <article className={`rounded-xl border px-4 py-3 ${styles.wrap}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      {loading ? (
        <div className="mt-2 h-6 w-16 animate-pulse rounded bg-slate-200/80" />
      ) : (
        <p className={`mt-1 flex items-center gap-2 text-lg font-bold ${styles.text}`}>
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${styles.dot}`} aria-hidden="true" />
          {hasValue ? "Sim" : "Não"}
        </p>
      )}
    </article>
  );
}

export function ExecutiveRegraDeOuroCard({ regra, loading = false, className = "" }) {
  const dados = regra?.dadosSuficientes ?? regra?.dados_suficientes;
  const inconsistencia = regra?.haInconsistencia ?? regra?.ha_inconsistencia;
  const confiavel = regra?.confiavelParaDecisao ?? regra?.confiavel_para_decisao;
  const explicacao = regra?.explicacaoPorque || regra?.explicacao_porque || "";

  const tone =
    inconsistencia || dados === false
      ? "border-amber-300 bg-gradient-to-br from-amber-50 to-white"
      : confiavel
        ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white"
        : "border-slate-200 bg-white";

  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${tone} ${className}`.trim()}
      aria-label="Regra de ouro — aderência dos dados"
    >
      <header className="mb-4 border-b border-slate-200/80 pb-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span aria-hidden="true">⚖️</span>
          Regra de ouro — aderência
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Validação automática de aderência antes do diagnóstico; quando necessário, sinaliza alerta operacional.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <VerdictBadge label="Dados suficientes?" value={dados} loading={loading} />
        <VerdictBadge label="Há alerta operacional?" value={inconsistencia} loading={loading} positiveWhenTrue={false} />
        <VerdictBadge
          label="Aderência adequada para decisão?"
          value={confiavel}
          loading={loading}
        />
      </div>

      {loading ? (
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-slate-100" />
      ) : explicacao ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Porquê</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-800">{explicacao}</p>
        </div>
      ) : null}
    </section>
  );
}

export function resolveRegraDeOuro({ overview, relatorio }) {
  if (relatorio?.regraDeOuro) return relatorio.regraDeOuro;
  if (overview?.contexto?.regraDeOuro) return overview.contexto.regraDeOuro;
  if (overview?.regra_de_ouro) return overview.regra_de_ouro;
  if (relatorio?.dadosSuficientes != null) {
    return {
      dadosSuficientes: relatorio.dadosSuficientes,
      haInconsistencia: relatorio.haInconsistencia,
      confiavelParaDecisao: relatorio.confiavelParaDecisao,
      explicacaoPorque: relatorio.explicacaoPorque,
    };
  }
  return null;
}
