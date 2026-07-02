const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const { pool } = require("../db");
const fuelSvc = require("./fuelService");
const transportSvc = require("./transportService");
const { getCompanyById } = require("../models/companyModel");

const PERIODOS = new Set(["dia", "semana", "mes", "ano"]);
const MONTHLY_LIMIT_DEFAULT = 10;
const COOLDOWN_SECONDS_DEFAULT = 60;
const OPENAI_MODEL_DEFAULT = "gpt-4o-mini";

let tablesReadyPromise = null;

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pct = (value, digits = 1) => {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const rangeFromPeriodo = (periodo, anchor = new Date()) => {
  const p = PERIODOS.has(periodo) ? periodo : "mes";
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const d = anchor.getUTCDate();
  const startDay = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));

  if (p === "dia") return { start: startDay.toISOString(), end: endDay.toISOString(), startDate: toIsoDate(startDay), endDate: toIsoDate(new Date(endDay.getTime() - 1)) };
  if (p === "semana") {
    const dow = startDay.getUTCDay();
    const offsetToMonday = (dow + 6) % 7;
    const start = new Date(startDay);
    start.setUTCDate(start.getUTCDate() - offsetToMonday);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start: start.toISOString(), end: end.toISOString(), startDate: toIsoDate(start), endDate: toIsoDate(new Date(end.getTime() - 1)) };
  }
  if (p === "ano") {
    const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0));
    return { start: start.toISOString(), end: end.toISOString(), startDate: toIsoDate(start), endDate: toIsoDate(new Date(end.getTime() - 1)) };
  }
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString(), startDate: toIsoDate(start), endDate: toIsoDate(new Date(end.getTime() - 1)) };
};

