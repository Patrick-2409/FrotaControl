const { z } = require("zod");
const ExcelJS = require("exceljs");
const fs = require("fs/promises");
const path = require("path");
const fleetModel = require("../models/fleetModel");
const { listVehicles } = require("../models/vehicleModel");
const { getCompanyById } = require("../models/companyModel");
const { csvEscape } = require("../utils/registrosCsv");

const resolveEmpresaId = (req) => {
  if (req.user?.role === "SUPER_ADMIN") {
    const id = Number(req.query.empresa_id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  const id = req.user?.empresa_id;
  return id ? Number(id) : null;
};

const REPORT_TIMEZONE = "America/Sao_Paulo";

const getBaseUrl = (req) => {
  const configured = (process.env.PUBLIC_BASE_URL || process.env.BACKEND_PUBLIC_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (configured) return configured;
  const rawProto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const proto = String(rawProto).split(",")[0].trim();
  const rawHost = req.headers["x-forwarded-host"] || req.get("host");
  const host = rawHost ? String(rawHost).split(",")[0].trim() : "";
  return host ? `${proto}://${host}` : `http://127.0.0.1:${process.env.PORT || 4000}`;
};

const normalizeLogoUrl = (req, logoUrl) => {
  if (!logoUrl) return "";
  const raw = String(logoUrl).trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  try {
    return new URL(raw, getBaseUrl(req)).toString();
  } catch {
    return "";
  }
};

const imageExtensionFrom = (url, contentType = "") => {
  const lowerType = String(contentType || "").toLowerCase();
  const lowerUrl = String(url || "").toLowerCase();
  if (lowerType.includes("jpeg") || lowerType.includes("jpg") || lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) {
    return "jpeg";
  }
  if (lowerType.includes("png") || lowerUrl.endsWith(".png")) return "png";
  return "";
};

const resolveUploadsPath = (logoUrl) => {
  if (!logoUrl) return null;
  let pathname = String(logoUrl).trim();
  try {
    if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname;
  } catch {
    return null;
  }
  const clean = pathname.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!clean.startsWith("uploads/")) return null;
  const uploadsRoot = path.resolve(__dirname, "../../uploads");
  const localPath = path.resolve(__dirname, "../../", clean);
  return localPath.startsWith(uploadsRoot) ? localPath : null;
};

const loadLogoForExcel = async (req, logoUrl) => {
  if (!logoUrl) return null;
  const localPath = resolveUploadsPath(logoUrl);
  if (localPath) {
    try {
      const buffer = await fs.readFile(localPath);
      const ext = path.extname(localPath).replace(".", "").toLowerCase();
      const extension = ext === "jpg" ? "jpeg" : ext;
      if (extension === "png" || extension === "jpeg") return { buffer, extension };
    } catch {
      // tenta por URL abaixo
    }
  }

  const absoluteUrl = normalizeLogoUrl(req, logoUrl);
  if (!absoluteUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(absoluteUrl, { signal: controller.signal });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    const extension = imageExtensionFrom(absoluteUrl, contentType);
    if (!extension) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, extension };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const asDisplayDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: REPORT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const asDisplayDateTime = (value = new Date()) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: REPORT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));

const statusLabel = (value) => {
  const map = {
    ativo: "Ativo",
    operacao: "Em operação",
    manutencao: "Manutenção",
    indisponivel: "Indisponível",
    parado: "Parado",
  };
  return map[String(value || "").trim()] || value || "";
};

const codigoLabel = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n).padStart(2, "0") : "";
};

const codigoOperacionalLabel = (vehicle) => {
  const code = codigoLabel(vehicle?.codigo_operacional);
  if (!code) return "";
  return `${vehicle?.usa_para_transporte ? "#" : "A"}${code}`;
};

const numberOrBlank = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
};

