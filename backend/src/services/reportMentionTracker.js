const THEME_PATTERNS = [
  { id: "PRODUCAO_SEM_CONSUMO", pattern: /produ(c|ç)(a|ã)o.*sem consumo|viagens?.*sem abastecimento|viagem.*sem consumo|producao sem consumo/i },
  { id: "CONSUMO_SEM_PRODUCAO", pattern: /consumo.*sem (produ(c|ç)(a|ã)o|viagens?)|abastecimento.*sem viagens?|litros?.*sem viagens?/i },
  { id: "INCONSISTENCIA", pattern: /inconsist(ê|e)ncia|erro cr(i|í)tico|lan(c|ç)amentos? incoerentes?/i },
  { id: "CONCENTRACAO", pattern: /concentra(c|ç)(a|ã)o operacional|responde por \d+/i },
  { id: "SUBUTILIZACAO", pattern: /ocioso|subutiliza(c|ç)(a|ã)o|sem utiliza(c|ç)(a|ã)o/i },
  { id: "CRESCIMENTO_CUSTO", pattern: /eleva(c|ç)(a|ã)o de \d+.*custo|crescimento de custo|volatilidade de custo/i },
];

const ROLE_COMPLEMENTS = {
  PRODUCAO_SEM_CONSUMO: {
    impacto: "Eficiência e custo por km permanecem distorcidos até reconciliar viagens e abastecimentos.",
    acao: "Concentre a reconciliação viagem × nota de combustível no ativo prioritário.",
    acao_imediata: "Priorize cruzar romaneios com abastecimentos antes de novas análises de margem.",
    resumo: "Reforço: regularizar produção sem consumo é pré-requisito para leitura financeira confiável.",
    problema: null,
    o_que_aconteceu: null,
    por_que_importa: "Indicadores de eficiência ficam inválidos enquanto houver viagens sem abastecimento.",
    acao_prioritaria: "Auditar imediatamente os lançamentos de combustível do veículo envolvido.",
  },
  CONSUMO_SEM_PRODUCAO: {
    impacto: "Custos de transporte sem produção associada distorcem produtividade e ociosidade.",
    acao: "Validar se houve viagem não registrada ou classificação incorreta do abastecimento.",
    acao_imediata: "Conferir utilização real do veículo e completar viagens pendentes.",
    resumo: "Consumo sem produção exige validação operacional antes de comparativos de eficiência.",
    problema: null,
    o_que_aconteceu: null,
    por_que_importa: "Abastecimentos órfãos comprometem leitura de produtividade da frota.",
    acao_prioritaria: "Verificar utilização real e lançamentos de viagem do ativo citado.",
  },
  INCONSISTENCIA: {
    impacto: "Decisões táticas perdem confiabilidade enquanto persistirem lacunas nos lançamentos.",
    acao: "Tratar primeiro os erros críticos listados na validação de consistência.",
    resumo: "Saneamento de inconsistências precede comparativos estratégicos.",
    problema: null,
  },
  CONCENTRACAO: {
    impacto: "Dependência de um único ativo amplifica risco de indisponibilidade operacional.",
    acao: "Redistribuir demanda ou reforçar manutenção preventiva do veículo dominante.",
    resumo: null,
    problema: null,
  },
  SUBUTILIZACAO: {
    impacto: "Ativos parados mantêm custo fixo sem retorno operacional no período.",
    acao: "Reavaliar alocação da frota entre transporte, apoio e manutenção.",
    resumo: null,
    problema: null,
  },
  CRESCIMENTO_CUSTO: {
    impacto: "Pressão recente sobre margem operacional no recorte analisado.",
    acao: "Investigar picos de custo nos últimos dias do período.",
    resumo: null,
    problema: null,
  },
};

const GENERIC_COMPLEMENTS = {
  impacto: "O efeito sobre margem e produtividade reforça a urgência do achado principal.",
  acao: "Detalhamento tático está consolidado na ação imediata e na priorização de riscos.",
  acao_imediata: "Esta recomendação complementa a ação prioritária já descrita no início do relatório.",
  acao_prioritaria: "Seguir a sequência: corrigir dados → validar KPIs → decidir.",
  resumo: null,
  o_que_aconteceu: null,
  por_que_importa: "Impacto já contextualizado nas seções executivas anteriores.",
  problema: null,
  explicacao: "Validação já apresentada na regra de ouro e no resumo para diretoria.",
  mensagem: "Exposição financeira alinhada ao risco principal já descrito.",
};

