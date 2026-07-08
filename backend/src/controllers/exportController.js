const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const fs = require("fs/promises");
const path = require("path");
const { listManagerRecords } = require("../models/recordModel");
const { buildRegistrosCsvContent } = require("../utils/registrosCsv");
const { getCompanyById } = require("../models/companyModel");
const viagemModel = require("../models/viagemModel");
const { z } = require("zod");
const { resolveSensitiveTenantScope } = require("../domain/tenantContext");
const { logInfo } = require("../services/loggerService");

const PDF_MAINTENANCE_MESSAGE = "Geração de PDF temporariamente desativada para manutenção";

const parseOperationalDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}-03:00`;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const resolveExportScope = (req) => {
  const strictScope = resolveSensitiveTenantScope(req, {
    allowSuperAdminGlobal: true,
    requireSuperAdminExplicitScope: true,
  });
  if (!strictScope.ok) {
    return strictScope;
  }

  const role = req.user?.role;
  return {
    ok: true,
    empresa_id: strictScope.empresa_id,
    is_global: strictScope.is_global === true,
    usuario_id: role === "MOTORISTA" ? req.user?.sub : null,
  };
};
const launchBrowser = async () => {
  throw new Error(PDF_MAINTENANCE_MESSAGE);
};
const normalizeDateFilter = (rawValue) => {
  if (!rawValue) return undefined;
  const raw = String(rawValue).trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
};
const normalizeMonthFilter = (rawValue) => {
  if (!rawValue) return undefined;
  const raw = String(rawValue).trim();
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return raw;
};
const parseExportFilters = (query = {}) => {
  const normalizedDate = normalizeDateFilter(query.data);
  const normalizedDateStart = normalizeDateFilter(query.data_inicio);
  const normalizedDateEnd = normalizeDateFilter(query.data_fim);
  const normalizedMonth = normalizeMonthFilter(query.mes);
  if (normalizedDate === null) throw new Error("Data inválida. Use YYYY-MM-DD ou DD/MM/AAAA.");
  if (normalizedDateStart === null || normalizedDateEnd === null) {
    throw new Error("Período inválido. Use YYYY-MM-DD ou DD/MM/AAAA.");
  }
  if (normalizedMonth === null) throw new Error("Mês inválido. Use YYYY-MM.");
  if (normalizedDateStart && normalizedDateEnd && normalizedDateStart > normalizedDateEnd) {
    throw new Error("Data inicial não pode ser maior que a data final.");
  }
  const filter = z
    .object({
      data: z.string().optional(),
      data_inicio: z.string().optional(),
      data_fim: z.string().optional(),
      mes: z.string().optional(),
      motorista: z.string().optional(),
      veiculo: z.string().optional(),
      tipo: z.preprocess((v) => {
        const s = String(v ?? "").trim();
        if (!s) return undefined;
        if (s === "romaneio" || s === "combustivel" || s === "parte_diaria") return s;
        return undefined;
      }, z.enum(["romaneio", "combustivel", "parte_diaria"]).optional()),
      source_id: z.string().min(8).optional(),
      source_ids: z
        .preprocess((v) => {
          if (Array.isArray(v)) return v;
          const raw = String(v ?? "").trim();
          if (!raw) return [];
          return raw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }, z.array(z.string().min(8)).max(300))
        .optional(),
      layout: z.preprocess((v) => {
        const s = String(v ?? "").trim().toLowerCase();
        if (s === "profissional") return "profissional";
        return undefined;
      }, z.enum(["profissional"]).optional()),
      modelo: z.preprocess((v) => {
        const s = String(v ?? "").trim().toLowerCase();
        if (s === "porto" || s === "padrao") return s;
        return undefined;
      }, z.enum(["porto", "padrao"]).optional()),
      include_viagens: z.preprocess((v) => {
        const raw = String(v ?? "").trim().toLowerCase();
        if (!raw) return undefined;
        return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
      }, z.boolean().optional()),
    })
    .parse({
      data: normalizedDate,
      data_inicio: normalizedDateStart,
      data_fim: normalizedDateEnd,
      mes: normalizedMonth,
      motorista: query.motorista ? String(query.motorista).trim() : undefined,
      veiculo: query.veiculo ? String(query.veiculo).trim() : undefined,
      tipo: query.tipo ? String(query.tipo).trim() : undefined,
      source_id: query.source_id ? String(query.source_id).trim() : undefined,
      source_ids: query.source_ids,
      layout: query.layout,
      modelo: query.modelo,
      include_viagens: query.include_viagens,
    });
  if (Array.isArray(filter.source_ids) && filter.source_ids.length > 0) {
    const uniqueSourceIds = Array.from(new Set(filter.source_ids.map((id) => String(id || "").trim()).filter(Boolean)));
    return { ...filter, source_id: undefined, source_ids: uniqueSourceIds };
  }
  return filter;
};

const parseChecklist = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};
const REPORT_TIMEZONE = "America/Sao_Paulo";

/** Resumo textual dos filtros e metadados para capa PDF/Excel (dados reais da query). */
const formatExportFiltersSummaryPt = (filter, recordCount = 0, scope = null) => {
  const lines = [];
  const tzLine = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: REPORT_TIMEZONE,
  }).format(new Date());
  lines.push(`Gerado em: ${tzLine} (${REPORT_TIMEZONE})`);
  lines.push(`Fichas incluídas neste ficheiro: ${recordCount}`);
  if (filter.data) lines.push(`Filtro — dia: ${filter.data}`);
  if (filter.mes) lines.push(`Filtro — mês: ${filter.mes}`);
  if (filter.data_inicio || filter.data_fim) {
    lines.push(`Filtro — intervalo: ${filter.data_inicio || "—"} a ${filter.data_fim || "—"}`);
  }
  if (filter.motorista) lines.push(`Filtro — motorista / texto: ${filter.motorista}`);
  if (filter.veiculo) lines.push(`Filtro — veículo / placa: ${filter.veiculo}`);
  if (filter.tipo) lines.push(`Filtro — tipo de registo: ${filter.tipo}`);
  if (filter.modelo === "porto") lines.push("Modelo de impressão: Porto (grelhas e resumo de produção quando aplicável).");
  if (filter.layout === "profissional") lines.push("Layout de exportação: Profissional (tabela executiva).");
  if (filter.source_id) lines.push(`Filtro — registo específico: ${filter.source_id}`);
  if (Array.isArray(filter.source_ids) && filter.source_ids.length) {
    lines.push(`Filtro — registos específicos: ${filter.source_ids.length}`);
  }
  if (filter._autoSevenDays) {
    lines.push("Período automático: últimos 7 dias (pedido sem data, mês ou intervalo).");
  }
  if (scope?.is_global) {
    lines.push("Escopo: todas as empresas (SUPER_ADMIN com scope=all).");
  } else if (scope?.empresa_id) {
    lines.push(`Escopo: empresa ${scope.empresa_id}.`);
  }
  if (lines.length === 2) lines.push("Sem filtros adicionais explícitos (âmbito: empresa autenticada).");
  return lines.join("\n");
};

const EXPORT_RECORD_CAP = 1000;
const EXPORT_TOO_MANY_MESSAGE = "Período muito grande. Refine o filtro.";

const getYmdInSaoPaulo = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const buildDefaultLastSevenDaysRange = () => {
  const endMs = Date.now();
  const startMs = endMs - 6 * 24 * 60 * 60 * 1000;
  return { data_inicio: getYmdInSaoPaulo(new Date(startMs)), data_fim: getYmdInSaoPaulo(new Date(endMs)) };
};

/** Sem data/mês/intervalo no pedido (e sem registo individual): aplica últimos 7 dias em America/Sao_Paulo. */
const normalizeExportQueryFilters = (filter) => {
  const next = { ...filter };
  if (next.source_id) return next;
  if (Array.isArray(next.source_ids) && next.source_ids.length > 0) return next;
  if (next.data || next.mes) return next;
  if (next.data_inicio || next.data_fim) return next;
  const { data_inicio, data_fim } = buildDefaultLastSevenDaysRange();
  return { ...next, data_inicio, data_fim, _autoSevenDays: true };
};

const loadExportItems = async (scope, filters) => {
  const { total } = await listManagerRecords({
    empresa_id: scope.empresa_id,
    usuario_id: scope.usuario_id ?? null,
    allow_global: scope.is_global === true,
    page: 1,
    limit: 1,
    ...filters,
  });
  if (Number(total) > EXPORT_RECORD_CAP) {
    throw new Error(EXPORT_TOO_MANY_MESSAGE);
  }
  const { items } = await listManagerRecords({
    empresa_id: scope.empresa_id,
    usuario_id: scope.usuario_id ?? null,
    allow_global: scope.is_global === true,
    page: 1,
    limit: EXPORT_RECORD_CAP,
    ...filters,
  });
  return items;
};

const weekdayRows = [
  { key: 1, label: "Segunda-feira" },
  { key: 2, label: "Terça-feira" },
  { key: 3, label: "Quarta-feira" },
  { key: 4, label: "Quinta-feira" },
  { key: 5, label: "Sexta-feira" },
  { key: 6, label: "Sábado" },
  { key: 0, label: "Domingo" },
];
const getEffectiveDateValue = (row) => row?.data || row?.recorded_at_client;
const getDateFromValue = (value) => {
  return parseOperationalDate(value);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const asDate = (value) => {
  const parsed = getDateFromValue(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: REPORT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const asDateTime = (value) => {
  const parsed = getDateFromValue(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: REPORT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
};
const getWeekdayIndex = (value) => {
  const parsed = getDateFromValue(value);
  if (!parsed) return null;
  const dayPart = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIMEZONE,
    weekday: "short",
  }).format(parsed);
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  return map[dayPart] ?? null;
};
const asWeekdayName = (value) => {
  const parsed = getDateFromValue(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: REPORT_TIMEZONE,
    weekday: "long",
  }).format(parsed);
};

const getBaseUrl = (req) => {
  const configured = (process.env.PUBLIC_BASE_URL || process.env.BACKEND_PUBLIC_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (configured) return configured;
  if (req) {
    const rawProto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const proto = String(rawProto).split(",")[0].trim();
    const rawHost = req.headers["x-forwarded-host"] || req.get("host");
    const host = rawHost ? String(rawHost).split(",")[0].trim() : "";
    if (host) return `${proto}://${host}`;
  }
  return `http://127.0.0.1:${process.env.PORT || 4000}`;
};

const normalizeLogo = (req, logoUrl) => {
  if (!logoUrl) return "";
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) return logoUrl;
  try {
    return new URL(logoUrl, getBaseUrl(req)).toString();
  } catch {
    return "";
  }
};

const extToMime = (ext) => {
  const normalized = String(ext || "").toLowerCase().replace(".", "");
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "webp") return "image/webp";
  if (normalized === "svg") return "image/svg+xml";
  return "image/png";
};

const inferImageExtension = (url, contentType = "") => {
  const lower = String(contentType).toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpeg";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("svg")) return "svg";
  if (String(url).toLowerCase().endsWith(".webp")) return "webp";
  if (String(url).toLowerCase().endsWith(".svg")) return "svg";
  if (String(url).toLowerCase().endsWith(".jpg") || String(url).toLowerCase().endsWith(".jpeg")) return "jpeg";
  return "png";
};

const resolveUploadsPath = (logoUrl) => {
  if (!logoUrl) return null;
  let pathname = logoUrl;
  try {
    if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
      pathname = new URL(logoUrl).pathname;
    }
  } catch {
    return null;
  }

  const clean = pathname.replace(/^\/+/, "");
  if (!clean.startsWith("uploads/")) return null;
  const rootUploads = path.resolve(__dirname, "../../uploads");
  const localPath = path.resolve(__dirname, "../../", clean);
  if (!localPath.startsWith(rootUploads)) return null;
  return localPath;
};

