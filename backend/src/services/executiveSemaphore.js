const SEMAFORO_CORES = {
  VERDE: { key: "VERDE", emoji: "🟢", label: "Favorável", badge: "bg-emerald-100 text-emerald-900 border-emerald-200" },
  AMARELO: { key: "AMARELO", emoji: "🟡", label: "Atenção", badge: "bg-amber-100 text-amber-900 border-amber-200" },
  VERMELHO: { key: "VERMELHO", emoji: "🔴", label: "Crítico", badge: "bg-red-100 text-red-900 border-red-200" },
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nivelFromScore = (score) => {
  const valor = toNumber(score?.valor, -1);
  const classificacao = String(score?.classificacao || "").toUpperCase();
  if (classificacao === "CRITICA" || (valor >= 0 && valor < 50)) return SEMAFORO_CORES.VERMELHO;
  if (classificacao === "ATENCAO" || (valor >= 50 && valor < 70)) return SEMAFORO_CORES.AMARELO;
  if (valor >= 70 || classificacao === "BOA" || classificacao === "EXCELENTE") return SEMAFORO_CORES.VERDE;
  return SEMAFORO_CORES.AMARELO;
};

const pickNarrativeHint = (narrativas = {}, key, preferNegative = true) => {
  const block = narrativas?.[key];
  if (!block) return null;
  const list = preferNegative ? block.negativas : block.positivas;
  const alt = preferNegative ? block.positivas : block.negativas;
  const line = String(list?.[0] || alt?.[0] || "").trim();
  if (!line) return null;
  return line.length > 120 ? `${line.slice(0, 117).trim()}…` : line;
};

const buildExecutiveSemaphore = ({ painelExecutivo, regraDeOuro, indicadores = {}, narrativas = {} } = {}) => {
  const haInconsistencia = regraDeOuro?.haInconsistencia ?? regraDeOuro?.ha_inconsistencia;
  const confiavel = regraDeOuro?.confiavelParaDecisao ?? regraDeOuro?.confiavel_para_decisao;
  const dadosSuficientes = regraDeOuro?.dadosSuficientes ?? regraDeOuro?.dados_suficientes;

  const operacaoNivel = haInconsistencia ? SEMAFORO_CORES.VERMELHO : nivelFromScore(painelExecutivo?.score_operacional);
  const financeiroNivel = nivelFromScore(painelExecutivo?.score_financeiro);
  const confiabilidadeNivel =
    confiavel === false || dadosSuficientes === false
      ? SEMAFORO_CORES.VERMELHO
      : nivelFromScore(painelExecutivo?.score_confiabilidade);

  const viagens = toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens);
  const parteDiaria = toNumber(indicadores.totalParteDiaria);
  const eventos = viagens + parteDiaria;
  const frota = toNumber(indicadores.totalVeiculosEscopo ?? indicadores.veiculosConsiderados);
  let produtividadeNivel = nivelFromScore(painelExecutivo?.score_operacional);
  if (frota > 0 && eventos === 0) produtividadeNivel = SEMAFORO_CORES.AMARELO;
  if (eventos >= 3) produtividadeNivel = SEMAFORO_CORES.VERDE;

  return [
    {
      ...operacaoNivel,
      titulo: "Operação",
      explicacao:
        pickNarrativeHint(narrativas, "score_operacional", operacaoNivel.key !== "VERDE") ||
        (haInconsistencia
          ? "Inconsistências críticas encontradas nos lançamentos operacionais."
          : operacaoNivel.key === "VERDE"
            ? "Produção e consumo coerentes no recorte analisado."
            : "Pressão operacional identificada no período."),
    },
    {
      ...financeiroNivel,
      titulo: "Financeiro",
      explicacao:
        pickNarrativeHint(narrativas, "score_financeiro", financeiroNivel.key !== "VERDE") ||
        (financeiroNivel.key === "VERDE" ? "Custos sob controle no período analisado." : "Custos com variação relevante no recorte."),
    },
    {
      ...confiabilidadeNivel,
      titulo: "Confiabilidade",
      explicacao:
        pickNarrativeHint(narrativas, "score_confiabilidade", confiabilidadeNivel.key !== "VERDE") ||
        (confiavel === false || dadosSuficientes === false
          ? "Dados insuficientes ou inconsistentes para decisão estratégica."
          : "Lançamentos coerentes para leitura executiva."),
    },
    {
      ...produtividadeNivel,
      titulo: "Produtividade",
      explicacao:
        pickNarrativeHint(narrativas, "score_operacional", eventos < 3) ||
        (frota > 0 && eventos === 0
          ? "Base insuficiente para avaliação — sem produção registrada no período."
          : eventos >= 3
            ? "Produção registrada de forma consistente no período."
            : "Volume de produção limitado no recorte."),
    },
  ];
};

module.exports = { buildExecutiveSemaphore, SEMAFORO_CORES };
