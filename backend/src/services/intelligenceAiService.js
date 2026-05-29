const crypto = require("crypto");
const { pool } = require("../db");
const {
  buildEscopoAnalise,
  MENSAGEM_CONTEXTO_TESTE,
  enrichRelatorioExecutivo,
  buildResumoExecutivoFallback,
  buildDiagnosticoFallback,
  buildAcoesFallback,
  looksLikeKpiRepetition,
  looksLikeDataDescription,
  filterModulosByScope,
  trimText,
} = require("./inteligencia/operacionalRules");
const { montarPromptIA, prepararPayloadPromptIA, buildPromptSistemaIA } = require("./inteligencia/promptInteligencia");
const { aplicarRegraDeOuroNoRelatorio } = require("./inteligencia/regraDeOuro");

const OPENAI_MODEL_DEFAULT = "gpt-4o-mini";
const INTELLIGENCE_DAILY_LIMIT_DEFAULT = 5;
const INTELLIGENCE_TIMEOUT_MS_DEFAULT = 20000;
let protectionTablesPromise = null;

const GENERIC_PATTERNS = [
  /é necessário melhorar/i,
  /é importante revisar/i,
  /deve melhorar/i,
  /precisa melhorar/i,
  /avaliar situação/i,
  /melhorar processo/i,
  /otimizar processos/i,
  /acompanhar de perto/i,
  /monitorar melhor/i,
  /ajustes gerais/i,
  /\bavaliar\b/i,
  /\bverificar\b/i,
  /^avaliar/i,
  /^verificar/i,
  /considerar a possibilidade/i,
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

const fallbackProblem = (data) =>
  buildDiagnosticoFallback({
    indicadores: data?.indicadores || {},
    insights: data?.insights || {},
    inconsistencias: data?.insights?.inconsistenciasDetectadas || [],
    metricas: data?.insights?.metricasExecutivas || {},
  });

const fallbackAnalise = (data) =>
  buildResumoExecutivoFallback({
    indicadores: data?.indicadores || {},
    insights: data?.insights || {},
    inconsistencias: data?.insights?.inconsistenciasDetectadas || [],
    metricas: data?.insights?.metricasExecutivas || {},
  });

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

const fallbackAcoes = (data) =>
  buildAcoesFallback({
    indicadores: data?.indicadores || {},
    insights: data?.insights || {},
    inconsistencias: data?.insights?.inconsistenciasDetectadas || [],
  });

const ensureConcreteText = (text, fallback) => {
  const raw = String(text || "").trim();
  if (!raw) return fallback;
  if (looksGeneric(raw) && !/\d/.test(raw)) return fallback;
  return raw;
};

const ensureModuleAnalysis = (raw, data) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const tipo = data?.tipoAnalise || "geral";
  const transporteDisponivel = Boolean(data?.indicadores?.dadosTransporteDisponiveis);
  const apoioBase = ensureConcreteText(
    source.apoio || source.frota,
    `${toNumber(data?.indicadores?.veiculosAtivosApoio)} ativo(s) / ${toNumber(data?.indicadores?.veiculosOciososApoio)} ocioso(s) em apoio — sem produção.`
  );
  const full = {
    combustivel: ensureConcreteText(
      source.combustivel,
      `Insight combustível: participação transporte/apoio e preço médio impactam margem.`
    ),
    transporte: ensureConcreteText(
      source.transporte,
      transporteDisponivel
        ? `Insight transporte: ${toNumber(data?.indicadores?.totalViagensTransporte)} viagem(ns) no recorte.`
        : "Dados insuficientes de transporte."
    ),
    apoio: apoioBase,
    frota: apoioBase,
  };
  return filterModulosByScope(full, tipo);
};

const ensureKpis = () => [];

