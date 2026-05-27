const crypto = require("crypto");
const { pool } = require("../db");

const OPENAI_MODEL_DEFAULT = "gpt-4o-mini";
const INTELLIGENCE_DAILY_LIMIT_DEFAULT = 5;
const INTELLIGENCE_TIMEOUT_MS_DEFAULT = 20000;
let protectionTablesPromise = null;

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

const ensureModuleAnalysis = (raw, data) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const transporteDisponivel = Boolean(data?.indicadores?.dadosTransporteDisponiveis);
  return {
    combustivel: ensureConcreteText(
      source.combustivel,
      `Consumo total ${toNumber(data?.indicadores?.totalLitros).toFixed(1)} L e custo total R$ ${toNumber(data?.indicadores?.totalValor).toFixed(2)}.`
    ),
    transporte: ensureConcreteText(
      source.transporte,
      transporteDisponivel
        ? `Produção de ${toNumber(data?.indicadores?.totalViagensTransporte)} viagem(ns) com consumo dedicado de ${toNumber(
            data?.indicadores?.totalLitrosTransporte
          ).toFixed(1)} L.`
        : "Dados insuficientes de transporte para análise de produção."
    ),
    frota: ensureConcreteText(
      source.frota,
      `${toNumber(data?.indicadores?.veiculosAtivos)} veículo(s) ativo(s) e ${toNumber(data?.indicadores?.veiculosOciosos)} ocioso(s).`
    ),
  };
};

const sanitizeResponse = (raw, data) => {
  const resumoExecutivo = ensureConcreteText(
    raw?.resumo_executivo,
    `Resumo executivo: ${fallbackAnalise(data)}`
  );
  const diagnosticoDetalhado = ensureConcreteText(
    raw?.diagnostico_detalhado || raw?.problema_principal,
    fallbackProblem(data)
  );
  const analiseModulos = ensureModuleAnalysis(raw?.analise_modulos, data);
  const impactoFinanceiro = ensureConcreteText(
    raw?.impacto_financeiro,
    `Impacto financeiro atual de R$ ${toNumber(data?.indicadores?.totalValor).toFixed(2)} no período analisado.`
  );
  const calculosUtilizados = ensureList(raw?.calculos_utilizados)
    .map((item) => ensureConcreteText(item, ""))
    .filter(Boolean);
  const riscos = ensureList(raw?.riscos_operacionais || raw?.riscos)
    .map((item) => ensureConcreteText(item, ""))
    .filter(Boolean);
  const acoes = ensureList(raw?.acoes_recomendadas || raw?.acoes)
    .map((item) => ensureConcreteText(item, ""))
    .filter(Boolean);
  const problemaPrincipal = diagnosticoDetalhado;
  const analise = [resumoExecutivo, analiseModulos.combustivel, analiseModulos.transporte, analiseModulos.frota, impactoFinanceiro]
    .filter(Boolean)
    .join(" ");

  return {
    problemaPrincipal,
    analise,
    riscos: riscos.length ? riscos : fallbackRiscos(data),
    acoes: acoes.length ? acoes : fallbackAcoes(data),
    resumoExecutivo,
    diagnosticoDetalhado,
    analiseModulos,
    impactoFinanceiro,
    calculosUtilizados: calculosUtilizados.length
      ? calculosUtilizados
      : [
          "Preço médio = total valor / total litros",
          "Eficiência de combustível = km rodados / litros consumidos (quando km disponível)",
        ],
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
    `RESUMO EXECUTIVO: ${report.resumoExecutivo || report.analise}`,
    `DIAGNÓSTICO DETALHADO: ${report.diagnosticoDetalhado || report.problemaPrincipal}`,
    `ANÁLISE POR MÓDULO:`,
    `- Combustível: ${report?.analiseModulos?.combustivel || "Dados insuficientes para combustível."}`,
    `- Transporte: ${report?.analiseModulos?.transporte || "Dados insuficientes para transporte."}`,
    `- Frota: ${report?.analiseModulos?.frota || "Dados insuficientes para frota."}`,
    `IMPACTO FINANCEIRO: ${report.impactoFinanceiro || "Dados insuficientes."}`,
    `RISCOS OPERACIONAIS:`,
    ...report.riscos.map((item) => `- ${item}`),
    `AÇÕES RECOMENDADAS:`,
    ...report.acoes.map((item) => `- ${item}`),
    `CÁLCULOS UTILIZADOS:`,
    ...(Array.isArray(report.calculosUtilizados) ? report.calculosUtilizados : []).map((item) => `- ${item}`),
  ].join("\n");
};

const stableStringify = (value) => {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
};

const sha256 = (value) => crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");

