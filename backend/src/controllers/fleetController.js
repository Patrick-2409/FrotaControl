const { z } = require("zod");
const fleetModel = require("../models/fleetModel");
const { listVehicles } = require("../models/vehicleModel");
const { csvEscape } = require("../utils/registrosCsv");

const resolveEmpresaId = (req) => {
  if (req.user?.role === "SUPER_ADMIN") {
    const id = Number(req.query.empresa_id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  const id = req.user?.empresa_id;
  return id ? Number(id) : null;
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
  const summary = await fleetModel.getFleetSummary(empresaId);
  return res.json({
    success: true,
    summary,
    future_telemetry: {
      status: "planned",
      channels: ["gps", "telemetria", "rastreamento", "sensores"],
      doc: "FC_FLEET_TELEMETRY",
    },
  });
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
  const { items } = await listVehicles(empresaId, {
    page: 1,
    limit: Math.min(1000, Math.max(1, Number(req.query.limit || 800))),
    search,
    status_operacional,
    tipo,
  });
  const headers = [
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

module.exports = {
  getSummary,
  getMaintenance,
  postMaintenance,
  removeMaintenance,
  exportVehiclesCsv,
};