const materialLabel = (vehicle) => {
  const parts = [];
  const transportaRochaPulmao =
    vehicle?.transporta_rocha_pulmao != null
      ? Boolean(vehicle.transporta_rocha_pulmao)
      : Boolean(vehicle?.transporta_rocha);
  const transportaRochaArmacao =
    vehicle?.transporta_rocha_armacao != null
      ? Boolean(vehicle.transporta_rocha_armacao)
      : Boolean(vehicle?.transporta_rocha);
  if (vehicle?.transporta_esteril) {
    const cap = numberOrBlank(vehicle.capacidade_esteril_ton ?? vehicle.capacidade_ton);
    parts.push(`Estéril${cap !== "" ? ` (${cap} t)` : ""}`);
  }
  if (transportaRochaPulmao) {
    const cap = numberOrBlank(
      vehicle.capacidade_rocha_pulmao_ton ?? vehicle.capacidade_rocha_ton ?? vehicle.capacidade_ton
    );
    parts.push(`Rocha Pulmão${cap !== "" ? ` (${cap} t)` : ""}`);
  }
  if (transportaRochaArmacao) {
    const cap = numberOrBlank(
      vehicle.capacidade_rocha_armacao_ton ?? vehicle.capacidade_rocha_ton ?? vehicle.capacidade_ton
    );
    parts.push(`Rocha Amarração${cap !== "" ? ` (${cap} t)` : ""}`);
  }
  return parts.length ? parts.join(" / ") : "Não configurado";
};

const motoristasLabel = (vehicle) => {
  const linked = Array.isArray(vehicle?.motoristas_vinculados) ? vehicle.motoristas_vinculados : [];
  if (linked.length) {
    return linked.map((m) => `${m.nome || "Motorista"}${m.is_principal ? " (principal)" : ""}`).join(", ");
  }
  return vehicle?.motorista_nome || "";
};

const buildFilterSummary = ({ search, status_operacional, tipo }) => {
  const parts = [];
  if (search) parts.push(`Busca: ${search}`);
  if (status_operacional) parts.push(`Status: ${statusLabel(status_operacional)}`);
  if (tipo) parts.push(`Tipo: ${tipo}`);
  return parts.length ? parts.join(" | ") : "Todos os veículos";
};

const EXPORT_VEHICLES_LIMIT = 5000;

const loadVehiclesForExport = async (empresaId, filters) => {
  const pageSize = 500;
  const items = [];
  let total = 0;
  for (let page = 1; items.length < EXPORT_VEHICLES_LIMIT; page += 1) {
    const result = await listVehicles(empresaId, {
      ...filters,
      page,
      limit: pageSize,
    });
    total = Number(result.total || 0);
    const batch = Array.isArray(result.items) ? result.items : [];
    items.push(...batch);
    if (batch.length === 0 || items.length >= total) break;
  }
  return {
    items: items.slice(0, EXPORT_VEHICLES_LIMIT),
    total,
    truncated: total > EXPORT_VEHICLES_LIMIT,
  };
};

const styleMergedTitleCell = (cell) => {
  cell.font = { name: "Arial", size: 18, bold: true, color: { argb: "FF0F172A" } };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
};

