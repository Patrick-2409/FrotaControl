const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const PDFDocument = require("pdfkit");
const { pool } = require("../db");
const fuelSvc = require("./fuelService");
const transportSvc = require("./transportService");
const { getCompanyById } = require("../models/companyModel");

const PERIODOS = new Set(["dia", "semana", "mes", "ano"]);
const MONTHLY_LIMIT_DEFAULT = 10;
const COOLDOWN_SECONDS_DEFAULT = 60;
const OPENAI_MODEL_DEFAULT = "gpt-4o-mini";

const COLORS = {
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#ca8a04",
  red: "#dc2626",
  gray: "#6b7280",
  white: "#ffffff",
};

let tablesReadyPromise = null;
let puppeteerModule = null;
const INSUFFICIENT_DATA_TEXT = "Dados insuficientes para análise";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPct = (value, digits = 1) => {
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

  if (p === "dia") {
    return {
      start: startDay.toISOString(),
      end: endDay.toISOString(),
      startDate: toIsoDate(startDay),
      endDate: toIsoDate(new Date(endDay.getTime() - 1)),
    };
  }
  if (p === "semana") {
    const dow = startDay.getUTCDay();
    const offsetToMonday = (dow + 6) % 7;
    const start = new Date(startDay);
    start.setUTCDate(start.getUTCDate() - offsetToMonday);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      startDate: toIsoDate(start),
      endDate: toIsoDate(new Date(end.getTime() - 1)),
    };
  }
  if (p === "ano") {
    const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0));
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      startDate: toIsoDate(start),
      endDate: toIsoDate(new Date(end.getTime() - 1)),
    };
  }
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: toIsoDate(start),
    endDate: toIsoDate(new Date(end.getTime() - 1)),
  };
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

const stableStringify = (value) => {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
};

const sha256 = (value) => crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
const monthlyLimit = () => Math.max(1, Number(process.env.OP_AI_MONTHLY_LIMIT || MONTHLY_LIMIT_DEFAULT));
const cooldownSeconds = () => Math.max(10, Number(process.env.OP_AI_COOLDOWN_SECONDS || COOLDOWN_SECONDS_DEFAULT));

const aggregateFuel = async (empresaId, bounds) => {
  const resumo = await fuelSvc.getCombustiveisResumoMetrics({
    empresa_id: empresaId,
    bounds,
    groupByVeiculo: true,
    veiculoId: null,
    motoristaId: null,
  });
  const rows = Array.isArray(resumo?.por_veiculo) ? resumo.por_veiculo : [];
  const currentPrice = toNumber(resumo?.preco_medio_litro, NaN);
  const historicalPrice = toNumber(resumo?.inteligencia?.preco_medio_historico, NaN);

  const prices = rows
    .map((r) => toNumber(r.preco_medio_litro, NaN))
    .filter((v) => Number.isFinite(v) && v > 0);
  const fleetPrice = prices.length ? prices.reduce((acc, value) => acc + value, 0) / prices.length : null;

  const vsFleet =
    Number.isFinite(currentPrice) && Number.isFinite(fleetPrice) && fleetPrice > 0
      ? toPct(((currentPrice - fleetPrice) / fleetPrice) * 100)
      : null;
  const vsHistorical =
    Number.isFinite(currentPrice) && Number.isFinite(historicalPrice) && historicalPrice > 0
      ? toPct(((currentPrice - historicalPrice) / historicalPrice) * 100)
      : null;

  const ranking = [...rows]
    .sort((a, b) => toNumber(b.total_litros) - toNumber(a.total_litros))
    .slice(0, 6)
    .map((r) => ({
      veiculo: r.veiculo_nome || r.veiculo_placa || `#${r.veiculo_id || "?"}`,
      litros: toNumber(r.total_litros),
      preco_medio: Number.isFinite(toNumber(r.preco_medio_litro, NaN)) ? toNumber(r.preco_medio_litro) : null,
    }));

  const { rows: seriesRows } = await pool.query(
    `SELECT DATE(COALESCE(recorded_at_client, data)) AS dia,
            COALESCE(SUM(valor_total), 0)::double precision AS custo_total
     FROM combustiveis
     WHERE empresa_id = $1
       AND COALESCE(recorded_at_client, data) >= $2::timestamptz
       AND COALESCE(recorded_at_client, data) < $3::timestamptz
     GROUP BY DATE(COALESCE(recorded_at_client, data))
     ORDER BY dia`,
    [empresaId, bounds.start, bounds.end]
  );

  return {
    total_gasto: toNumber(resumo?.total_valor),
    total_litros: toNumber(resumo?.total_litros),
    media_preco: Number.isFinite(currentPrice) ? currentPrice : null,
    vs_frota_pct: vsFleet,
    vs_historico_pct: vsHistorical,
    ranking_consumo: ranking,
    serie_custo_dia: seriesRows.map((r) => ({
      dia: toIsoDate(new Date(r.dia)),
      valor: toNumber(r.custo_total),
    })),
  };
};

