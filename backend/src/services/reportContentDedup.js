const { buildExecutiveBoardSummary } = require("./executiveBoardSummary");
const { createMentionTracker } = require("./reportMentionTracker");

const collectTextSnapshot = (payload = {}) => ({
  resumo_diretoria: payload.resumo_diretoria,
  regra_de_ouro: payload.regra_de_ouro?.explicacao,
  narrativas: payload.painel_executivo?.narrativas,
  narrativa_executiva: payload.narrativa_executiva,
  top_riscos: (payload.top_riscos || []).map((item) => item.problema),
  acao_imediata: payload.acao_imediata,
  risco_financeiro: payload.risco_financeiro_estimado?.mensagem,
  resumo_executivo: payload.resumo_executivo,
  diagnostico: payload.diagnostico,
  problemas: payload.problemas,
  insights: (payload.insights || []).map((item) => (typeof item === "string" ? item : item.mensagem || item.diagnostico)),
  inconsistencias: (payload.inconsistencias_detalhadas || []).map((item) => item.descricao),
});

const SECTION_PAGE_LABELS = {
  resumo_diretoria: "Resumo Executivo para Diretoria",
  regra_de_ouro: "Regra de ouro",
  narrativas: "Painel Executivo (Por que este score?)",
  narrativa_executiva: "O que aconteceu / Por que importa / Ação prioritária",
  top_riscos: "Top 5 Riscos Operacionais",
  acao_imediata: "Ação imediata recomendada",
  risco_financeiro: "Risco financeiro estimado",
  resumo_executivo: "Resumo Executivo",
  diagnostico: "Diagnóstico operacional",
  problemas: "Inconsistências detectadas (lista)",
  insights: "Gráficos explicados (insights)",
  inconsistencias: "Inconsistências detectadas (detalhe)",
};

const measureChars = (tracker, snapshot) => tracker.countChars(snapshot);

const measureSections = (tracker, snapshot) => {
  const sections = {};
  Object.keys(SECTION_PAGE_LABELS).forEach((key) => {
    sections[key] = tracker.countChars(snapshot[key]);
  });
  return sections;
};

const resolveAffectedPages = (before, after) =>
  Object.keys(SECTION_PAGE_LABELS).filter((key) => (before[key] || 0) > (after[key] || 0));

const dedupeNarrativasScores = (narrativas = {}, tracker) => {
  if (!narrativas || typeof narrativas !== "object") return narrativas;
  const keys = ["score_geral", "score_operacional", "score_financeiro", "score_confiabilidade"];
  const out = { ...narrativas };

  keys.forEach((key) => {
    const block = narrativas[key];
    if (!block) return;
    out[key] = {
      positivas: tracker.filterLines(block.positivas || [], { role: "texto", max: 4 }),
      negativas: tracker.filterLines(block.negativas || [], { role: "texto", max: 4 }),
    };
  });

  return out;
};

const dedupeTopRiscos = (topRiscos = [], tracker) =>
  topRiscos.map((item) => {
    const problemaOriginal = item?.problema || "";
    const claimed = tracker.claim(problemaOriginal, { role: "problema" });
    if (claimed) {
      return { ...item, problema: claimed, problema_redundante: false };
    }

    const complemento =
      item.recomendacao && !tracker.alreadyMentioned(item.recomendacao)
        ? tracker.claim(item.recomendacao, { role: "acao" })
        : tracker.claim(`Prioridade #${item.posicao}: score ${item.score}/100 (${item.faixa}).`, {
            role: "problema",
            allowComplement: false,
          });

    return {
      ...item,
      problema: complemento || `Prioridade #${item.posicao}: score ${item.score}/100 (${item.faixa}).`,
      problema_redundante: true,
    };
  });

const dedupeInsights = (insights = [], tracker) =>
  insights
    .map((item) => {
      if (typeof item === "string") {
        const mensagem = tracker.claim(item, { role: "texto" });
        return mensagem || null;
      }
      const mensagem = tracker.claim(item.mensagem || item.diagnostico, { role: "texto" });
      if (!mensagem) return null;
      return { ...item, mensagem, diagnostico: item.diagnostico ? tracker.claim(item.diagnostico, { role: "impacto" }) : item.diagnostico };
    })
    .filter(Boolean);

const dedupeInconsistenciasDetalhadas = (items = [], tracker) =>
  items.map((item) => {
    const descricao = item?.descricao || "";
    const claimed = tracker.claim(descricao, { role: "problema" });
    if (claimed) return { ...item, descricao: claimed };

    const resumoTecnico = `${item.veiculo || "Veículo"}: ${Number(item.viagens || 0)} viagem(ns) · ${Number(item.litros || 0).toLocaleString("pt-BR")} L`;
    return {
      ...item,
      descricao: tracker.claim(resumoTecnico, { role: "texto", allowComplement: false }) || resumoTecnico,
      descricao_redundante: true,
    };
  });