const addFleetSummarySheet = (workbook, { company, summary, filters, logoImageId }) => {
  const ws = workbook.addWorksheet("Resumo");
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  ws.columns = [
    { width: 18 },
    { width: 24 },
    { width: 18 },
    { width: 24 },
    { width: 18 },
    { width: 24 },
  ];
  ws.mergeCells("A1:B4");
  ws.mergeCells("C1:F2");
  ws.mergeCells("C3:F3");
  ws.mergeCells("C4:F4");
  ws.getCell("A1").border = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };
  ws.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
  if (logoImageId !== null && logoImageId !== undefined) {
    ws.addImage(logoImageId, { tl: { col: 0.25, row: 0.3 }, ext: { width: 155, height: 70 } });
  } else {
    ws.getCell("A1").value = company?.nome || "Empresa";
    ws.getCell("A1").font = { name: "Arial", size: 14, bold: true, color: { argb: "FF1E3A8A" } };
  }
  ws.getCell("C1").value = "Relação de veículos da frota";
  styleMergedTitleCell(ws.getCell("C1"));
  ws.getCell("C3").value = company?.nome || "Empresa";
  ws.getCell("C3").font = { name: "Arial", size: 12, bold: true, color: { argb: "FF334155" } };
  ws.getCell("C4").value = `Emitido em ${asDisplayDateTime()} | ${buildFilterSummary(filters)}`;
  ws.getCell("C4").font = { name: "Arial", size: 10, color: { argb: "FF64748B" } };

  const cards = [
    ["Total de veículos", summary.total],
    ["Transporte", summary.transporte],
    ["Apoio", summary.apoio],
    ["Ativos/operação", summary.ativos],
    ["Manutenção", summary.manutencao],
    ["Sem motorista", summary.semMotorista],
  ];
  let row = 6;
  for (let i = 0; i < cards.length; i += 2) {
    const left = cards[i];
    const right = cards[i + 1];
    ws.getCell(`A${row}`).value = left[0];
    ws.getCell(`B${row}`).value = left[1];
    ws.getCell(`D${row}`).value = right[0];
    ws.getCell(`E${row}`).value = right[1];
    for (const addr of [`A${row}`, `D${row}`]) {
      ws.getCell(addr).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF475569" } };
      ws.getCell(addr).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    }
    for (const addr of [`B${row}`, `E${row}`]) {
      ws.getCell(addr).font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } };
      ws.getCell(addr).alignment = { horizontal: "right" };
    }
    row += 2;
  }

  ws.mergeCells("A14:F14");
  ws.getCell("A14").value =
    "Esta planilha usa os dados reais cadastrados no módulo Frota e respeita o escopo da empresa autenticada.";
  ws.getCell("A14").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF64748B" } };
};

const addFleetVehiclesSheet = (workbook, { vehicles }) => {
  const ws = workbook.addWorksheet("Veículos");
  ws.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1 };
  const columns = [
    ["ID apontador", "codigo"],
    ["Placa", "placa"],
    ["Veículo", "nome"],
    ["Motorista(s)", "motoristas"],
    ["Operação", "operacao"],
    ["Materiais autorizados", "materiais"],
    ["Cap. estéril (t)", "capacidade_esteril_ton"],
    ["Cap. rocha pulmão (t)", "capacidade_rocha_pulmao_ton"],
    ["Cap. rocha amarração (t)", "capacidade_rocha_armacao_ton"],
    ["Status", "status"],
    ["Tipo", "tipo"],
    ["Categoria", "categoria"],
    ["Marca", "marca"],
    ["Modelo", "modelo"],
    ["Ano", "ano"],
    ["Combustível", "combustivel_principal"],
    ["Cap. tanque (L)", "capacidade_litros"],
    ["Horímetro", "horimetro_atual"],
    ["Hodômetro", "hodometro_atual"],
    ["RENAVAM", "renavam"],
    ["Chassi", "chassi"],
    ["Revisão/doc.", "doc_revisao_validade"],
    ["Licenciamento", "doc_licenciamento_validade"],
    ["Seguro", "doc_seguro_validade"],
    ["Inspeção", "doc_inspecao_validade"],
    ["Manutenção até", "manutencao_agendar_ate"],
    ["Criado em", "created_at"],
  ];
  ws.columns = columns.map(([header]) => ({ header, width: Math.min(34, Math.max(12, header.length + 5)) }));
  ws.getRow(1).height = 28;
  ws.getRow(1).eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF334155" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      bottom: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });
  vehicles.forEach((vehicle) => {
    ws.addRow([
      codigoOperacionalLabel(vehicle),
      vehicle.placa || "",
      vehicle.nome || "",
      motoristasLabel(vehicle),
      vehicle.usa_para_transporte ? "Transporte" : "Apoio",
      materialLabel(vehicle),
      numberOrBlank(vehicle.capacidade_esteril_ton),
      numberOrBlank(vehicle.capacidade_rocha_pulmao_ton ?? vehicle.capacidade_rocha_ton),
      numberOrBlank(vehicle.capacidade_rocha_armacao_ton ?? vehicle.capacidade_rocha_ton),
      statusLabel(vehicle.status_operacional),
      vehicle.tipo || "",
      vehicle.categoria || "",
      vehicle.marca || "",
      vehicle.modelo || "",
      numberOrBlank(vehicle.ano),
      vehicle.combustivel_principal || "",
      numberOrBlank(vehicle.capacidade_litros),
      numberOrBlank(vehicle.horimetro_atual),
      numberOrBlank(vehicle.hodometro_atual),
      vehicle.renavam || "",
      vehicle.chassi || "",
      asDisplayDate(vehicle.doc_revisao_validade),
      asDisplayDate(vehicle.doc_licenciamento_validade),
      asDisplayDate(vehicle.doc_seguro_validade),
      asDisplayDate(vehicle.doc_inspecao_validade),
      asDisplayDate(vehicle.manutencao_agendar_ate),
      asDisplayDate(vehicle.created_at),
    ]);
  });
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, vehicles.length + 1), column: columns.length },
  };
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 24;
    row.eachCell((cell) => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF111827" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
    });
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }
  });
  [7, 8, 9, 17, 18, 19].forEach((col) => {
    ws.getColumn(col).numFmt = '#,##0.00';
  });
  ws.getColumn(1).alignment = { horizontal: "center" };
};

