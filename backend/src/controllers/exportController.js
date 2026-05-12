const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");
const { listManagerRecords } = require("../models/recordModel");
const { getCompanyById } = require("../models/companyModel");
const { z } = require("zod");

/** Puppeteer só aqui: evitar require no arranque (Render/OOM e cold start). */
let puppeteerModule = null;
const getPuppeteer = () => {
  if (!puppeteerModule) {
    puppeteerModule = require("puppeteer");
  }
  return puppeteerModule;
};

const getData = ({ empresa_id, usuario_id = null }, filters = {}) =>
  listManagerRecords({
    empresa_id,
    usuario_id,
    page: 1,
    limit: 100000,
    ...filters,
  });
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
  const role = req.user?.role;
  if (role === "MOTORISTA") {
    return {
      empresa_id: req.user?.empresa_id,
      usuario_id: req.user?.sub,
    };
  }
  return {
    empresa_id: req.user?.empresa_id,
    usuario_id: null,
  };
};
const getBrowserCandidates = () => {
  const puppeteer = getPuppeteer();
  return [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    typeof puppeteer.executablePath === "function" ? puppeteer.executablePath() : "",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);
};
const resolveBrowserExecutable = () =>
  getBrowserCandidates().find((candidate) => {
    try {
      return fsSync.existsSync(candidate);
    } catch {
      return false;
    }
  });
const launchBrowser = async () => {
  const executablePath = resolveBrowserExecutable();
  const timeoutMs = Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS || 90000);
  const baseOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-zygote",
      "--single-process",
    ],
    timeout: timeoutMs,
    protocolTimeout: timeoutMs,
  };
  const attempts = executablePath
    ? [{ ...baseOptions, executablePath }, baseOptions]
    : [baseOptions];
  let lastError;
  const puppeteer = getPuppeteer();
  for (const options of attempts) {
    try {
      return await puppeteer.launch(options);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Falha ao iniciar navegador para gerar PDF. Verifique PUPPETEER_EXECUTABLE_PATH no ambiente de produção. Detalhe: ${
      lastError?.message || "erro desconhecido"
    }`
  );
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
      tipo: z.enum(["romaneio", "combustivel", "parte_diaria"]).optional(),
      source_id: z.string().min(8).optional(),
    })
    .parse({
      data: normalizedDate,
      data_inicio: normalizedDateStart,
      data_fim: normalizedDateEnd,
      mes: normalizedMonth,
      motorista: query.motorista ? String(query.motorista).trim() : undefined,
      tipo: query.tipo ? String(query.tipo).trim() : undefined,
      source_id: query.source_id ? String(query.source_id).trim() : undefined,
    });
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

const marker = (checked) => (checked ? "&#10005;" : "&nbsp;");
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
    <section class="sheet">
      <div class="header-row">
        <div class="logo-box">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="height:60px;"/>` : ""}</div>
        <div>
          <div class="title">PARTE DIÁRIA DE EQUIPAMENTO</div>
          <div class="subtitle">Atividade principal: ${getActivityName(row.tipo)} | Data executada: ${asDate(reportDate)}</div>
        </div>
      </div>

      <table class="form-table">
        <tr><td>CONTRATADO:</td><td>${escapeHtml(row.contratado || companyName)}</td><td>DATA:</td><td>${asDate(reportDate)}</td></tr>
        <tr><td>OPERADOR:</td><td>${escapeHtml(row.operador || row.motorista)}</td><td>EQUIPAMENTO:</td><td>${escapeHtml(row.equipamento || row.veiculo || "-")}</td></tr>
        <tr><td>MARCA/MODELO:</td><td>${escapeHtml(row.marca_modelo || "-")}</td><td>LOCAL DE OPERAÇÃO:</td><td>${escapeHtml(row.local || "-")}</td></tr>
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
      <table class="form-table">
        <tr><td>Tempo de parada</td><td>${escapeHtml(row.tempo_parado || "-")}</td></tr>
        <tr><td>Outros (checklist)</td><td>${escapeHtml(row.outros_descricao || "-")}</td></tr>
        <tr><td>Observações</td><td class="text-area">${escapeHtml(row.observacoes || "-")}</td></tr>
      </table>

      <h4>PRODUÇÃO</h4>
      <table class="form-table">
        <tr><td class="text-area">${escapeHtml(row.producao || "-")}</td></tr>
      </table>

      <div class="signatures">
        <div>Operador: ________________________________</div>
        <div>Responsável: ________________________________</div>
      </div>
    </section>
  `;
};

const renderCombustivelSheet = (row, companyName, logoUrl) => {
  const reportDate = getEffectiveDateValue(row);
  const weekdayIndex = getWeekdayIndex(reportDate);
  const weekRowsHtml = weekdayRows
    .map((day) => {
      const isRow = weekdayIndex === day.key;
      return `<tr>
        <td>${day.label}</td>
        <td>${isRow ? asDate(reportDate) : ""}</td>
        <td>${isRow ? escapeHtml(row.litros ?? "") : ""}</td>
        <td>${isRow ? escapeHtml(row.tipo_combustivel || "") : ""}</td>
        <td>${isRow ? escapeHtml(row.horimetro ?? "") : ""}</td>
        <td>${isRow ? escapeHtml(row.hodometro ?? "") : ""}</td>
      </tr>`;
    })
    .join("");
  return `
    <section class="sheet">
      <div class="header-row">
        <div class="logo-box">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="height:60px;"/>` : ""}</div>
        <div>
          <div class="title">CONTROLE DE COMBUSTÍVEL SEMANAL</div>
          <div class="subtitle">Atividade principal: ${getActivityName(row.tipo)} | Data executada: ${asDate(reportDate)} (${escapeHtml(asWeekdayName(reportDate))})</div>
        </div>
      </div>
      <table class="form-table">
        <tr><td>MOTORISTA / OPERADOR:</td><td>${escapeHtml(row.motorista || "-")}</td></tr>
        <tr><td>EQUIPAMENTO:</td><td>${escapeHtml(row.veiculo || companyName || "-")}</td></tr>
      </table>
      <table class="grid-table">
        <tr><th>Dia</th><th>Data</th><th>Quantidade (L)</th><th>Combustível</th><th>Horímetro</th><th>Hodômetro</th></tr>
        ${weekRowsHtml}
      </table>
      <div class="signatures">
        <div>Operador: ________________________________</div>
        <div>Responsável: ________________________________</div>
      </div>
    </section>
  `;
};