const aggregateTransport = async (empresaId, bounds) => {
  const summary = await transportSvc.getViagensResumoProducao(empresaId, bounds);
  const totalTon = toNumber(summary?.total_toneladas_esteril) + toNumber(summary?.total_toneladas_rocha);
  const totalTrips = toNumber(summary?.total_viagens_esteril) + toNumber(summary?.total_viagens_rocha);

  const [{ rows: vehicleRows }, { rows: idleRows }, { rows: seriesRows }] = await Promise.all([
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
       ORDER BY viagens DESC, v.nome
       LIMIT 12`,
      [empresaId, bounds.start, bounds.end]
    ),
    pool.query(
      `SELECT COALESCE(v.nome, 'Sem nome') AS nome, COALESCE(v.placa, '-') AS placa
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
       LIMIT 12`,
      [empresaId, bounds.start, bounds.end]
    ),
    pool.query(
      `SELECT (vi.marcacao AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
              COUNT(*)::int AS viagens,
              COALESCE(
                SUM(CASE
                      WHEN COALESCE(v.usa_para_transporte, false) = true
                      THEN COALESCE(v.capacidade_ton, 0)
                      ELSE 0
                    END),
                0
              )::double precision AS toneladas
       FROM viagens vi
       INNER JOIN veiculos v ON v.id = vi.veiculo_id AND v.empresa_id = vi.empresa_id
       WHERE vi.empresa_id = $1
         AND vi.marcacao >= $2::timestamptz
         AND vi.marcacao < $3::timestamptz
       GROUP BY (vi.marcacao AT TIME ZONE 'America/Sao_Paulo')::date
       ORDER BY dia`,
      [empresaId, bounds.start, bounds.end]
    ),
  ]);

  const activeVehicles = vehicleRows.filter((r) => toNumber(r.viagens) > 0).length;
  const transportVehicles = vehicleRows.length || idleRows.length;
  const productivity = totalTrips > 0 && transportVehicles > 0 ? toPct(totalTrips / transportVehicles, 2) : 0;

  return {
    total_toneladas: totalTon,
    viagens: totalTrips,
    produtividade_media_viagens_por_veiculo: productivity,
    veiculos_ativos: activeVehicles,
    veiculos_ociosos: idleRows.map((r) => `${r.nome} (${r.placa})`),
    ranking_veiculos: vehicleRows.map((r) => ({
      veiculo: `${r.nome} (${r.placa})`,
      viagens: toNumber(r.viagens),
    })),
    serie_dia: seriesRows.map((r) => ({
      dia: toIsoDate(new Date(r.dia)),
      viagens: toNumber(r.viagens),
      toneladas: toNumber(r.toneladas),
    })),
  };
};

const aggregateFleet = async (empresaId, bounds) => {
  const [{ rows: totalsRows }, { rows: usageRows }] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_veiculos,
         COUNT(*) FILTER (WHERE COALESCE(status_operacional, 'ativo') IN ('ativo', 'operacao'))::int AS em_uso
       FROM veiculos
       WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT v.id, COALESCE(v.nome, 'Sem nome') AS nome, COALESCE(v.placa, '-') AS placa,
              COALESCE(status_operacional, 'ativo') AS status_operacional,
              COUNT(vi.id)::int AS viagens
       FROM veiculos v
       LEFT JOIN viagens vi
         ON vi.veiculo_id = v.id
        AND vi.empresa_id = v.empresa_id
        AND vi.marcacao >= $2::timestamptz
        AND vi.marcacao < $3::timestamptz
       WHERE v.empresa_id = $1
       GROUP BY v.id, v.nome, v.placa, v.status_operacional
       ORDER BY viagens DESC, v.nome
       LIMIT 30`,
      [empresaId, bounds.start, bounds.end]
    ),
  ]);

  const totals = totalsRows[0] || {};
  const lowPerformance = usageRows
    .filter((r) => toNumber(r.viagens) > 0 && toNumber(r.viagens) <= 2)
    .slice(0, 10)
    .map((r) => `${r.nome} (${r.placa})`);
  const idle = usageRows.filter((r) => toNumber(r.viagens) === 0).slice(0, 12).map((r) => `${r.nome} (${r.placa})`);

  return {
    total_veiculos: toNumber(totals.total_veiculos),
    em_uso: toNumber(totals.em_uso),
    ociosos: idle.length,
    baixa_performance: lowPerformance,
    utilizacao_por_veiculo: usageRows.slice(0, 12).map((r) => ({
      veiculo: `${r.nome} (${r.placa})`,
      viagens: toNumber(r.viagens),
    })),
  };
};

