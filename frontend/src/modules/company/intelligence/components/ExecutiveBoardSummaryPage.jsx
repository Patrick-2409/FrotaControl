import { buildExecutiveBoardSummary, SITUACAO_GERAL } from "../utils/executiveBoardSummary";

function SummaryBlock({ label, children, className = "" }) {
  return (
    <article className={`rounded-xl border border-slate-200 bg-white/90 p-4 ${className}`.trim()}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-2">{children}</div>
    </article>
  );
}

function SemaphoreCard({ item }) {
  return (
    <article className={`rounded-xl border p-4 ${item.badge}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden="true">
          {item.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-wide text-slate-900">{item.titulo}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-800">{item.explicacao}</p>
        </div>
      </div>
    </article>
  );
}

export default function ExecutiveBoardSummaryPage({
  overview,
  boardSummary = null,
  topRiscos = [],
  acaoImediata,
  riscoFinanceiroEstimado,
  painelExecutivo,
  narrativaExecutiva,
  regraDeOuro,
  statusLabel,
  indicadores = {},
  loading = false,
}) {
  if (loading) {
    return (
      <section className="fc-report-board-summary mt-8 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 p-8">
        <div className="mx-auto h-6 w-72 rounded bg-slate-200" />
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-24 rounded-xl bg-slate-200/80" />
          ))}
        </div>
      </section>
    );
  }

  const summaryRaw =
    boardSummary ||
    buildExecutiveBoardSummary({
      overview,
      topRiscos,
      acaoImediata,
      riscoFinanceiroEstimado,
      painelExecutivo,
      narrativaExecutiva,
      regraDeOuro,
      statusLabel,
      indicadores: indicadores || overview?.indicadores,
    });

  const situacaoKey = summaryRaw.situacao?.key || summaryRaw.situacao?.label;
  const situacao =
    SITUACAO_GERAL[summaryRaw.situacao?.key] ||
    SITUACAO_GERAL[situacaoKey] ||
    summaryRaw.situacao;

  const summary = { ...summaryRaw, situacao };
  const { scoreGeral, semaforo, principalProblema, impacto, acaoImediata: acao, decisaoRecomendada } = summary;

  return (
    <section
      id="resumo-diretoria"
      className={`fc-report-board-summary fc-report-section mt-8 scroll-mt-6 rounded-2xl border p-6 shadow-sm sm:p-8 ${situacao.panel}`}
      aria-label="Resumo executivo para diretoria"
    >
      <header className="border-b border-slate-200/80 pb-5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">FrotaMax · Inteligência</p>
        <h2 className="mt-2 text-xl font-black uppercase tracking-wide text-slate-900 sm:text-2xl">
          Resumo Executivo para Diretoria
        </h2>
      </header>

      <div className="mt-6 space-y-4">
        <SummaryBlock label="1. Situação Geral">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="text-4xl leading-none" aria-hidden="true">
                {situacao.emoji}
              </span>
              <div>
                <p className={`text-lg font-black uppercase tracking-wide ${situacao.accent}`}>{situacao.headline}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Classificação: <span className="font-semibold">{situacao.label}</span>
                  {scoreGeral?.valor != null ? (
                    <>
                      {" "}
                      · Score Geral <span className="font-bold tabular-nums text-slate-900">{scoreGeral.valor}</span>
                      /100
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
        </SummaryBlock>

        <SummaryBlock label="2. Semáforo Executivo">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(semaforo || []).map((item) => (
              <SemaphoreCard key={item.titulo} item={item} />
            ))}
          </div>
        </SummaryBlock>

        <SummaryBlock label="3. Principal Problema">
          <p className="text-base font-semibold leading-relaxed text-slate-900">{principalProblema}</p>
        </SummaryBlock>

        <SummaryBlock label="4. Impacto Executivo">
          <p className="text-sm leading-relaxed text-slate-800">{impacto}</p>
        </SummaryBlock>

        <SummaryBlock label="5. Ação Imediata">
          <p className="text-sm font-medium leading-relaxed text-slate-900">{acao}</p>
        </SummaryBlock>

        <article className="rounded-xl border border-slate-300 bg-slate-900 p-5 text-white shadow-md">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">6. Decisão Recomendada</p>
          <p className="mt-3 text-base font-semibold leading-relaxed">{decisaoRecomendada}</p>
        </article>
      </div>
    </section>
  );
}