const dailyLimit = () => Math.max(1, Number(process.env.INTELLIGENCE_AI_DAILY_LIMIT || INTELLIGENCE_DAILY_LIMIT_DEFAULT));

const aiTimeoutMs = () =>
  Math.max(10000, Number(process.env.INTELLIGENCE_AI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || INTELLIGENCE_TIMEOUT_MS_DEFAULT));

const ensureProtectionTables = async () => {
  if (!protectionTablesPromise) {
    protectionTablesPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS intelligence_ai_cache (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        cache_key VARCHAR(64) NOT NULL,
        response_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (empresa_id, cache_key)
      );
      CREATE INDEX IF NOT EXISTS idx_intelligence_ai_cache_lookup
        ON intelligence_ai_cache (empresa_id, cache_key, updated_at DESC);

      CREATE TABLE IF NOT EXISTS intelligence_ai_usage_logs (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        cache_key VARCHAR(64),
        model VARCHAR(80),
        cache_hit BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_intelligence_ai_usage_empresa_created
        ON intelligence_ai_usage_logs (empresa_id, created_at DESC);
    `);
  }
  return protectionTablesPromise;
};

const buildCacheKey = (data) => {
  const base = {
    periodo: data?.periodo?.tipo || null,
    periodo_inicio: data?.periodo?.inicio || null,
    periodo_fim: data?.periodo?.fim || null,
    tipoAnalise: data?.tipoAnalise || null,
    filtros: data?.filtros || null,
  };
  return sha256(stableStringify(base));
};

const getCachedReport = async ({ empresaId, cacheKey }) => {
  const { rows } = await pool.query(
    `SELECT response_json
     FROM intelligence_ai_cache
     WHERE empresa_id = $1
       AND cache_key = $2
     ORDER BY updated_at DESC
     LIMIT 1`,
    [empresaId, cacheKey]
  );
  if (!rows.length) return null;
  return rows[0].response_json || null;
};

const saveCachedReport = async ({ empresaId, cacheKey, report }) => {
  await pool.query(
    `INSERT INTO intelligence_ai_cache (empresa_id, cache_key, response_json)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (empresa_id, cache_key)
     DO UPDATE SET response_json = EXCLUDED.response_json, updated_at = NOW()`,
    [empresaId, cacheKey, JSON.stringify(report)]
  );
};

const saveUsageLog = async ({ empresaId, cacheKey, model, cacheHit }) => {
  await pool.query(
    `INSERT INTO intelligence_ai_usage_logs (empresa_id, cache_key, model, cache_hit)
     VALUES ($1, $2, $3, $4)`,
    [empresaId, cacheKey || null, model || null, Boolean(cacheHit)]
  );
};

const getTodayUsageCount = async (empresaId) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM intelligence_ai_usage_logs
     WHERE empresa_id = $1
       AND cache_hit = false
       AND DATE_TRUNC('day', created_at) = DATE_TRUNC('day', NOW())`,
    [empresaId]
  );
  return toNumber(rows[0]?.total);
};

const runWithFunctionTimeout = async (promiseFactory, timeoutMs) => {
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve({ timeout: true }), timeoutMs);
  });
  const result = await Promise.race([promiseFactory(), timeoutPromise]);
  if (result?.timeout) return null;
  return result;
};

