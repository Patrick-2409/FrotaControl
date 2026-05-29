const { createMentionTracker, jaccardSimilarity, normalizeText } = require("./reportMentionTracker");

const COMPLEMENT_FIELDS = ["hipotese_provavel", "consequencia", "risco_futuro", "acao_recomendada"];

const FIELD_ROLES = {
  hipotese_provavel: "problema",
  consequencia: "impacto",
  risco_futuro: "impacto",
  acao_recomendada: "acao",
};

const GENERIC_WHEN_REPEAT = {
  hipotese_provavel:
    "Hipótese operacional: divergência entre registro de viagens e abastecimentos pode indicar falha de processo ou integração entre sistemas.",
  consequencia:
    "Consequência provável: decisões de alocação e precificação permanecem expostas a distorção enquanto a origem do desvio não for isolada.",
  risco_futuro:
    "Risco futuro: recorrência do padrão pode mascarar ineficiência estrutural e ampliar custo fixo sem retorno mensurável.",
  acao_recomendada:
    "Ação recomendada: mapear o fluxo ponta a ponta (romaneio → abastecimento → faturamento) e definir responsável por reconciliação diária.",
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const collectMotorTexts = (motor = {}) => {
  const texts = [
    motor.resumo,
    ...(motor.problemas || []),
    ...(motor.recomendacoes || []),
    motor.acao_imediata,
    motor.risco_financeiro_estimado?.mensagem,
    motor.narrativa_executiva?.o_que_aconteceu,
    motor.narrativa_executiva?.por_que_importa,
    motor.narrativa_executiva?.acao_prioritaria,
    ...(motor.top_riscos || []).map((item) => item?.problema),
    ...(motor.top_riscos || []).map((item) => item?.recomendacao),
    ...(motor.insights || []).map((item) => (typeof item === "string" ? item : item?.mensagem || "")),
  ];
  return texts.map((item) => String(item || "").trim()).filter(Boolean);
};

const extractNumbersFromText = (text) => {
  const raw = String(text || "");
  const matches = raw.match(/\d[\d.,]*/g) || [];
  return matches
    .map((token) => token.replace(/\./g, "").replace(",", "."))
    .map((token) => Number(token))
    .filter((num) => Number.isFinite(num) && num > 0);
};

const buildShownNumbers = (indicadores = {}, motorTexts = []) => {
  const shown = new Set();
  const add = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return;
    shown.add(String(Math.round(num)));
    if (num >= 100) shown.add(String(Math.round(num / 10) * 10));
  };

  Object.values(indicadores || {}).forEach((value) => add(value));
  motorTexts.forEach((text) => extractNumbersFromText(text).forEach(add));
  return shown;
};

const containsShownNumber = (text, shownNumbers) => {
  const nums = extractNumbersFromText(text);
  return nums.some((num) => shownNumbers.has(String(Math.round(num))));
};

const buildConteudoProibidoRepetir = (motor = {}, indicadores = {}) => {
  const motorTexts = collectMotorTexts(motor);
  return {
    resumo: motor.resumo || null,
    problemas: motor.problemas || [],
    recomendacoes: motor.recomendacoes || [],
    narrativa_executiva: motor.narrativa_executiva || null,
    top_riscos: (motor.top_riscos || []).map((item) => ({
      posicao: item?.posicao,
      problema: item?.problema,
      recomendacao: item?.recomendacao,
    })),
    acao_imediata: motor.acao_imediata || null,
    risco_financeiro: motor.risco_financeiro_estimado?.mensagem || null,
    insights: (motor.insights || []).map((item) => (typeof item === "string" ? item : item?.mensagem || "")),
    numeros_ja_exibidos: [...buildShownNumbers(indicadores, motorTexts)],
  };
};

const registerMotorContent = (tracker, motor = {}) => {
  collectMotorTexts(motor).forEach((text) => tracker.register(text));
};

const isRepetitiveField = (text, tracker, shownNumbers) => {
  const raw = String(text || "").trim();
  if (!raw) return true;
  if (tracker.alreadyMentioned(raw, { minOverlap: 0.45 })) return true;
  if (containsShownNumber(raw, shownNumbers) && tracker.alreadyMentioned(raw, { minOverlap: 0.25 })) return true;
  return false;
};