const renderRomaneioSheet = (row, logoUrl) => `
  <section class="sheet">
    <div class="header-row">
      <div class="logo-box">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="height:60px;"/>` : ""}</div>
      <div>
        <div class="title">CONTROLE DIÁRIO DE TRANSPORTE</div>
        <div class="subtitle">Atividade principal: ${getActivityName(row.tipo)} | Data executada: ${asDate(getEffectiveDateValue(row))}</div>
      </div>
    </div>
    <table class="form-table"><tr><td>DATA:</td><td>${asDate(getEffectiveDateValue(row))}</td></tr></table>
    <table class="grid-table">
      <tr><th>Equipamento</th><th>Placa</th><th>Motorista</th><th>Transporte</th></tr>
      <tr><td>${escapeHtml(row.veiculo || "-")}</td><td>${escapeHtml(row.placa || "-")}</td><td>${escapeHtml(row.motorista || "-")}</td><td>${escapeHtml(row.tipo_transporte || "-")}</td></tr>
      <tr><td colspan="3">Estéril</td><td>${marker((row.tipo_transporte || "").toLowerCase().includes("estéril"))}</td></tr>
      <tr><td colspan="3">Rocha (amarração)</td><td>${marker((row.tipo_transporte || "").toLowerCase().includes("amarração"))}</td></tr>
      <tr><td colspan="3">Rocha (pulmão)</td><td>${marker((row.tipo_transporte || "").toLowerCase().includes("pulmão"))}</td></tr>
      <tr><td colspan="3">Destinação</td><td>${escapeHtml(row.destino || "-")}</td></tr>
    </table>
    <table class="form-table"><tr><td>Observação</td><td>${escapeHtml(row.observacao || "-")}</td></tr></table>
    <p class="legend">Legenda: Site (ST) / Depósito de Rochas (DP) / Vias de Acesso (VA)</p>
    <div class="signatures">
      <div>Apontador: ________________________________</div>
      <div>Responsável: ________________________________</div>
    </div>
  </section>
