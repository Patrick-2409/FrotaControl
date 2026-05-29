/**
 * Resolve campos textuais do relatório priorizando conteudo_relatorio (deduplicado pelo backend).
 */
export function resolveReportContent(overview = {}, relatorio = {}) {
  const cr = overview?.conteudo_relatorio || {};
  const rawRegra =
    overview?.regra_de_ouro ||
    overview?.contexto?.regraDeOuro ||
    relatorio?.regraDeOuro ||
    null;

  const regraExplicacao = cr.regra_de_ouro?.explicacao;
  const regraDeOuro =
    rawRegra && regraExplicacao
      ? {
          ...rawRegra,
          explicacaoPorque: regraExplicacao,
          explicacao_porque: regraExplicacao,
        }
      : rawRegra;

  const painelExecutivo = cr.painel_executivo || overview?.painel_executivo || overview?.mio?.painel_executivo || null;
  const narrativaExecutiva =
    cr.narrativa_executiva || overview?.narrativa_executiva || overview?.mio?.narrativa_executiva || null;
  const topRiscos = cr.top_riscos || overview?.top_riscos || overview?.priorizacao?.top_riscos || [];
  const acaoImediata = cr.acao_imediata ?? overview?.acao_imediata ?? overview?.priorizacao?.acao_imediata ?? null;
  const riscoFinanceiroEstimado =
    cr.risco_financeiro_estimado || overview?.risco_financeiro_estimado || overview?.priorizacao?.risco_financeiro_estimado || null;

  const resumoExecutivo =
    cr.resumo_executivo ?? overview?.resumo ?? relatorio?.resumoExecutivo ?? relatorio?.resumo_executivo ?? "";

  const diagnosticoDedup = cr.diagnostico;
  const diagnostico =
    diagnosticoDedup ??
    relatorio?.diagnosticoDetalhado ??
    (Array.isArray(overview?.problemas) && overview.problemas.length ? overview.problemas.join(" ") : "") ??
    relatorio?.diagnostico ??
    "";

  const problemas = cr.problemas || overview?.problemas || [];
  const insightsRaw = cr.insights || overview?.insights || overview?.insights_automaticos || [];
  const insights = insightsRaw.map((item) => (typeof item === "string" ? { tipo: "INSIGHT", mensagem: item } : item));
  const inconsistenciasDetalhadas = cr.inconsistencias_detalhadas || overview?.inconsistencias_detalhadas || [];

  return {
    meta: cr.meta || null,
    boardSummary: cr.resumo_diretoria || null,
    regraDeOuro,
    painelExecutivo,
    narrativaExecutiva,
    topRiscos,
    acaoImediata,
    riscoFinanceiroEstimado,
    resumoExecutivo,
    diagnostico,
    problemas,
    insights,
    inconsistencias: problemas,
    inconsistenciasDetalhadas,
  };
}