const ensureTables = async () => {
  if (!tablesReadyPromise) {
    tablesReadyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS operational_ai_reports (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        periodo VARCHAR(12) NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        source_hash VARCHAR(64) NOT NULL,
        report_json JSONB NOT NULL,
        generated_by INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (empresa_id, periodo, period_start, period_end, source_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_operational_ai_reports_lookup
        ON operational_ai_reports (empresa_id, periodo, period_start, period_end, generated_at DESC);

      CREATE TABLE IF NOT EXISTS operational_ai_usage_logs (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        periodo VARCHAR(12) NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        cache_hit BOOLEAN NOT NULL DEFAULT false,
        source_hash VARCHAR(64),
        model VARCHAR(80),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_operational_ai_usage_empresa_created
        ON operational_ai_usage_logs (empresa_id, created_at DESC);
    `);
  }
  return tablesReadyPromise;
};

const stableJson = (value) => JSON.stringify(value, Object.keys(value).sort());

const sha256 = (value) => crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");

const getMonthlyLimit = () => Math.max(1, Number(process.env.OP_AI_MONTHLY_LIMIT || MONTHLY_LIMIT_DEFAULT));
const getCooldownSeconds = () => Math.max(10, Number(process.env.OP_AI_COOLDOWN_SECONDS || COOLDOWN_SECONDS_DEFAULT));

const queryFuelData = async (empresaId, bounds) => {
  const resumo = await fuelSvc.getCombustiveisResumoMetrics({
    empresa_id: empresaId,
    bounds,
    groupByVeiculo: true,
    veiculoId: null,
    motoristaId: null,
  });
  const rows = Array.isArray(resumo?.por_veiculo) ? resumo.por_veiculo : [];
  const topConsumo = [...rows]
    .sort((a, b) => num(b.total_litros) - num(a.total_litros))
    .slice(0, 5)
    .map((r) => ({
      veiculo: r.veiculo_nome || r.veiculo_placa || `#${r.veiculo_id || "?"}`,
      litros: num(r.total_litros),
    }));
  const topPreco = [...rows]
    .filter((r) => Number.isFinite(num(r.preco_medio_litro, NaN)))
    .sort((a, b) => num(b.preco_medio_litro) - num(a.preco_medio_litro))
    .slice(0, 5)
    .map((r) => ({
      veiculo: r.veiculo_nome || r.veiculo_placa || `#${r.veiculo_id || "?"}`,
      preco_medio_litro: num(r.preco_medio_litro),
    }));

  const atual = num(resumo?.preco_medio_litro, NaN);
  const historico = num(resumo?.inteligencia?.preco_medio_historico, NaN);
  const vsHistorico =
    Number.isFinite(atual) && Number.isFinite(historico) && historico > 0
      ? pct(((atual - historico) / historico) * 100)
      : null;

  const prices = rows.map((r) => num(r.preco_medio_litro, NaN)).filter((v) => Number.isFinite(v) && v > 0);
  const mediaFrota = prices.length ? prices.reduce((acc, v) => acc + v, 0) / prices.length : null;
  const vsFrota =
    Number.isFinite(atual) && Number.isFinite(mediaFrota) && mediaFrota > 0
      ? pct(((atual - mediaFrota) / mediaFrota) * 100)
      : null;

  return {
    total_gasto: num(resumo?.total_valor),
    total_litros: num(resumo?.total_litros),
    preco_medio_litro: Number.isFinite(atual) ? atual : null,
    veiculos_maior_consumo: topConsumo,
    veiculos_maior_custo_litro: topPreco,
    variacao_vs_historico_pct: vsHistorico,
    variacao_vs_frota_pct: vsFrota,
  };
};

const queryTransportData = async (empresaId, bounds) => {
  const resumo = await transportSvc.getViagensResumoProducao(empresaId, bounds);
  const totalTon = num(resumo?.total_toneladas_esteril) + num(resumo?.total_toneladas_rocha);
  const totalViagens = num(resumo?.total_viagens_esteril) + num(resumo?.total_viagens_rocha);

  const [{ rows: produtividadeRows }, { rows: ociososRows }, { rows: planRows }] = await Promise.all([
    pool.query(
      `SELECT v.id, COALESCE(v.nome, 'Sem nome') AS nome, COALESCE(v.placa, '-') AS placa,
              COUNT(vi.id)::int AS viagens,
              COALESCE(SUM(CASE
                WHEN COALESCE(v.usa_para_transporte, false) = true AND vi.tipo = 'esteril'
                  THEN COALESCE(v.capacidade_esteril_ton, v.capacidade_ton, 0)
                WHEN COALESCE(v.usa_para_transporte, false) = true AND vi.tipo = 'rocha'
                  THEN COALESCE(v.capacidade_rocha_ton, v.capacidade_ton, 0)
                WHEN COALESCE(v.usa_para_transporte, false) = true
                  THEN COALESCE(v.capacidade_ton, 0)
                ELSE 0
              END), 0)::double precision AS toneladas
       FROM veiculos v
       LEFT JOIN viagens vi
         ON vi.veiculo_id = v.id
        AND vi.empresa_id = v.empresa_id
        AND vi.marcacao >= $2::timestamptz
        AND vi.marcacao < $3::timestamptz
       WHERE v.empresa_id = $1
         AND COALESCE(v.usa_para_transporte, false) = true
       GROUP BY v.id, v.nome, v.placa
       ORDER BY toneladas DESC, viagens DESC
       LIMIT 5`,
      [empresaId, bounds.start, bounds.end]
    ),
    pool.query(
      `SELECT v.id, COALESCE(v.nome, 'Sem nome') AS nome, COALESCE(v.placa, '-') AS placa
       FROM veiculos v
       LEFT JOIN viagens vi
         ON vi.veiculo_id = v.id
        AND vi.empresa_id = v.empresa_id
        AND vi.marcacao >= $2::timestamptz
        AND vi.marcacao < $3::timestamptz
       WHERE v.empresa_id = $1
         AND COALESCE(v.usa_para_transporte, false) = true
       GROUP BY v.id, v.nome, v.placa
       HAVING COUNT(vi.id) = 0
       ORDER BY v.nome
       LIMIT 10`,
      [empresaId, bounds.start, bounds.end]
    ),
    pool.query(
      `SELECT meta_esteril_ton, meta_rocha_ton
       FROM planejamento_semanal
       WHERE empresa_id = $1
         AND data_inicio <= $2::date
         AND data_fim >= $3::date
       ORDER BY created_at DESC
       LIMIT 1`,
      [empresaId, bounds.end.slice(0, 10), bounds.start.slice(0, 10)]
    ),
  ]);

  const metaTotal = planRows[0] ? num(planRows[0].meta_esteril_ton) + num(planRows[0].meta_rocha_ton) : null;
  const atingimento = metaTotal && metaTotal > 0 ? pct((totalTon / metaTotal) * 100) : null;

  return {
    total_toneladas: totalTon,
    numero_viagens: totalViagens,
    atingimento_meta_pct: atingimento,
    veiculos_mais_produtivos: produtividadeRows.map((r) => ({
      veiculo: `${r.nome} (${r.placa})`,
      viagens: num(r.viagens),
      toneladas: num(r.toneladas),
    })),
    veiculos_ociosos: ociososRows.map((r) => `${r.nome} (${r.placa})`),
  };
};

const queryFleetData = async (empresaId, bounds) => {
  const [{ rows: fleetRows }, { rows: lowProdRows }, { rows: semUsoRows }, { rows: falhaRows }] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE COALESCE(status_operacional, 'ativo') IN ('ativo', 'operacao'))::int AS ativos
       FROM veiculos
       WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT v.id, COALESCE(v.nome, 'Sem nome') AS nome, COALESCE(v.placa, '-') AS placa,
              COUNT(vi.id)::int AS viagens
       FROM veiculos v
       LEFT JOIN viagens vi
         ON vi.veiculo_id = v.id
        AND vi.empresa_id = v.empresa_id
        AND vi.marcacao >= $2::timestamptz
        AND vi.marcacao < $3::timestamptz
       WHERE v.empresa_id = $1
         AND COALESCE(v.usa_para_transporte, false) = true
       GROUP BY v.id, v.nome, v.placa
       HAVING COUNT(vi.id) BETWEEN 1 AND 2
       ORDER BY viagens ASC, v.nome
       LIMIT 10`,
      [empresaId, bounds.start, bounds.end]
    ),
    pool.query(
      `SELECT v.id, COALESCE(v.nome, 'Sem nome') AS nome, COALESCE(v.placa, '-') AS placa
       FROM veiculos v
       LEFT JOIN romaneios r
         ON r.veiculo_id = v.id
        AND r.empresa_id = v.empresa_id
        AND COALESCE(r.recorded_at_client, r.data) >= $2::timestamptz
        AND COALESCE(r.recorded_at_client, r.data) < $3::timestamptz
       LEFT JOIN combustiveis c
         ON c.veiculo_id = v.id
        AND c.empresa_id = v.empresa_id
        AND COALESCE(c.recorded_at_client, c.data) >= $2::timestamptz
        AND COALESCE(c.recorded_at_client, c.data) < $3::timestamptz
       LEFT JOIN parte_diaria p
         ON p.veiculo_id = v.id
        AND p.empresa_id = v.empresa_id
        AND COALESCE(p.recorded_at_client, p.data) >= $2::timestamptz
        AND COALESCE(p.recorded_at_client, p.data) < $3::timestamptz
       WHERE v.empresa_id = $1
       GROUP BY v.id, v.nome, v.placa
       HAVING COUNT(r.id) = 0 AND COUNT(c.id) = 0 AND COUNT(p.id) = 0
       ORDER BY v.nome
       LIMIT 20`,
      [empresaId, bounds.start, bounds.end]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE doc_revisao_validade IS NOT NULL AND doc_revisao_validade < CURRENT_DATE)::int AS revisao_vencida,
         COUNT(*) FILTER (WHERE doc_licenciamento_validade IS NOT NULL AND doc_licenciamento_validade < CURRENT_DATE)::int AS licenciamento_vencido,
         COUNT(*) FILTER (WHERE doc_seguro_validade IS NOT NULL AND doc_seguro_validade < CURRENT_DATE)::int AS seguro_vencido,
         COUNT(*) FILTER (WHERE doc_inspecao_validade IS NOT NULL AND doc_inspecao_validade < CURRENT_DATE)::int AS inspecao_vencida,
         COUNT(*) FILTER (WHERE manutencao_agendar_ate IS NOT NULL AND manutencao_agendar_ate < CURRENT_DATE)::int AS manutencao_atrasada
       FROM veiculos
       WHERE empresa_id = $1`,
      [empresaId]
    ),
  ]);

  const fleet = fleetRows[0] || {};
  const falhas = falhaRows[0] || {};

  return {
    veiculos_ativos: num(fleet.ativos),
    veiculos_sem_uso: semUsoRows.map((r) => `${r.nome} (${r.placa})`),
    veiculos_baixa_produtividade: lowProdRows.map((r) => ({
      veiculo: `${r.nome} (${r.placa})`,
      viagens: num(r.viagens),
    })),
    indicadores_falha: {
      revisao_vencida: num(falhas.revisao_vencida),
      licenciamento_vencido: num(falhas.licenciamento_vencido),
      seguro_vencido: num(falhas.seguro_vencido),
      inspecao_vencida: num(falhas.inspecao_vencida),
      manutencao_atrasada: num(falhas.manutencao_atrasada),
    },
  };
};