const getLogoAssets = async (req, logoUrl) => {
  if (!logoUrl) return { htmlSrc: "", excelImage: null };

  const localPath = resolveUploadsPath(logoUrl);
  if (localPath) {
    try {
      const buffer = await fs.readFile(localPath);
      const extension = path.extname(localPath).replace(".", "").toLowerCase() || "png";
      const mime = extToMime(extension);
      return {
        htmlSrc: `data:${mime};base64,${buffer.toString("base64")}`,
        excelImage:
          extension === "png" || extension === "jpg" || extension === "jpeg"
            ? { buffer, extension: extension === "jpg" ? "jpeg" : extension }
            : null,
      };
    } catch {
      // fallback HTTP
    }
  }

  const absoluteUrl = normalizeLogo(req, logoUrl);
  if (!absoluteUrl) return { htmlSrc: "", excelImage: null };

  try {
    const response = await fetch(absoluteUrl);
    if (!response.ok) {
      return { htmlSrc: absoluteUrl, excelImage: null };
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "";
    const extension = inferImageExtension(absoluteUrl, contentType);
    return {
      htmlSrc: `data:${extToMime(extension)};base64,${buffer.toString("base64")}`,
      excelImage: { buffer, extension },
    };
  } catch {
    return { htmlSrc: absoluteUrl, excelImage: null };
  }
};

const escapeForSvgText = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** Logo de substituição (SVG) quando a empresa não carregou ficheiro — garante área visível em PDF/Excel. */
const buildPlaceholderLogoDataUrl = (companyName) => {
  const name = escapeForSvgText(String(companyName || "Empresa").trim().slice(0, 72)) || "Empresa";
  const initial = String(companyName || "E").trim().charAt(0).toUpperCase() || "E";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="96" viewBox="0 0 360 96">
  <rect width="360" height="96" fill="#ffffff" stroke="#1e3a8a" stroke-width="2" rx="6"/>
  <circle cx="48" cy="48" r="30" fill="#1e3a8a"/>
  <text x="48" y="56" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="26" font-weight="700">${escapeForSvgText(
    initial
  )}</text>
  <text x="92" y="44" fill="#1e3a8a" font-family="Arial,sans-serif" font-size="15" font-weight="700">${name}</text>
  <text x="92" y="66" fill="#64748b" font-family="Arial,sans-serif" font-size="10">Logótipo (definir em perfil da empresa)</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
};

const resolveEmpresaLogoAssets = async (req, company) => {
  const base = await getLogoAssets(req, company?.logo_url);
  if (base.htmlSrc) return base;
  return {
    htmlSrc: buildPlaceholderLogoDataUrl(company?.nome || "Empresa"),
    excelImage: null,
  };
};

const toPdfCompatibleLogo = (logoAssets) => {
  const image = logoAssets?.excelImage;
  const extension = String(image?.extension || "").toLowerCase();
  if (!image?.buffer) return null;
  if (extension !== "png" && extension !== "jpeg" && extension !== "jpg") return null;
  return { buffer: image.buffer, extension: extension === "jpg" ? "jpeg" : extension };
};

const marker = (checked) => (checked ? "&#10005;" : "&nbsp;");

/** Data operacional em YYYY-MM-DD (America/Sao_Paulo) para agrupar romaneios por dia + veículo. */
const asYmdSp = (value) => {
  const parsed = getDateFromValue(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
};

const classifyRomaneioTransport = (tipoTransporte) => {
  const s = String(tipoTransporte || "").toLowerCase();
  if (s.includes("estéril") || s.includes("esteril")) return "e";
  if (s.includes("armação") || s.includes("armacao") || s.includes("amarração") || s.includes("amarracao")) {
    return "ra";
  }
  if (s.includes("pulmão") || s.includes("pulmao")) return "rp";
  return "";
};

const appendDistinctName = (current, candidate) => {
  const next = String(candidate || "").trim();
  if (!next) return current || "";
  if (!current) return next;
  if (String(current).includes(next)) return current;
  return `${current} · ${next}`;
};

const signatureNameOrLine = (value) => {
  const text = String(value || "").trim();
  return text || "_______________________________";
};

const signatureText = (label, value) => `${label}: ${signatureNameOrLine(value)}`;

const resolvePrimarySigner = (row = {}) => {
  const tipo = String(row?.tipo || "").trim().toLowerCase();
  if (tipo === "combustivel") {
    return { label: "Motorista/Operador", value: row?.motorista || null };
  }
  if (tipo === "parte_diaria") {
    return { label: "Operador", value: row?.operador || row?.motorista || null };
  }
  return { label: "Apontador", value: row?.apontador || null };
};

/**
 * Romaneio: uma ficha por combinação (dia local + veículo + placa), com até 10 viagens (colunas 1–10).
 * Mantém ordem de aparição dos grupos igual à listagem (data DESC).
 */
const buildSheetEntriesFromRecords = (records) => {
  const groupMap = new Map();
  for (const row of records) {
    if (row.tipo !== "romaneio") continue;
    const ymd = asYmdSp(getEffectiveDateValue(row)) || "_";
    const vKey = `${String(row.veiculo || "").trim()}|${String(row.placa || "").trim()}`;
    const key = `${ymd}\t${vKey}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        kind: "romaneio_group",
        ymd,
        veiculo: row.veiculo,
        placa: row.placa,
        motorista: "",
        apontador: "",
        trips: [],
      });
    }
    const g = groupMap.get(key);
    g.trips.push(row);
    g.motorista = appendDistinctName(g.motorista, row.motorista);
    g.apontador = appendDistinctName(g.apontador, row.apontador);
  }
  const parseTs = (row) => {
    const raw = getEffectiveDateValue(row);
    const normalized = raw && !String(raw).includes("T") ? String(raw).replace(" ", "T") : raw;
    const p = parseOperationalDate(normalized);
    return p && !Number.isNaN(p.getTime()) ? p.getTime() : 0;
  };
  for (const g of groupMap.values()) {
    g.trips.sort((a, b) => parseTs(a) - parseTs(b));
  }
  const merged = [];
  const romSeen = new Set();
  for (const row of records) {
    if (row.tipo !== "romaneio") {
      merged.push({ kind: "single", row });
      continue;
    }
    const ymd = asYmdSp(getEffectiveDateValue(row)) || "_";
    const vKey = `${String(row.veiculo || "").trim()}|${String(row.placa || "").trim()}`;
    const key = `${ymd}\t${vKey}`;
    if (romSeen.has(key)) continue;
    romSeen.add(key);
    const grouped = groupMap.get(key);
    if (grouped) merged.push(grouped);
  }
  return merged;
};

const getActivityName = (tipo) => {
  if (tipo === "parte_diaria") return "PARTE DIÁRIA";
  if (tipo === "combustivel") return "COMBUSTÍVEL";
  return "ROMANEIO";
};

const renderParteDiariaSheet = (row, companyName, logoUrl) => {
  const reportDate = getEffectiveDateValue(row);
  const checklist = parseChecklist(row.checklist);
  const pickChecklist = (...aliases) => {
    for (const alias of aliases) {
      if (checklist[alias] !== undefined) return checklist[alias];
    }
    return "";
  };
  const isBom = String(row.clima || "").toLowerCase() === "bom";
  const isChuva = String(row.clima || "").toLowerCase().includes("chuva");
  const period = String(row.periodo || "").toLowerCase();
  const pManha = period.includes("manh");
  const pTarde = period.includes("tarde");
  const pNoite = period.includes("noite");
  const checklistRows = [
    ["Motor", pickChecklist("motor")],
    ["Sistema Hidráulico", pickChecklist("hidráulico", "hidraulico")],
    ["Freios", pickChecklist("freios")],
    ["Pneus/Esteiras", pickChecklist("pneus", "pneus/esteiras")],
    ["Iluminação e Sinalização", pickChecklist("iluminação", "iluminacao")],
    ["Nível de Óleo e Fluídos", pickChecklist("óleo", "oleo", "fluídos", "fluidos")],
    ["Combustível", pickChecklist("combustível", "combustivel")],
    ["Outros (especificar)", pickChecklist("outros")],
  ]
    .map(
      ([label, status]) => `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="center">${marker(status === "ok")}</td>
        <td class="center">${marker(status === "ajuste")}</td>
        <td class="center">${marker(status === "não_funcional")}</td>
      </tr>
    `
    )
    .join("");

  return `
    <section class="sheet sheet-parte-diaria">
      <div class="header-row">
        <div class="logo-box"><img src="${escapeHtml(logoUrl)}" alt="Logótipo" style="height:60px;"/></div>
        <div class="title-bar-wrap">
          <div class="title-bar">PARTE DIÁRIA DE EQUIPAMENTO</div>
          <div class="subtitle">Atividade principal: ${getActivityName(row.tipo)} | Data executada: ${asDate(reportDate)}</div>
        </div>
      </div>

      <table class="form-table">
        <tr><td>CONTRATADO:</td><td>${escapeHtml(row.contratado || companyName)}</td><td>DATA:</td><td>${asDate(reportDate)}</td></tr>
        <tr><td>OPERADOR:</td><td>${escapeHtml(row.operador || row.motorista)}</td><td>EQUIPAMENTO:</td><td>${escapeHtml(row.equipamento || row.veiculo || "-")}</td></tr>
        <tr><td>PLACA:</td><td>${escapeHtml(row.placa || "-")}</td><td>MARCA/MODELO:</td><td>${escapeHtml(row.marca_modelo || "-")}</td></tr>
        <tr><td>LOCAL DE OPERAÇÃO:</td><td colspan="3">${escapeHtml(row.local || "-")}</td></tr>
        <tr><td>EXPEDIENTE:</td><td colspan="3">${escapeHtml(row.expediente || row.periodo || "-")}</td></tr>
      </table>

      <h4>REGISTRO DE TEMPO</h4>
      <table class="grid-table">
        <tr><th>PERÍODO</th><th>MANHÃ</th><th>TARDE</th><th>NOITE</th></tr>
        <tr><td>BOM</td><td class="center">${marker(isBom && pManha)}</td><td class="center">${marker(isBom && pTarde)}</td><td class="center">${marker(isBom && pNoite)}</td></tr>
        <tr><td>CHUVA</td><td class="center">${marker(isChuva && pManha)}</td><td class="center">${marker(isChuva && pTarde)}</td><td class="center">${marker(isChuva && pNoite)}</td></tr>
      </table>

      <h4>REGISTRO DE HORAS</h4>
      <table class="form-table">
        <tr><td>Horímetro Início</td><td>${escapeHtml(row.horimetro_inicio ?? "-")} hrs</td><td>Horímetro Término</td><td>${escapeHtml(row.horimetro_fim ?? "-")} hrs</td></tr>
        <tr><td>Total de Horas</td><td>${escapeHtml(row.total_horas ?? "-")} hrs</td><td>Hodômetro Início</td><td>${escapeHtml(row.hodometro_inicio ?? "-")} km</td></tr>
        <tr><td>Hodômetro Término</td><td>${escapeHtml(row.hodometro_fim ?? "-")} km</td><td>Total de Quilômetros</td><td>${escapeHtml(row.total_km ?? "-")} km</td></tr>
      </table>

      <h4>CHECKLIST</h4>
      <table class="grid-table">
        <tr><th>Item</th><th>OK</th><th>Ajuste necessário</th><th>Não funcional</th></tr>
        ${checklistRows}
      </table>

      <h4>OCORRÊNCIAS</h4>
      <table class="form-table form-table-longtext">
        <tr><td>Tempo de parada</td><td colspan="3" class="text-area-long">${escapeHtml(row.tempo_parado || "-")}</td></tr>
        <tr><td>Outros (checklist)</td><td colspan="3" class="text-area-long">${escapeHtml(row.outros_descricao || "-")}</td></tr>
        <tr><td>Observações</td><td colspan="3" class="text-area-long">${escapeHtml(row.observacoes || "-")}</td></tr>
      </table>

      <h4>PRODUÇÃO</h4>
      <table class="form-table form-table-longtext">
        <tr><td colspan="4" class="text-area-long">${escapeHtml(row.producao || "-")}</td></tr>
      </table>

      <div class="signatures">
        <div>${escapeHtml(signatureText(resolvePrimarySigner(row).label, resolvePrimarySigner(row).value))}</div>
        <div>${escapeHtml(signatureText("Responsável", ""))}</div>
      </div>
    </section>
  `;
};

const fmtMoneyBr = (n) => {
  if (n === undefined || n === null || n === "") return "—";
  const x = Number(n);
  if (Number.isNaN(x)) return "—";
  return x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtLitrosBr = (n) => {
  if (n === undefined || n === null || n === "") return "—";
  const x = Number(n);
  if (Number.isNaN(x)) return "—";
  return x.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

const renderCombustivelSheet = (row, companyName, logoUrl) => {
  const reportDate = getEffectiveDateValue(row);
  const preco = row.preco_por_litro ?? row.preco_litro;
  return `
    <section class="sheet">
      <div class="header-row">
        <div class="logo-box"><img src="${escapeHtml(logoUrl)}" alt="Logótipo" style="height:60px;"/></div>
        <div class="title-bar-wrap">
          <div class="title-bar fuel-title">FICHA DE ABASTECIMENTO</div>
          <div class="subtitle">Controle operacional — ${asDate(reportDate)}</div>
        </div>
      </div>
      <table class="form-table">
        <tr><td class="bold">DATA</td><td>${asDate(reportDate)}</td><td class="bold">HORÁRIO</td><td>${asDateTime(reportDate)}</td></tr>
        <tr><td class="bold">MOTORISTA / OPERADOR</td><td colspan="3">${escapeHtml(row.motorista || "-")}</td></tr>
        <tr><td class="bold">EQUIPAMENTO</td><td colspan="3">${escapeHtml(row.veiculo || companyName || "-")}</td></tr>
        <tr><td class="bold">PLACA</td><td>${escapeHtml(row.placa || "-")}</td><td class="bold">COMBUSTÍVEL</td><td>${escapeHtml(row.tipo_combustivel || "-")}</td></tr>
      </table>
      <h4>VALORES DO LANÇAMENTO</h4>
      <table class="grid-table">
        <tr>
          <th>Litros (L)</th>
          <th>Valor total (R$)</th>
          <th>Preço / litro (R$)</th>
          <th>Horímetro</th>
          <th>Hodômetro</th>
        </tr>
        <tr>
          <td class="center">${escapeHtml(fmtLitrosBr(row.litros))}</td>
          <td class="center">${escapeHtml(fmtMoneyBr(row.valor_total))}</td>
          <td class="center">${escapeHtml(fmtMoneyBr(preco))}</td>
          <td class="center">${escapeHtml(row.horimetro ?? "—")}</td>
          <td class="center">${escapeHtml(row.hodometro ?? "—")}</td>
        </tr>
      </table>
      <div class="assinaturas-bar">ASSINATURAS</div>
      <div class="signatures">
        <div>${escapeHtml(signatureText(resolvePrimarySigner(row).label, resolvePrimarySigner(row).value))}</div>
        <div>${escapeHtml(signatureText("Responsável", ""))}</div>
      </div>
    </section>
  `;
};

const renderRomaneioGroupSheet = (group, logoUrl) => {
  const first = group.trips[0];
  const reportDate = getEffectiveDateValue(first);
  const nums = Array.from({ length: 10 }, (_, i) => `<th class="small center">${i + 1}</th>`).join("");
  const tallyMark = (on) => (on ? "&#10005;" : "");
  const colMarks = (code) => {
    let html = "";
    for (let j = 0; j < 10; j += 1) {
      const trip = group.trips[j];
      const cls = classifyRomaneioTransport(trip?.tipo_transporte);
      const on = Boolean(trip && cls === code);
      html += `<td class="center">${tallyMark(on)}</td>`;
    }
    return html;
  };
  const destinos = [
    ...new Set(group.trips.map((t) => String(t.destino || "").trim()).filter(Boolean)),
  ].join(" · ");
  const obsExtras = group.trips.length > 10 ? ` Nota: ${group.trips.length} viagens no dia; colunas 1–10.` : "";
  const obsCombined = [
    ...new Set(group.trips.map((t) => String(t.observacao || "").trim()).filter(Boolean)),
  ].join(" | ");
  const obsFinal = [obsCombined, obsExtras].filter(Boolean).join("") || "-";

  return `
  <section class="sheet">
    <div class="header-row">
      <div class="logo-box"><img src="${escapeHtml(logoUrl)}" alt="Logótipo" style="height:60px;"/></div>
      <div class="title-bar-wrap">
        <div class="title-bar">CONTROLE DIÁRIO DE TRANSPORTE</div>
      </div>
    </div>
    <table class="form-table"><tr><td class="bold">DATA:</td><td colspan="3">${asDate(reportDate)}</td></tr></table>
    <table class="grid-table transport-main">
      <colgroup>
        <col class="col-equip" /><col class="col-placa" /><col class="col-motor" />
        <col class="col-sub" /><col span="10" />
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2">Equipamento</th>
          <th rowspan="2">Placa</th>
          <th rowspan="2">Motorista</th>
          <th colspan="11" class="center">Transporte (1 viagem por coluna)</th>
        </tr>
        <tr>
          <th class="small narrow"></th>
          ${nums}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td rowspan="4">${escapeHtml(group.veiculo || "-")}</td>
          <td rowspan="4">${escapeHtml(group.placa || "-")}</td>
          <td rowspan="4">${escapeHtml(group.motorista || "-")}</td>
          <td class="narrow bold">Estéril</td>
          ${colMarks("e")}
        </tr>
        <tr>
          <td class="narrow bold">Rocha (armação)</td>
          ${colMarks("ra")}
        </tr>
        <tr>
          <td class="narrow bold">Rocha (pulmão)</td>
          ${colMarks("rp")}
        </tr>
        <tr>
          <td class="narrow bold">Destinação</td>
          <td colspan="10" class="left">${escapeHtml(destinos || "-")}</td>
        </tr>
      </tbody>
    </table>
    <table class="form-table"><tr><td class="bold">Observação</td><td colspan="3">${escapeHtml(obsFinal)}</td></tr></table>
    <p class="legend">Legenda: Site (ST) / Depósito de Rochas (DP) / Vias de Acesso (VA)</p>
    <div class="assinaturas-bar">ASSINATURAS</div>
    <div class="signatures">
      <div>${escapeHtml(signatureText("Apontador", group.apontador))}</div>
      <div>${escapeHtml(signatureText("Responsável", ""))}</div>
    </div>
  </section>
`;
};

const renderRomaneioSheet = (row, logoUrl) =>
  renderRomaneioGroupSheet(
    {
      kind: "romaneio_group",
      ymd: asYmdSp(getEffectiveDateValue(row)),
      veiculo: row.veiculo,
      placa: row.placa,
      motorista: row.motorista,
      apontador: row.apontador,
      trips: [row],
    },
    logoUrl
  );

const buildExportCoverSection = ({ companyName, logoUrl, summaryText }) => {
  const safeSummary = escapeHtml(summaryText).replaceAll("\n", "<br/>");
  return `
  <section class="sheet export-cover">
    <div class="header-row">
      <div class="logo-box"><img src="${escapeHtml(logoUrl)}" alt="Logótipo" /></div>
      <div>
        <div class="title">${escapeHtml(companyName)}</div>
        <div class="subtitle">Exportação de registros operacionais · FrotaMax</div>
      </div>
    </div>
    <h4>Resumo dos filtros e geração</h4>
    <p class="meta-block">${safeSummary}</p>
  </section>`;
};

const buildOfficialHtml = ({ companyName, logoUrl, records, summaryText }) => {
  const cover = buildExportCoverSection({ companyName, logoUrl, summaryText });
  const sheetEntries = buildSheetEntriesFromRecords(records);
  const sheets = sheetEntries
    .map((entry) => {
      if (entry.kind === "romaneio_group") return renderRomaneioGroupSheet(entry, logoUrl);
      const row = entry.row;
      if (row.tipo === "parte_diaria") return renderParteDiariaSheet(row, companyName, logoUrl);
      if (row.tipo === "combustivel") return renderCombustivelSheet(row, companyName, logoUrl);
      return renderRomaneioSheet(row, logoUrl);
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 14mm; }
          html, body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; overflow: visible; }
          .sheet { page-break-after: always; }
          .sheet:last-child { page-break-after: auto; }
          .sheet-parte-diaria { page-break-inside: auto; break-inside: auto; }
          .sheet-parte-diaria table,
          .sheet-parte-diaria tr,
          .sheet-parte-diaria td,
          .sheet-parte-diaria th {
            page-break-inside: auto;
            break-inside: auto;
          }
          .sheet-parte-diaria h4 { page-break-after: avoid; }
          .text-area-long {
            white-space: pre-wrap;
            word-break: break-word;
            overflow: visible;
            min-height: 2.5em;
            line-height: 1.35;
          }
          .form-table-longtext td { vertical-align: top; }
          .header-row { display: grid; grid-template-columns: 140px 1fr; align-items: center; margin-bottom: 8px; }
          .logo-box { height: 70px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
          .logo-box img { max-width: 100%; object-fit: contain; }
          .title { text-align: center; font-size: 18px; font-weight: 700; text-transform: uppercase; }
          .subtitle { text-align: center; font-size: 11px; margin-top: 4px; }
          h4 { margin: 8px 0 4px; text-transform: uppercase; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
          .form-table td, .form-table th, .grid-table td, .grid-table th {
            border: 1px solid #000; padding: 5px; vertical-align: top;
          }
          .grid-table th { background: #f3f4f6; text-align: center; }
          .center { text-align: center; }
          .left { text-align: left; }
          .bold { font-weight: 700; }
          .title-bar-wrap { width: 100%; }
          .title-bar {
            text-align: center; font-weight: 700; text-transform: uppercase; font-size: 15px;
            background: #e5e7eb; border: 1px solid #000; padding: 6px;
          }
          .fuel-title { color: #0f172a; }
          .transport-main th.small { font-size: 9px; padding: 2px; }
          .transport-main .narrow { font-size: 10px; max-width: 88px; }
          .assinaturas-bar {
            text-align: center; font-weight: 700; text-transform: uppercase; border: 1px solid #000;
            padding: 4px; margin: 10px 0 4px; background: #f3f4f6;
          }
          tr.weekend td:first-child { color: #b91c1c; font-weight: 600; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; font-size: 11px; }
          .text-area { min-height: 38px; }
          .legend { margin: 6px 0; font-size: 11px; }
          .export-cover { margin-bottom: 10px; }
          .export-cover .title { font-size: 16px; }
          .meta-block { font-size: 11px; line-height: 1.45; border: 1px solid #ccc; padding: 8px; background: #fafafa; }
        </style>
      </head>
      <body>
        ${cover}
        ${sheets || '<section class="sheet"><p>Sem registros para exportação.</p></section>'}
      </body>
    </html>
  `;
};

const buildFallbackPdfBuffer = async ({ companyName, records, logoImage, filterSummary }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 26,
      info: {
        Title: "Relatorio de Registros",
        Author: "FrotaMax",
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = 26;
    const pageWidth = doc.page.width - margin * 2;
    const small = 9;
    const normal = 10;
    const rowGap = 0;

    let contentStartY = margin;
    if (filterSummary) {
      doc.font("Helvetica").fontSize(8.5).fillColor("#222222").text(String(filterSummary), margin, contentStartY, {
        width: pageWidth,
        lineGap: 2,
      });
      contentStartY = doc.y + 10;
    }

    const pageBottomY = () => doc.page.height - margin;

    /** Garante espaço vertical; quebra página quando necessário. */
    const advancePage = (y, need) => {
      if (y + need > pageBottomY()) {
        doc.addPage();
        return margin;
      }
      return y;
    };

    /** Texto longo que pode ocupar várias páginas (sem clip de altura). */
    const drawFlowingBlock = (y, titleLine, bodyText, { withTitle = true } = {}) => {
      let yy = advancePage(y, withTitle ? 48 : 32);
      if (withTitle && titleLine) {
        doc.font("Helvetica-Bold").fontSize(normal).fillColor("#000000").text(String(titleLine), margin, yy, {
          width: pageWidth,
        });
        yy = doc.y + 6;
      }
      yy = advancePage(yy, 28);
      doc.font("Helvetica").fontSize(small).fillColor("#000000");
      doc.text(String(bodyText ?? ""), margin, yy, {
        width: pageWidth,
        lineGap: 2,
        align: "left",
      });
      return doc.y + 12;
    };

    const drawCells = (y, height, cells, opts = {}) => {
      const padding = opts.padding ?? 4;
      const fontSize = opts.fontSize ?? small;
      const lineGap = opts.lineGap ?? 2;
      const clipH = opts.clipText !== false;
      let effHeight = height;

      if (opts.dynamicHeight || height === null || height === "auto") {
        effHeight = opts.minRowHeight ?? 22;
        cells.forEach((cell) => {
          const fs = cell.fontSize || fontSize;
          const useBold = !!(cell.bold || opts.bold);
          doc.font(useBold ? "Helvetica-Bold" : "Helvetica").fontSize(fs);
          const innerW = Math.max(1, cell.width - 2 * padding);
          const innerH = doc.heightOfString(String(cell.text ?? ""), { width: innerW, lineGap });
          effHeight = Math.max(effHeight, innerH + 2 * padding);
        });
      }

      while (y + effHeight > pageBottomY()) {
        doc.addPage();
        y = margin;
      }
      let pageAvail = pageBottomY() - y;
      let effectiveClip = clipH;
      if (effHeight > pageAvail) {
        effHeight = Math.max(opts.minRowHeight ?? 22, pageAvail);
        if (opts.dynamicHeight) effectiveClip = false;
      }

      let x = margin;
      cells.forEach((cell) => {
        const width = cell.width;
        doc.rect(x, y, width, effHeight).lineWidth(0.8).stroke("#000");
        if (cell.imageBuffer) {
          try {
            doc.image(cell.imageBuffer, x + 6, y + 4, { fit: [Math.max(20, width - 12), Math.max(18, effHeight - 8)] });
          } catch {
            // ignora erros de renderizacao de imagem no fallback
          }
        }
        if (cell.text !== undefined && cell.text !== null) {
          const fs = cell.fontSize || fontSize;
          const useBold = !!(cell.bold || opts.bold);
          doc.font(useBold ? "Helvetica-Bold" : "Helvetica").fontSize(fs).fillColor("#000000");
          const textOpts = {
            width: width - padding * 2,
            lineGap,
            align: cell.align || "left",
            lineBreak: true,
          };
          if (effectiveClip) {
            textOpts.height = Math.max(8, effHeight - padding * 2);
          }
          doc.text(String(cell.text), x + padding, y + padding, textOpts);
        }
        x += width;
      });
      return y + effHeight + rowGap;
    };

    const drawSectionTitle = (y, title) =>
      drawCells(y, 22, [{ width: pageWidth, text: title, bold: true, fontSize: normal }], { fontSize: normal, bold: true });

    const drawRecordHeader = (y, row, title) => {
      const logoWidth = Math.round(pageWidth * 0.23);
      const infoWidth = pageWidth - logoWidth;
      const subtitle = `Atividade principal: ${getActivityName(row.tipo)} | Data executada: ${asDate(getEffectiveDateValue(row))}`;
      return drawCells(
        y,
        58,
        [
          {
            width: logoWidth,
            imageBuffer: logoImage?.buffer,
            text: logoImage?.buffer
              ? undefined
              : String(companyName || "Empresa").trim().slice(0, 2).toUpperCase() || "FM",
            align: "center",
            bold: true,
            fontSize: 18,
          },
          { width: infoWidth, text: `${title}\n${subtitle}`, fontSize: 11, bold: true },
        ],
        { fontSize: 11, bold: true, padding: 6 }
      );
    };

    const drawParteDiaria = (row, startY) => {
      const signer = resolvePrimarySigner(row);
      const col = pageWidth / 4;
      let y = drawRecordHeader(startY, row, "PARTE DIARIA DE EQUIPAMENTO");
      y = drawCells(y, 28, [
        { width: col, text: "CONTRATADO:", bold: true },
        { width: col, text: asDisplayValue(row.contratado || companyName) },
        { width: col, text: "DATA:", bold: true },
        { width: col, text: asDate(getEffectiveDateValue(row)) },
      ]);
      y = drawCells(y, 28, [
        { width: col, text: "OPERADOR:", bold: true },
        { width: col, text: asDisplayValue(row.operador || row.motorista) },
        { width: col, text: "EQUIPAMENTO:", bold: true },
        { width: col, text: asDisplayValue(row.equipamento || row.veiculo) },
      ]);
      y = drawCells(y, 28, [
        { width: col, text: "MARCA/MODELO:", bold: true },
        { width: col, text: asDisplayValue(row.marca_modelo) },
        { width: col, text: "LOCAL:", bold: true },
        { width: col, text: asDisplayValue(row.local) },
      ]);
      y = drawCells(y, 28, [
        { width: col, text: "REGISTRO DE TEMPO:", bold: true },
        { width: col, text: "Preenchimento por turno" },
        { width: col, text: "EXPEDIENTE:", bold: true },
        { width: col, text: asDisplayValue(row.expediente || row.periodo) },
      ]);

      y = drawSectionTitle(y, "REGISTRO DE TEMPO");
      const c4 = pageWidth / 4;
      y = drawCells(y, 24, [
        { width: c4, text: "PERIODO", bold: true, align: "center" },
        { width: c4, text: "MANHA", bold: true, align: "center" },
        { width: c4, text: "TARDE", bold: true, align: "center" },
        { width: c4, text: "NOITE", bold: true, align: "center" },
      ]);
      const clima = String(row.clima || "").toLowerCase();
      const periodo = String(row.periodo || "").toLowerCase();
      const pManha = periodo.includes("manh");
      const pTarde = periodo.includes("tarde");
      const pNoite = periodo.includes("noite");
      y = drawCells(y, 24, [
        { width: c4, text: "BOM" },
        { width: c4, text: clima === "bom" && pManha ? "X" : "", align: "center", bold: true },
        { width: c4, text: clima === "bom" && pTarde ? "X" : "", align: "center", bold: true },
        { width: c4, text: clima === "bom" && pNoite ? "X" : "", align: "center", bold: true },
      ]);
      y = drawCells(y, 24, [
        { width: c4, text: "CHUVA" },
        { width: c4, text: clima.includes("chuva") && pManha ? "X" : "", align: "center", bold: true },
        { width: c4, text: clima.includes("chuva") && pTarde ? "X" : "", align: "center", bold: true },
        { width: c4, text: clima.includes("chuva") && pNoite ? "X" : "", align: "center", bold: true },
      ]);

      y = drawSectionTitle(y, "REGISTRO DE HORAS");
      y = drawCells(y, 28, [
        { width: col, text: "Horimetro inicio:" },
        { width: col, text: `${asDisplayValue(row.horimetro_inicio)} hrs` },
        { width: col, text: "Horimetro fim:" },
        { width: col, text: `${asDisplayValue(row.horimetro_fim)} hrs` },
      ]);
      y = drawCells(y, 28, [
        { width: col, text: "Total de horas:" },
        { width: col, text: `${asDisplayValue(row.total_horas)} hrs` },
        { width: col, text: "Hodometro inicio:" },
        { width: col, text: `${asDisplayValue(row.hodometro_inicio)} km` },
      ]);
      y = drawCells(y, 28, [
        { width: col, text: "Hodometro fim:" },
        { width: col, text: `${asDisplayValue(row.hodometro_fim)} km` },
        { width: col, text: "Total KM:" },
        { width: col, text: `${asDisplayValue(row.total_km)} km` },
      ]);

      y = drawSectionTitle(y, "CHECKLIST");
      const itemCol = pageWidth * 0.63;
      const statusCol = (pageWidth - itemCol) / 3;
      y = drawCells(y, 24, [
        { width: itemCol, text: "Item", bold: true, align: "center" },
        { width: statusCol, text: "OK", bold: true, align: "center" },
        { width: statusCol, text: "Ajuste", bold: true, align: "center" },
        { width: statusCol, text: "Nao funcional", bold: true, align: "center" },
      ]);
      const checklist = parseChecklist(row.checklist);
      const pickChecklist = (...aliases) => {
        for (const alias of aliases) {
          if (checklist[alias] !== undefined) return checklist[alias];
        }
        return "";
      };
      const checklistRows = [
        ["Motor", pickChecklist("motor")],
        ["Sistema Hidraulico", pickChecklist("hidráulico", "hidraulico")],
        ["Freios", pickChecklist("freios")],
        ["Pneus/Esteiras", pickChecklist("pneus", "pneus/esteiras")],
        ["Iluminacao", pickChecklist("iluminação", "iluminacao")],
        ["Oleo/Fluidos", pickChecklist("óleo", "oleo", "fluídos", "fluidos")],
        ["Combustivel", pickChecklist("combustível", "combustivel")],
        ["Outros (especificar)", pickChecklist("outros")],
      ];
      checklistRows.forEach(([label, status]) => {
        y = drawCells(y, 24, [
          { width: itemCol, text: label },
          { width: statusCol, text: status === "ok" ? "X" : "", align: "center", bold: true },
          { width: statusCol, text: status === "ajuste" ? "X" : "", align: "center", bold: true },
          { width: statusCol, text: status === "não_funcional" ? "X" : "", align: "center", bold: true },
        ]);
      });
      y = drawFlowingBlock(y, "Outros (detalhes)", asDisplayValue(row.outros_descricao), { withTitle: true });

      y = drawSectionTitle(y, "OCORRENCIAS");
      y = drawCells(y, 24, [
        { width: col, text: "Tempo parado:", bold: true },
        { width: pageWidth - col, text: asDisplayValue(row.tempo_parado) },
      ], { dynamicHeight: true, minRowHeight: 24 });
      y = drawFlowingBlock(y, "Observações", asDisplayValue(row.observacoes), { withTitle: true });

      y = drawSectionTitle(y, "PRODUCAO");
      y = drawFlowingBlock(y, null, asDisplayValue(row.producao), { withTitle: false });
      y = advancePage(y, 36);
      y = drawCells(y, 26, [
        { width: pageWidth / 2, text: signatureText(signer.label, signer.value) },
        { width: pageWidth / 2, text: signatureText("Responsavel", "") },
      ]);
      return y;
    };

    const drawCombustivel = (row, startY) => {
      const signer = resolvePrimarySigner(row);
      const preco = row.preco_por_litro ?? row.preco_litro;
      let y = drawRecordHeader(startY, row, "FICHA DE ABASTECIMENTO");
      y = drawCells(y, 26, [
        { width: pageWidth * 0.35, text: "MOTORISTA:", bold: true },
        { width: pageWidth * 0.65, text: asDisplayValue(row.motorista) },
      ]);
      y = drawCells(y, 26, [
        { width: pageWidth * 0.35, text: "EQUIPAMENTO:", bold: true },
        { width: pageWidth * 0.65, text: asDisplayValue(row.veiculo || companyName) },
      ]);
      y = drawCells(y, 26, [
        { width: pageWidth * 0.35, text: "Litros (L):", bold: true },
        { width: pageWidth * 0.65, text: asDisplayValue(row.litros) },
      ]);
      y = drawCells(y, 26, [
        { width: pageWidth * 0.35, text: "Valor total (R$):", bold: true },
        { width: pageWidth * 0.65, text: asDisplayValue(row.valor_total) },
      ]);
      y = drawCells(y, 26, [
        { width: pageWidth * 0.35, text: "Preço / litro (R$):", bold: true },
        { width: pageWidth * 0.65, text: asDisplayValue(preco) },
      ]);
      y = drawCells(y, 26, [
        { width: pageWidth * 0.35, text: "Horímetro:", bold: true },
        { width: pageWidth * 0.65, text: asDisplayValue(row.horimetro) },
      ]);
      y = drawCells(y, 26, [
        { width: pageWidth * 0.35, text: "Hodômetro:", bold: true },
        { width: pageWidth * 0.65, text: asDisplayValue(row.hodometro) },
      ]);
      y = drawCells(y, 26, [
        { width: pageWidth * 0.35, text: "Combustível:", bold: true },
        { width: pageWidth * 0.65, text: asDisplayValue(row.tipo_combustivel) },
      ]);
      y = drawCells(y, 26, [
        { width: pageWidth / 2, text: signatureText(signer.label, signer.value) },
        { width: pageWidth / 2, text: signatureText("Responsavel", "") },
      ]);
      return y;
    };

    const drawRomaneioGroup = (group, startY) => {
      const first = group.trips[0];
      let y = drawRecordHeader(startY, first, "CONTROLE DIARIO DE TRANSPORTE");
      y = drawCells(y, 28, [
        { width: pageWidth * 0.2, text: "DATA:", bold: true },
        { width: pageWidth * 0.8, text: asDate(getEffectiveDateValue(first)) },
      ]);
      y = drawCells(y, 26, [
        { width: pageWidth * 0.22, text: "Equipamento:", bold: true },
        { width: pageWidth * 0.28, text: asDisplayValue(group.veiculo) },
        { width: pageWidth * 0.2, text: "Placa:", bold: true },
        { width: pageWidth * 0.3, text: asDisplayValue(group.placa) },
      ]);
      y = drawCells(y, 26, [
        { width: pageWidth * 0.22, text: "Motorista:", bold: true },
        { width: pageWidth * 0.78, text: asDisplayValue(group.motorista) },
      ]);
      const labW = pageWidth * 0.16;
      const colW = (pageWidth - labW) / 10;
      const headCells = [{ width: labW, text: "Transporte", bold: true }];
      for (let i = 1; i <= 10; i += 1) {
        headCells.push({ width: colW, text: String(i), bold: true, align: "center" });
      }
      y = drawCells(y, 22, headCells);
      const typeRows = [
        ["Estéril", "e"],
        ["Rocha (armação)", "ra"],
        ["Rocha (pulmao)", "rp"],
      ];
      typeRows.forEach(([label, code]) => {
        const cells = [{ width: labW, text: label, bold: true }];
        for (let j = 0; j < 10; j += 1) {
          const trip = group.trips[j];
          const cls = classifyRomaneioTransport(trip?.tipo_transporte);
          const mark = trip && cls === code ? "X" : "";
          cells.push({ width: colW, text: mark, align: "center", bold: true });
        }
        y = drawCells(y, 22, cells);
      });
      const destinos = [
        ...new Set(group.trips.map((t) => String(t.destino || "").trim()).filter(Boolean)),
      ].join(" | ");
      y = drawCells(y, 26, [
        { width: pageWidth * 0.22, text: "Destinacao:", bold: true },
        { width: pageWidth * 0.78, text: destinos || "-" },
      ]);
      const obsParts = [
        ...new Set(group.trips.map((t) => String(t.observacao || "").trim()).filter(Boolean)),
      ];
      if (group.trips.length > 10) obsParts.push(`Nota: ${group.trips.length} viagens; ficha PDF mostra colunas 1-10.`);
      y = drawFlowingBlock(y, "Observacao", obsParts.length ? obsParts.join(" | ") : "-", { withTitle: true });
      y = drawCells(y, 26, [
        { width: pageWidth / 2, text: signatureText("Apontador", group.apontador) },
        { width: pageWidth / 2, text: signatureText("Responsavel", "") },
      ]);
      return y;
    };

    const drawRomaneio = (row, startY) =>
      drawRomaneioGroup(
        {
          kind: "romaneio_group",
          veiculo: row.veiculo,
          placa: row.placa,
          motorista: row.motorista,
          apontador: row.apontador,
          trips: [row],
        },
        startY
      );

    if (!records.length) {
      drawCells(contentStartY, 28, [{ width: pageWidth, text: `Empresa: ${asDisplayValue(companyName)} | Sem registros para exportacao.` }], {
        fontSize: normal,
      });
      doc.end();
      return;
    }

    const sheetEntries = buildSheetEntriesFromRecords(records);
    sheetEntries.forEach((entry, index) => {
      if (index > 0) doc.addPage();
      const startY = index === 0 ? contentStartY : margin;
      if (entry.kind === "romaneio_group") {
        drawRomaneioGroup(entry, startY);
        return;
      }
      const row = entry.row;
      if (row.tipo === "parte_diaria") {
        drawParteDiaria(row, startY);
      } else if (row.tipo === "combustivel") {
        drawCombustivel(row, startY);
      } else {
        drawRomaneio(row, startY);
      }
    });

    doc.end();
  });

const asDisplayValue = (value) => (value === undefined || value === null || value === "" ? "-" : String(value));

const loadLogoImage = async (workbook, excelImage) => {
  if (!excelImage) return null;
  try {
    return workbook.addImage(excelImage);
  } catch {
    return null;
  }
};

const toExcelCompatibleImage = async (htmlSrc, excelImage) => {
  const isExcelCompatible =
    excelImage &&
    (String(excelImage.extension).toLowerCase() === "png" ||
      String(excelImage.extension).toLowerCase() === "jpeg");
  if (isExcelCompatible) return excelImage;
  if (!htmlSrc) return null;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 420, height: 140, deviceScaleFactor: 2 });
    await page.setContent(
      '<!doctype html><html><body style="margin:0;padding:8px;background:#fff;display:flex;align-items:center;justify-content:center;"><img id="logo" style="max-width:380px;max-height:110px;object-fit:contain;" /></body></html>'
    );
    await page.$eval("#logo", (img, src) => {
      img.src = src;
    }, htmlSrc);
    await page.waitForFunction(() => {
      const img = document.getElementById("logo");
      return Boolean(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
    });
    const rect = await page.$eval("#logo", (img) => {
      const r = img.getBoundingClientRect();
      return {
        x: Math.max(0, r.x),
        y: Math.max(0, r.y),
        width: Math.max(1, r.width),
        height: Math.max(1, r.height),
      };
    });
    const buffer = await page.screenshot({
      type: "png",
      clip: rect,
      omitBackground: false,
    });
    return { buffer, extension: "png" };
  } catch {
    return null;
  } finally {
    if (browser) await browser.close();
  }
};

/** Índice de coluna 1-based (A=1) para letra(s), até além da coluna Z. */
const getColumnLetter = (index) => {
  let n = index;
  let letter = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    letter = String.fromCharCode(65 + m) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
};

const applyBaseStyle = (worksheet) => {
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.35,
      bottom: 0.35,
      header: 0.2,
      footer: 0.2,
    },
  };
  worksheet.views = [{ showGridLines: false }];
  worksheet.properties.defaultRowHeight = 18;
  worksheet.columns = [
    { width: 16 },
    { width: 16 },
    { width: 15 },
    { width: 15 },
    { width: 16 },
    { width: 16 },
    { width: 15 },
    { width: 15 },
  ];
};