const sanitizeComplementField = (text, field, tracker, shownNumbers) => {
  const raw = String(text || "").trim();
  if (!raw) return null;

  if (isRepetitiveField(raw, tracker, shownNumbers)) {
    const fallback = GENERIC_WHEN_REPEAT[field];
    if (!fallback || tracker.alreadyMentioned(fallback)) return null;
    tracker.register(fallback);
    return fallback;
  }

  if (containsShownNumber(raw, shownNumbers)) {
    const withoutNumbers = raw
      .replace(/R\$\s*[\d.,]+/gi, "valor já apresentado")
      .replace(/\d[\d.,]*\s*(viagens?|litros?|veículos?|km|%)/gi, "volume já apresentado")
      .replace(/\s+/g, " ")
      .trim();
    if (withoutNumbers.length >= 40 && !tracker.alreadyMentioned(withoutNumbers)) {
      tracker.register(withoutNumbers);
      return withoutNumbers;
    }
    const fallback = GENERIC_WHEN_REPEAT[field];
    if (fallback && !tracker.alreadyMentioned(fallback)) {
      tracker.register(fallback);
      return fallback;
    }
    return null;
  }

  const role = FIELD_ROLES[field] || "texto";
  const claimed = tracker.claim(raw, { role, allowComplement: false, allowNull: true });
  return claimed;
};

const extractComplementoExecutivo = (gptReport = {}) => {
  const block = gptReport?.complemento_executivo;
  if (block && typeof block === "object") {
    return {
      hipotese_provavel: block.hipotese_provavel || block.hipotese || "",
      consequencia: block.consequencia || "",
      risco_futuro: block.risco_futuro || "",
      acao_recomendada: block.acao_recomendada || block.acao || "",
    };
  }

  return {
    hipotese_provavel: gptReport?.hipotese_provavel || gptReport?.diagnostico_detalhado || gptReport?.problemaPrincipal || "",
    consequencia: gptReport?.consequencia || gptReport?.impacto_financeiro || gptReport?.impactoFinanceiro || "",
    risco_futuro:
      gptReport?.risco_futuro ||
      ensureArray(gptReport?.riscos_operacionais || gptReport?.riscos)[0] ||
      "",
    acao_recomendada:
      gptReport?.acao_recomendada ||
      ensureArray(gptReport?.acoes_recomendadas || gptReport?.acoes)[0] ||
      "",
  };
};

const sanitizeGptComplement = (gptReport = {}, motor = {}, indicadores = {}) => {
  const tracker = createMentionTracker();
  registerMotorContent(tracker, motor);
  const shownNumbers = buildShownNumbers(indicadores, collectMotorTexts(motor));
  const raw = extractComplementoExecutivo(gptReport);

  const sanitized = {};
  COMPLEMENT_FIELDS.forEach((field) => {
    sanitized[field] = sanitizeComplementField(raw[field], field, tracker, shownNumbers);
  });

  const filled = COMPLEMENT_FIELDS.filter((field) => sanitized[field]).length;
  return {
    ...sanitized,
    disponivel: filled > 0,
    campos_preenchidos: filled,
  };
};

const buildLegacyComplemento = (sanitized = {}) => ({
  hipotese_provavel: sanitized.hipotese_provavel || null,
  consequencia: sanitized.consequencia || null,
  risco_futuro: sanitized.risco_futuro || null,
  acao_recomendada: sanitized.acao_recomendada || null,
  diagnostico: sanitized.hipotese_provavel || null,
  impacto: sanitized.consequencia || null,
  recomendacoes: sanitized.acao_recomendada ? [sanitized.acao_recomendada] : [],
});

module.exports = {
  COMPLEMENT_FIELDS,
  buildConteudoProibidoRepetir,
  buildShownNumbers,
  extractComplementoExecutivo,
  sanitizeGptComplement,
  buildLegacyComplemento,
  containsShownNumber,
  isRepetitiveField,
  jaccardSimilarity,
  normalizeText,
};