const buildReportContentDeduped = ({
  resumo,
  statusLabel = "OK",
  regraDeOuro,
  painelExecutivo,
  narrativaExecutiva,
  topRiscos = [],
  acaoImediata,
  riscoFinanceiroEstimado,
  problemas = [],
  insights = [],
  inconsistenciasDetalhadas = [],
  diagnostico = "",
  indicadores = {},
} = {}) => {
  const tracker = createMentionTracker();
  const boardRaw = buildExecutiveBoardSummary({
    overview: { resumo },
    topRiscos,
    acaoImediata,
    riscoFinanceiroEstimado,
    painelExecutivo,
    narrativaExecutiva,
    regraDeOuro,
    statusLabel,
    indicadores,
  });

  const rawSnapshot = collectTextSnapshot({
    resumo_diretoria: boardRaw,
    regra_de_ouro: { explicacao: regraDeOuro?.explicacaoPorque || regraDeOuro?.explicacao_porque },
    painel_executivo: { narrativas: painelExecutivo?.narrativas },
    narrativa_executiva: narrativaExecutiva,
    top_riscos: topRiscos,
    acao_imediata: acaoImediata,
    risco_financeiro_estimado: riscoFinanceiroEstimado,
    resumo_executivo: resumo,
    diagnostico,
    problemas,
    insights,
    inconsistencias_detalhadas: inconsistenciasDetalhadas,
  });
  const charsBefore = measureChars(tracker, rawSnapshot);
  const sectionCharsBefore = measureSections(tracker, rawSnapshot);

  const resumoDiretoria = {
    ...boardRaw,
    principalProblema: tracker.claim(boardRaw.principalProblema, { role: "problema" }),
    impacto: tracker.claim(boardRaw.impacto, { role: "impacto" }),
    acaoImediata: tracker.claim(boardRaw.acaoImediata, { role: "acao_imediata" }),
    decisaoRecomendada: tracker.claim(boardRaw.decisaoRecomendada, { role: "acao" }),
    semaforo: (boardRaw.semaforo || []).map((item) => ({
      ...item,
      explicacao: tracker.claim(item.explicacao, { role: "explicacao" }) || item.explicacao,
    })),
  };

  const regraDedup = {
    explicacao: tracker.claim(regraDeOuro?.explicacaoPorque || regraDeOuro?.explicacao_porque, { role: "explicacao" }),
  };

  const narrativasDedup = dedupeNarrativasScores(painelExecutivo?.narrativas, tracker);

  const narrativaDedup = {
    o_que_aconteceu: tracker.claim(narrativaExecutiva?.o_que_aconteceu, { role: "o_que_aconteceu" }),
    por_que_importa: tracker.claim(narrativaExecutiva?.por_que_importa, { role: "por_que_importa" }),
    acao_prioritaria: tracker.claim(narrativaExecutiva?.acao_prioritaria, { role: "acao_prioritaria" }),
  };

  const topRiscosDedup = dedupeTopRiscos(topRiscos, tracker);
  const acaoImediataDedup = tracker.claim(acaoImediata, { role: "acao_imediata" });
  const riscoFinanceiroDedup = {
    ...(riscoFinanceiroEstimado || {}),
    mensagem: tracker.claim(riscoFinanceiroEstimado?.mensagem, { role: "mensagem" }),
  };
  const resumoExecutivoDedup = tracker.claim(resumo, { role: "resumo" });
  const diagnosticoDedup = tracker.claim(diagnostico, { role: "resumo" });
  const problemasDedup = tracker.filterLines(problemas, { role: "problema", max: 8 });
  const insightsDedup = dedupeInsights(insights, tracker);
  const inconsistenciasDedup = dedupeInconsistenciasDetalhadas(inconsistenciasDetalhadas, tracker);

  const deduped = {
    resumo_diretoria: resumoDiretoria,
    regra_de_ouro: regraDedup,
    painel_executivo: {
      ...(painelExecutivo || {}),
      narrativas: narrativasDedup,
    },
    narrativa_executiva: narrativaDedup,
    top_riscos: topRiscosDedup,
    acao_imediata: acaoImediataDedup,
    risco_financeiro_estimado: riscoFinanceiroDedup,
    resumo_executivo: resumoExecutivoDedup,
    diagnostico: diagnosticoDedup,
    problemas: problemasDedup,
    insights: insightsDedup,
    inconsistencias_detalhadas: inconsistenciasDedup,
  };

  const dedupedSnapshot = collectTextSnapshot(deduped);
  const charsAfter = measureChars(tracker, dedupedSnapshot);
  const sectionCharsAfter = measureSections(tracker, dedupedSnapshot);
  const reducaoPercentual =
    charsBefore > 0 ? Math.round(((charsBefore - charsAfter) / charsBefore) * 1000) / 10 : 0;
  const paginasAfetadas = resolveAffectedPages(sectionCharsBefore, sectionCharsAfter).map(
    (key) => SECTION_PAGE_LABELS[key]
  );

  deduped.meta = {
    caracteres_antes: charsBefore,
    caracteres_depois: charsAfter,
    reducao_percentual: reducaoPercentual,
    paginas_afetadas: paginasAfetadas,
    temas_registrados: tracker.getThemes(),
  };

  return deduped;
};

module.exports = {
  buildReportContentDeduped,
  collectTextSnapshot,
};