const normalizeText = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenSet = (text) =>
  new Set(
    normalizeText(text)
      .split(" ")
      .filter((word) => word.length > 2)
  );

const jaccardSimilarity = (a, b) => {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  sa.forEach((token) => {
    if (sb.has(token)) inter += 1;
  });
  const union = new Set([...sa, ...sb]).size;
  return union ? inter / union : 0;
};

const detectThemes = (text) => {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  return THEME_PATTERNS.filter(({ pattern }) => pattern.test(raw)).map(({ id }) => id);
};

const extractEntityHints = (text) => {
  const hints = [];
  const raw = String(text || "");
  const vehicleMatch = raw.match(/(?:ve[ií]culo|ativo|caminh[aã]o|munk|munck)\s+([A-Za-z0-9][\w\s-]{2,40})/i);
  if (vehicleMatch?.[1]) hints.push(normalizeText(vehicleMatch[1]));
  const parenPlate = raw.match(/\(([A-Z0-9-]{5,8})\)/);
  if (parenPlate?.[1]) hints.push(normalizeText(parenPlate[1]));
  return hints.filter(Boolean);
};

const createMentionTracker = () => {
  const fingerprints = [];
  const themes = new Set();
  const entities = new Set();

  const alreadyMentioned = (text, { minOverlap = 0.5 } = {}) => {
    if (!text || !String(text).trim()) return false;
    const norm = normalizeText(text);
    if (!norm) return false;

    const textThemes = detectThemes(text);
    if (textThemes.some((theme) => themes.has(theme))) return true;

    const textEntities = extractEntityHints(text);
    if (
      textEntities.length > 0 &&
      textThemes.length > 0 &&
      textEntities.every((entity) => entities.has(entity))
    ) {
      return true;
    }

    return fingerprints.some((fp) => jaccardSimilarity(fp, norm) >= minOverlap);
  };

  const register = (text) => {
    if (!text || !String(text).trim()) return;
    fingerprints.push(normalizeText(text));
    detectThemes(text).forEach((theme) => themes.add(theme));
    extractEntityHints(text).forEach((entity) => entities.add(entity));
  };

  const resolveComplement = (role) => {
    for (const theme of themes) {
      const themed = ROLE_COMPLEMENTS[theme]?.[role];
      if (themed) return themed;
    }
    return GENERIC_COMPLEMENTS[role] ?? null;
  };

  const claim = (text, { role = "texto", allowComplement = true, allowNull = true } = {}) => {
    const raw = String(text || "").trim();
    if (!raw) return allowNull ? null : "";

    if (alreadyMentioned(raw)) {
      if (!allowComplement) return allowNull ? null : "";
      const complement = resolveComplement(role);
      if (!complement) return allowNull ? null : "";
      if (alreadyMentioned(complement)) return allowNull ? null : "";
      register(complement);
      return complement;
    }

    register(raw);
    return raw;
  };

  const filterLines = (lines = [], { role = "texto", max = 4 } = {}) => {
    const out = [];
    lines.forEach((line) => {
      if (out.length >= max) return;
      const claimed = claim(line, { role, allowNull: true });
      if (claimed) out.push(claimed);
    });
    return out;
  };

  const countChars = (value) => {
    if (value == null) return 0;
    if (typeof value === "string") return value.length;
    if (Array.isArray(value)) return value.reduce((acc, item) => acc + countChars(item), 0);
    if (typeof value === "object") {
      return Object.values(value).reduce((acc, item) => acc + countChars(item), 0);
    }
    return String(value).length;
  };

  return {
    alreadyMentioned,
    register,
    claim,
    filterLines,
    resolveComplement,
    getThemes: () => [...themes],
    countChars,
  };
};

module.exports = {
  THEME_PATTERNS,
  ROLE_COMPLEMENTS,
  createMentionTracker,
  normalizeText,
  detectThemes,
  jaccardSimilarity,
};