const aggregateDaily = async (empresaId, bounds) => {
  const { rows } = await pool.query(
    `SELECT DATE(COALESCE(recorded_at_client, data)) AS dia,
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
  );
  const totalHours = rows.reduce((acc, row) => acc + toNumber(row.total_horas), 0);
  const totalKm = rows.reduce((acc, row) => acc + toNumber(row.total_km), 0);
  return {
    producao_total: {
      registros: rows.reduce((acc, row) => acc + toNumber(row.registros), 0),
      total_horas: totalHours,
      total_km: totalKm,
    },
    evolucao: rows.map((r) => ({
      dia: toIsoDate(new Date(r.dia)),
      registros: toNumber(r.registros),
      total_horas: toNumber(r.total_horas),
      total_km: toNumber(r.total_km),
    })),
  };
};

const aggregateAlerts = async (empresaId) => {
  const { rows } = await pool.query(
    `SELECT alert_key, severity, category, title, body
     FROM operational_alert_events
     WHERE empresa_id = $1
       AND is_active = true
     ORDER BY
       CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
       last_seen_at DESC
     LIMIT 20`,
    [empresaId]
  );
  return {
    lista: rows.map((r) => ({
      criticidade: r.severity,
      categoria: r.category,
      titulo: r.title,
      descricao: r.body,
      chave: r.alert_key,
    })),
  };
};

const buildDataset = async (empresaId, periodo) => {
  const bounds = rangeFromPeriodo(periodo);
  const [company, combustivel, transporte, frota, parteDiaria, alertas] = await Promise.all([
    getCompanyById(empresaId),
    aggregateFuel(empresaId, bounds),
    aggregateTransport(empresaId, bounds),
    aggregateFleet(empresaId, bounds),
    aggregateDaily(empresaId, bounds),
    aggregateAlerts(empresaId),
  ]);
  return {
    empresa: { id: empresaId, nome: company?.nome || `Empresa ${empresaId}`, logo_url: company?.logo_url || null },
    periodo: { tipo: periodo, inicio: bounds.startDate, fim: bounds.endDate, gerado_em: new Date().toISOString() },
    combustivel,
    transporte,
    frota,
    parte_diaria: parteDiaria,
    alertas,
  };
};

const aiPrompt = `
Você é um engenheiro de produção e especialista em logística.

Analise os dados abaixo e gere um relatório executivo claro, direto e profissional.

Inclua:

1. Resumo executivo
2. Classificação da saúde da operação (Saudável, Atenção ou Crítico)
3. Principais gargalos
4. Análise de combustível
5. Análise de transporte
6. Análise da frota
7. Pontos de atenção prioritários
8. Recomendações práticas

Regras:
- linguagem simples
- frases curtas
- foco em decisão
- não usar termos técnicos complexos
- não inventar dados

Responda somente em JSON válido com a estrutura:
{
  "resumo_executivo": "texto",
  "saude_operacao": "Saudável|Atenção|Crítico",
  "gargalos": ["..."],
  "analise_combustivel": "texto",
  "analise_transporte": "texto",
  "analise_frota": "texto",
  "pontos_prioritarios": ["..."],
  "recomendacoes": ["..."]
}
`.trim();

const extractJson = (text) => {
  if (!text) return null;
  const raw = String(text).trim();
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch {
      return null;
    }
  }
};

const normalizeHealth = (value) => {
  const s = String(value || "").toLowerCase();
  if (s.includes("saud")) return "Saudável";
  if (s.includes("aten")) return "Atenção";
  return "Crítico";
};

const ensureList = (value) => (Array.isArray(value) ? value.map((v) => String(v || "").trim()).filter(Boolean) : []);

const sanitizeAiResult = (value) => {
  const src = value && typeof value === "object" ? value : {};
  return {
    resumo_executivo: String(src.resumo_executivo || "").trim(),
    saude_operacao: normalizeHealth(src.saude_operacao),
    gargalos: ensureList(src.gargalos),
    analise_combustivel: String(src.analise_combustivel || "").trim(),
    analise_transporte: String(src.analise_transporte || "").trim(),
    analise_frota: String(src.analise_frota || "").trim(),
    pontos_prioritarios: ensureList(src.pontos_prioritarios),
    recomendacoes: ensureList(src.recomendacoes),
  };
};

const callOpenAi = async (dataset) => {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada no backend.");
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
        temperature: 0.2,
        messages: [
          { role: "system", content: aiPrompt },
          { role: "user", content: `Dados agregados:\n${JSON.stringify(dataset)}` },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Falha ao gerar análise IA.");
    }
    const content = payload?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    if (!parsed) throw new Error("Resposta da IA fora do formato JSON.");
    return { result: sanitizeAiResult(parsed), model };
  } finally {
    clearTimeout(timer);
  }
};

const fallbackFromDataset = (dataset) => {
  const fuel = dataset.combustivel || {};
  const transport = dataset.transporte || {};
  const fleet = dataset.frota || {};
  const alerts = dataset.alertas?.lista || [];
  const hasCritical = alerts.some((a) => String(a.criticidade) === "critical");
  const health = hasCritical ? "Crítico" : alerts.length ? "Atenção" : "Saudável";
  return {
    resumo_executivo:
      "Análise automática em modo de contingência: operação consolidada com foco em custo, produtividade e utilização de ativos.",
    saude_operacao: health,
    gargalos: [
      `Veículos ociosos: ${toNumber(fleet.ociosos)}.`,
      `Variação combustível vs histórico: ${fuel.vs_historico_pct == null ? "indisponível" : `${fuel.vs_historico_pct}%`}.`,
      `Viagens no período: ${toNumber(transport.viagens)}.`,
    ],
    analise_combustivel: `Total gasto ${toNumber(fuel.total_gasto).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, com média de preço ${fuel.media_preco == null ? "indisponível" : `R$ ${fuel.media_preco.toFixed(2)}/L`}.`,
    analise_transporte: `Foram registadas ${toNumber(transport.viagens)} viagens e ${toNumber(transport.total_toneladas)} toneladas no período.`,
    analise_frota: `Frota com ${toNumber(fleet.em_uso)} veículos em uso de um total de ${toNumber(fleet.total_veiculos)}.`,
    pontos_prioritarios: alerts.slice(0, 4).map((a) => a.titulo),
    recomendacoes: [
      "Atuar nos pontos críticos primeiro e acompanhar diariamente até estabilizar.",
      "Revisar alocação de veículos com baixa utilização.",
      "Monitorar preço de combustível para evitar aumento contínuo de custo.",
    ],
  };
};

const getMonthlyUsage = async (empresaId) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM operational_ai_usage_logs
     WHERE empresa_id = $1
       AND cache_hit = false
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
    [empresaId]
  );
  return toNumber(rows[0]?.total);
};

const enforceCooldown = async (empresaId) => {
  const cooldown = cooldownSeconds();
  const { rows } = await pool.query(
    `SELECT created_at
     FROM operational_ai_usage_logs
     WHERE empresa_id = $1
       AND cache_hit = false
     ORDER BY created_at DESC
     LIMIT 1`,
    [empresaId]
  );
  if (!rows.length) return;
  const elapsed = (Date.now() - new Date(rows[0].created_at).getTime()) / 1000;
  if (elapsed < cooldown) {
    const wait = Math.ceil(cooldown - elapsed);
    const err = new Error(`Aguarde ${wait}s para gerar nova análise.`);
    err.statusCode = 429;
    throw err;
  }
};

const findCached = async ({ empresaId, periodo, startDate, endDate, hash }) => {
  const { rows } = await pool.query(
    `SELECT report_json
     FROM operational_ai_reports
     WHERE empresa_id = $1
       AND periodo = $2
       AND period_start = $3::date
       AND period_end = $4::date
       AND source_hash = $5
     ORDER BY generated_at DESC
     LIMIT 1`,
    [empresaId, periodo, startDate, endDate, hash]
  );
  if (!rows.length) return null;
  return sanitizeAiResult(rows[0].report_json);
};

const saveReport = async ({ empresaId, userId, periodo, startDate, endDate, hash, report }) => {
  await pool.query(
    `INSERT INTO operational_ai_reports
      (empresa_id, periodo, period_start, period_end, source_hash, report_json, generated_by)
     VALUES ($1, $2, $3::date, $4::date, $5, $6::jsonb, $7)
     ON CONFLICT (empresa_id, periodo, period_start, period_end, source_hash)
     DO UPDATE SET report_json = EXCLUDED.report_json,
                   generated_by = EXCLUDED.generated_by,
                   generated_at = NOW()`,
    [empresaId, periodo, startDate, endDate, hash, JSON.stringify(report), userId || null]
  );
};

const saveUsage = async ({ empresaId, userId, periodo, startDate, endDate, cacheHit, hash, model }) => {
  await pool.query(
    `INSERT INTO operational_ai_usage_logs
      (empresa_id, usuario_id, periodo, period_start, period_end, cache_hit, source_hash, model)
     VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8)`,
    [empresaId, userId || null, periodo, startDate, endDate, Boolean(cacheHit), hash || null, model || null]
  );
};

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const fmtMoney = (value) =>
  Number.isFinite(toNumber(value, NaN))
    ? toNumber(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

const fmtNum = (value, digits = 0) =>
  Number.isFinite(toNumber(value, NaN))
    ? toNumber(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "—";

const isPresentNumber = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
const orInsufficient = (text) => (String(text || "").trim() ? String(text).trim() : INSUFFICIENT_DATA_TEXT);

const formatMetric = (value, formatter) => {
  if (!isPresentNumber(value)) return INSUFFICIENT_DATA_TEXT;
  return formatter(value);
};

const getBaseUrl = () => {
  const configured = String(process.env.PUBLIC_BASE_URL || process.env.BACKEND_PUBLIC_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (configured) return configured;
  return `http://127.0.0.1:${process.env.PORT || 4000}`;
};

const extToMime = (ext) => {
  const normalized = String(ext || "").toLowerCase().replace(".", "");
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "webp") return "image/webp";
  if (normalized === "svg") return "image/svg+xml";
  return "image/png";
};