const queryDailyData = async (empresaId, bounds) => {
  const [{ rows: resumoRows }, { rows: evolucaoRows }, { rows: checklistRows }] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS registros,
         COALESCE(SUM(total_horas), 0)::double precision AS total_horas,
         COALESCE(SUM(total_km), 0)::double precision AS total_km,
         COUNT(*) FILTER (WHERE LOWER(COALESCE(producao, '')) LIKE '%esteril%')::int AS registros_esteril,
         COUNT(*) FILTER (WHERE LOWER(COALESCE(producao, '')) LIKE '%rocha%')::int AS registros_rocha
       FROM parte_diaria
       WHERE empresa_id = $1
         AND COALESCE(recorded_at_client, data) >= $2::timestamptz
         AND COALESCE(recorded_at_client, data) < $3::timestamptz`,
      [empresaId, bounds.start, bounds.end]
    ),
    pool.query(
      `SELECT
         DATE(COALESCE(recorded_at_client, data)) AS dia,
         COUNT(*)::int AS registros,
         COALESCE(SUM(total_horas), 0)::double precision AS total_horas,
         COALESCE(SUM(total_km), 0)::double precision AS total_km
       FROM parte_diaria
       WHERE empresa_id = $1
         AND COALESCE(recorded_at_client, data) >= $2::timestamptz
         AND COALESCE(recorded_at_client, data) < $3::timestamptz
       GROUP BY DATE(COALESCE(recorded_at_client, data))
       ORDER BY dia`,
      [empresaId, bounds.start, bounds.end]
    ),
    pool.query(
      `SELECT COALESCE(SUM(pendencias), 0)::int AS pendencias, COUNT(*)::int AS registros
       FROM (
         SELECT COUNT(*) FILTER (WHERE LOWER(COALESCE(value, '')) <> 'ok')::int AS pendencias
         FROM parte_diaria pd
         LEFT JOIN LATERAL jsonb_each_text(COALESCE(pd.checklist, '{}'::jsonb)) checklist(key, value) ON TRUE
         WHERE pd.empresa_id = $1
           AND COALESCE(pd.recorded_at_client, pd.data) >= $2::timestamptz
           AND COALESCE(pd.recorded_at_client, pd.data) < $3::timestamptz
         GROUP BY pd.id
       ) x`,
      [empresaId, bounds.start, bounds.end]
    ),
  ]);

  const resumo = resumoRows[0] || {};
  const checklist = checklistRows[0] || {};

  return {
    producao_total: {
      registros: num(resumo.registros),
      total_horas: num(resumo.total_horas),
      total_km: num(resumo.total_km),
    },
    producao_por_tipo: {
      esteril: num(resumo.registros_esteril),
      rocha: num(resumo.registros_rocha),
    },
    evolucao_por_periodo: evolucaoRows.map((r) => ({
      dia: toIsoDate(new Date(r.dia)),
      registros: num(r.registros),
      total_horas: num(r.total_horas),
      total_km: num(r.total_km),
    })),
    checklist: {
      disponivel: num(checklist.registros) > 0,
      registros_com_checklist: num(checklist.registros),
      pendencias: num(checklist.pendencias),
    },
  };
};

const queryAlertsData = async (empresaId) => {
  const { rows } = await pool.query(
    `SELECT alert_key, severity, category, title, body, last_seen_at
     FROM operational_alert_events
     WHERE empresa_id = $1
       AND is_active = true
     ORDER BY
       CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
       last_seen_at DESC
     LIMIT 30`,
    [empresaId]
  );
  const bySeverity = rows.reduce(
    (acc, row) => {
      const key = row.severity || "info";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 }
  );
  return {
    ativos: rows.map((r) => ({
      chave: r.alert_key,
      criticidade: r.severity,
      categoria: r.category,
      titulo: r.title,
      descricao: r.body,
      atualizado_em: r.last_seen_at,
    })),
    por_criticidade: bySeverity,
  };
};

const buildOperationalDataset = async (empresaId, periodo) => {
  const bounds = rangeFromPeriodo(periodo);
  const [company, combustivel, transporte, frota, parteDiaria, alertas] = await Promise.all([
    getCompanyById(empresaId),
    queryFuelData(empresaId, bounds),
    queryTransportData(empresaId, bounds),
    queryFleetData(empresaId, bounds),
    queryDailyData(empresaId, bounds),
    queryAlertsData(empresaId),
  ]);

  const dataset = {
    empresa: {
      id: empresaId,
      nome: company?.nome || `Empresa ${empresaId}`,
    },
    periodo: {
      tipo: periodo,
      inicio: bounds.startDate,
      fim: bounds.endDate,
      gerado_em: new Date().toISOString(),
    },
    combustivel,
    transporte,
    frota,
    parte_diaria: parteDiaria,
    alertas,
  };

  return dataset;
};

const buildAiSystemPrompt = () => `
Você é um engenheiro de produção e especialista em logística.
Analise os dados operacionais abaixo e gere um relatório completo, claro e objetivo para um gestor.

IMPORTANTE:
- linguagem simples e direta
- evitar termos técnicos complexos
- foco em decisão rápida
- destacar problemas reais
- não inventar dados, apenas analisar o que foi fornecido

Responda SOMENTE em JSON válido (sem markdown), com esta estrutura:
{
  "resumo_executivo": "texto curto e direto",
  "saude_geral": "saudavel|atencao|critico",
  "gargalos": ["..."],
  "analise_combustivel": "texto",
  "analise_transporte": "texto",
  "analise_frota": "texto",
  "analise_parte_diaria": "texto",
  "analise_alertas": "texto",
  "pontos_prioritarios": ["..."],
  "recomendacoes": ["..."]
}
`.trim();

const extractJsonObject = (text) => {
  if (!text) return null;
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fallback: tenta extrair o maior bloco JSON entre { ... }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  const candidate = trimmed.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

const sanitizeAiReport = (raw) => {
  const r = raw && typeof raw === "object" ? raw : {};
  const list = (v) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);
  const normalizeHealth = (v) => {
    const s = String(v || "").toLowerCase();
    if (s === "saudavel" || s === "saudável") return "saudavel";
    if (s === "atencao" || s === "atenção") return "atencao";
    return "critico";
  };
  return {
    resumo_executivo: String(r.resumo_executivo || "").trim() || "Sem resumo executivo disponível.",
    saude_geral: normalizeHealth(r.saude_geral),
    gargalos: list(r.gargalos),
    analise_combustivel: String(r.analise_combustivel || "").trim() || "Sem análise de combustível.",
    analise_transporte: String(r.analise_transporte || "").trim() || "Sem análise de transporte.",
    analise_frota: String(r.analise_frota || "").trim() || "Sem análise de frota.",
    analise_parte_diaria: String(r.analise_parte_diaria || "").trim() || "Sem análise de parte diária.",
    analise_alertas: String(r.analise_alertas || "").trim() || "Sem análise de alertas.",
    pontos_prioritarios: list(r.pontos_prioritarios),
    recomendacoes: list(r.recomendacoes),
  };
};

const callOpenAi = async (dataset) => {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada no backend.");
  }
  const model = String(process.env.OPENAI_MODEL || OPENAI_MODEL_DEFAULT).trim();
  const timeoutMs = Math.max(15_000, Number(process.env.OPENAI_TIMEOUT_MS || 40_000));
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
        temperature: 0.2,
        messages: [
          { role: "system", content: buildAiSystemPrompt() },
          { role: "user", content: `Dados operacionais (JSON):\n${JSON.stringify(dataset)}` },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || "Falha na chamada da API de IA.";
      throw new Error(detail);
    }
    const content = payload?.choices?.[0]?.message?.content || "";
    const parsed = extractJsonObject(content);
    if (!parsed) {
      throw new Error("A IA não retornou JSON válido.");
    }
    return { report: sanitizeAiReport(parsed), model };
  } finally {
    clearTimeout(timer);
  }
};

const buildFallbackReport = (dataset) => {
  const fuel = dataset.combustivel || {};
  const transport = dataset.transporte || {};
  const fleet = dataset.frota || {};
  const alerts = dataset.alertas || {};
  const topAlert = Array.isArray(alerts.ativos) && alerts.ativos.length ? alerts.ativos[0] : null;
  const health =
    num(alerts?.por_criticidade?.critical) > 0 || (fuel.variacao_vs_historico_pct != null && fuel.variacao_vs_historico_pct > 8)
      ? "critico"
      : num(alerts?.por_criticidade?.warning) > 0 || (fuel.variacao_vs_historico_pct != null && fuel.variacao_vs_historico_pct > 3)
        ? "atencao"
        : "saudavel";

  return {
    resumo_executivo:
      "Análise automática em modo de contingência: foram identificados pontos de custo, produtividade e uso de frota para decisão rápida.",
    saude_geral: health,
    gargalos: [
      topAlert ? `${topAlert.titulo}: ${topAlert.descricao}` : "Sem alertas críticos ativos no momento.",
      `Veículos sem uso no período: ${num(fleet.veiculos_sem_uso?.length)}`,
      `Viagens no período: ${num(transport.numero_viagens)}`,
    ],
    analise_combustivel: `Preço médio ${fuel.preco_medio_litro != null ? `R$ ${fuel.preco_medio_litro.toFixed(2)}/L` : "indisponível"}, variação vs histórico ${fuel.variacao_vs_historico_pct != null ? `${fuel.variacao_vs_historico_pct}%` : "indisponível"}.`,
    analise_transporte: `Produção de ${num(transport.total_toneladas)} toneladas em ${num(transport.numero_viagens)} viagens.`,
    analise_frota: `${num(fleet.veiculos_ativos)} veículos ativos; ${num(fleet.veiculos_sem_uso?.length)} sem uso no período.`,
    analise_parte_diaria: `Registros de parte diária analisados no período com evolução por dia disponível no relatório.`,
    analise_alertas: `Alertas ativos: críticos ${num(alerts?.por_criticidade?.critical)}, atenção ${num(alerts?.por_criticidade?.warning)}.`,
    pontos_prioritarios: [
      "Atuar nos alertas críticos primeiro.",
      "Reduzir desvios de preço de combustível acima da média.",
      "Reativar ou redistribuir veículos sem uso.",
    ],
    recomendacoes: [
      "Revisar fornecedores e rotas de abastecimento com preço acima da média.",
      "Rebalancear alocação dos veículos ociosos.",
      "Acompanhar indicadores diariamente até estabilização dos desvios.",
    ],
  };
};

const monthlyUsageCount = async (empresaId) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM operational_ai_usage_logs
     WHERE empresa_id = $1
       AND cache_hit = false
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
    [empresaId]
  );
  return num(rows[0]?.c);
};

const enforceCooldown = async (empresaId) => {
  const cooldownSeconds = getCooldownSeconds();
  const { rows } = await pool.query(
    `SELECT created_at
     FROM operational_ai_usage_logs
     WHERE empresa_id = $1
       AND cache_hit = false
     ORDER BY created_at DESC
     LIMIT 1`,
    [empresaId]
  );
  const last = rows[0]?.created_at ? new Date(rows[0].created_at).getTime() : null;
  if (!last) return;
  const elapsed = (Date.now() - last) / 1000;
  if (elapsed < cooldownSeconds) {
    const wait = Math.ceil(cooldownSeconds - elapsed);
    const err = new Error(`Aguarde ${wait}s para gerar nova análise completa.`);
    err.statusCode = 429;
    throw err;
  }
};

const tryGetCached = async ({ empresaId, periodo, periodStart, periodEnd, sourceHash }) => {
  const { rows } = await pool.query(
    `SELECT id, report_json, generated_at
     FROM operational_ai_reports
     WHERE empresa_id = $1
       AND periodo = $2
       AND period_start = $3::date
       AND period_end = $4::date
       AND source_hash = $5
     ORDER BY generated_at DESC
     LIMIT 1`,
    [empresaId, periodo, periodStart, periodEnd, sourceHash]
  );
  if (!rows.length) return null;
  return {
    reportId: rows[0].id,
    report: sanitizeAiReport(rows[0].report_json),
    generatedAt: rows[0].generated_at,
  };
};

const saveReport = async ({ empresaId, periodo, periodStart, periodEnd, sourceHash, report, userId }) => {
  const { rows } = await pool.query(
    `INSERT INTO operational_ai_reports
      (empresa_id, periodo, period_start, period_end, source_hash, report_json, generated_by)
     VALUES ($1, $2, $3::date, $4::date, $5, $6::jsonb, $7)
     ON CONFLICT (empresa_id, periodo, period_start, period_end, source_hash)
     DO UPDATE SET report_json = EXCLUDED.report_json,
                   generated_by = EXCLUDED.generated_by,
                   generated_at = NOW()
     RETURNING id, generated_at`,
    [empresaId, periodo, periodStart, periodEnd, sourceHash, JSON.stringify(report), userId || null]
  );
  return rows[0];
};

const saveUsageLog = async ({ empresaId, userId, periodo, periodStart, periodEnd, cacheHit, sourceHash, model }) => {
  await pool.query(
    `INSERT INTO operational_ai_usage_logs
      (empresa_id, usuario_id, periodo, period_start, period_end, cache_hit, source_hash, model)
     VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8)`,
    [empresaId, userId || null, periodo, periodStart, periodEnd, Boolean(cacheHit), sourceHash || null, model || null]
  );
};

const healthPill = (value) => {
  if (value === "saudavel") return { text: "Saudável", color: "#059669" };
  if (value === "atencao") return { text: "Atenção", color: "#d97706" };
  return { text: "Crítico", color: "#dc2626" };
};

const drawSection = (doc, title, content) => {
  doc.moveDown(0.8);
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(title);
  doc.moveDown(0.25);
  doc.fillColor("#1f2937").font("Helvetica").fontSize(10).text(content || "Sem informações.", {
    lineGap: 2,
  });
};

const drawList = (doc, title, items) => {
  drawSection(doc, title, "");
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) {
    doc.fillColor("#4b5563").font("Helvetica").fontSize(10).text("Sem itens prioritários.");
    return;
  }
  list.forEach((item) => {
    doc.fillColor("#1f2937").font("Helvetica").fontSize(10).text(`- ${item}`, { lineGap: 2 });
  });
};

const createExecutivePdf = ({ empresaNome, periodoLabel, report }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      info: {
        Title: "Relatório Executivo Operacional",
        Author: "FrotaMax",
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const generatedAt = new Date().toLocaleString("pt-BR");
    const health = healthPill(report.saude_geral);

    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text("Relatório Executivo Operacional");
    doc.moveDown(0.2);
    doc.fillColor("#334155").font("Helvetica").fontSize(10).text(`Empresa: ${empresaNome}`);
    doc.fillColor("#334155").font("Helvetica").fontSize(10).text(`Período da análise: ${periodoLabel}`);
    doc.fillColor("#334155").font("Helvetica").fontSize(10).text(`Data de geração: ${generatedAt}`);
    doc.moveDown(0.7);
    doc.roundedRect(doc.x, doc.y, 520, 34, 8).fillAndStroke("#f8fafc", "#e2e8f0");
    doc.fillColor(health.color).font("Helvetica-Bold").fontSize(12).text(`Saúde da Operação: ${health.text}`, doc.x + 10, doc.y + 10);
    doc.moveDown(2.4);

    drawSection(doc, "1. 🧠 Resumo Executivo", report.resumo_executivo);
    drawSection(doc, "2. 📊 Saúde da Operação", `Classificação geral: ${health.text}.`);
    drawSection(doc, "3. ⛽ Combustível", report.analise_combustivel);
    drawSection(doc, "4. 🚛 Transporte", report.analise_transporte);
    drawSection(doc, "5. 🚜 Frota", report.analise_frota);
    drawSection(doc, "6. 📋 Alertas", report.analise_alertas);
    drawList(doc, "7. ⚠ Gargalos Identificados", report.gargalos);
    drawList(doc, "8. 💡 Recomendações", report.recomendacoes);

    doc.moveDown(1.2);
    doc.fillColor("#64748b").font("Helvetica-Oblique").fontSize(9).text("Relatório gerado automaticamente pelo FrotaMax", {
      align: "center",
    });

    doc.end();
  });

const runOperationalAnalysis = async ({ empresaId, userId, periodo }) => {
  await ensureTables();
  const monthlyLimit = getMonthlyLimit();
  const bounds = rangeFromPeriodo(periodo);
  const dataset = await buildOperationalDataset(empresaId, periodo);
  const sourceHash = sha256(stableJson(dataset));

  const cached = await tryGetCached({
    empresaId,
    periodo,
    periodStart: bounds.startDate,
    periodEnd: bounds.endDate,
    sourceHash,
  });
  if (cached) {
    await saveUsageLog({
      empresaId,
      userId,
      periodo,
      periodStart: bounds.startDate,
      periodEnd: bounds.endDate,
      cacheHit: true,
      sourceHash,
      model: "cache",
    });
    return {
      report: cached.report,
      dataset,
      cacheHit: true,
      periodLabel: `${bounds.startDate} até ${bounds.endDate}`,
      sourceHash,
    };
  }

  await enforceCooldown(empresaId);
  const usedThisMonth = await monthlyUsageCount(empresaId);
  if (usedThisMonth >= monthlyLimit) {
    const err = new Error(`Limite mensal atingido (${monthlyLimit} análises completas).`);
    err.statusCode = 429;
    throw err;
  }

  let aiResult = null;
  let report = null;
  try {
    aiResult = await callOpenAi(dataset);
    report = aiResult.report;
  } catch {
    report = buildFallbackReport(dataset);
  }

  await saveReport({
    empresaId,
    periodo,
    periodStart: bounds.startDate,
    periodEnd: bounds.endDate,
    sourceHash,
    report,
    userId,
  });

  await saveUsageLog({
    empresaId,
    userId,
    periodo,
    periodStart: bounds.startDate,
    periodEnd: bounds.endDate,
    cacheHit: false,
    sourceHash,
    model: aiResult?.model || "fallback",
  });

  return {
    report,
    dataset,
    cacheHit: false,
    periodLabel: `${bounds.startDate} até ${bounds.endDate}`,
    sourceHash,
  };
};

const generateOperationalAnalysisPdf = async ({ empresaId, userId, periodo }) => {
  const result = await runOperationalAnalysis({ empresaId, userId, periodo });
  const companyName = result.dataset?.empresa?.nome || `Empresa ${empresaId}`;
  const pdf = await createExecutivePdf({
    empresaNome: companyName,
    periodoLabel: result.periodLabel,
    report: result.report,
  });
  return {
    buffer: pdf,
    cacheHit: result.cacheHit,
    periodLabel: result.periodLabel,
    companyName,
  };
};

module.exports = {
  generateOperationalAnalysisPdf,
};