const maintenanceSchema = z.object({
  tipo: z.enum(["preventiva", "corretiva"]),
  titulo: z.string().trim().min(2).max(200),
  descricao: z.string().trim().max(4000).optional().nullable(),
  custo: z.coerce.number().nonnegative().optional().nullable(),
  data_servico: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  odometro_snapshot: z.coerce.number().nonnegative().optional().nullable(),
});

const getSummary = async (req, res) => {
  const empresaId = resolveEmpresaId(req);
  if (!empresaId) {
    return res.status(400).json({ success: false, error: "empresa_id é obrigatório" });
  }
  const t0 = Date.now();
  try {
    const summary = await fleetModel.getFleetSummary(empresaId);
    if (process.env.NODE_ENV !== "production") {
      const ms = Date.now() - t0;
      if (ms > 800) console.warn(`[getFleetSummary] empresa=${empresaId} ${ms}ms`);
    }
    return res.json({
      success: true,
      summary,
      future_telemetry: {
        status: "planned",
        channels: ["gps", "telemetria", "rastreamento", "sensores"],
        doc: "FC_FLEET_TELEMETRY",
      },
    });
  } catch {
    return res.json({
      success: true,
      summary: fleetModel.EMPTY_FLEET_SUMMARY(),
      degraded: true,
      future_telemetry: {
        status: "planned",
        channels: ["gps", "telemetria", "rastreamento", "sensores"],
        doc: "FC_FLEET_TELEMETRY",
      },
    });
  }
};

const getMaintenance = async (req, res) => {
  const empresaId = resolveEmpresaId(req);
  const veiculoId = Number(req.params.veiculoId);
  if (!empresaId || !Number.isFinite(veiculoId)) {
    return res.status(400).json({ success: false, error: "Pedido inválido." });
  }
  const ok = await fleetModel.assertVehicleOwned(empresaId, veiculoId);
  if (!ok) return res.status(404).json({ success: false, error: "Veículo não encontrado." });
  const items = await fleetModel.listMaintenance(empresaId, veiculoId, {
    limit: Number(req.query.limit || 80),
  });
  return res.json({ success: true, items });
};

const postMaintenance = async (req, res) => {
  const empresaId = resolveEmpresaId(req);
  const veiculoId = Number(req.params.veiculoId);
  if (!empresaId || !Number.isFinite(veiculoId)) {
    return res.status(400).json({ success: false, error: "Pedido inválido." });
  }
  const ok = await fleetModel.assertVehicleOwned(empresaId, veiculoId);
  if (!ok) return res.status(404).json({ success: false, error: "Veículo não encontrado." });
  const body = maintenanceSchema.parse(req.body);
  const row = await fleetModel.createMaintenance(empresaId, veiculoId, body);
  return res.status(201).json({ success: true, item: row });
};

const removeMaintenance = async (req, res) => {
  const empresaId = resolveEmpresaId(req);
  const id = Number(req.params.id);
  if (!empresaId || !Number.isFinite(id)) {
    return res.status(400).json({ success: false, error: "Pedido inválido." });
  }
  const removed = await fleetModel.deleteMaintenance(empresaId, id);
  if (!removed) return res.status(404).json({ success: false, error: "Registo não encontrado." });
  return res.status(204).send();
};