`;

const buildOfficialHtml = ({ companyName, logoUrl, records }) => {
  const sheets = records
    .map((row) => {
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
          @page { size: A4; margin: 16mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; }
          .sheet { page-break-after: always; }
          .sheet:last-child { page-break-after: auto; }
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
          .text-area { min-height: 38px; }
          .legend { margin: 6px 0; font-size: 11px; }
          .signatures { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          td, th { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        ${sheets || '<section class="sheet"><p>Sem registros para exportação.</p></section>'}
      </body>
    </html>
  `;
};

const buildFallbackPdfBuffer = async ({ companyName, records, logoImage }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 26,
      info: {
        Title: "Relatorio de Registros",
        Author: "FrotaControl",
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

    const drawCells = (y, height, cells, { fontSize = small, bold = false, padding = 4 } = {}) => {
      let x = margin;
      cells.forEach((cell) => {
        const width = cell.width;
        doc.rect(x, y, width, height).lineWidth(0.8).stroke("#000");
        if (cell.imageBuffer) {
          try {
            doc.image(cell.imageBuffer, x + 6, y + 4, { fit: [Math.max(20, width - 12), Math.max(18, height - 8)] });
          } catch {
            // ignora erros de renderizacao de imagem no fallback
          }
        }
        if (cell.text !== undefined && cell.text !== null) {
          doc
            .font(cell.bold || bold ? "Helvetica-Bold" : "Helvetica")
            .fontSize(cell.fontSize || fontSize)
            .text(String(cell.text), x + padding, y + padding, {
              width: width - padding * 2,
              height: height - padding * 2,
              align: cell.align || "left",
              valign: "center",
              lineBreak: true,
            });
        }
        x += width;
      });
      return y + height + rowGap;
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
          { width: logoWidth, imageBuffer: logoImage?.buffer },
          { width: infoWidth, text: `${title}\n${subtitle}`, fontSize: 11, bold: true },
        ],
        { fontSize: 11, bold: true, padding: 6 }
      );
    };

    const drawParteDiaria = (row, startY) => {
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
      y = drawCells(y, 24, [
        { width: col, text: "Outros (detalhes):", bold: true },
        { width: pageWidth - col, text: asDisplayValue(row.outros_descricao) },
      ]);

      y = drawSectionTitle(y, "OCORRENCIAS");
      y = drawCells(y, 24, [
        { width: col, text: "Tempo parado:", bold: true },
        { width: pageWidth - col, text: asDisplayValue(row.tempo_parado) },
      ]);
      y = drawCells(y, 40, [
        { width: col, text: "Observacoes:", bold: true },
        { width: pageWidth - col, text: asDisplayValue(row.observacoes) },
      ]);
      y = drawSectionTitle(y, "PRODUCAO");
      y = drawCells(y, 32, [{ width: pageWidth, text: asDisplayValue(row.producao) }]);
      y = drawCells(y, 26, [
        { width: pageWidth / 2, text: "Operador: ________________________________" },
        { width: pageWidth / 2, text: "Responsavel: ________________________________" },
      ]);
      return y;
    };

    const drawCombustivel = (row, startY) => {
      let y = drawRecordHeader(startY, row, "CONTROLE DE COMBUSTIVEL SEMANAL");
      y = drawCells(y, 28, [
        { width: pageWidth * 0.3, text: "MOTORISTA / OPERADOR:", bold: true },
        { width: pageWidth * 0.7, text: asDisplayValue(row.motorista) },
      ]);
      y = drawCells(y, 28, [
        { width: pageWidth * 0.3, text: "EQUIPAMENTO:", bold: true },
        { width: pageWidth * 0.7, text: asDisplayValue(row.veiculo || companyName) },
      ]);
      const dayW = pageWidth * 0.2;
      const colW = (pageWidth - dayW) / 5;
      y = drawCells(y, 24, [
        { width: dayW, text: "Dia", bold: true, align: "center" },
        { width: colW, text: "Data", bold: true, align: "center" },
        { width: colW, text: "Quantidade (L)", bold: true, align: "center" },
        { width: colW, text: "Combustivel", bold: true, align: "center" },
        { width: colW, text: "Horimetro", bold: true, align: "center" },
        { width: colW, text: "Hodometro", bold: true, align: "center" },
      ]);
      const weekIdx = getWeekdayIndex(getEffectiveDateValue(row));
      weekdayRows.forEach((day) => {
        const selected = day.key === weekIdx;
        y = drawCells(y, 24, [
          { width: dayW, text: day.label },
          { width: colW, text: selected ? asDate(getEffectiveDateValue(row)) : "" },
          { width: colW, text: selected ? asDisplayValue(row.litros) : "" },
          { width: colW, text: selected ? asDisplayValue(row.tipo_combustivel) : "" },
          { width: colW, text: selected ? asDisplayValue(row.horimetro) : "" },
          { width: colW, text: selected ? asDisplayValue(row.hodometro) : "" },
        ]);
      });
      y = drawCells(y, 26, [
        { width: pageWidth / 2, text: "Operador: ________________________________" },
        { width: pageWidth / 2, text: "Responsavel: ________________________________" },
      ]);
      return y;
    };

    const drawRomaneio = (row, startY) => {
      let y = drawRecordHeader(startY, row, "CONTROLE DIARIO DE TRANSPORTE");
      y = drawCells(y, 28, [
        { width: pageWidth * 0.2, text: "DATA:", bold: true },
        { width: pageWidth * 0.8, text: asDate(getEffectiveDateValue(row)) },
      ]);
      const c4 = pageWidth / 4;
      y = drawCells(y, 24, [
        { width: c4, text: "Equipamento", bold: true, align: "center" },
        { width: c4, text: "Placa", bold: true, align: "center" },
        { width: c4, text: "Motorista", bold: true, align: "center" },
        { width: c4, text: "Transporte", bold: true, align: "center" },
      ]);
      y = drawCells(y, 24, [
        { width: c4, text: asDisplayValue(row.veiculo) },
        { width: c4, text: asDisplayValue(row.placa) },
        { width: c4, text: asDisplayValue(row.motorista) },
        { width: c4, text: asDisplayValue(row.tipo_transporte) },
      ]);
      y = drawCells(y, 24, [
        { width: pageWidth * 0.75, text: "Esteril" },
        { width: pageWidth * 0.25, text: String(row.tipo_transporte || "").toLowerCase().includes("estéril") ? "X" : "", align: "center", bold: true },
      ]);
      y = drawCells(y, 24, [
        { width: pageWidth * 0.75, text: "Rocha (amarracao)" },
        { width: pageWidth * 0.25, text: String(row.tipo_transporte || "").toLowerCase().includes("amarração") ? "X" : "", align: "center", bold: true },
      ]);
      y = drawCells(y, 24, [
        { width: pageWidth * 0.75, text: "Rocha (pulmao)" },
        { width: pageWidth * 0.25, text: String(row.tipo_transporte || "").toLowerCase().includes("pulmão") ? "X" : "", align: "center", bold: true },
      ]);
      y = drawCells(y, 24, [
        { width: pageWidth * 0.75, text: "Destinacao", bold: true },
        { width: pageWidth * 0.25, text: asDisplayValue(row.destino) },
      ]);
      y = drawCells(y, 36, [
        { width: pageWidth * 0.2, text: "Observacao", bold: true },
        { width: pageWidth * 0.8, text: asDisplayValue(row.observacao) },
      ]);
      y = drawCells(y, 24, [{ width: pageWidth, text: "Legenda: Site (ST) / Deposito de Rochas (DP) / Vias de Acesso (VA)" }], { fontSize: 8 });
      y = drawCells(y, 26, [
        { width: pageWidth / 2, text: "Apontador: ________________________________" },
        { width: pageWidth / 2, text: "Responsavel: ________________________________" },
      ]);
      return y;
    };

    if (!records.length) {
      drawCells(margin, 28, [{ width: pageWidth, text: `Empresa: ${asDisplayValue(companyName)} | Sem registros para exportacao.` }], {
        fontSize: normal,
      });
      doc.end();
      return;
    }

    records.forEach((row, index) => {
      if (index > 0) doc.addPage();
      const startY = margin;
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

const getColumnLetter = (index) => String.fromCharCode(64 + index);

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
  const reportDate = getEffectiveDateValue(row);
  const worksheet = workbook.addWorksheet(`ParteDiaria-${index + 1}`);
  applyBaseStyle(worksheet);

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

  worksheet.mergeCells(`A${currentRow}:B${currentRow + 2}`);
  worksheet.mergeCells(`C${currentRow}:H${currentRow + 2}`);
  worksheet.getCell(`A${currentRow}`).value = "Observações:";
  worksheet.getCell(`A${currentRow}`).font = { name: "Arial", size: 10, bold: true };
  worksheet.getCell(`C${currentRow}`).value = asDisplayValue(row.observacoes);
  worksheet.getCell(`C${currentRow}`).alignment = { vertical: "top", horizontal: "left", wrapText: true };
  applyBorderAndFont(worksheet, currentRow, currentRow + 2, 1, 8);
  currentRow += 3;

  worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "PRODUÇÃO";
  worksheet.getCell(`A${currentRow}`).font = { name: "Arial", size: 11, bold: true };
  applyBorderAndFont(worksheet, currentRow, currentRow, 1, 8);
  currentRow += 1;

  worksheet.mergeCells(`A${currentRow}:H${currentRow + 1}`);
  worksheet.getCell(`A${currentRow}`).value = asDisplayValue(row.producao);
  worksheet.getCell(`A${currentRow}`).alignment = { vertical: "top", horizontal: "left", wrapText: true };
  applyBorderAndFont(worksheet, currentRow, currentRow + 1, 1, 8);
  currentRow += 3;

  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "Operador: ________________________________";
  worksheet.getCell(`E${currentRow}`).value = "Responsável: ________________________________";
  worksheet.getCell(`A${currentRow}`).alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getCell(`E${currentRow}`).alignment = { vertical: "middle", horizontal: "left" };
  applyBorderAndFont(worksheet, currentRow, currentRow, 1, 8);
};

const addSimpleFormWorksheet = (workbook, row, logoImageId, index) => {
  const reportDate = getEffectiveDateValue(row);
  const kind = row.tipo === "combustivel" ? "Combustivel" : "Romaneio";
  const worksheet = workbook.addWorksheet(`${kind}-${index + 1}`);
  applyBaseStyle(worksheet);

  worksheet.mergeCells("A1:B3");
  worksheet.mergeCells("C1:H3");
  const title =
    row.tipo === "combustivel" ? "CONTROLE DE COMBUSTÍVEL SEMANAL" : "CONTROLE DIÁRIO DE TRANSPORTE";
  worksheet.getCell("C1").value = `${title}\nAtividade principal: ${getActivityName(
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
  }

  putLabelValue(worksheet, 4, "A4:B4", "C4:D4", "DATA:", asDate(reportDate));
  putLabelValue(worksheet, 4, "E4:F4", "G4:H4", "EMISSÃO:", asDateTime(new Date()));
  putLabelValue(worksheet, 5, "A5:B5", "C5:D5", "MOTORISTA:", row.motorista);
  putLabelValue(worksheet, 5, "E5:F5", "G5:H5", "VEÍCULO:", row.veiculo);

  if (row.tipo === "combustivel") {
    worksheet.mergeCells("A6:H6");
    worksheet.getCell("A6").value = "CONTROLE SEMANAL";
    worksheet.getCell("A6").font = { name: "Arial", size: 11, bold: true };
    applyBorderAndFont(worksheet, 6, 6, 1, 8);

    worksheet.getCell("A7").value = "Dia";
    worksheet.mergeCells("B7:C7");
    worksheet.getCell("B7").value = "Data";
    worksheet.getCell("D7").value = "Quantidade (L)";
    worksheet.getCell("E7").value = "Combustível";
    worksheet.getCell("F7").value = "Horímetro";
    worksheet.mergeCells("G7:H7");
    worksheet.getCell("G7").value = "Hodômetro";
    applyBorderAndFont(worksheet, 7, 7, 1, 8);
    ["A7", "B7", "D7", "E7", "F7", "G7"].forEach((addr) => {
      worksheet.getCell(addr).font = { name: "Arial", size: 10, bold: true };
      worksheet.getCell(addr).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    const weekdayIndex = getWeekdayIndex(reportDate);
    let currentRow = 8;
    weekdayRows.forEach((day) => {
      const isRow = weekdayIndex === day.key;
      worksheet.getCell(`A${currentRow}`).value = day.label;
      worksheet.mergeCells(`B${currentRow}:C${currentRow}`);
      worksheet.getCell(`B${currentRow}`).value = isRow ? asDate(reportDate) : "";
      worksheet.getCell(`D${currentRow}`).value = isRow ? asDisplayValue(row.litros) : "";
      worksheet.getCell(`E${currentRow}`).value = isRow ? asDisplayValue(row.tipo_combustivel) : "";
      worksheet.getCell(`F${currentRow}`).value = isRow ? asDisplayValue(row.horimetro) : "";
      worksheet.mergeCells(`G${currentRow}:H${currentRow}`);
      worksheet.getCell(`G${currentRow}`).value = isRow ? asDisplayValue(row.hodometro) : "";
      applyBorderAndFont(worksheet, currentRow, currentRow, 1, 8);
      ["A", "B", "D", "E", "F", "G"].forEach((col) => {
        worksheet.getCell(`${col}${currentRow}`).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });
      currentRow += 1;
    });

    worksheet.mergeCells("A16:D16");
    worksheet.mergeCells("E16:H16");
    worksheet.getCell("A16").value = "Operador: ________________________________";
    worksheet.getCell("E16").value = "Responsável: ________________________________";
    applyBorderAndFont(worksheet, 16, 16, 1, 8);
    return;
  } else {
    putLabelValue(worksheet, 6, "A6:B6", "C6:D6", "TRANSPORTE:", row.tipo_transporte);
    putLabelValue(worksheet, 6, "E6:F6", "G6:H6", "DESTINO:", row.destino);
    worksheet.mergeCells("A7:B7");
    worksheet.mergeCells("C7:H7");
    worksheet.getCell("A7").value = "OBSERVAÇÃO:";
    worksheet.getCell("A7").font = { name: "Arial", size: 10, bold: true };
    worksheet.getCell("C7").value = asDisplayValue(row.observacao);
    worksheet.getCell("C7").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    applyBorderAndFont(worksheet, 7, 7, 1, 8);
  }

  worksheet.mergeCells("A10:D10");
  worksheet.mergeCells("E10:H10");
  worksheet.getCell("A10").value = "Operador: ________________________________";
  worksheet.getCell("E10").value = "Responsável: ________________________________";
  applyBorderAndFont(worksheet, 10, 10, 1, 8);
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
  const company = await getCompanyById(scope.empresa_id);
  const data = (await getData(scope, filters)).items;
  const workbook = new ExcelJS.Workbook();
  const logoAssets = await getLogoAssets(req, company?.logo_url);
  const excelImage = await toExcelCompatibleImage(logoAssets.htmlSrc, logoAssets.excelImage);
  const logoImageId = await loadLogoImage(workbook, excelImage);

  if (!data.length) {
    const empty = workbook.addWorksheet("Sem registros");
    empty.getCell("A1").value = `Sem registros para exportação (${company?.nome || "Empresa"})`;
    empty.getCell("A1").font = { name: "Arial", size: 12, bold: true };
  } else {
    data.forEach((row, index) => {
      if (row.tipo === "parte_diaria") {
        addParteDiariaWorksheet(workbook, row, company?.nome || "Empresa", logoImageId, index);
        return;
      }
      addSimpleFormWorksheet(workbook, row, logoImageId, index);
    });
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
      error: err.message || "Filtros inválidos para exportação.",
      message: err.message || "Filtros inválidos para exportação.",
    });
  }
  const scope = resolveExportScope(req);
  const company = await getCompanyById(scope.empresa_id);
  const data = (await getData(scope, filters)).items;
  const logoAssets = await getLogoAssets(req, company?.logo_url);
  const html = buildOfficialHtml({
    companyName: company?.nome || "Empresa",
    logoUrl: logoAssets.htmlSrc,
    records: data,
  });

  let browser;
  let pdfBuffer;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => {});
    pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      scale: 1,
      margin: {
        top: "10mm",
        right: "10mm",
        bottom: "10mm",
        left: "10mm",
      },
    });
  } catch (error) {
    const fallbackBuffer = await buildFallbackPdfBuffer({
      companyName: company?.nome || "Empresa",
      records: data,
      logoImage: logoAssets.excelImage,
    });
    res.setHeader("X-PDF-Fallback", "1");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=registros.pdf");
    return res.send(fallbackBuffer);
  } finally {
    if (browser) await browser.close();
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=registros.pdf");
  res.send(pdfBuffer);
};

module.exports = {
  exportExcel,
  exportPdf,
};
