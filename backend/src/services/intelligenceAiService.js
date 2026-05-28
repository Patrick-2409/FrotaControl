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
  const apoioBase = ensureConcreteText(
    source.apoio || source.frota,
    `${toNumber(data?.indicadores?.veiculosAtivos)} veículo(s) de apoio/serviço ativo(s) e ${toNumber(data?.indicadores?.veiculosOciosos)} ocioso(s).`
  );
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
    apoio: apoioBase,
    // Compatibilidade com consumidores legados da chave "frota".
    frota: apoioBase,
  };
};

const ensureKpis = (value, data) => {
  const rawList = Array.isArray(value) ? value : [];
  const normalized = rawList
    .map((item) => {
      const nome = String(item?.nome || "").trim();
      const valor = String(item?.valor ?? "").trim();
      const formula = String(item?.formula || item?.calculo || "").trim();
      if (!nome || !valor) return null;
      return { nome, valor, formula };
    })
    .filter(Boolean);
  if (normalized.length) return normalized;
  return [
    { nome: "Total de litros", valor: `${toNumber(data?.indicadores?.totalLitros).toFixed(1)} L`, formula: "Somatório dos litros abastecidos no período" },
    { nome: "Custo total", valor: `R$ ${toNumber(data?.indicadores?.totalValor).toFixed(2)}`, formula: "Somatório dos valores abastecidos no período" },
    {
      nome: "Preço médio",
      valor: `R$ ${toNumber(data?.indicadores?.precoMedio).toFixed(2)}/L`,
      formula: "Preço médio = total valor / total litros",
    },
    { nome: "Viagens de transporte", valor: `${toNumber(data?.indicadores?.totalViagensTransporte)} viagens`, formula: "Contagem de viagens para veículos de transporte" },
  ];
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
  const kpis = ensureKpis(raw?.kpis, data);
  const riscos = ensureList(raw?.riscos_operacionais || raw?.riscos)
    .map((item) => ensureConcreteText(item, ""))
    .filter(Boolean);
  const acoes = ensureList(raw?.acoes_recomendadas || raw?.acoes)
    .map((item) => ensureConcreteText(item, ""))
    .filter(Boolean);
  const inconsistencias = ensureList(raw?.inconsistencias)
    .map((item) => ensureConcreteText(item, ""))
    .filter(Boolean);
  const historicoSuficiente = typeof raw?.historico_suficiente === "boolean" ? raw.historico_suficiente : null;
  const observacaoHistorico = ensureConcreteText(
    raw?.observacao_historico,
    historicoSuficiente === false ? "Dados históricos insuficientes para comparação robusta no período selecionado." : ""
  );
  const problemaPrincipal = diagnosticoDetalhado;
  const analise = [resumoExecutivo, analiseModulos.combustivel, analiseModulos.transporte, analiseModulos.apoio, impactoFinanceiro]
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
    kpis,
    impactoFinanceiro,
    inconsistencias,
    historicoSuficiente,
    observacaoHistorico,
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
  const kpisLines = Array.isArray(report.kpis)
    ? report.kpis.map((kpi) => `- ${kpi.nome}: ${kpi.valor}${kpi.formula ? ` (${kpi.formula})` : ""}`)
    : [];
  return [
    `RESUMO EXECUTIVO: ${report.resumoExecutivo || report.analise}`,
    `KPIS:`,
    ...(kpisLines.length ? kpisLines : ["- KPIs indisponíveis para o período"]),
    `DIAGNÓSTICO DETALHADO: ${report.diagnosticoDetalhado || report.problemaPrincipal}`,
    `ANÁLISE POR MÓDULO:`,
    `- Combustível: ${report?.analiseModulos?.combustivel || "Dados insuficientes para combustível."}`,
    `- Transporte: ${report?.analiseModulos?.transporte || "Dados insuficientes para transporte."}`,
    `- Apoio: ${report?.analiseModulos?.apoio || report?.analiseModulos?.frota || "Dados insuficientes para apoio."}`,
    ...(report?.observacaoHistorico ? [`HISTÓRICO: ${report.observacaoHistorico}`] : []),
    ...(Array.isArray(report?.inconsistencias) && report.inconsistencias.length
      ? ["INCONSISTÊNCIAS:", ...report.inconsistencias.map((item) => `- ${item}`)]
      : []),
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
    "Você é um especialista em engenharia de produção e logística operacional.",
    "Sua missão é gerar um RELATÓRIO EXECUTIVO PROFISSIONAL com base EXCLUSIVA nos dados fornecidos.",
    "Responda somente JSON válido no formato:",
    "{",
    '  "resumo_executivo": "texto executivo e objetivo com base numérica",',
    '  "kpis": [{"nome":"kpi","valor":"valor","formula":"fórmula aplicada"}],',
    '  "analise_modulos": {',
    '    "combustivel": "análise específica com números",',
    '    "transporte": "análise específica com números para veículos de transporte",',
    '    "apoio": "análise específica com números para veículos de apoio"',
    "  },",
    '  "diagnostico_detalhado": "diagnóstico com causa e evidência numérica",',
    '  "impacto_financeiro": "impacto objetivo com valores e cálculo explícito",',
    '  "inconsistencias": ["inconsistência detectada com evidência"],',
    '  "historico_suficiente": true,',
    '  "observacao_historico": "declarar explicitamente quando histórico for insuficiente",',
    '  "riscos_operacionais": ["risco específico com evidência numérica"],',
    '  "acoes_recomendadas": ["ação objetiva, específica e executável"],',
    '  "calculos_utilizados": ["Preço médio = total valor / total litros"]',
    "}",
    "REGRAS:",
    "1) Separar obrigatoriamente veículos de transporte e veículos de apoio.",
    "2) NÃO atribuir produção a veículos de apoio.",
    "3) Validar se há histórico suficiente; se não houver, declarar explicitamente.",
    "4) Explicar todos os cálculos utilizados.",
    "5) Estrutura obrigatória: Resumo executivo, KPIs, Análise por módulo (combustível, transporte, apoio), Diagnóstico, Impacto financeiro, Riscos e Ações recomendadas.",
    "6) NÃO usar frases genéricas.",
    "7) Justificar TODAS as conclusões com números.",
    "8) Se houver inconsistência, declarar no relatório.",
    "9) Linguagem executiva, clara, objetiva e profissional.",
    "Se o dado for insuficiente, assuma explicitamente insuficiência de dados em vez de inferir.",
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
