import {
  getExecutiveToneStyles,
  mapStatusLabel,
  mapStatusTone,
  normalizeMensagens,
} from "../utils/overviewInteligencia";
import ExecutiveMioPanel, { ExecutiveMioNarrativeBlock } from "./ExecutiveMioPanel";
import ExecutiveRiskPanel, {
  ExecutiveFinancialRiskBlock,
  ExecutiveImmediateActionBlock,
} from "./ExecutiveRiskPanel";
import ExecutiveGptComplementBlock from "./ExecutiveGptComplementBlock";

function ExecutivePanelCard({ title, tone = "default", children, className = "" }) {
  const styles = getExecutiveToneStyles(tone);
  return (
    <article
      className={`rounded-2xl border p-5 sm:p-6 ${styles.card} ${className}`.trim()}
    >
      <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 sm:text-xs">{title}</h3>
      <div className="mt-4 sm:mt-5">{children}</div>
    </article>
  );
}

function ExecutivePanelSkeleton() {
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-5 sm:p-6">
          <div className="h-4 w-32 rounded bg-zinc-800/80" />
          <div className="mt-5 h-16 rounded-xl bg-zinc-800/60" />
        </div>
      ))}
    </div>
  );
}

function MessageList({ items, tone = "default", ordered = false }) {
  const styles = getExecutiveToneStyles(tone);
  if (!items.length) return null;

  if (ordered) {
    return (
      <ol className="space-y-4">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-3 text-base leading-relaxed text-zinc-100 sm:text-sm">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${styles.card} ${styles.accent}`}>
              {index + 1}
            </span>
            <span className="pt-0.5">{item}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-3 text-base leading-relaxed text-zinc-100 sm:text-sm">
          <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function IntelligenceExecutivePanel({
  overview,
  loading = false,
  error = "",
  periodoLabel = "",
}) {
  if (loading) {
    return <ExecutivePanelSkeleton />;
  }

  const tone = error ? "critical" : mapStatusTone(overview?.status);
  const styles = getExecutiveToneStyles(tone);
  const statusLabel = error ? "INSTÁVEL" : mapStatusLabel(overview);
  const resumo = error || overview?.resumo || "";
  const problemas = normalizeMensagens(overview?.problemas);
  const insights = normalizeMensagens(overview?.insights);
  const recomendacoes = normalizeMensagens(overview?.recomendacoes);
  const complementoGpt = overview?.complemento_gpt || null;
  const hasComplementoGpt = Boolean(
    complementoGpt?.hipotese_provavel ||
      complementoGpt?.consequencia ||
      complementoGpt?.risco_futuro ||
      complementoGpt?.acao_recomendada
  );
  const painelExecutivo = overview?.painel_executivo || overview?.mio?.painel_executivo || null;
  const narrativaExecutiva = overview?.narrativa_executiva || overview?.mio?.narrativa_executiva || null;
  const topRiscos = overview?.top_riscos || overview?.priorizacao?.top_riscos || [];
  const acaoImediata = overview?.acao_imediata || overview?.priorizacao?.acao_imediata || null;
  const riscoFinanceiroEstimado =
    overview?.risco_financeiro_estimado || overview?.priorizacao?.risco_financeiro_estimado || null;

  if (!error && overview?.vazio) {
    const mensagem = overview?.mensagem || overview?.resumo;
    if (!mensagem) return null;
    return (
      <ExecutivePanelCard title="Status geral" tone="default">
        <p className="text-base leading-relaxed text-zinc-200 sm:text-sm">{mensagem}</p>
      </ExecutivePanelCard>
    );
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <ExecutivePanelCard title="Status geral" tone={tone}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span
            className={`inline-flex w-full items-center justify-center rounded-2xl border-2 px-6 py-5 text-center text-3xl font-black uppercase tracking-wide sm:w-auto sm:px-10 sm:py-6 sm:text-4xl ${styles.badge}`}
          >
            {statusLabel}
          </span>
          {periodoLabel ? (
            <p className="text-center text-sm text-zinc-400 sm:text-right sm:text-xs">{periodoLabel}</p>
          ) : null}
        </div>
      </ExecutivePanelCard>

      {painelExecutivo ? (
        <ExecutivePanelCard title="Painel executivo (MIO)" tone={tone}>
          <ExecutiveMioPanel painelExecutivo={painelExecutivo} />
        </ExecutivePanelCard>
      ) : null}

      {narrativaExecutiva?.o_que_aconteceu ? (
        <ExecutivePanelCard title="O que aconteceu" tone={tone}>
          <ExecutiveMioNarrativeBlock narrativa={narrativaExecutiva.o_que_aconteceu} variant="dark" />
        </ExecutivePanelCard>
      ) : null}

      {narrativaExecutiva?.por_que_importa ? (
        <ExecutivePanelCard title="Por que isso importa" tone={tone === "critical" ? "critical" : "warning"}>
          <ExecutiveMioNarrativeBlock narrativa={narrativaExecutiva.por_que_importa} variant="dark" />
        </ExecutivePanelCard>
      ) : null}

      {narrativaExecutiva?.acao_prioritaria ? (
        <ExecutivePanelCard title="Ação prioritária" tone="warning">
          <ExecutiveMioNarrativeBlock narrativa={narrativaExecutiva.acao_prioritaria} variant="dark" />
        </ExecutivePanelCard>
      ) : null}

      {topRiscos.length > 0 ? (
        <ExecutivePanelCard title="Top 5 riscos operacionais" tone={topRiscos[0]?.classificacao === "CRITICO" ? "critical" : "warning"}>
          <ExecutiveRiskPanel topRiscos={topRiscos} />
        </ExecutivePanelCard>
      ) : null}

      {acaoImediata ? (
        <ExecutivePanelCard title="Ação imediata recomendada" tone="critical">
          <ExecutiveImmediateActionBlock acao={acaoImediata} variant="dark" />
        </ExecutivePanelCard>
      ) : null}

      {riscoFinanceiroEstimado?.mensagem ? (
        <ExecutivePanelCard title="Risco financeiro estimado" tone="warning">
          <ExecutiveFinancialRiskBlock riscoFinanceiro={riscoFinanceiroEstimado} variant="dark" />
        </ExecutivePanelCard>
      ) : null}

      {resumo ? (
        <ExecutivePanelCard title="Resumo executivo" tone={tone}>
          <p className="text-base font-medium leading-relaxed text-zinc-100 sm:text-lg">{resumo}</p>
        </ExecutivePanelCard>
      ) : null}

      {problemas.length > 0 ? (
        <ExecutivePanelCard title="Problemas detectados" tone="critical">
          <MessageList items={problemas} tone="critical" />
        </ExecutivePanelCard>
      ) : null}

      {insights.length > 0 ? (
        <ExecutivePanelCard title="Insights operacionais" tone={tone === "critical" ? "warning" : tone}>
          <MessageList items={insights} tone={tone === "ok" ? "ok" : "warning"} />
        </ExecutivePanelCard>
      ) : null}

      {hasComplementoGpt ? (
        <ExecutivePanelCard title="Complemento estratégico (IA)" tone={tone}>
          <ExecutiveGptComplementBlock complemento={complementoGpt} variant="dark" />
        </ExecutivePanelCard>
      ) : null}

      {recomendacoes.length > 0 ? (
        <ExecutivePanelCard title="Recomendações" tone={tone === "ok" ? "ok" : "warning"}>
          <MessageList items={recomendacoes} tone={tone === "ok" ? "ok" : "warning"} ordered />
        </ExecutivePanelCard>
      ) : null}
    </div>
  );
}
