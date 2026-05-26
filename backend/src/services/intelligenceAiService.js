const OPENAI_MODEL_DEFAULT = "gpt-4o-mini";

const GENERIC_PATTERNS = [
  /é necessário melhorar/i,
  /é importante revisar/i,
  /deve melhorar/i,
  /precisa melhorar/i,
  /otimizar processos/i,
  /acompanhar de perto/i,
  /monitorar melhor/i,
  /ajustes gerais/i,
];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureList = (value) =>
  Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

const looksGeneric = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return true;
  if (GENERIC_PATTERNS.some((rx) => rx.test(raw))) return true;
  return false;
};

const fallbackProblem = (data) => {
  const totalViagens = toNumber(data?.indicadores?.totalViagens);
  const totalLitros = toNumber(data?.indicadores?.totalLitros);
  const ociosos = toNumber(data?.indicadores?.veiculosOciosos);
  if (totalViagens === 0 && totalLitros > 0) {
    return `Foram consumidos ${totalLitros.toFixed(1)} L sem viagens no período.`;
  }
  if (ociosos > 0) {
    return `${ociosos} veículo(s) ficaram ociosos no período analisado.`;
  }
  const destaque = data?.insights?.veiculoDestaque;
  if (destaque?.nome && toNumber(destaque?.totalLitros) > 0) {
    return `O veículo ${destaque.nome} liderou consumo com ${toNumber(destaque.totalLitros).toFixed(1)} L.`;
  }
  return `A operação registrou ${totalViagens} viagem(ns) no período analisado.`;
};

const fallbackAnalise = (data) => {
  const indicador = data?.indicadores || {};
  const totalLitros = toNumber(indicador.totalLitros);
  const totalValor = toNumber(indicador.totalValor);
  const precoMedio = indicador.precoMedio == null ? null : toNumber(indicador.precoMedio, NaN);
  const totalViagens = toNumber(indicador.totalViagens);
  return `Consumo total de ${totalLitros.toFixed(1)} L, custo de R$ ${totalValor.toFixed(2)} e ${totalViagens} viagem(ns). ${
    Number.isFinite(precoMedio) ? `Preço médio de R$ ${precoMedio.toFixed(2)}/L.` : "Preço médio indisponível."
  }`;
};

const fallbackRiscos = (data) => {
  const riscos = [];
  const indicador = data?.indicadores || {};
  const insights = data?.insights || {};
  if (insights.operacaoParada) riscos.push("Operação parada com consumo ativo gera custo sem retorno.");
  if (insights.consumoSemProducao) riscos.push("Consumo sem produção pode indicar desvio operacional.");
  if (toNumber(indicador.veiculosOciosos) > 0) {
    riscos.push(`${toNumber(indicador.veiculosOciosos)} veículo(s) ocioso(s) reduzem produtividade.`);
  }
  const destaque = insights.veiculoDestaque;
  if (destaque?.nome && toNumber(destaque?.totalLitros) > 0) {
    riscos.push(`Concentração de consumo no veículo ${destaque.nome}.`);
  }
  return riscos.length ? riscos : ["Sem risco crítico identificado no recorte atual."];
};

const fallbackAcoes = (data) => {
  const acoes = [];
  const insights = data?.insights || {};
  const indicador = data?.indicadores || {};
  if (insights.operacaoParada || insights.consumoSemProducao) {
    acoes.push("Validar imediatamente abastecimentos sem viagens e bloquear novas ocorrências.");
  }
  if (toNumber(indicador.veiculosOciosos) > 0) {
    acoes.push("Redistribuir veículos ociosos para frentes com demanda ativa.");
  }
  if (insights.veiculoDestaque?.nome) {
    acoes.push(`Auditar consumo do veículo ${insights.veiculoDestaque.nome} ainda neste turno.`);
  }
  if (!acoes.length) {
    acoes.push("Manter monitoramento diário e revisar indicadores ao fim de cada turno.");
  }
  return acoes;
};

const ensureConcreteText = (text, fallback) => {
  const raw = String(text || "").trim();
  if (!raw) return fallback;
  if (looksGeneric(raw) && !/\d/.test(raw)) return fallback;
  return raw;
};

const sanitizeResponse = (raw, data) => {
  const problemaPrincipal = ensureConcreteText(raw?.problema_principal, fallbackProblem(data));
  const analise = ensureConcreteText(raw?.analise, fallbackAnalise(data));
  const riscos = ensureList(raw?.riscos).map((item) => ensureConcreteText(item, "")).filter(Boolean);
  const acoes = ensureList(raw?.acoes).map((item) => ensureConcreteText(item, "")).filter(Boolean);

  return {
    problemaPrincipal,
    analise,
    riscos: riscos.length ? riscos : fallbackRiscos(data),
    acoes: acoes.length ? acoes : fallbackAcoes(data),
  };
};

const extractJson = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const buildStructuredText = (report) => {
  return [
    `PROBLEMA PRINCIPAL: ${report.problemaPrincipal}`,
    `ANÁLISE: ${report.analise}`,
    `RISCOS:`,
    ...report.riscos.map((item) => `- ${item}`),
    `AÇÕES:`,
    ...report.acoes.map((item) => `- ${item}`),
  ].join("\n");
};

const generateIntelligenceReport = async (data) => {
  const prompt = [
    "Você é um especialista em operações logísticas.",
    "Receberá indicadores e insights reais da operação.",
    "Objetivo: retornar diagnóstico direto, com foco em decisão.",
    "Responda somente JSON válido no formato:",
    "{",
    '  "problema_principal": "texto objetivo com números",',
    '  "analise": "texto objetivo com números",',
    '  "riscos": ["item 1", "item 2"],',
    '  "acoes": ["ação 1", "ação 2"]',
    "}",
    "Regras obrigatórias:",
    "- Não usar frases genéricas.",
    "- Não inventar dados.",
    "- Usar números concretos sempre que disponíveis.",
    "- Máximo de 2 frases por campo textual.",
  ].join("\n");

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const fallbackBase = sanitizeResponse({}, data);
  if (!apiKey) {
    return {
      ...fallbackBase,
      textoEstruturado: buildStructuredText(fallbackBase),
      origem: "fallback",
    };
  }

  const model = String(process.env.OPENAI_MODEL || OPENAI_MODEL_DEFAULT).trim();
  const timeoutMs = Math.max(15000, Number(process.env.OPENAI_TIMEOUT_MS || 40000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Dados da operação:\n${JSON.stringify(data)}` },
        ],
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const fallback = sanitizeResponse({}, data);
      return {
        ...fallback,
        textoEstruturado: buildStructuredText(fallback),
        origem: "fallback",
      };
    }

    const content = payload?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    const normalized = sanitizeResponse(parsed || {}, data);
    return {
      ...normalized,
      textoEstruturado: buildStructuredText(normalized),
      origem: "openai",
    };
  } catch {
    const fallback = sanitizeResponse({}, data);
    return {
      ...fallback,
      textoEstruturado: buildStructuredText(fallback),
      origem: "fallback",
    };
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  generateIntelligenceReport,
};
