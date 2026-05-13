/**
 * Contexto multi-tenant: resolução de empresa_id a partir do JWT e, para SUPER_ADMIN, da query/corpo.
 * Única fonte de verdade para isolamento entre empresas nas rotas de dashboard/relatórios.
 */

const resolveEmpresaScope = (req) => {
  if (req.user?.role !== "SUPER_ADMIN") {
    return req.user?.empresa_id;
  }
  const fromQuery = req.query?.empresa_id;
  if (fromQuery == null || String(fromQuery).trim() === "") return null;
  const parsed = Number(fromQuery);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Para POST: super admin pode informar empresa_id no corpo ou na query. */
const resolveEmpresaScopeWrite = (req) => {
  if (req.user?.role !== "SUPER_ADMIN") {
    return req.user?.empresa_id ?? null;
  }
  const raw = req.body?.empresa_id ?? req.query?.empresa_id;
  if (raw == null || String(raw).trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

module.exports = {
  resolveEmpresaScope,
  resolveEmpresaScopeWrite,
};
