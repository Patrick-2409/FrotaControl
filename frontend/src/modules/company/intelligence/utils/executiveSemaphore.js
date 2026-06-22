export const SEMAFORO_CORES = {
  VERDE: {
    key: "VERDE",
    emoji: "🟢",
    label: "Favorável",
    badge: "bg-emerald-100 text-emerald-900 border-emerald-200",
    dot: "bg-emerald-500",
  },
  AMARELO: {
    key: "AMARELO",
    emoji: "🟡",
    label: "Alerta",
    badge: "bg-amber-100 text-amber-900 border-amber-200",
    dot: "bg-amber-500",
  },
  VERMELHO: {
    key: "VERMELHO",
    emoji: "🔴",
    label: "Crítico",
    badge: "bg-red-100 text-red-900 border-red-200",
    dot: "bg-red-500",
  },
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
  const line = (list?.[0] || alt?.[0] || "").trim();
  if (!line) return null;
  return line.length > 120 ? `${line.slice(0, 117).trim()}…` : line;
};

const buildOperacaoSemaforo = ({ painelExecutivo, regraDeOuro, narrativas }) => {
  const haInconsistencia = regraDeOuro?.haInconsistencia ?? regraDeOuro?.ha_inconsistencia;
  const score = painelExecutivo?.score_operacional;

  if (haInconsistencia) {
    return {
      ...SEMAFORO_CORES.VERMELHO,
      titulo: "Operação",
      explicacao: "Inconsistências críticas encontradas nos lançamentos operacionais.",
    };
  }

  const nivel = nivelFromScore(score);
  const hint = pickNarrativeHint(narrativas, "score_operacional", nivel.key !== "VERDE");

  return {
    ...nivel,
    titulo: "Operação",
    explicacao:
      hint ||
      (nivel.key === "VERDE"
        ? "Produção e consumo coerentes no recorte analisado."
        : nivel.key === "AMARELO"
          ? "Pressão operacional identificada — acompanhar evolução no período."
          : "Operação com falhas críticas que exigem intervenção imediata."),
  };
};

const buildFinanceiroSemaforo = ({ painelExecutivo, narrativas }) => {
  const nivel = nivelFromScore(painelExecutivo?.score_financeiro);
  const hint = pickNarrativeHint(narrativas, "score_financeiro", nivel.key !== "VERDE");

  return {
    ...nivel,
    titulo: "Financeiro",
    explicacao:
      hint ||
      (nivel.key === "VERDE"
        ? "Custos sob controle no período analisado."
        : nivel.key === "AMARELO"
          ? "Custos com variação relevante — revisar concentração e picos."
          : "Pressão financeira crítica sobre a operação no recorte."),
  };
};

const buildConfiabilidadeSemaforo = ({ painelExecutivo, regraDeOuro, narrativas }) => {
  const confiavel = regraDeOuro?.confiavelParaDecisao ?? regraDeOuro?.confiavel_para_decisao;
  const dadosSuficientes = regraDeOuro?.dadosSuficientes ?? regraDeOuro?.dados_suficientes;
  const score = painelExecutivo?.score_confiabilidade;

  if (confiavel === false || dadosSuficientes === false) {
    return {
      ...SEMAFORO_CORES.VERMELHO,
      titulo: "Aderência",
      explicacao: "Dados insuficientes ou inconsistentes para decisão estratégica.",
    };
  }

  const nivel = nivelFromScore(score);
  const hint = pickNarrativeHint(narrativas, "score_confiabilidade", nivel.key !== "VERDE");

  return {
    ...nivel,
    titulo: "Aderência",
    explicacao:
      hint ||
      (nivel.key === "VERDE"
        ? "Dados aderentes ao processo — indicadores confiáveis para decisão."
        : nivel.key === "AMARELO"
          ? "Aderência parcial dos dados — exige cautela na interpretação."
          : "Baixa aderência dos dados — corrigir lançamentos antes de decidir."),
  };
};

const buildProdutividadeSemaforo = ({ indicadores = {}, painelExecutivo, narrativas }) => {
  const viagens = toNumber(indicadores.totalViagensTransporte ?? indicadores.totalViagens);
  const parteDiaria = toNumber(indicadores.totalParteDiaria);
  const eventos = viagens + parteDiaria;
  const frota = toNumber(indicadores.totalVeiculosEscopo ?? indicadores.veiculosConsiderados);
  const ativos = toNumber(indicadores.veiculosAtivos);
  const ociosos = toNumber(indicadores.veiculosOciosos);

  if (frota > 0 && eventos === 0) {
    return {
      ...SEMAFORO_CORES.AMARELO,
      titulo: "Produtividade",
      explicacao: "Base insuficiente para avaliação — sem produção registrada no período.",
    };
  }

  if (frota > 0 && ativos === 0) {
    return {
      ...SEMAFORO_CORES.VERMELHO,
      titulo: "Produtividade",
      explicacao: "Nenhum veículo ativo no recorte — produtividade comprometida.",
    };
  }

  if (ociosos > 0 && ativos > 0 && ociosos >= ativos) {
    return {
      ...SEMAFORO_CORES.AMARELO,
      titulo: "Produtividade",
      explicacao: `${ociosos} veículo(s) ocioso(s) — produtividade abaixo do potencial da frota.`,
    };
  }

  const nivel = nivelFromScore(painelExecutivo?.score_operacional);
  const hint = pickNarrativeHint(narrativas, "score_operacional", eventos < 3);

  if (eventos > 0 && eventos < 3) {
    return {
      ...SEMAFORO_CORES.AMARELO,
      titulo: "Produtividade",
      explicacao: hint || "Volume de produção limitado — base preliminar para conclusões.",
    };
  }

  return {
    ...(eventos >= 3 ? SEMAFORO_CORES.VERDE : nivel),
    titulo: "Produtividade",
    explicacao:
      hint ||
      (eventos >= 3
        ? "Produção registrada de forma consistente no período."
        : "Produtividade em patamar que exige monitoramento."),
  };
};

export const buildExecutiveSemaphore = ({
  painelExecutivo,
  regraDeOuro,
  indicadores = {},
  narrativas = {},
} = {}) => [
  buildOperacaoSemaforo({ painelExecutivo, regraDeOuro, narrativas }),
  buildFinanceiroSemaforo({ painelExecutivo, narrativas }),
  buildConfiabilidadeSemaforo({ painelExecutivo, regraDeOuro, narrativas }),
  buildProdutividadeSemaforo({ indicadores, painelExecutivo, narrativas }),
];