const generateIntelligenceReport = async (data) => {
  const dataContext = {
    periodo: data?.periodo || null,
    tipoAnalise: data?.tipoAnalise || null,
    filtros: data?.filtros || null,
    indicadores: data?.indicadores || {},
    insights: data?.insights || {},
    regra_contexto: {
      transporte_tem_producao: true,
      apoio_sem_producao: true,
      dados_transporte_disponiveis: Boolean(data?.indicadores?.dadosTransporteDisponiveis),
      analise_producao_ignorada: Boolean(data?.insights?.analiseProducaoIgnorada),
    },
  };
  const prompt = [
    "Você é um analista sênior de operações e logística.",
    "Sua função é gerar um relatório executivo baseado EXCLUSIVAMENTE nos dados fornecidos.",
    "Responda somente JSON válido no formato:",
    "{",
    '  "resumo_executivo": "texto executivo e objetivo com base numérica",',
    '  "diagnostico_detalhado": "problema principal + causa com base numérica",',
    '  "analise_modulos": {',
    '    "combustivel": "análise específica com números e sem generalização",',
    '    "transporte": "análise específica com números e sem assumir produção para apoio",',
    '    "frota": "análise específica com números"',
    "  },",
    '  "impacto_financeiro": "impacto objetivo com valores e cálculo explícito",',
    '  "riscos_operacionais": ["risco específico com evidência numérica"],',
    '  "acoes_recomendadas": ["ação objetiva, específica e executável"],',
    '  "calculos_utilizados": ["Preço médio = total valor / total litros"]',
    "}",
    "REGRAS OBRIGATÓRIAS:",
    "1) NÃO misturar contextos operacionais.",
    "- Veículos de transporte possuem produção (viagens).",
    "- Veículos de apoio NÃO possuem produção.",
    "- Nunca atribuir produção a veículos de apoio.",
    "2) Validar coerência dos dados antes de analisar.",
    "- Se houver consumo sem produção, verificar se é veículo de apoio.",
    "- Não classificar automaticamente como problema quando for apoio.",
    "3) Separar análise por módulo: Combustível, Transporte e Frota.",
    "4) Explicar TODOS os cálculos utilizados com fórmula explícita.",
    "5) Gerar relatório estruturado com: Resumo executivo, Diagnóstico detalhado, Análise por módulo, Impacto financeiro, Riscos operacionais e Ações recomendadas.",
    "6) Sempre justificar conclusões com base numérica.",
    "7) Se dados forem insuficientes, declarar explicitamente e não inventar análise.",
    "8) Linguagem executiva, clara e profissional.",
    "9) Evitar frases genéricas como 'avaliar situação' e 'melhorar processo'.",
    "10) Ser específico e objetivo.",
    "IMPORTANTE: Se não houver dados de transporte, declarar 'dados insuficientes para transporte' e ignorar inferências de produção.",
    "No campo calculos_utilizados inclua fórmulas realmente usadas na análise.",
  ].join("\n");

  const empresaId = Number(data?.empresaId);
  const hasEmpresaId = Number.isFinite(empresaId) && empresaId > 0;
  await ensureProtectionTables();
  const cacheKey = hasEmpresaId ? buildCacheKey(data) : null;

  if (hasEmpresaId && cacheKey) {
    const cached = await getCachedReport({ empresaId, cacheKey });
    if (cached && typeof cached === "object") {
      const normalizedCached = sanitizeResponse(cached, data);
      await saveUsageLog({ empresaId, cacheKey, model: "cache", cacheHit: true });
      return {
        ...normalizedCached,
        textoEstruturado: buildStructuredText(normalizedCached),
        origem: "cache",
      };
    }
  }

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const fallbackBase = sanitizeResponse({}, data);
  if (!apiKey) {
    return {
      ...fallbackBase,
      textoEstruturado: buildStructuredText(fallbackBase),
      origem: "fallback",
    };
  }

  if (hasEmpresaId) {
    const usageCount = await getTodayUsageCount(empresaId);
    if (usageCount >= dailyLimit()) {
      const limited = {
        ...fallbackBase,
        analise: `Limite diário de análises IA atingido (${dailyLimit()}/dia).`,
      };
      return {
        ...limited,
        textoEstruturado: buildStructuredText(limited),
        origem: "limit",
      };
    }
  }

  const model = String(process.env.OPENAI_MODEL || OPENAI_MODEL_DEFAULT).trim();
  const timeoutMs = aiTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await runWithFunctionTimeout(
      () =>
        fetch("https://api.openai.com/v1/chat/completions", {
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
              { role: "user", content: `DADOS:\n${JSON.stringify(dataContext)}` },
            ],
          }),
        }),
      timeoutMs + 500
    );
    if (!response) {
      const fallback = sanitizeResponse({}, data);
      if (hasEmpresaId && cacheKey) {
        await saveUsageLog({ empresaId, cacheKey, model: `${model}-timeout`, cacheHit: false });
      }
      return {
        ...fallback,
        textoEstruturado: buildStructuredText(fallback),
        origem: "timeout",
      };
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const fallback = sanitizeResponse({}, data);
      if (hasEmpresaId && cacheKey) {
        await saveUsageLog({ empresaId, cacheKey, model: `${model}-error`, cacheHit: false });
      }
      return {
        ...fallback,
        textoEstruturado: buildStructuredText(fallback),
        origem: "fallback",
      };
    }

    const content = payload?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    const normalized = sanitizeResponse(parsed || {}, data);
    if (hasEmpresaId && cacheKey) {
      await saveCachedReport({ empresaId, cacheKey, report: normalized });
      await saveUsageLog({ empresaId, cacheKey, model, cacheHit: false });
    }
    return {
      ...normalized,
      textoEstruturado: buildStructuredText(normalized),
      origem: "openai",
    };
  } catch {
    const fallback = sanitizeResponse({}, data);
    if (hasEmpresaId && cacheKey) {
      await saveUsageLog({ empresaId, cacheKey, model: `${model}-exception`, cacheHit: false });
    }
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