const applyBorderAndFont = (worksheet, fromRow, toRow, fromCol, toCol) => {
  for (let r = fromRow; r <= toRow; r += 1) {
    for (let c = fromCol; c <= toCol; c += 1) {
      const cell = worksheet.getCell(`${getColumnLetter(c)}${r}`);
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  }
};

const putLabelValue = (worksheet, row, labelRange, valueRange, label, value) => {
  worksheet.mergeCells(labelRange);
  worksheet.mergeCells(valueRange);
  const labelCell = worksheet.getCell(labelRange.split(":")[0]);
  labelCell.value = label;
  labelCell.font = { name: "Arial", size: 10, bold: true };
  labelCell.alignment = { vertical: "middle", horizontal: "left" };
  const valueCell = worksheet.getCell(valueRange.split(":")[0]);
  valueCell.value = asDisplayValue(value);
  valueCell.font = { name: "Arial", size: 10 };
  valueCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  applyBorderAndFont(worksheet, row, row, 1, 8);
};

const markStatus = (status, expected) => (status === expected ? "X" : "");

const addParteDiariaWorksheet = (workbook, row, companyName, logoImageId, index) => {
  const signer = resolvePrimarySigner(row);
  const reportDate = getEffectiveDateValue(row);
  const worksheet = workbook.addWorksheet(`ParteDiaria-${index + 1}`);
  applyBaseStyle(worksheet);
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: false,
    scale: 100,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.35,
      bottom: 0.35,
      header: 0.2,
      footer: 0.2,
    },
  };

  worksheet.mergeCells("A1:B3");
  worksheet.mergeCells("C1:H3");
  worksheet.getCell("C1").value = `PARTE DIÁRIA DE EQUIPAMENTO\nAtividade principal: ${getActivityName(
    row.tipo
  )} | Data executada: ${asDate(reportDate)}`;
  worksheet.getCell("C1").font = { name: "Arial", size: 14, bold: true };
  worksheet.getCell("C1").alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  applyBorderAndFont(worksheet, 1, 3, 1, 8);

  if (logoImageId !== null && logoImageId !== undefined) {
    worksheet.addImage(logoImageId, {
      tl: { col: 0.1, row: 0.1 },
      br: { col: 1.9, row: 2.9 },
      editAs: "oneCell",
    });
  } else {
    worksheet.getCell("A1").value = "LOGO";
    worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getCell("A1").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF64748B" } };
  }

  putLabelValue(worksheet, 4, "A4:B4", "C4:D4", "CONTRATADO:", row.contratado || companyName);
  putLabelValue(worksheet, 4, "E4:F4", "G4:H4", "DATA:", asDate(reportDate));
  putLabelValue(worksheet, 5, "A5:B5", "C5:D5", "OPERADOR:", row.operador || row.motorista);
  putLabelValue(worksheet, 5, "E5:F5", "G5:H5", "EQUIPAMENTO:", row.equipamento || row.veiculo);
  putLabelValue(worksheet, 6, "A6:B6", "C6:D6", "MARCA/MODELO:", row.marca_modelo);
  putLabelValue(worksheet, 6, "E6:F6", "G6:H6", "LOCAL:", row.local);
  putLabelValue(worksheet, 7, "A7:B7", "C7:D7", "REGISTRO DE TEMPO:", "Preenchimento por turno");
  putLabelValue(worksheet, 7, "E7:F7", "G7:H7", "EXPEDIENTE:", row.expediente || row.periodo);

  worksheet.mergeCells("A8:H8");
  worksheet.getCell("A8").value = "REGISTRO DE TEMPO";
  worksheet.getCell("A8").font = { name: "Arial", size: 11, bold: true };
  worksheet.getCell("A8").alignment = { vertical: "middle", horizontal: "left" };
  applyBorderAndFont(worksheet, 8, 8, 1, 8);

  worksheet.getCell("A9").value = "PERÍODO";
  worksheet.mergeCells("B9:C9");
  worksheet.getCell("B9").value = "MANHÃ";
  worksheet.mergeCells("D9:E9");
  worksheet.getCell("D9").value = "TARDE";
  worksheet.mergeCells("F9:H9");
  worksheet.getCell("F9").value = "NOITE";

  worksheet.getCell("A10").value = "BOM";
  worksheet.mergeCells("B10:C10");
  worksheet.mergeCells("D10:E10");
  worksheet.mergeCells("F10:H10");
  worksheet.getCell("A11").value = "CHUVA";
  worksheet.mergeCells("B11:C11");
  worksheet.mergeCells("D11:E11");
  worksheet.mergeCells("F11:H11");

  const clima = String(row.clima || "").toLowerCase();
  const periodo = String(row.periodo || "").toLowerCase();
  const pManha = periodo.includes("manh");
  const pTarde = periodo.includes("tarde");
  const pNoite = periodo.includes("noite");
  const isBom = clima === "bom";
  const isChuva = clima.includes("chuva");

  worksheet.getCell("B10").value = isBom && pManha ? "X" : "";
  worksheet.getCell("D10").value = isBom && pTarde ? "X" : "";
  worksheet.getCell("F10").value = isBom && pNoite ? "X" : "";
  worksheet.getCell("B11").value = isChuva && pManha ? "X" : "";
  worksheet.getCell("D11").value = isChuva && pTarde ? "X" : "";
  worksheet.getCell("F11").value = isChuva && pNoite ? "X" : "";
  applyBorderAndFont(worksheet, 9, 11, 1, 8);
  ["A9", "B9", "D9", "F9", "B10", "D10", "F10", "B11", "D11", "F11"].forEach((addr) => {
    worksheet.getCell(addr).alignment = { vertical: "middle", horizontal: "center" };
    if (addr.endsWith("9")) worksheet.getCell(addr).font = { name: "Arial", size: 10, bold: true };
  });

  worksheet.mergeCells("A12:H12");
  worksheet.getCell("A12").value = "REGISTRO DE HORAS";
  worksheet.getCell("A12").font = { name: "Arial", size: 11, bold: true };
  applyBorderAndFont(worksheet, 12, 12, 1, 8);

  putLabelValue(worksheet, 13, "A13:B13", "C13:D13", "Horímetro início:", `${asDisplayValue(row.horimetro_inicio)} hrs`);
  putLabelValue(worksheet, 13, "E13:F13", "G13:H13", "Horímetro fim:", `${asDisplayValue(row.horimetro_fim)} hrs`);
  putLabelValue(worksheet, 14, "A14:B14", "C14:D14", "Total de horas:", `${asDisplayValue(row.total_horas)} hrs`);
  putLabelValue(worksheet, 14, "E14:F14", "G14:H14", "Hodômetro início:", `${asDisplayValue(row.hodometro_inicio)} km`);
  putLabelValue(worksheet, 15, "A15:B15", "C15:D15", "Hodômetro fim:", `${asDisplayValue(row.hodometro_fim)} km`);
  putLabelValue(worksheet, 15, "E15:F15", "G15:H15", "Total KM:", `${asDisplayValue(row.total_km)} km`);

  worksheet.mergeCells("A16:H16");
  worksheet.getCell("A16").value = "CHECKLIST";
  worksheet.getCell("A16").font = { name: "Arial", size: 11, bold: true };
  applyBorderAndFont(worksheet, 16, 16, 1, 8);

  worksheet.mergeCells("A17:E17");
  worksheet.getCell("A17").value = "Item";
  worksheet.getCell("F17").value = "OK";
  worksheet.getCell("G17").value = "Ajuste";
  worksheet.getCell("H17").value = "Não funcional";
  applyBorderAndFont(worksheet, 17, 17, 1, 8);
  ["A17", "F17", "G17", "H17"].forEach((addr) => {
    worksheet.getCell(addr).font = { name: "Arial", size: 10, bold: true };
    worksheet.getCell(addr).alignment = { vertical: "middle", horizontal: "center" };
  });

  const checklist = parseChecklist(row.checklist);
  const pickChecklist = (...aliases) => {
    for (const alias of aliases) {
      if (checklist[alias] !== undefined) return checklist[alias];
    }
    return "";
  };
  const checklistRows = [
    ["Motor", pickChecklist("motor")],
    ["Sistema Hidráulico", pickChecklist("hidráulico", "hidraulico")],
    ["Freios", pickChecklist("freios")],
    ["Pneus/Esteiras", pickChecklist("pneus", "pneus/esteiras")],
    ["Iluminação", pickChecklist("iluminação", "iluminacao")],
    ["Óleo/Fluídos", pickChecklist("óleo", "oleo", "fluídos", "fluidos")],
    ["Combustível", pickChecklist("combustível", "combustivel")],
    ["Outros (especificar)", pickChecklist("outros")],
  ];

  let currentRow = 18;
  checklistRows.forEach(([item, status]) => {
    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = item;
    worksheet.getCell(`F${currentRow}`).value = markStatus(status, "ok");
    worksheet.getCell(`G${currentRow}`).value = markStatus(status, "ajuste");
    worksheet.getCell(`H${currentRow}`).value = markStatus(status, "não_funcional");
    applyBorderAndFont(worksheet, currentRow, currentRow, 1, 8);
    ["F", "G", "H"].forEach((col) => {
      worksheet.getCell(`${col}${currentRow}`).alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getCell(`${col}${currentRow}`).font = { name: "Arial", size: 10, bold: true };
    });
    currentRow += 1;
  });

  worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
  worksheet.mergeCells(`C${currentRow}:H${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "Outros (detalhes):";
  worksheet.getCell(`A${currentRow}`).font = { name: "Arial", size: 10, bold: true };
  worksheet.getCell(`C${currentRow}`).value = asDisplayValue(row.outros_descricao);
  applyBorderAndFont(worksheet, currentRow, currentRow, 1, 8);
  currentRow += 1;

  worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "OCORRÊNCIAS";
  worksheet.getCell(`A${currentRow}`).font = { name: "Arial", size: 11, bold: true };
  applyBorderAndFont(worksheet, currentRow, currentRow, 1, 8);
  currentRow += 1;

  worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
  worksheet.mergeCells(`C${currentRow}:H${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "Tempo parado:";
  worksheet.getCell(`A${currentRow}`).font = { name: "Arial", size: 10, bold: true };
  worksheet.getCell(`C${currentRow}`).value = asDisplayValue(row.tempo_parado);
  applyBorderAndFont(worksheet, currentRow, currentRow, 1, 8);
  currentRow += 1;

  const countVisualLines = (text, charsPerLine = 88) => {
    const s = String(text ?? "");
    if (!s || s === "-") return 1;
    return s.split(/\r?\n/).reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  };

  const obsSpan = Math.min(45, Math.max(3, countVisualLines(row.observacoes, 85)));
  worksheet.mergeCells(`A${currentRow}:B${currentRow + obsSpan - 1}`);
  worksheet.mergeCells(`C${currentRow}:H${currentRow + obsSpan - 1}`);
  worksheet.getCell(`A${currentRow}`).value = "Observações:";
  worksheet.getCell(`A${currentRow}`).font = { name: "Arial", size: 10, bold: true };
  worksheet.getCell(`C${currentRow}`).value = asDisplayValue(row.observacoes);
  worksheet.getCell(`C${currentRow}`).alignment = { vertical: "top", horizontal: "left", wrapText: true };
  applyBorderAndFont(worksheet, currentRow, currentRow + obsSpan - 1, 1, 8);
  currentRow += obsSpan;

  worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "PRODUÇÃO";
  worksheet.getCell(`A${currentRow}`).font = { name: "Arial", size: 11, bold: true };
  applyBorderAndFont(worksheet, currentRow, currentRow, 1, 8);
  currentRow += 1;

  const prodSpan = Math.min(50, Math.max(2, countVisualLines(row.producao, 95)));
  worksheet.mergeCells(`A${currentRow}:H${currentRow + prodSpan - 1}`);
  worksheet.getCell(`A${currentRow}`).value = asDisplayValue(row.producao);
  worksheet.getCell(`A${currentRow}`).alignment = { vertical: "top", horizontal: "left", wrapText: true };
  applyBorderAndFont(worksheet, currentRow, currentRow + prodSpan - 1, 1, 8);
  currentRow += prodSpan;

  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = signatureText(signer.label, signer.value);
  worksheet.getCell(`E${currentRow}`).value = signatureText("Responsável", "");
  worksheet.getCell(`A${currentRow}`).alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getCell(`E${currentRow}`).alignment = { vertical: "middle", horizontal: "left" };
  applyBorderAndFont(worksheet, currentRow, currentRow, 1, 8);
};

const toYmdFromPg = (dia) => {
  if (dia == null) return null;
  const s = String(dia).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = dia instanceof Date ? dia : new Date(dia);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const enumerateDaysInclusiveYmd = (ymdStart, ymdEnd) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymdStart)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(ymdEnd))) return [];
  const out = [];
  let cur = String(ymdStart);
  const end = String(ymdEnd);
  let guard = 0;
  while (cur <= end && guard < 500) {
    out.push(cur);
    const dt = new Date(`${cur}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 1);
    cur = dt.toISOString().slice(0, 10);
    guard += 1;
  }
  return out;
};

const fmtDiaCurtoPtUtc = (ymd) => {
  const [yy, mm, dd] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(dt)
    .replace(".", "");
};

const ROM_COL_LAST = 14;

const addRomaneioPortoGroupWorksheet = (workbook, group, logoImageId, index) => {
  const first = group.trips[0];
  const reportDate = getEffectiveDateValue(first);
  const ws = workbook.addWorksheet(`Romaneio-${index + 1}`);
  ws.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.35, right: 0.35, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
  };
  ws.views = [{ showGridLines: false }];
  ws.properties.defaultRowHeight = 18;
  for (let c = 1; c <= ROM_COL_LAST; c += 1) {
    ws.getColumn(c).width = c <= 3 ? 14 : c === 4 ? 16 : 8.5;
  }

  ws.mergeCells("A1:B3");
  ws.mergeCells("C1:N3");
  ws.getCell("C1").value = `CONTROLE DIÁRIO DE TRANSPORTE\nAtividade: ${getActivityName("romaneio")} · Data: ${asDate(
    reportDate
  )}`;
  ws.getCell("C1").font = { name: "Arial", size: 14, bold: true };
  ws.getCell("C1").alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  applyBorderAndFont(ws, 1, 3, 1, ROM_COL_LAST);

  if (logoImageId !== null && logoImageId !== undefined) {
    ws.addImage(logoImageId, {
      tl: { col: 0.1, row: 0.1 },
      br: { col: 1.9, row: 2.9 },
      editAs: "oneCell",
    });
  } else {
    ws.getCell("A1").value = "LOGO";
    ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell("A1").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF64748B" } };
  }

  ws.mergeCells("A4:N4");
  ws.getCell("A4").value = `DATA: ${asDate(reportDate)}`;
  ws.getCell("A4").font = { name: "Arial", size: 11, bold: true };
  applyBorderAndFont(ws, 4, 4, 1, ROM_COL_LAST);

  const hdr = 6;
  ws.getCell(`A${hdr}`).value = "Equipamento";
  ws.getCell(`B${hdr}`).value = "Placa";
  ws.getCell(`C${hdr}`).value = "Motorista";
  ws.mergeCells(`D${hdr}:N${hdr}`);
  ws.getCell(`D${hdr}`).value = "TRANSPORTE (1 viagem por coluna)";
  ["A", "B", "C", "D"].forEach((col) => {
    ws.getCell(`${col}${hdr}`).font = { name: "Arial", size: 10, bold: true };
    ws.getCell(`${col}${hdr}`).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.getCell(`D${hdr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  applyBorderAndFont(ws, hdr, hdr, 1, ROM_COL_LAST);

  const h2 = hdr + 1;
  ws.mergeCells(`A${h2}:C${h2}`);
  ws.getCell(`D${h2}`).value = "";
  for (let i = 0; i < 10; i += 1) {
    const colL = getColumnLetter(5 + i);
    ws.getCell(`${colL}${h2}`).value = i + 1;
    ws.getCell(`${colL}${h2}`).font = { name: "Arial", size: 9, bold: true };
    ws.getCell(`${colL}${h2}`).alignment = { vertical: "middle", horizontal: "center" };
    ws.getCell(`${colL}${h2}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  }
  applyBorderAndFont(ws, h2, h2, 1, ROM_COL_LAST);

  const r0 = h2 + 1;
  ws.mergeCells(`A${r0}:A${r0 + 3}`);
  ws.mergeCells(`B${r0}:B${r0 + 3}`);
  ws.mergeCells(`C${r0}:C${r0 + 3}`);
  ws.getCell(`A${r0}`).value = asDisplayValue(group.veiculo);
  ws.getCell(`B${r0}`).value = asDisplayValue(group.placa);
  ws.getCell(`C${r0}`).value = asDisplayValue(group.motorista);
  ["A", "B", "C"].forEach((col) => {
    ws.getCell(`${col}${r0}`).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  const typeRows = [
    ["Estéril", "e"],
    ["Rocha (armação)", "ra"],
    ["Rocha (pulmão)", "rp"],
  ];
  typeRows.forEach(([label, code], i) => {
    const r = r0 + i;
    ws.getCell(`D${r}`).value = label;
    ws.getCell(`D${r}`).font = { name: "Arial", size: 9, bold: true };
    for (let j = 0; j < 10; j += 1) {
      const colL = getColumnLetter(5 + j);
      const trip = group.trips[j];
      const cls = classifyRomaneioTransport(trip?.tipo_transporte);
      ws.getCell(`${colL}${r}`).value = trip && cls === code ? "X" : "";
      ws.getCell(`${colL}${r}`).alignment = { vertical: "middle", horizontal: "center" };
    }
  });

  const rDest = r0 + 3;
  ws.getCell(`D${rDest}`).value = "Destinação";
  ws.getCell(`D${rDest}`).font = { name: "Arial", size: 9, bold: true };
  ws.mergeCells(`E${rDest}:N${rDest}`);
  const destinos = [
    ...new Set(group.trips.map((t) => String(t.destino || "").trim()).filter(Boolean)),
  ].join(" · ");
  ws.getCell(`E${rDest}`).value = destinos || "-";
  ws.getCell(`E${rDest}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  applyBorderAndFont(ws, r0, r0 + 3, 1, ROM_COL_LAST);

  const obsParts = [
    ...new Set(group.trips.map((t) => String(t.observacao || "").trim()).filter(Boolean)),
  ];
  if (group.trips.length > 10) obsParts.push(`Nota: ${group.trips.length} viagens no dia; colunas 1–10.`);
  const orow = r0 + 4;
  ws.mergeCells(`A${orow}:N${orow}`);
  ws.getCell(`A${orow}`).value = `Observação: ${obsParts.length ? obsParts.join(" | ") : "-"}`;
  applyBorderAndFont(ws, orow, orow, 1, ROM_COL_LAST);

  const lrow = orow + 1;
  ws.mergeCells(`A${lrow}:N${lrow}`);
  ws.getCell(`A${lrow}`).value = "Legenda: Site (ST) / Depósito de Rochas (DP) / Vias de Acesso (VA)";
  ws.getCell(`A${lrow}`).font = { name: "Arial", size: 9, italic: true };
  applyBorderAndFont(ws, lrow, lrow, 1, ROM_COL_LAST);

  const srow = lrow + 1;
  ws.mergeCells(`A${srow}:N${srow}`);
  ws.getCell(`A${srow}`).value = "ASSINATURAS";
  ws.getCell(`A${srow}`).font = { name: "Arial", size: 11, bold: true };
  ws.getCell(`A${srow}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`A${srow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  applyBorderAndFont(ws, srow, srow, 1, ROM_COL_LAST);

  const sig = srow + 1;
  ws.mergeCells(`A${sig}:G${sig}`);
  ws.mergeCells(`H${sig}:N${sig}`);
  ws.getCell(`A${sig}`).value = signatureText("Apontador", group.apontador);
  ws.getCell(`H${sig}`).value = signatureText("Responsável", "");
  applyBorderAndFont(ws, sig, sig, 1, ROM_COL_LAST);
};

const addRomaneioPortoWorksheet = (workbook, row, logoImageId, index) =>
  addRomaneioPortoGroupWorksheet(
    workbook,
    {
      kind: "romaneio_group",
      ymd: asYmdSp(getEffectiveDateValue(row)) || "_",
      veiculo: row.veiculo,
      placa: row.placa,
      motorista: row.motorista,
      apontador: row.apontador,
      trips: [row],
    },
    logoImageId,
    index
  );

const PROD_HDR_FILL = "FF404040";
const PROD_HDR_FONT = "FFFFFFFF";
const PROD_ROW_FILL = "FFFFDCC2";
const PROD_SUM_FILL = "FF92D050";

const addProducaoPortoSheets = async (workbook, { empresaId, dataInicio, dataFim, logoImageId, companyName }) => {
  const bounds = viagemModel.utcBoundsFromDateRangeYmd(dataInicio, dataFim);
  if (!bounds?.start || !bounds?.end) return;
  const raw = await viagemModel.listViagensByVehicleDay(empresaId, bounds.start, bounds.end);
  const days = enumerateDaysInclusiveYmd(dataInicio, dataFim);
  if (!days.length) return;

  const vehiclesMap = new Map();
  for (const r of raw) {
    const id = r.veiculo_id;
    const day = toYmdFromPg(r.dia_local);
    if (!day) continue;
    if (!vehiclesMap.has(id)) {
      vehiclesMap.set(id, {
        nome: r.veiculo_nome,
        placa: r.placa || "",
        ton_esteril: Number(r.ton_esteril) || 0,
        ton_rocha: Number(r.ton_rocha) || 0,
        esteril: {},
        rocha: {},
      });
    }
    const v = vehiclesMap.get(id);
    v.esteril[day] = (v.esteril[day] || 0) + (Number(r.esteril) || 0);
    v.rocha[day] = (v.rocha[day] || 0) + (Number(r.rocha) || 0);
  }
  const vehicles = [...vehiclesMap.values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome)));

  const paintHeaderRow = (ws, row, fromCol, toCol) => {
    for (let c = fromCol; c <= toCol; c += 1) {
      const cell = ws.getCell(`${getColumnLetter(c)}${row}`);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PROD_HDR_FILL } };
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: PROD_HDR_FONT } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  };

  const paintDataRow = (ws, row, fromCol, toCol) => {
    for (let c = fromCol; c <= toCol; c += 1) {
      const cell = ws.getCell(`${getColumnLetter(c)}${row}`);
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PROD_ROW_FILL } };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  };

  const paintSumRow = (ws, row, fromCol, toCol) => {
    for (let c = fromCol; c <= toCol; c += 1) {
      const cell = ws.getCell(`${getColumnLetter(c)}${row}`);
      cell.font = { name: "Arial", size: 10, bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PROD_SUM_FILL } };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  };

  const buildSheet = (tipoKey, titlePt) => {
    const sheetName = `Resumo-${tipoKey}`.slice(0, 31).replace(/[[\]:*?/\\]/g, "-");
    const ws = workbook.addWorksheet(sheetName);
    ws.pageSetup = {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.35, right: 0.35, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    };
    ws.views = [{ showGridLines: false }];
    ws.mergeCells("A1:B3");
    ws.mergeCells("C1:H3");
    ws.getCell("C1").value = `${titlePt}\n${companyName || "Empresa"} · ${dataInicio} a ${dataFim}`;
    ws.getCell("C1").font = { name: "Arial", size: 13, bold: true };
    ws.getCell("C1").alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    applyBorderAndFont(ws, 1, 3, 1, 8);
    if (logoImageId !== null && logoImageId !== undefined) {
      ws.addImage(logoImageId, {
        tl: { col: 0.1, row: 0.1 },
        br: { col: 1.9, row: 2.9 },
        editAs: "oneCell",
      });
    }

    const lastCol = 2 + days.length + 2;
    for (let c = 1; c <= lastCol; c += 1) {
      ws.getColumn(c).width = c <= 2 ? 16 : 9;
    }

    const hr = 5;
    let c = 1;
    ws.getCell(`${getColumnLetter(c)}${hr}`).value = "CB";
    c += 1;
    ws.getCell(`${getColumnLetter(c)}${hr}`).value = "TON";
    c += 1;
    days.forEach((d) => {
      ws.getCell(`${getColumnLetter(c)}${hr}`).value = fmtDiaCurtoPtUtc(d);
      c += 1;
    });
    ws.getCell(`${getColumnLetter(c)}${hr}`).value = "TOTAL VIAGENS";
    c += 1;
    ws.getCell(`${getColumnLetter(c)}${hr}`).value = "TOTAL TONELADAS";
    paintHeaderRow(ws, hr, 1, lastCol);

    let dataRow = hr + 1;
    vehicles.forEach((v) => {
      const capacidadeMaterial = Number(tipoKey === "esteril" ? v.ton_esteril : v.ton_rocha) || 0;
      let col = 1;
      ws.getCell(`${getColumnLetter(col)}${dataRow}`).value = asDisplayValue(v.nome);
      col += 1;
      ws.getCell(`${getColumnLetter(col)}${dataRow}`).value = capacidadeMaterial ? String(capacidadeMaterial) : "-";
      col += 1;
      let tripSum = 0;
      days.forEach((d) => {
        const n = v[tipoKey][d] || 0;
        tripSum += n;
        ws.getCell(`${getColumnLetter(col)}${dataRow}`).value = n > 0 ? n : "";
        col += 1;
      });
      ws.getCell(`${getColumnLetter(col)}${dataRow}`).value = tripSum;
      col += 1;
      const tonTot = capacidadeMaterial * tripSum;
      ws.getCell(`${getColumnLetter(col)}${dataRow}`).value = tonTot ? Math.round(tonTot * 10) / 10 : "";
      paintDataRow(ws, dataRow, 1, lastCol);
      dataRow += 1;
    });

    const totalsByDay = {};
    days.forEach((d) => {
      totalsByDay[d] = vehicles.reduce((s, v) => s + (v[tipoKey][d] || 0), 0);
    });
    const grandTrips = vehicles.reduce(
      (s, v) => s + days.reduce((t, d) => t + (v[tipoKey][d] || 0), 0),
      0
    );
    const grandTon = vehicles.reduce((s, v) => {
      const capacidadeMaterial = Number(tipoKey === "esteril" ? v.ton_esteril : v.ton_rocha) || 0;
      const trips = days.reduce((t, d) => t + (v[tipoKey][d] || 0), 0);
      return s + capacidadeMaterial * trips;
    }, 0);

    let col = 1;
    ws.getCell(`${getColumnLetter(col)}${dataRow}`).value = "TOTAL";
    ws.getCell(`${getColumnLetter(col)}${dataRow}`).font = { name: "Arial", size: 10, bold: true };
    col += 1;
    ws.getCell(`${getColumnLetter(col)}${dataRow}`).value = "";
    col += 1;
    days.forEach((d) => {
      const dayTot = totalsByDay[d];
      ws.getCell(`${getColumnLetter(col)}${dataRow}`).value = dayTot > 0 ? dayTot : "";
      col += 1;
    });
    ws.getCell(`${getColumnLetter(col)}${dataRow}`).value = grandTrips;
    col += 1;
    ws.getCell(`${getColumnLetter(col)}${dataRow}`).value = grandTon ? Math.round(grandTon * 10) / 10 : "";
    paintSumRow(ws, dataRow, 1, lastCol);
  };

  buildSheet("esteril", "ESTÉRIL — viagens por dia");
  buildSheet("rocha", "ROCHA — viagens por dia");
};

const addSimpleFormWorksheet = (workbook, row, logoImageId, index) => {
  const signer = resolvePrimarySigner(row);
  if (row.tipo !== "combustivel") {
    addRomaneioPortoWorksheet(workbook, row, logoImageId, index);
    return;
  }

  const reportDate = getEffectiveDateValue(row);
  const preco = row.preco_por_litro ?? row.preco_litro;
  const worksheet = workbook.addWorksheet(`Combustivel-${index + 1}`);
  applyBaseStyle(worksheet);

  worksheet.mergeCells("A1:B3");
  worksheet.mergeCells("C1:H3");
  worksheet.getCell("C1").value = `FICHA DE ABASTECIMENTO\nData: ${asDate(reportDate)}`;
  worksheet.getCell("C1").font = { name: "Arial", size: 14, bold: true };
  worksheet.getCell("C1").alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  applyBorderAndFont(worksheet, 1, 3, 1, 8);

  if (logoImageId !== null && logoImageId !== undefined) {
    worksheet.addImage(logoImageId, {
      tl: { col: 0.1, row: 0.1 },
      br: { col: 1.9, row: 2.9 },
      editAs: "oneCell",
    });
  } else {
    worksheet.getCell("A1").value = "LOGO";
    worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getCell("A1").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF64748B" } };
  }

  putLabelValue(worksheet, 4, "A4:B4", "C4:D4", "DATA:", asDate(reportDate));
  putLabelValue(worksheet, 4, "E4:F4", "G4:H4", "EMISSÃO:", asDateTime(new Date()));
  putLabelValue(worksheet, 5, "A5:B5", "C5:H5", "MOTORISTA / OPERADOR:", row.motorista);
  putLabelValue(worksheet, 6, "A6:B6", "C6:H6", "EQUIPAMENTO:", row.veiculo);
  putLabelValue(worksheet, 7, "A7:B7", "C7:D7", "PLACA:", row.placa);
  putLabelValue(worksheet, 8, "A8:B8", "C8:H8", "TIPO COMBUSTÍVEL:", row.tipo_combustivel);

  worksheet.mergeCells("A9:H9");
  worksheet.getCell("A9").value = "VALORES DO LANÇAMENTO";
  worksheet.getCell("A9").font = { name: "Arial", size: 11, bold: true };
  applyBorderAndFont(worksheet, 9, 9, 1, 8);

  worksheet.getCell("A10").value = "Litros (L)";
  worksheet.getCell("B10").value = "Valor total (R$)";
  worksheet.mergeCells("C10:D10");
  worksheet.getCell("C10").value = "Preço / litro (R$)";
  worksheet.getCell("E10").value = "Horímetro";
  worksheet.mergeCells("F10:H10");
  worksheet.getCell("F10").value = "Hodômetro";
  ["A10", "B10", "C10", "E10", "F10"].forEach((addr) => {
    worksheet.getCell(addr).font = { name: "Arial", size: 10, bold: true };
    worksheet.getCell(addr).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  applyBorderAndFont(worksheet, 10, 10, 1, 8);

  worksheet.getCell("A11").value = row.litros != null ? Number(row.litros) : "";
  worksheet.getCell("B11").value = row.valor_total != null ? Number(row.valor_total) : "";
  worksheet.getCell("B11").numFmt = '"R$" #,##0.00';
  worksheet.mergeCells("C11:D11");
  worksheet.getCell("C11").value = preco != null ? Number(preco) : "";
  worksheet.getCell("C11").numFmt = '"R$" #,##0.00';
  worksheet.getCell("E11").value = asDisplayValue(row.horimetro);
  worksheet.mergeCells("F11:H11");
  worksheet.getCell("F11").value = asDisplayValue(row.hodometro);
  applyBorderAndFont(worksheet, 11, 11, 1, 8);
  ["A11", "B11", "C11", "E11", "F11"].forEach((addr) => {
    worksheet.getCell(addr).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  worksheet.mergeCells("A12:H12");
  worksheet.getCell("A12").value = "ASSINATURAS";
  worksheet.getCell("A12").font = { name: "Arial", size: 11, bold: true };
  worksheet.getCell("A12").alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getCell("A12").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  applyBorderAndFont(worksheet, 12, 12, 1, 8);

  worksheet.mergeCells("A13:D13");
  worksheet.mergeCells("E13:H13");
  worksheet.getCell("A13").value = signatureText(signer.label, signer.value);
  worksheet.getCell("E13").value = signatureText("Responsável", "");
  applyBorderAndFont(worksheet, 13, 13, 1, 8);
};

const addExportSummaryWorksheet = (workbook, { companyName, summaryText }) => {
  const ws = workbook.addWorksheet("00-Resumo-exportação", {
    properties: { tabColor: { argb: "FF475569" } },
  });
  ws.getColumn(1).width = 72;
  ws.getCell("A1").value = "FrotaMax — resumo da exportação";
  ws.getCell("A1").font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } };
  ws.getCell("A3").value = "Empresa";
  ws.getCell("A3").font = { name: "Arial", bold: true, size: 11 };
  ws.getCell("B3").value = companyName || "—";
  ws.getCell("B3").font = { name: "Arial", size: 11 };
  ws.getCell("A5").value = "Metadados e filtros aplicados";
  ws.getCell("A5").font = { name: "Arial", bold: true, size: 11 };
  ws.getCell("A6").value = summaryText;
  ws.getCell("A6").font = { name: "Arial", size: 10 };
  ws.getCell("A6").alignment = { wrapText: true, vertical: "top" };
};

const getProfessionalPeriodLabel = (filters) => {
  if (filters.data) return filters.data;
  if (filters.mes) return filters.mes;
  if (filters.data_inicio || filters.data_fim) return `${filters.data_inicio || "—"} a ${filters.data_fim || "—"}`;
  return "Últimos 7 dias (automático)";
};

const sanitizeSheetName = (value) => {
  const base = String(value || "")
    .replace(/[\\/*?:[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return base || "Ficha";
};

const reserveSheetName = (usedNames, preferredName) => {
  const normalized = sanitizeSheetName(preferredName);
  const maxLen = 31;
  const toKey = (name) => String(name).toLowerCase();
  let candidate = normalized.slice(0, maxLen);
  if (!usedNames.has(toKey(candidate))) {
    usedNames.add(toKey(candidate));
    return candidate;
  }
  for (let i = 2; i <= 999; i += 1) {
    const suffix = ` (${i})`;
    const room = maxLen - suffix.length;
    candidate = `${normalized.slice(0, Math.max(1, room))}${suffix}`;
    if (!usedNames.has(toKey(candidate))) {
      usedNames.add(toKey(candidate));
      return candidate;
    }
  }
  const fallback = `Ficha-${Date.now()}`.slice(0, maxLen);
  usedNames.add(toKey(fallback));
  return fallback;
};

const getAbastecimentoSheetDateLabel = (row) => {
  const ymd = asYmdSp(getEffectiveDateValue(row));
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [yyyy, mm, dd] = ymd.split("-");
  return `${dd}-${mm}-${yyyy}`;
};

const getProfessionalSheetTypeLabel = (tipo) => {
  if (tipo === "romaneio") return "Transporte";
  if (tipo === "parte_diaria") return "ParteDiaria";
  if (tipo === "combustivel") return "Combustivel";
  return "Ficha";
};

const addProfessionalFichaWorksheet = (workbook, { row, logoImageId, sheetName = "Ficha" }) => {
  const ws = workbook.addWorksheet(sheetName);
  const signer = resolvePrimarySigner(row);
  applyBaseStyle(ws);
  ws.columns = Array.from({ length: 8 }, () => ({ width: 17 }));
  ws.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.35, right: 0.35, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
  };

  const reportDate = getEffectiveDateValue(row);
  const preco = row.preco_por_litro ?? row.preco_litro;
  const fichaTitle =
    row.tipo === "romaneio"
      ? "FICHA EXECUTIVA DE TRANSPORTE"
      : row.tipo === "parte_diaria"
        ? "FICHA EXECUTIVA DE PARTE DIARIA"
        : "FICHA EXECUTIVA DE ABASTECIMENTO";
  const secondarySubtitle =
    row.tipo === "romaneio"
      ? `${asDisplayValue(row.tipo_transporte)} · ${asDisplayValue(row.destino)}`
      : row.tipo === "parte_diaria"
        ? `${asDisplayValue(row.periodo)} · ${asDisplayValue(row.clima)}`
        : `${asDisplayValue(row.tipo_combustivel)} · ${fmtLitrosBr(row.litros)} L`;
  const theme = {
    headerBg: "FF0F172A",
    headerFg: "FFFFFFFF",
    sectionBg: "FFE2E8F0",
    labelBg: "FFF8FAFC",
    valueBg: "FFFFFFFF",
    textMain: "FF0F172A",
    textMuted: "FF334155",
    border: "FFCBD5E1",
  };
  const styleRowBorders = (rowStart, rowEnd = rowStart) => {
    for (let r = rowStart; r <= rowEnd; r += 1) {
      for (let c = 1; c <= 8; c += 1) {
        const cell = ws.getCell(`${getColumnLetter(c)}${r}`);
        cell.border = {
          top: { style: "thin", color: { argb: theme.border } },
          left: { style: "thin", color: { argb: theme.border } },
          bottom: { style: "thin", color: { argb: theme.border } },
          right: { style: "thin", color: { argb: theme.border } },
        };
      }
    }
  };
  const fillRow = (rowNumber, color) => {
    for (let c = 1; c <= 8; c += 1) {
      ws.getCell(`${getColumnLetter(c)}${rowNumber}`).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color },
      };
    }
  };
  const paintCell = (addr, { bold = false, size = 10, color = theme.textMain, h = "left" } = {}) => {
    const cell = ws.getCell(addr);
    cell.font = { name: "Calibri", size, bold, color: { argb: color } };
    cell.alignment = { horizontal: h, vertical: "middle", wrapText: true };
  };
  const writePairRow = (rowNumber, leftLabel, leftValue, rightLabel, rightValue) => {
    ws.mergeCells(`A${rowNumber}:B${rowNumber}`);
    ws.mergeCells(`C${rowNumber}:D${rowNumber}`);
    ws.mergeCells(`E${rowNumber}:F${rowNumber}`);
    ws.mergeCells(`G${rowNumber}:H${rowNumber}`);
    ws.getCell(`A${rowNumber}`).value = leftLabel;
    ws.getCell(`C${rowNumber}`).value = leftValue;
    ws.getCell(`E${rowNumber}`).value = rightLabel;
    ws.getCell(`G${rowNumber}`).value = rightValue;
    fillRow(rowNumber, theme.valueBg);
    ws.getCell(`A${rowNumber}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.labelBg } };
    ws.getCell(`E${rowNumber}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.labelBg } };
    paintCell(`A${rowNumber}`, { bold: true, color: theme.textMuted });
    paintCell(`C${rowNumber}`);
    paintCell(`E${rowNumber}`, { bold: true, color: theme.textMuted });
    paintCell(`G${rowNumber}`);
    styleRowBorders(rowNumber);
  };
  const writeWideRow = (rowNumber, label, value) => {
    ws.mergeCells(`A${rowNumber}:B${rowNumber}`);
    ws.mergeCells(`C${rowNumber}:H${rowNumber}`);
    ws.getCell(`A${rowNumber}`).value = label;
    ws.getCell(`C${rowNumber}`).value = value;
    fillRow(rowNumber, theme.valueBg);
    ws.getCell(`A${rowNumber}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: theme.labelBg } };
    paintCell(`A${rowNumber}`, { bold: true, color: theme.textMuted });
    paintCell(`C${rowNumber}`);
    styleRowBorders(rowNumber);
  };

  ws.mergeCells("A1:B3");
  ws.mergeCells("C1:H2");
  ws.getCell("C1").value = fichaTitle;
  ws.getCell("C1").font = { name: "Calibri", size: 15, bold: true, color: { argb: theme.headerFg } };
  ws.getCell("C1").alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells("C3:H3");
  ws.getCell("C3").value = `Atividade: ${getActivityName(row?.tipo)} • Data: ${asDate(reportDate)} • ${secondarySubtitle}`;
  ws.getCell("C3").font = { name: "Calibri", size: 10, color: { argb: theme.headerFg } };
  ws.getCell("C3").alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  fillRow(1, theme.headerBg);
  fillRow(2, theme.headerBg);
  fillRow(3, theme.headerBg);
  styleRowBorders(1, 3);

  if (logoImageId !== null && logoImageId !== undefined) {
    ws.addImage(logoImageId, {
      tl: { col: 0.1, row: 0.1 },
      br: { col: 1.9, row: 2.9 },
      editAs: "oneCell",
    });
  } else {
    ws.getCell("A1").value = "LOGO";
    ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell("A1").font = { name: "Calibri", size: 10, italic: true, color: { argb: "FFE2E8F0" } };
  }

  writePairRow(5, "MOTORISTA / OPERADOR", asDisplayValue(row.motorista), "VEICULO", asDisplayValue(row.veiculo));
  writePairRow(6, "PLACA", asDisplayValue(row.placa), String(signer.label || "Assinatura").toUpperCase(), asDisplayValue(signer.value));
  writePairRow(7, "DATA DO REGISTRO", asDateTime(reportDate), "ATUALIZADO EM", asDateTime(row.updated_at || reportDate));

  ws.mergeCells("A9:H9");
  ws.getCell("A9").value = "RESUMO OPERACIONAL";
  paintCell("A9", { bold: true, size: 11, color: theme.textMain });
  fillRow(9, theme.sectionBg);
  styleRowBorders(9);

  if (row.tipo === "romaneio") {
    writePairRow(10, "TIPO TRANSPORTE", asDisplayValue(row.tipo_transporte), "DESTINO", asDisplayValue(row.destino));
    writePairRow(11, "VEICULO", asDisplayValue(row.veiculo), "PLACA", asDisplayValue(row.placa));
    writeWideRow(12, "OBSERVACAO", asDisplayValue(row.observacao));
  } else if (row.tipo === "parte_diaria") {
    writePairRow(10, "TOTAL HORAS", asDisplayValue(row.total_horas), "PERIODO", asDisplayValue(row.periodo));
    writePairRow(11, "CLIMA", asDisplayValue(row.clima), "TOTAL KM", asDisplayValue(row.total_km));
    writePairRow(12, "HORIMETRO (INI/FIM)", `${asDisplayValue(row.horimetro_inicio)} / ${asDisplayValue(row.horimetro_fim)}`, "EXPEDIENTE", asDisplayValue(row.expediente));
  } else {
    writePairRow(10, "LITROS (L)", fmtLitrosBr(row.litros), "VALOR TOTAL", fmtMoneyBr(row.valor_total));
    writePairRow(11, "PRECO / LITRO", fmtMoneyBr(preco), "COMBUSTIVEL", asDisplayValue(row.tipo_combustivel));
    writePairRow(12, "HORIMETRO", asDisplayValue(row.horimetro), "HODOMETRO", asDisplayValue(row.hodometro));
  }

  ws.mergeCells("A14:H14");
  ws.getCell("A14").value = "OBSERVACOES E CONTEXTO";
  paintCell("A14", { bold: true, size: 11, color: theme.textMain });
  fillRow(14, theme.sectionBg);
  styleRowBorders(14);
  ws.mergeCells("A15:H17");
  const observationsText =
    row.tipo === "romaneio"
      ? asDisplayValue(row.observacao)
      : row.tipo === "parte_diaria"
        ? `${asDisplayValue(row.observacoes)}\n\nProducao: ${asDisplayValue(row.producao)}`
        : `Tipo: ${asDisplayValue(row.tipo_combustivel)}\nValor total: ${fmtMoneyBr(row.valor_total)}\nPreco por litro: ${fmtMoneyBr(preco)}`;
  ws.getCell("A15").value = observationsText;
  ws.getCell("A15").alignment = { horizontal: "left", vertical: "top", wrapText: true };
  ws.getCell("A15").font = { name: "Calibri", size: 10, color: { argb: theme.textMain } };
  fillRow(15, theme.valueBg);
  fillRow(16, theme.valueBg);
  fillRow(17, theme.valueBg);
  styleRowBorders(15, 17);

  ws.mergeCells("A19:H19");
  ws.getCell("A19").value = "ASSINATURAS";
  paintCell("A19", { bold: true, size: 11, h: "center", color: theme.textMain });
  fillRow(19, theme.sectionBg);
  styleRowBorders(19);

  ws.mergeCells("A20:D20");
  ws.mergeCells("E20:H20");
  ws.getCell("A20").value = signatureText(signer.label, signer.value);
  ws.getCell("E20").value = signatureText("Responsavel", "");
  paintCell("A20", { size: 10 });
  paintCell("E20", { size: 10 });
  fillRow(20, theme.valueBg);
  styleRowBorders(20);

  ws.getRow(1).height = 24;
  ws.getRow(2).height = 24;
  ws.getRow(3).height = 24;
  ws.getRow(5).height = 22;
  ws.getRow(6).height = 22;
  ws.getRow(7).height = 22;
  ws.getRow(9).height = 22;
  ws.getRow(10).height = 22;
  ws.getRow(11).height = 22;
  ws.getRow(12).height = 22;
  ws.getRow(14).height = 22;
  ws.getRow(15).height = 24;
  ws.getRow(16).height = 24;
  ws.getRow(17).height = 24;
  ws.getRow(19).height = 22;
  ws.getRow(20).height = 22;
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 4 }];
};

const exportExcel = async (req, res) => {
  let filters;
  try {
    filters = parseExportFilters(req.query);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || "Filtros inválidos para exportação.",
      message: err.message || "Filtros inválidos para exportação.",
    });
  }
  const scope = resolveExportScope(req);
  if (!scope.ok) {
    return res.status(scope.statusCode).json({
      success: false,
      error: scope.message,
      message: scope.message,
    });
  }
  if (scope.is_global) {
    logInfo("export:global_scope", {
      usuario_id: req.user?.sub || null,
      role: req.user?.role || null,
      endpoint: req.originalUrl || req.url || "/api/dashboard/export/excel",
    });
  }
  const filtersEffective = normalizeExportQueryFilters(filters);
  let data;
  try {
    data = await loadExportItems(scope, filtersEffective);
  } catch (e) {
    if (e.message === EXPORT_TOO_MANY_MESSAGE) {
      return res.status(400).json({
        success: false,
        error: EXPORT_TOO_MANY_MESSAGE,
        message: EXPORT_TOO_MANY_MESSAGE,
      });
    }
    throw e;
  }
  const company = scope.empresa_id ? await getCompanyById(scope.empresa_id) : null;
  const companyName = company?.nome || (scope.is_global ? "Todas as empresas" : "Empresa");
  const workbook = new ExcelJS.Workbook();
  const logoAssets = await resolveEmpresaLogoAssets(req, company);
  const excelImage = await toExcelCompatibleImage(logoAssets.htmlSrc, logoAssets.excelImage);
  const logoImageId = await loadLogoImage(workbook, excelImage);
  const summaryText = formatExportFiltersSummaryPt(filtersEffective, data.length, scope);
  const isProfessionalLayout = filtersEffective.layout === "profissional";
  if (!isProfessionalLayout) {
    addExportSummaryWorksheet(workbook, { companyName, summaryText });
  }

  if (!data.length) {
    const empty = workbook.addWorksheet("Sem registros");
    empty.getCell("A1").value = `Sem registros para exportação (${companyName})`;
    empty.getCell("A1").font = { name: "Arial", size: 12, bold: true };
  } else if (isProfessionalLayout) {
    const rows = data;
    const usedSheetNames = new Set();
    rows.forEach((row, idx) => {
      const dateLabel = getAbastecimentoSheetDateLabel(row);
      const typeLabel = getProfessionalSheetTypeLabel(row?.tipo);
      const preferredSheetName = rows.length > 1 ? `${typeLabel} ${dateLabel || idx + 1}` : `${typeLabel} ${idx + 1}`;
      const sheetName = reserveSheetName(usedSheetNames, preferredSheetName);
      addProfessionalFichaWorksheet(workbook, {
        row,
        logoImageId,
        sheetName,
      });
    });
  } else {
    const sheetEntries = buildSheetEntriesFromRecords(data);
    sheetEntries.forEach((entry, index) => {
      if (entry.kind === "romaneio_group") {
        addRomaneioPortoGroupWorksheet(workbook, entry, logoImageId, index);
        return;
      }
      const row = entry.row;
      if (row.tipo === "parte_diaria") {
        addParteDiariaWorksheet(workbook, row, companyName, logoImageId, index);
        return;
      }
      addSimpleFormWorksheet(workbook, row, logoImageId, index);
    });
    if (
      filtersEffective.modelo === "porto" &&
      filtersEffective.data_inicio &&
      filtersEffective.data_fim &&
      !filtersEffective.source_id &&
      scope.empresa_id
    ) {
      try {
        await addProducaoPortoSheets(workbook, {
          empresaId: scope.empresa_id,
          dataInicio: filtersEffective.data_inicio,
          dataFim: filtersEffective.data_fim,
          logoImageId,
          companyName,
        });
      } catch {
        // evita falhar exportação se agregação de viagens não estiver disponível
      }
    }
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=registros.xlsx");
  await workbook.xlsx.write(res);
  res.end();
};

const exportPdf = async (req, res) => {
  let filters;
  try {
    filters = parseExportFilters(req.query);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || "Filtros invÃ¡lidos para exportaÃ§Ã£o.",
      message: err.message || "Filtros invÃ¡lidos para exportaÃ§Ã£o.",
    });
  }
  const scope = resolveExportScope(req);
  if (!scope.ok) {
    return res.status(scope.statusCode).json({
      success: false,
      error: scope.message,
      message: scope.message,
    });
  }
  if (scope.is_global) {
    logInfo("export:global_scope", {
      usuario_id: req.user?.sub || null,
      role: req.user?.role || null,
      endpoint: req.originalUrl || req.url || "/api/dashboard/export/pdf",
    });
  }

  const filtersEffective = normalizeExportQueryFilters(filters);
  let data;
  try {
    data = await loadExportItems(scope, filtersEffective);
  } catch (e) {
    if (e.message === EXPORT_TOO_MANY_MESSAGE) {
      return res.status(400).json({
        success: false,
        error: EXPORT_TOO_MANY_MESSAGE,
        message: EXPORT_TOO_MANY_MESSAGE,
      });
    }
    throw e;
  }

  const company = scope.empresa_id ? await getCompanyById(scope.empresa_id) : null;
  const companyName = company?.nome || (scope.is_global ? "Todas as empresas" : "Empresa");
  const logoAssets = await resolveEmpresaLogoAssets(req, company);
  const pdfLogo = toPdfCompatibleLogo(logoAssets);
  const summaryText = formatExportFiltersSummaryPt(filtersEffective, data.length, scope);
  const buffer = await buildFallbackPdfBuffer({
    companyName,
    records: data,
    logoImage: pdfLogo,
    filterSummary: summaryText,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=registros.pdf");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(buffer);
};

const exportCsv = async (req, res) => {
  let filters;
  try {
    filters = parseExportFilters(req.query);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || "Filtros inválidos para exportação.",
      message: err.message || "Filtros inválidos para exportação.",
    });
  }
  const scope = resolveExportScope(req);
  if (!scope.ok) {
    return res.status(scope.statusCode).json({
      success: false,
      error: scope.message,
      message: scope.message,
    });
  }
  if (scope.is_global) {
    logInfo("export:global_scope", {
      usuario_id: req.user?.sub || null,
      role: req.user?.role || null,
      endpoint: req.originalUrl || req.url || "/api/dashboard/export/csv",
    });
  }
  const filtersEffective = normalizeExportQueryFilters(filters);
  let data;
  try {
    data = await loadExportItems(scope, filtersEffective);
  } catch (e) {
    if (e.message === EXPORT_TOO_MANY_MESSAGE) {
      return res.status(400).json({
        success: false,
        error: EXPORT_TOO_MANY_MESSAGE,
        message: EXPORT_TOO_MANY_MESSAGE,
      });
    }
    throw e;
  }
  const company = scope.empresa_id ? await getCompanyById(scope.empresa_id) : null;
  const companyName = company?.nome || (scope.is_global ? "Todas as empresas" : "Empresa");
  const csv = buildRegistrosCsvContent(data, companyName);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=registros.csv");
  res.send(Buffer.from(csv, "utf8"));
};

module.exports = {
  exportExcel,
  exportPdf,
  exportCsv,
};
