const { buildExecutiveSemaphore } = require("./executiveSemaphore");

const SITUACAO_GERAL = {
  CRITICO: { key: "CRITICO", label: "Crítica", emoji: "🔴", headline: "SITUAÇÃO CRÍTICA" },
  ALTO: { key: "ALTO", label: "Alta", emoji: "🟠", headline: "SITUAÇÃO ALTA" },
  MEDIO: { key: "MEDIO", label: "Média", emoji: "🟡", headline: "SITUAÇÃO MÉDIA" },
  BAIXO: { key: "BAIXO", label: "Baixa", emoji: "🟢", headline: "SITUAÇÃO FAVORÁVEL" },
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

const resolveSituacaoFromScoreGeral = (painelExecutivo = {}) => {
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

const resolveSituacaoGeral = ({ topRiscos = [], statusLabel = "", painelExecutivo } = {}) => {
  if (painelExecutivo?.score_geral) return resolveSituacaoFromScoreGeral(painelExecutivo);
  const fromRisk = topRiscos[0]?.classificacao;
  if (fromRisk && SITUACAO_GERAL[fromRisk]) return SITUACAO_GERAL[fromRisk];
  const status = String(statusLabel || "").toUpperCase();
  if (status.includes("CRIT")) return SITUACAO_GERAL.CRITICO;
  if (status.includes("ATEN") || status.includes("ALERT")) return SITUACAO_GERAL.MEDIO;
  return SITUACAO_GERAL.BAIXO;
};

const resolveImpactoExecutivo = ({ narrativaExecutiva, riscoFinanceiroEstimado, topRisco, regraDeOuro } = {}) => {
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

  return truncateTwoLines(candidatos[0] || "Sem impacto executivo prioritário identificado para o período analisado.");
};

const resolveDecisaoRecomendada = ({ regraDeOuro, situacao } = {}) => {
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

const buildExecutiveBoardSummary = ({
  overview,
  topRiscos = [],
  acaoImediata,
  riscoFinanceiroEstimado,
  painelExecutivo,
  narrativaExecutiva,
  regraDeOuro,
  statusLabel,
  indicadores = {},
} = {}) => {
  const topRisco = topRiscos[0] || null;
  const situacao = resolveSituacaoFromScoreGeral(painelExecutivo);
  const narrativas = painelExecutivo?.narrativas || {};

  return {
    situacao,
    scoreGeral: painelExecutivo?.score_geral || null,
    semaforo: buildExecutiveSemaphore({
      painelExecutivo,
      regraDeOuro,
      indicadores: indicadores || overview?.indicadores || {},
      narrativas,
    }),
    principalProblema: topRisco?.problema || overview?.resumo || "Nenhum risco crítico identificado no período.",
    impacto: resolveImpactoExecutivo({ narrativaExecutiva, riscoFinanceiroEstimado, topRisco, regraDeOuro }),
    acaoImediata:
      acaoImediata ||
      topRisco?.recomendacao ||
      narrativaExecutiva?.acao_prioritaria ||
      "Manter monitoramento dos indicadores operacionais e financeiros do período.",
    decisaoRecomendada: resolveDecisaoRecomendada({ regraDeOuro, situacao }),
  };
};

module.exports = {
  SITUACAO_GERAL,
  buildExecutiveBoardSummary,
  resolveSituacaoGeral,
  resolveSituacaoFromScoreGeral,
};