const sanitizeResponse = (raw, data) => {
  const statusOperacao = ensureConcreteText(
    raw?.status_operacao,
    toNumber(data?.indicadores?.veiculosOciosos) > 0 ? "Atenção: operação com ociosidade relevante." : "Operação estável no recorte atual."
  );
  const complementoExecutivo =
    raw?.complemento_executivo && typeof raw.complemento_executivo === "object"
      ? {
          hipotese_provavel: String(raw.complemento_executivo.hipotese_provavel || raw.complemento_executivo.hipotese || "").trim(),
          consequencia: String(raw.complemento_executivo.consequencia || "").trim(),
          risco_futuro: String(raw.complemento_executivo.risco_futuro || "").trim(),
          acao_recomendada: String(raw.complemento_executivo.acao_recomendada || raw.complemento_executivo.acao || "").trim(),
        }
      : null;
  const hasComplementoExecutivo = Boolean(
    complementoExecutivo &&
      (complementoExecutivo.hipotese_provavel ||
        complementoExecutivo.consequencia ||
        complementoExecutivo.risco_futuro ||
        complementoExecutivo.acao_recomendada)
  );

  const resumoRaw = String(raw?.resumo_executivo || "").trim();
  const resumoExecutivo = hasComplementoExecutivo
    ? ""
    : ensureConcreteText(looksLikeKpiRepetition(resumoRaw) ? "" : resumoRaw, fallbackAnalise(data));
  const diagnosticoDetalhado = hasComplementoExecutivo
    ? ""
    : ensureConcreteText(raw?.diagnostico_detalhado || raw?.problema_principal, fallbackProblem(data));
  const analiseModulos = ensureModuleAnalysis(raw?.analise_modulos, data);
  const impactoFinanceiro = hasComplementoExecutivo
    ? ""
    : ensureConcreteText(
        raw?.impacto_financeiro,
        `Impacto financeiro atual de R$ ${toNumber(data?.indicadores?.totalValor).toFixed(2)} no período analisado.`
      );
  const calculosUtilizados = ensureList(raw?.calculos_utilizados)
    .map((item) => ensureConcreteText(item, ""))
    .filter(Boolean);
  const kpis = ensureKpis();
  const riscos = ensureList(raw?.riscos_operacionais || raw?.riscos)
    .map((item) => ensureConcreteText(item, ""))
    .filter(Boolean);
  const acoes = hasComplementoExecutivo
    ? ensureList(complementoExecutivo?.acao_recomendada ? [complementoExecutivo.acao_recomendada] : [])
    : ensureList(raw?.acoes_recomendadas || raw?.acoes)
        .map((item) => ensureConcreteText(item, ""))
        .filter(Boolean);
  const inconsistencias = ensureList(raw?.inconsistencias)
    .map((item) => ensureConcreteText(item, ""))
    .filter(Boolean);
  const inconsistenciasInput = ensureList(data?.insights?.inconsistenciasDetectadas)
    .map((item) => ensureConcreteText(item, ""))
    .filter(Boolean);
  const historicoSuficiente = typeof raw?.historico_suficiente === "boolean" ? raw.historico_suficiente : null;
  const observacaoHistorico = ensureConcreteText(
    raw?.observacao_historico,
    historicoSuficiente === false ? "Dados históricos insuficientes para comparação robusta no período selecionado." : ""
  );
  const problemaPrincipal = diagnosticoDetalhado;
  const analise = [statusOperacao, resumoExecutivo, analiseModulos.combustivel, analiseModulos.transporte, analiseModulos.apoio, impactoFinanceiro]
    .filter(Boolean)
    .join(" ");

  return {
    statusOperacao,
    problemaPrincipal,
    analise,
    riscos: riscos.length ? riscos : fallbackRiscos(data),
    acoes: acoes.length ? acoes : hasComplementoExecutivo ? [] : fallbackAcoes(data),
    resumoExecutivo,
    diagnosticoDetalhado,
    analiseModulos,
    kpis,
    impactoFinanceiro,
    complemento_executivo: hasComplementoExecutivo ? complementoExecutivo : null,
    inconsistencias: [...new Set([...inconsistenciasInput, ...inconsistencias])],
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
    `STATUS DA OPERAÇÃO: ${report.statusOperacao || "Status indisponível."}`,
    ...(report?.regraDeOuro || report?.dadosSuficientes != null
      ? [
          "REGRA DE OURO:",
          `- Dados suficientes: ${report?.regraDeOuro?.dadosSuficientes ?? report?.dadosSuficientes ? "Sim" : "Não"}`,
          `- Há inconsistência: ${report?.regraDeOuro?.haInconsistencia ?? report?.haInconsistencia ? "Sim" : "Não"}`,
          `- Confiável para decisão: ${report?.regraDeOuro?.confiavelParaDecisao ?? report?.confiavelParaDecisao ? "Sim" : "Não"}`,
          `- Porquê: ${report?.regraDeOuro?.explicacaoPorque || report?.explicacaoPorque || "—"}`,
        ]
      : []),
    `RESUMO EXECUTIVO: ${report.resumoExecutivo || report.analise}`,
    `KPIS:`,
    ...(kpisLines.length ? kpisLines : ["- KPIs indisponíveis para o período"]),
    `DIAGNÓSTICO DETALHADO: ${report.diagnosticoDetalhado || report.problemaPrincipal}`,
    ...(report?.complemento_executivo
      ? [
          "COMPLEMENTO EXECUTIVO (IA):",
          `- Hipótese provável: ${report.complemento_executivo.hipotese_provavel || "—"}`,
          `- Consequência: ${report.complemento_executivo.consequencia || "—"}`,
          `- Risco futuro: ${report.complemento_executivo.risco_futuro || "—"}`,
          `- Ação recomendada: ${report.complemento_executivo.acao_recomendada || "—"}`,
        ]
      : []),
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

const generateIntelligenceReport = async (data = {}) => {
  const escopo = buildEscopoAnalise(data?.tipoAnalise, data?.filtros);
  const { contexto, dados, inconsistencias, insights, motor_interno } = prepararPayloadPromptIA({
    ...data,
    inteligenciaMotor: data?.inteligenciaMotor || null,
    insights: {
      ...(data?.insights || {}),
      contextoTeste: Boolean(data?.insights?.contextoTeste),
      mensagemContextoTeste: data?.insights?.contextoTeste ? MENSAGEM_CONTEXTO_TESTE : null,
    },
    statusOperacao: data?.statusOperacao || null,
  });
  const systemPrompt = buildPromptSistemaIA(escopo);
  const userPrompt = montarPromptIA(contexto, dados, inconsistencias, insights, motor_interno);

  const finalizeReport = (report) => {
    const enriched = enrichRelatorioExecutivo(report, data);
    const withRegra = aplicarRegraDeOuroNoRelatorio(enriched, data);
    return { ...withRegra, textoEstruturado: buildStructuredText(withRegra) };
  };

  const empresaId = Number(data?.empresaId);
  const hasEmpresaId = Number.isFinite(empresaId) && empresaId > 0;
  await ensureProtectionTables();
  const cacheKey = hasEmpresaId ? buildCacheKey(data) : null;

  if (hasEmpresaId && cacheKey) {
    const cached = await getCachedReport({ empresaId, cacheKey });
    if (cached && typeof cached === "object") {
      const normalizedCached = sanitizeResponse(cached, data);
      await saveUsageLog({ empresaId, cacheKey, model: "cache", cacheHit: true });
      return { ...finalizeReport(normalizedCached), origem: "cache" };
    }
  }

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const fallbackBase = sanitizeResponse({}, data);
  if (!apiKey) {
    return { ...finalizeReport(fallbackBase), origem: "fallback" };
  }

  if (hasEmpresaId) {
    const usageCount = await getTodayUsageCount(empresaId);
    if (usageCount >= dailyLimit()) {
      const limited = {
        ...fallbackBase,
        analise: `Limite diário de análises IA atingido (${dailyLimit()}/dia).`,
      };
      return { ...finalizeReport(limited), origem: "limit" };
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
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
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
      return { ...finalizeReport(fallback), origem: "timeout" };
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const fallback = sanitizeResponse({}, data);
      if (hasEmpresaId && cacheKey) {
        await saveUsageLog({ empresaId, cacheKey, model: `${model}-error`, cacheHit: false });
      }
      return { ...finalizeReport(fallback), origem: "fallback" };
    }

    const content = payload?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    const normalized = sanitizeResponse(parsed || {}, data);
    const finalized = finalizeReport(normalized);
    if (hasEmpresaId && cacheKey) {
      await saveCachedReport({ empresaId, cacheKey, report: finalized });
      await saveUsageLog({ empresaId, cacheKey, model, cacheHit: false });
    }
    return { ...finalized, origem: "openai" };
  } catch {
    const fallback = sanitizeResponse({}, data);
    if (hasEmpresaId && cacheKey) {
      await saveUsageLog({ empresaId, cacheKey, model: `${model}-exception`, cacheHit: false });
    }
    return { ...finalizeReport(fallback), origem: "fallback" };
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  generateIntelligenceReport,
};
