/**
 * Controller administrativo de EXECUÇÕES do módulo de Automações (Bloco 9,
 * Seção 41) — hoje só a distribuição por e-mail de um documento já
 * APROVADO. Mesmo padrão de `automationConfigController.js`: sempre
 * tenant-scoped via `resolveEmpresaScope`, nenhuma lógica de escopo própria.
 *
 * Este endpoint NUNCA é um "override" de aprovação (Seção 42) — quem decide
 * se pode enviar é sempre `documentDistributionService.distributeApprovedDocument`,
 * que exige uma aprovação explícita e consistente independente de quem
 * chamou (ADMIN_EMPRESA ou SUPER_ADMIN não pulam nenhuma checagem).
 *
 * Os clients de Drive/e-mail usados aqui são os de PRODUÇÃO
 * (`storage/productionClients.js`) — seguros de construir mesmo sem
 * credencial real configurada (só falham dentro de uma chamada de verdade,
 * nunca ao serem criados); nenhum teste deste bloco exercita este
 * controller com credenciais reais.
 */

const { pool } = require("../../../db");
const { resolveEmpresaScope } = require("../../../domain/tenantContext");
const { distributeApprovedDocument, getDistributionStatusForEmpresa } = require("../distribution/documentDistributionService");
const { createDefaultGoogleDriveClient, createDefaultAutomationEmailClient } = require("../storage/productionClients");

const NOT_FOUND = {
  success: false,
  error: "Execução não encontrada.",
  message: "Execução não encontrada para esta empresa.",
};

const distributeExecution = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const automacaoExecucaoId = Number(req.params.id);

  const result = await distributeApprovedDocument({
    pool,
    empresaId,
    automacaoExecucaoId,
    emailClient: createDefaultAutomationEmailClient(),
    driveClient: createDefaultGoogleDriveClient(),
  });

  if (result.outcome === "NOT_FOUND") {
    return res.status(404).json(NOT_FOUND);
  }
  return res.json({ success: true, data: result });
};

const getDistributionStatus = async (req, res) => {
  const empresaId = resolveEmpresaScope(req);
  const automacaoExecucaoId = Number(req.params.id);

  const status = await getDistributionStatusForEmpresa(pool, { empresaId, automacaoExecucaoId });
  if (!status) {
    return res.status(404).json(NOT_FOUND);
  }
  return res.json({ success: true, data: status });
};

module.exports = { distributeExecution, getDistributionStatus };
