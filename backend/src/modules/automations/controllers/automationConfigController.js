/**
 * Controller administrativo do módulo de Automações (Bloco 2).
 *
 * Segue o padrão já usado no restante do FrotaMax: controllers são funções
 * `async (req, res)` puras, erros são lançados (ZodError, erros com `.status`)
 * e capturados pelo `asyncHandler` + `errorMiddleware` na camada de rota — não
 * há try/catch aqui além dos casos que precisam de uma resposta específica.
 *
 * Isolamento multiempresa: SEMPRE via `resolveEmpresaScope`/
 * `resolveEmpresaScopeWrite` de `domain/tenantContext.js` — nenhuma lógica de
 * escopo própria é reimplementada neste módulo.
 */

const { resolveEmpresaScope, resolveEmpresaScopeWrite } = require("../../../domain/tenantContext");
const { listActiveCatalog } = require("../models/automationCatalogModel");
const configModel = require("../models/automationConfigModel");
const approverModel = require("../models/automationApproverModel");
const recipientModel = require("../models/automationRecipientModel");
const {
  automationConfigCreateSchema,
  automationConfigUpdateSchema,
  automationConfigStatusSchema,
  automationApproverSchema,
  automationApproverUpdateSchema,
  automationRecipientSchema,
  automationRecipientUpdateSchema,
} = require("../validators/automationValidators");

const NOT_FOUND = {
  success: false,
  error: "Configuração não encontrada.",
  message: "Configuração de automação não encontrada para esta empresa.",
};

const EMPRESA_REQUIRED = {
  success: false,
  error: "empresa_id é obrigatório.",
  message: "Informe empresa_id (super admin) ou use uma conta de administrador de empresa.",
};

/** Carrega a config já validando posse do tenant; responde 404 e retorna null se não achar/pertencer. */
const loadOwnedConfigOrRespond = async (req, res, empresaId) => {
  const configId = Number(req.params.id);
  const config = await configModel.getConfigById(configId, empresaId);
  if (!config) {
    res.status(404).json(NOT_FOUND);
    return null;
  }
  return config;
};

// ------------------------------------------------------------- catálogo

const getCatalog = async (req, res) => {
  const items = await listActiveCatalog();
  return res.json({ success: true, data: items });
};

// -------------------------------------------------------------- configs

const listConfigs = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const items = await configModel.listConfigsByEmpresa(empresaId);
  return res.json({ success: true, data: items });
};

const getConfig = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const config = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!config) return;
  const [aprovadores, destinatarios] = await Promise.all([
    approverModel.listApprovers(config.id),
    recipientModel.listRecipients(config.id),
  ]);
  return res.json({ success: true, data: { ...config, aprovadores, destinatarios } });
};

const automationConfigCreatePayloadSchema = automationConfigCreateSchema.omit({ empresa_id: true });

const createConfig = async (req, res) => {
  // resolveEmpresaScopeWrite já rejeita (403) usuário não-SUPER_ADMIN tentando
  // informar empresa_id diferente da própria; para SUPER_ADMIN, lê do body/query.
  const empresaId = resolveEmpresaScopeWrite(req);
  if (!empresaId) {
    return res.status(400).json(EMPRESA_REQUIRED);
  }
  const parsed = automationConfigCreatePayloadSchema.parse(req.body || {});
  const config = await configModel.createConfig({ ...parsed, empresa_id: empresaId });
  return res.status(201).json({ success: true, data: config });
};

const updateConfig = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const existing = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!existing) return;
  const parsed = automationConfigUpdateSchema.parse(req.body || {});
  const updated = await configModel.updateConfig(existing.id, empresaId, parsed);
  return res.json({ success: true, data: updated });
};

const updateConfigStatus = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const existing = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!existing) return;
  const { ativo } = automationConfigStatusSchema.parse(req.body || {});
  const updated = await configModel.updateConfigStatus(existing.id, empresaId, ativo);
  return res.json({ success: true, data: updated });
};

const deleteConfig = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const existing = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!existing) return;
  await configModel.softDeleteConfig(existing.id, empresaId);
  return res.status(204).send();
};

// ----------------------------------------------------------- aprovadores

const listApprovers = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const config = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!config) return;
  const items = await approverModel.listApprovers(config.id);
  return res.json({ success: true, data: items });
};

const createApprover = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const config = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!config) return;
  const parsed = automationApproverSchema.parse(req.body || {});
  const approver = await approverModel.createApprover(config.id, config.empresa_id, parsed);
  return res.status(201).json({ success: true, data: approver });
};

const updateApprover = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const config = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!config) return;
  const parsed = automationApproverUpdateSchema.parse(req.body || {});
  const approver = await approverModel.updateApprover(Number(req.params.approverId), config.id, parsed);
  if (!approver) {
    return res.status(404).json({ success: false, error: "Aprovador não encontrado.", message: "Aprovador não encontrado nesta configuração." });
  }
  return res.json({ success: true, data: approver });
};

const deleteApprover = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const config = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!config) return;
  const removed = await approverModel.deleteApprover(Number(req.params.approverId), config.id);
  if (!removed) {
    return res.status(404).json({ success: false, error: "Aprovador não encontrado.", message: "Aprovador não encontrado nesta configuração." });
  }
  return res.status(204).send();
};

// ---------------------------------------------------------- destinatários

const listRecipients = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const config = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!config) return;
  const items = await recipientModel.listRecipients(config.id);
  return res.json({ success: true, data: items });
};

const createRecipient = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const config = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!config) return;
  const parsed = automationRecipientSchema.parse(req.body || {});
  const recipient = await recipientModel.createRecipient(config.id, config.empresa_id, parsed);
  return res.status(201).json({ success: true, data: recipient });
};

const updateRecipient = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const config = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!config) return;
  const parsed = automationRecipientUpdateSchema.parse(req.body || {});
  const recipient = await recipientModel.updateRecipient(Number(req.params.recipientId), config.id, parsed);
  if (!recipient) {
    return res.status(404).json({ success: false, error: "Destinatário não encontrado.", message: "Destinatário não encontrado nesta configuração." });
  }
  return res.json({ success: true, data: recipient });
};

const deleteRecipient = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const config = await loadOwnedConfigOrRespond(req, res, empresaId);
  if (!config) return;
  const removed = await recipientModel.deleteRecipient(Number(req.params.recipientId), config.id);
  if (!removed) {
    return res.status(404).json({ success: false, error: "Destinatário não encontrado.", message: "Destinatário não encontrado nesta configuração." });
  }
  return res.status(204).send();
};

module.exports = {
  getCatalog,
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  updateConfigStatus,
  deleteConfig,
  listApprovers,
  createApprover,
  updateApprover,
  deleteApprover,
  listRecipients,
  createRecipient,
  updateRecipient,
  deleteRecipient,
};