const resolveUploadsPath = (logoUrl) => {
  if (!logoUrl) return null;
  let pathname = String(logoUrl).trim();
  try {
    if (/^https?:\/\//i.test(pathname)) {
      pathname = new URL(pathname).pathname;
    }
  } catch {
    return null;
  }
  const normalized = pathname.replace(/\\/g, "/");
  if (!normalized.includes("/uploads/") && !normalized.startsWith("uploads/")) return null;
  const uploadsPath = normalized.includes("/uploads/")
    ? normalized.slice(normalized.toLowerCase().indexOf("/uploads/") + 1)
    : normalized;
  const root = path.resolve(__dirname, "../../");
  const localPath = path.resolve(root, uploadsPath);
  const uploadsRoot = path.resolve(root, "uploads");
  if (!localPath.startsWith(uploadsRoot)) return null;
  return localPath;
};

const resolveLogoDataUrl = async (logoUrl) => {
  if (!logoUrl) return "";
  const localPath = resolveUploadsPath(logoUrl);
  if (localPath) {
    try {
      const buffer = await fs.readFile(localPath);
      const ext = path.extname(localPath).replace(".", "").toLowerCase();
      return `data:${extToMime(ext)};base64,${buffer.toString("base64")}`;
    } catch {
      // fallback HTTP abaixo
    }
  }
  let url = String(logoUrl).trim();
  if (!/^https?:\/\//i.test(url)) {
    url = new URL(url.startsWith("/") ? url : `/${url}`, getBaseUrl()).toString();
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return "";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const ext = contentType.includes("jpeg")
      ? "jpeg"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("svg")
          ? "svg"
          : "png";
    return `data:${extToMime(ext)};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
};

const yDomain = (values) => {
  const clean = values.filter((v) => Number.isFinite(v));
  const max = clean.length ? Math.max(...clean) : 0;
  return max <= 0 ? 1 : max;
};

const emptyChartSvg = (label) => `
<svg viewBox="0 0 720 220" width="100%" height="220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}">
  <rect x="0" y="0" width="720" height="220" rx="10" fill="${COLORS.white}" />
  <text x="360" y="115" text-anchor="middle" fill="${COLORS.gray}" font-size="16" font-family="Inter, Arial, sans-serif">Sem atividade no período</text>
</svg>`;

const lineChartSvg = (series, title) => {
  if (!Array.isArray(series) || series.length === 0) return emptyChartSvg(title);
  const width = 720;
  const height = 220;
  const padX = 38;
  const padY = 26;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const values = series.map((p) => toNumber(p.valor, NaN)).filter((v) => Number.isFinite(v));
  if (!values.length) return emptyChartSvg(title);
  const maxY = yDomain(values);
  const points = series
    .map((p, i) => {
      const x = padX + (chartW * i) / Math.max(1, series.length - 1);
      const y = padY + chartH - (chartH * toNumber(p.valor)) / maxY;
      return `${x},${y}`;
    })
    .join(" ");
  const last = series[series.length - 1];
  return `
<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="${COLORS.white}" />
  <polyline fill="none" stroke="${COLORS.blue}" stroke-width="3" points="${points}" />
  <text x="${width - 16}" y="${padY + 2}" text-anchor="end" fill="${COLORS.gray}" font-size="11" font-family="Inter, Arial, sans-serif">último: ${esc(fmtMoney(last.valor))}</text>
</svg>`;
};

const verticalBarSvg = (series, title, valueKey, color = COLORS.green) => {
  if (!Array.isArray(series) || series.length === 0) return emptyChartSvg(title);
  const width = 720;
  const height = 220;
  const padX = 36;
  const padY = 24;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const values = series.map((p) => toNumber(p[valueKey], NaN)).filter((v) => Number.isFinite(v));
  if (!values.length) return emptyChartSvg(title);
  const maxY = yDomain(values);
  const barW = chartW / Math.max(1, series.length) - 8;
  const bars = series
    .map((p, i) => {
      const value = toNumber(p[valueKey], 0);
      const h = (chartH * value) / maxY;
      const x = padX + i * (barW + 8);
      const y = padY + chartH - h;
      return `<rect x="${x}" y="${y}" width="${Math.max(3, barW)}" height="${h}" rx="4" fill="${color}" opacity="0.9" />`;
    })
    .join("");
  return `
<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="${COLORS.white}" />
  ${bars}
</svg>`;
};

const dualBarSvg = (series, title) => {
  if (!Array.isArray(series) || series.length === 0) return emptyChartSvg(title);
  const width = 720;
  const height = 220;
  const padX = 36;
  const padY = 24;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const valuesA = series.map((p) => toNumber(p.toneladas, NaN)).filter((v) => Number.isFinite(v));
  const valuesB = series.map((p) => toNumber(p.viagens, NaN)).filter((v) => Number.isFinite(v));
  if (!valuesA.length && !valuesB.length) return emptyChartSvg(title);
  const maxY = yDomain([...valuesA, ...valuesB]);
  const groupW = chartW / Math.max(1, series.length);
  const barW = Math.max(3, groupW / 2 - 6);
  const bars = series
    .map((p, i) => {
      const baseX = padX + i * groupW + 2;
      const valueA = toNumber(p.toneladas, 0);
      const valueB = toNumber(p.viagens, 0);
      const hA = (chartH * valueA) / maxY;
      const hB = (chartH * valueB) / maxY;
      const yA = padY + chartH - hA;
      const yB = padY + chartH - hB;
      return `
        <rect x="${baseX}" y="${yA}" width="${barW}" height="${hA}" rx="4" fill="${COLORS.green}" opacity="0.9" />
        <rect x="${baseX + barW + 3}" y="${yB}" width="${barW}" height="${hB}" rx="4" fill="${COLORS.blue}" opacity="0.9" />
      `;
    })
    .join("");
  return `
<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="${COLORS.white}" />
  ${bars}
  <circle cx="${width - 170}" cy="20" r="5" fill="${COLORS.green}" /><text x="${width - 160}" y="24" fill="${COLORS.gray}" font-size="11" font-family="Inter, Arial, sans-serif">Toneladas</text>
  <circle cx="${width - 88}" cy="20" r="5" fill="${COLORS.blue}" /><text x="${width - 78}" y="24" fill="${COLORS.gray}" font-size="11" font-family="Inter, Arial, sans-serif">Viagens</text>
</svg>`;
};

const horizontalBarSvg = (series, title) => {
  if (!Array.isArray(series) || series.length === 0) return emptyChartSvg(title);
  const width = 720;
  const height = 240;
  const padX = 180;
  const padY = 18;
  const rowH = 34;
  const values = series.map((p) => toNumber(p.viagens, NaN)).filter((v) => Number.isFinite(v));
  if (!values.length) return emptyChartSvg(title);
  const maxY = yDomain(values);
  const bars = series
    .slice(0, 6)
    .map((p, i) => {
      const y = padY + i * rowH;
      const value = toNumber(p.viagens, 0);
      const w = ((width - padX - 24) * value) / maxY;
      return `
      <text x="12" y="${y + 21}" fill="${COLORS.gray}" font-size="12" font-family="Inter, Arial, sans-serif">${esc(
        String(p.veiculo || "").slice(0, 26)
      )}</text>
      <rect x="${padX}" y="${y + 8}" width="${w}" height="16" rx="8" fill="${COLORS.blue}" />
      <text x="${padX + w + 8}" y="${y + 21}" fill="${COLORS.gray}" font-size="11" font-family="Inter, Arial, sans-serif">${esc(
        fmtNum(value)
      )}</text>`;
    })
    .join("");
  return `
<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="${COLORS.white}" />
  ${bars}
</svg>`;
};

const healthClass = (health) => {
  if (health === "Saudável") return { color: COLORS.green, bg: "#ecfdf5" };
  if (health === "Atenção") return { color: COLORS.yellow, bg: "#fefce8" };
  return { color: COLORS.red, bg: "#fef2f2" };
};

const maybeSection = (title, body) => {
  const text = String(body || "").trim();
  if (!text) return "";
  return `<section class="section"><h2>${esc(title)}</h2><p>${esc(text)}</p></section>`;
};

const bullets = (items) => {
  const safe = ensureList(items);
  if (!safe.length) return "";
  return `<ul>${safe.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
};

const buildHtmlReport = async ({ dataset, ai }) => {
  const health = healthClass(ai.saude_operacao);
  const generatedAt = new Date(dataset.periodo.gerado_em).toLocaleString("pt-BR");
  const fuelChart = lineChartSvg(dataset.combustivel.serie_custo_dia, "Custo combustível por dia");
  const transportChart = dualBarSvg(dataset.transporte.serie_dia, "Toneladas e viagens por dia");
  const fleetChart = horizontalBarSvg(dataset.frota.utilizacao_por_veiculo, "Utilização por veículo");
  const logoSrc = await resolveLogoDataUrl(dataset?.empresa?.logo_url);

  const fuelDataReady =
    (Array.isArray(dataset.combustivel?.serie_custo_dia) && dataset.combustivel.serie_custo_dia.length > 0) ||
    toNumber(dataset.combustivel?.total_litros) > 0 ||
    toNumber(dataset.combustivel?.total_gasto) > 0;
  const transportDataReady =
    (Array.isArray(dataset.transporte?.serie_dia) && dataset.transporte.serie_dia.length > 0) ||
    toNumber(dataset.transporte?.viagens) > 0 ||
    toNumber(dataset.transporte?.total_toneladas) > 0;
  const fleetDataReady =
    (Array.isArray(dataset.frota?.utilizacao_por_veiculo) && dataset.frota.utilizacao_por_veiculo.length > 0) ||
    toNumber(dataset.frota?.total_veiculos) > 0;

  const criticalNow = [
    ...ensureList(ai.pontos_prioritarios),
    ...ensureList(ai.gargalos).filter((x) => /crit|urg|risco|atras|vencid/i.test(x)),
    ...dataset.alertas.lista.filter((a) => a.criticidade === "critical").map((a) => a.titulo),
  ];
  const priorityImmediate = Array.from(new Set(criticalNow)).slice(0, 8);

  const fuelKpisTemplate = `
    <div class="kpis">
      <div class="kpi"><span>Total gasto</span><strong>{{TOTAL_GASTO}}</strong></div>
      <div class="kpi"><span>Total litros</span><strong>{{TOTAL_LITROS}}</strong></div>
      <div class="kpi"><span>Média preço</span><strong>{{MEDIA_PRECO}}</strong></div>
      <div class="kpi"><span>Vs frota</span><strong>{{VS_FROTA}}</strong></div>
      <div class="kpi"><span>Vs histórico</span><strong>{{VS_HISTORICO}}</strong></div>
    </div>
  `;

  const transportKpisTemplate = `
    <div class="kpis">
      <div class="kpi"><span>Total toneladas</span><strong>{{TONELADAS}}</strong></div>
      <div class="kpi"><span>Total viagens</span><strong>{{VIAGENS}}</strong></div>
      <div class="kpi"><span>Produtividade</span><strong>{{PRODUTIVIDADE}}</strong></div>
      <div class="kpi"><span>Veículos ativos</span><strong>{{VEICULOS_ATIVOS}}</strong></div>
      <div class="kpi"><span>Veículos ociosos</span><strong>{{VEICULOS_OCIOSOS}}</strong></div>
    </div>
  `;

  const fleetKpisTemplate = `
    <div class="kpis">
      <div class="kpi"><span>Total veículos</span><strong>{{FROTA_TOTAL}}</strong></div>
      <div class="kpi"><span>Em uso</span><strong>{{FROTA_EM_USO}}</strong></div>
      <div class="kpi"><span>Ociosos</span><strong>{{FROTA_OCIOSOS}}</strong></div>
      <div class="kpi"><span>Baixa performance</span><strong>{{FROTA_BAIXA_PERFORMANCE}}</strong></div>
    </div>
  `;

  const placeholders = {
    "{{TOTAL_GASTO}}": esc(formatMetric(dataset.combustivel?.total_gasto, fmtMoney)),
    "{{TOTAL_LITROS}}": esc(formatMetric(dataset.combustivel?.total_litros, (v) => `${fmtNum(v, 1)} L`)),
    "{{MEDIA_PRECO}}": esc(formatMetric(dataset.combustivel?.media_preco, (v) => `R$ ${fmtNum(v, 2)}/L`)),
    "{{VS_FROTA}}": esc(formatMetric(dataset.combustivel?.vs_frota_pct, (v) => `${fmtNum(v, 1)}%`)),
    "{{VS_HISTORICO}}": esc(formatMetric(dataset.combustivel?.vs_historico_pct, (v) => `${fmtNum(v, 1)}%`)),
    "{{TONELADAS}}": esc(formatMetric(dataset.transporte?.total_toneladas, (v) => fmtNum(v, 1))),
    "{{VIAGENS}}": esc(formatMetric(dataset.transporte?.viagens, (v) => fmtNum(v))),
    "{{PRODUTIVIDADE}}": esc(formatMetric(dataset.transporte?.produtividade_media_viagens_por_veiculo, (v) => fmtNum(v, 2))),
    "{{VEICULOS_ATIVOS}}": esc(formatMetric(dataset.transporte?.veiculos_ativos, (v) => fmtNum(v))),
    "{{VEICULOS_OCIOSOS}}": esc(formatMetric(dataset.transporte?.veiculos_ociosos?.length, (v) => fmtNum(v))),
    "{{FROTA_TOTAL}}": esc(formatMetric(dataset.frota?.total_veiculos, (v) => fmtNum(v))),
    "{{FROTA_EM_USO}}": esc(formatMetric(dataset.frota?.em_uso, (v) => fmtNum(v))),
    "{{FROTA_OCIOSOS}}": esc(formatMetric(dataset.frota?.ociosos, (v) => fmtNum(v))),
    "{{FROTA_BAIXA_PERFORMANCE}}": esc(formatMetric(dataset.frota?.baixa_performance?.length, (v) => fmtNum(v))),
  };

  let html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Inter, Arial, sans-serif; color: #111827; margin: 0; background: #f8fafc; }
    .page { padding: 10px 4px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .header h1 { margin: 0; font-size: 20px; color: #0f172a; }
    .meta { color: #6b7280; font-size: 12px; line-height: 1.5; text-align: right; }
    .health { border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; border: 1px solid #e2e8f0; background: ${health.bg}; }
    .health h2 { margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #334155; }
    .health p { margin: 0; font-size: 30px; font-weight: 700; color: ${health.color}; }
    .section { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin-bottom: 12px; }
    .section h2 { margin: 0 0 8px; font-size: 15px; color: #111827; }
    .section p { margin: 0; color: #374151; line-height: 1.5; font-size: 13px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; padding: 8px 10px; }
    .kpi span { display: block; color: #6b7280; font-size: 11px; margin-bottom: 4px; }
    .kpi strong { font-size: 14px; color: #111827; }
    .inline-note { margin-top: 8px; color: #6b7280; font-size: 12px; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 5px 0; font-size: 13px; color: #1f2937; }
    .chart { margin-top: 8px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 8px; background: #fff; }
    .footer { margin-top: 16px; text-align: center; color: #6b7280; font-size: 11px; }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div style="display:flex;align-items:center;gap:12px;">
        ${logoSrc ? `<img src="${esc(logoSrc)}" alt="Logo da empresa" style="width:68px;height:68px;object-fit:contain;border-radius:10px;border:1px solid #e5e7eb;background:#fff;padding:4px;" />` : ""}
        <div>
        <h1>Relatório Executivo Operacional</h1>
        <div style="font-size:12px;color:#475569;">${esc(dataset.empresa.nome)} • ${esc(dataset.periodo.inicio)} até ${esc(dataset.periodo.fim)}</div>
      </div>
      </div>
      <div class="meta">
        <div>Período: ${esc(dataset.periodo.tipo)}</div>
        <div>Gerado em: ${esc(generatedAt)}</div>
      </div>
    </header>

    <section class="health">
      <h2>1. Saúde da Operação</h2>
      <p>${esc(ai.saude_operacao)}</p>
    </section>

    <section class="section">
      <h2>2. 🧠 Resumo Executivo</h2>
      <p>${esc(ai.resumo_executivo)}</p>
    </section>

    <section class="section">
      <h2>3. ⛽ Combustível</h2>
      ${fuelKpisTemplate}
      <p>${esc(fuelDataReady ? orInsufficient(ai.analise_combustivel) : INSUFFICIENT_DATA_TEXT)}</p>
      ${
        dataset.combustivel.ranking_consumo?.length
          ? `<div class="inline-note">Maiores consumos: ${esc(
              dataset.combustivel.ranking_consumo
                .slice(0, 3)
                .map((r) => `${r.veiculo} (${fmtNum(r.litros, 1)} L)`)
                .join(" • ")
            )}</div>`
          : ""
      }
      <div class="chart">${fuelChart}</div>
    </section>

    <section class="section">
      <h2>4. 🚛 Transporte</h2>
      ${transportKpisTemplate}
      <p>${esc(transportDataReady ? orInsufficient(ai.analise_transporte) : INSUFFICIENT_DATA_TEXT)}</p>
      ${
        dataset.transporte.veiculos_ociosos?.length
          ? `<div class="inline-note">Ociosos: ${esc(dataset.transporte.veiculos_ociosos.slice(0, 3).join(" • "))}</div>`
          : ""
      }
      <div class="chart">${transportChart}</div>
    </section>

    <section class="section">
      <h2>5. 🚜 Frota</h2>
      ${fleetKpisTemplate}
      <p>${esc(fleetDataReady ? orInsufficient(ai.analise_frota) : INSUFFICIENT_DATA_TEXT)}</p>
      ${
        dataset.frota.baixa_performance?.length
          ? `<div class="inline-note">Baixa performance: ${esc(dataset.frota.baixa_performance.slice(0, 3).join(" • "))}</div>`
          : ""
      }
      <div class="chart">${fleetChart}</div>
    </section>

    ${
      dataset.alertas.lista.length
        ? `<section class="section"><h2>6. 📋 Alertas</h2>${bullets(
            dataset.alertas.lista.map((a) => `[${a.criticidade}] ${a.titulo}`)
          )}</section>`
        : ""
    }

    ${
      priorityImmediate.length
        ? `<section class="section"><h2>7. ⚠ PRIORIDADE IMEDIATA</h2>${bullets(priorityImmediate)}</section>`
        : ""
    }

    ${
      ai.recomendacoes.length
        ? `<section class="section"><h2>8. 💡 Recomendações</h2>${bullets(ai.recomendacoes)}</section>`
        : ""
    }

    ${
      ai.gargalos.length
        ? `<section class="section"><h2>Gargalos Identificados</h2>${bullets(ai.gargalos)}</section>`
        : ""
    }

    <div class="footer">Relatório gerado automaticamente pelo FrotaMax</div>
  </div>
</body>
</html>`;

  for (const [key, value] of Object.entries(placeholders)) {
    html = html.replaceAll(key, value);
  }
  return html;
};

const getPuppeteer = () => {
  if (!puppeteerModule) {
    puppeteerModule = require("puppeteer");
  }
  return puppeteerModule;
};

const launchBrowser = async () => {
  const puppeteer = getPuppeteer();
  const timeoutMs = Math.max(20000, Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS || 90000));
  const options = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--single-process"],
    timeout: timeoutMs,
    protocolTimeout: timeoutMs,
  };
  return puppeteer.launch(options);
};

const fallbackPdf = ({ dataset, ai }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(17).fillColor("#111827").text("Relatório Executivo Operacional");
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10).fillColor("#334155").text(dataset.empresa.nome);
    doc.text(`${dataset.periodo.inicio} até ${dataset.periodo.fim}`);
    doc.moveDown(0.7);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827").text(`Saúde da operação: ${ai.saude_operacao}`);
    doc.moveDown(0.7);
    doc.font("Helvetica-Bold").fontSize(11).text("Resumo Executivo");
    doc.font("Helvetica").fontSize(10).text(ai.resumo_executivo || "Operação consolidada.");
    if (ai.recomendacoes.length) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(11).text("Recomendações");
      ai.recomendacoes.forEach((item) => doc.font("Helvetica").fontSize(10).text(`- ${item}`));
    }
    doc.moveDown(1.2);
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#6b7280").text("Relatório gerado automaticamente pelo FrotaMax", {
      align: "center",
    });
    doc.end();
  });

const renderPdfFromHtml = async (html) => {
  let browser = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 960, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 15000 }).catch(() => {});
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

const runAnalysis = async ({ empresaId, userId, periodo }) => {
  await ensureTables();
  const p = PERIODOS.has(periodo) ? periodo : "mes";
  const range = rangeFromPeriodo(p);
  const dataset = await buildDataset(empresaId, p);
  const hash = sha256(stableStringify(dataset));

  const cached = await findCached({
    empresaId,
    periodo: p,
    startDate: range.startDate,
    endDate: range.endDate,
    hash,
  });
  if (cached) {
    await saveUsage({
      empresaId,
      userId,
      periodo: p,
      startDate: range.startDate,
      endDate: range.endDate,
      cacheHit: true,
      hash,
      model: "cache",
    });
    return { ai: cached, dataset, cacheHit: true };
  }

  await enforceCooldown(empresaId);
  const used = await getMonthlyUsage(empresaId);
  if (used >= monthlyLimit()) {
    const err = new Error("Limite de análises atingido");
    err.statusCode = 429;
    throw err;
  }

  let ai = null;
  let model = "fallback";
  try {
    const aiResult = await callOpenAi(dataset);
    ai = aiResult.result;
    model = aiResult.model;
  } catch {
    ai = fallbackFromDataset(dataset);
  }

  await saveReport({
    empresaId,
    userId,
    periodo: p,
    startDate: range.startDate,
    endDate: range.endDate,
    hash,
    report: ai,
  });
  await saveUsage({
    empresaId,
    userId,
    periodo: p,
    startDate: range.startDate,
    endDate: range.endDate,
    cacheHit: false,
    hash,
    model,
  });

  return { ai, dataset, cacheHit: false };
};

const generateExecutivePdf = async ({ empresaId, userId, periodo }) => {
  const analysis = await runAnalysis({ empresaId, userId, periodo });
  const html = await buildHtmlReport({ dataset: analysis.dataset, ai: analysis.ai });
  let buffer = null;
  try {
    buffer = await renderPdfFromHtml(html);
  } catch {
    buffer = await fallbackPdf({ dataset: analysis.dataset, ai: analysis.ai });
  }
  return {
    buffer,
    cacheHit: analysis.cacheHit,
    companyName: analysis.dataset?.empresa?.nome || `empresa-${empresaId}`,
  };
};

module.exports = {
  generateExecutivePdf,
};

