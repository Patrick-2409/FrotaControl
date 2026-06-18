import { buildExecutiveSemaphore } from "./executiveSemaphore.js";

export const SITUACAO_GERAL = {
  CRITICO: {
    key: "CRITICO",
    label: "Crítica",
    emoji: "🔴",
    headline: "SITUAÇÃO CRÍTICA",
    badge: "bg-red-600 text-white border-red-700",
    panel: "border-red-300 bg-gradient-to-br from-red-50 to-white",
    accent: "text-red-800",
    dot: "bg-red-600",
  },
  ALTO: {
    key: "ALTO",
    label: "Alta",
    emoji: "🟠",
    headline: "SITUAÇÃO ALTA",
    badge: "bg-orange-600 text-white border-orange-700",
    panel: "border-orange-300 bg-gradient-to-br from-orange-50 to-white",
    accent: "text-orange-900",
    dot: "bg-orange-600",
  },
  MEDIO: {
    key: "MEDIO",
    label: "Média",
    emoji: "🟡",
    headline: "SITUAÇÃO MÉDIA",
    badge: "bg-amber-500 text-white border-amber-600",
    panel: "border-amber-300 bg-gradient-to-br from-amber-50 to-white",
    accent: "text-amber-900",
    dot: "bg-amber-500",
  },
  BAIXO: {
    key: "BAIXO",
    label: "Baixa",
    emoji: "🟢",
    headline: "SITUAÇÃO FAVORÁVEL",
    badge: "bg-emerald-600 text-white border-emerald-700",
    panel: "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white",
    accent: "text-emerald-900",
    dot: "bg-emerald-600",
  },
};

const truncateTwoLines = (text, maxLen = 220) => {
  const raw = String(text || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1).trim()}…`;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Situação derivada exclusivamente do Score Geral (sem recalcular). */
export const resolveSituacaoFromScoreGeral = (painelExecutivo = {}) => {
  const score = painelExecutivo?.score_geral;
  const valor = toNumber(score?.valor);
  const classificacao = String(score?.classificacao || "").toUpperCase();

  if (classificacao === "CRITICA" || (valor != null && valor < 50)) return SITUACAO_GERAL.CRITICO;
  if (valor != null && valor >= 50 && valor < 60) return SITUACAO_GERAL.ALTO;
  if (classificacao === "ATENCAO" || (valor != null && valor >= 60 && valor < 70)) return SITUACAO_GERAL.MEDIO;
  if (classificacao === "BOA" || classificacao === "EXCELENTE" || (valor != null && valor >= 70)) {
    return SITUACAO_GERAL.BAIXO;
  }

  return SITUACAO_GERAL.MEDIO;
};

/** Fallback legado — mantido para compatibilidade em testes. */
export const resolveSituacaoGeral = ({ topRiscos = [], statusLabel = "", painelExecutivo } = {}) => {
  if (painelExecutivo?.score_geral) return resolveSituacaoFromScoreGeral(painelExecutivo);

  const fromRisk = topRiscos[0]?.classificacao;
  if (fromRisk && SITUACAO_GERAL[fromRisk]) return SITUACAO_GERAL[fromRisk];

  const status = String(statusLabel || "").toUpperCase();
  if (status.includes("CRIT")) return SITUACAO_GERAL.CRITICO;
  if (status.includes("ATEN") || status.includes("ALERT")) return SITUACAO_GERAL.MEDIO;
  return SITUACAO_GERAL.BAIXO;
};

export const resolveImpactoExecutivo = ({
  narrativaExecutiva,
  riscoFinanceiroEstimado,
  topRisco,
  regraDeOuro,
} = {}) => {
  const confiavel = regraDeOuro?.confiavelParaDecisao ?? regraDeOuro?.confiavel_para_decisao;
  const haInconsistencia = regraDeOuro?.haInconsistencia ?? regraDeOuro?.ha_inconsistencia;
  const dadosSuficientes = regraDeOuro?.dadosSuficientes ?? regraDeOuro?.dados_suficientes;

  if (haInconsistencia || confiavel === false) {
    return "Os indicadores de eficiência atualmente não são confiáveis para tomada de decisão.";
  }

  if (dadosSuficientes === false) {
    return "O volume de lançamentos do período é insuficiente para sustentar decisões estratégicas com segurança.";
  }

  const candidatos = [
    narrativaExecutiva?.por_que_importa,
    topRisco?.problema
      ? `O principal achado operacional (${topRisco.problema}) impacta diretamente a leitura gerencial do período.`
      : null,
    riscoFinanceiroEstimado?.mensagem,
  ].filter(Boolean);

  return truncateTwoLines(
    candidatos[0] || "Sem impacto executivo prioritário identificado para o período analisado."
  );
};

export const resolveDecisaoRecomendada = ({ regraDeOuro, situacao } = {}) => {
  const confiavel = regraDeOuro?.confiavelParaDecisao ?? regraDeOuro?.confiavel_para_decisao;
  const haInconsistencia = regraDeOuro?.haInconsistencia ?? regraDeOuro?.ha_inconsistencia;
  const dadosSuficientes = regraDeOuro?.dadosSuficientes ?? regraDeOuro?.dados_suficientes;

  if (haInconsistencia || confiavel === false) {
    return "Não utilizar os indicadores deste período para decisões estratégicas até saneamento das inconsistências identificadas.";
  }

  if (dadosSuficientes === false) {
    return "Ampliar o volume de lançamentos do período antes de utilizar os indicadores para decisões estratégicas.";
  }

  if (situacao?.key === "CRITICO" || situacao?.key === "ALTO") {
    return "Executar a ação imediata recomendada e revisar os indicadores após a regularização dos lançamentos.";
  }

  return "Indicadores confiáveis para decisões táticas do período — manter monitoramento contínuo da operação.";
};

export const buildExecutiveBoardSummary = ({
  overview,
  topRiscos = [],
  acaoImediata,
  riscoFinanceiroEstimado,
  painelExecutivo,
  narrativaExecutiva,
  regraDeOuro,
  indicadores = {},
} = {}) => {
  const topRisco = topRiscos[0] || null;
  const situacao = resolveSituacaoFromScoreGeral(painelExecutivo);
  const scoreGeral = painelExecutivo?.score_geral || null;
  const narrativas = painelExecutivo?.narrativas || {};

  return {
    situacao,
    scoreGeral,
    semaforo: buildExecutiveSemaphore({
      painelExecutivo,
      regraDeOuro,
      indicadores: indicadores || overview?.indicadores || {},
      narrativas,
    }),
    principalProblema:
      topRisco?.problema || overview?.resumo || "Nenhum risco crítico identificado no período.",
    impacto: resolveImpactoExecutivo({
      narrativaExecutiva,
      riscoFinanceiroEstimado,
      topRisco,
      regraDeOuro,
    }),
    acaoImediata:
      acaoImediata ||
      topRisco?.recomendacao ||
      narrativaExecutiva?.acao_prioritaria ||
      "Manter monitoramento dos indicadores operacionais e financeiros do período.",
    decisaoRecomendada: resolveDecisaoRecomendada({ regraDeOuro, situacao }),
  };
};