const exportVehiclesCsv = async (req, res) => {
  const empresaId = resolveEmpresaId(req);
  if (!empresaId) {
    return res.status(400).json({ success: false, error: "empresa_id é obrigatório" });
  }
  const search = String(req.query.search || "");
  const status_operacional = String(req.query.status_operacional || "").trim();
  const tipo = String(req.query.tipo || "").trim();
  const { items } = await loadVehiclesForExport(empresaId, {
    search,
    status_operacional,
    tipo,
  });
  const headers = [
    "codigo_operacional",
    "id",
    "nome",
    "placa",
    "status_operacional",
    "tipo",
    "categoria",
    "marca",
    "modelo",
    "ano",
    "combustivel_principal",
    "capacidade_ton",
    "capacidade_esteril_ton",
    "capacidade_rocha_ton",
    "capacidade_rocha_pulmao_ton",
    "capacidade_rocha_armacao_ton",
    "transporta_esteril",
    "transporta_rocha",
    "transporta_rocha_pulmao",
    "transporta_rocha_armacao",
    "capacidade_litros",
    "usa_para_transporte",
    "motorista_nome",
    "doc_revisao_validade",
    "doc_licenciamento_validade",
    "doc_seguro_validade",
    "doc_inspecao_validade",
    "manutencao_agendar_ate",
  ];
  const pick = (row, k) => {
    if (k === "codigo_operacional") return codigoOperacionalLabel(row) || "";
    const v = row[k];
    if (v == null) return "";
    if (typeof v === "boolean") return v ? "1" : "0";
    return String(v);
  };
  const lines = [
    "\ufeff" + headers.map((h) => csvEscape(h)).join(","),
    ...items.map((row) => headers.map((h) => csvEscape(pick(row, h))).join(",")),
  ];
  const body = lines.join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="frota_veiculos.csv"');
  return res.send(body);
};

const exportVehiclesXlsx = async (req, res) => {
  const empresaId = resolveEmpresaId(req);
  if (!empresaId) {
    return res.status(400).json({ success: false, error: "empresa_id é obrigatório" });
  }
  const search = String(req.query.search || "").trim();
  const status_operacional = String(req.query.status_operacional || "").trim();
  const tipo = String(req.query.tipo || "").trim();
  const { items, total, truncated } = await loadVehiclesForExport(empresaId, {
    search,
    status_operacional,
    tipo,
  });
  const company = await getCompanyById(empresaId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FrotaMax";
  workbook.lastModifiedBy = "FrotaMax";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties = {
    title: "Relação de veículos da frota",
    subject: company?.nome || "Frota",
    company: company?.nome || "FrotaMax",
  };

  const logo = await loadLogoForExcel(req, company?.logo_url);
  let logoImageId = null;
  if (logo) {
    try {
      logoImageId = workbook.addImage(logo);
    } catch {
      logoImageId = null;
    }
  }
  const summary = {
    total: total || items.length,
    transporte: items.filter((v) => v.usa_para_transporte).length,
    apoio: items.filter((v) => !v.usa_para_transporte).length,
    ativos: items.filter((v) => v.status_operacional === "ativo" || v.status_operacional === "operacao").length,
    manutencao: items.filter((v) => v.status_operacional === "manutencao").length,
    semMotorista: items.filter((v) => !motoristasLabel(v)).length,
  };

  addFleetSummarySheet(workbook, {
    company,
    summary: truncated ? { ...summary, total: `${summary.total} (primeiros ${items.length})` } : summary,
    filters: { search, status_operacional, tipo },
    logoImageId,
  });
  addFleetVehiclesSheet(workbook, { vehicles: items });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="frota_veiculos.xlsx"');
  await workbook.xlsx.write(res);
  return res.end();
};

module.exports = {
  getSummary,
  getMaintenance,
  postMaintenance,
  removeMaintenance,
  exportVehiclesCsv,
  exportVehiclesXlsx,
};
