/**
 * Contexto multi-tenant: resolução de empresa_id a partir do JWT e, para SUPER_ADMIN, da query/corpo.
 * Única fonte de verdade para isolamento entre empresas nas rotas de dashboard/relatórios.
 */

const SCOPE_ALL_VALUE = "all";

const toPositiveInt = (raw) => {
  if (raw == null || String(raw).trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
};

const toNormalizedText = (raw) => String(raw || "").trim().toLowerCase();

const resolveRequestedEmpresaId = (req) => req.query?.empresa_id ?? req.body?.empresa_id;

const hasRequestedEmpresaId = (req) => {
  const raw = resolveRequestedEmpresaId(req);
  return raw != null && String(raw).trim() !== "";
};

const resolveScopeParam = (req, scopeParamName = "scope") =>
  toNormalizedText(req.query?.[scopeParamName] ?? req.body?.[scopeParamName]);

const buildScopeError = (statusCode, message) => ({
  ok: false,
  statusCode,
  message,
});

/**
 * Resolve escopo de leitura/escrita sensível com regras estritas de autorização:
 * - perfis não SUPER_ADMIN nunca saem da própria empresa;
 * - SUPER_ADMIN só usa global quando explicitamente pedido (scope=all), se permitido;
 * - pode exigir empresa_id ou scope=all para evitar globais acidentais.
 */
const resolveSensitiveTenantScope = (
  req,
  {
    allowSuperAdminGlobal = false,
    requireSuperAdminExplicitScope = false,
    scopeParamName = "scope",
  } = {}
) => {
  const role = String(req.user?.role || "").trim().toUpperCase();
  const userEmpresaId = toPositiveInt(req.user?.empresa_id);
  const empresaIdProvided = hasRequestedEmpresaId(req);
  const requestedEmpresaId = toPositiveInt(resolveRequestedEmpresaId(req));
  const scopeValue = resolveScopeParam(req, scopeParamName);

  if (role !== "SUPER_ADMIN") {
    if (!userEmpresaId) {
      return buildScopeError(403, "Empresa não associada ao usuário autenticado.");
    }
    if (empresaIdProvided && requestedEmpresaId !== userEmpresaId) {
      return buildScopeError(
        403,
        "Não é permitido informar empresa_id diferente da empresa autenticada."
      );
    }
    return {
      ok: true,
      empresa_id: userEmpresaId,
      is_global: false,
      scope: "empresa",
      explicit_global: false,
    };
  }

  if (scopeValue && scopeValue !== SCOPE_ALL_VALUE) {
    return buildScopeError(400, "Escopo inválido. Use scope=all para escopo global.");
  }

  if (empresaIdProvided) {
    if (!requestedEmpresaId) {
      return buildScopeError(400, "empresa_id inválido. Informe um identificador positivo.");
    }
    if (scopeValue === SCOPE_ALL_VALUE) {
      return buildScopeError(
        400,
        "Parâmetros conflitantes: use empresa_id ou scope=all, não ambos."
      );
    }
    return {
      ok: true,
      empresa_id: requestedEmpresaId,
      is_global: false,
      scope: "empresa",
      explicit_global: false,
    };
  }

  if (scopeValue === SCOPE_ALL_VALUE) {
    if (!allowSuperAdminGlobal) {
      return buildScopeError(403, "Escopo global não permitido neste endpoint.");
    }
    return {
      ok: true,
      empresa_id: null,
      is_global: true,
      scope: SCOPE_ALL_VALUE,
      explicit_global: true,
    };
  }

  if (requireSuperAdminExplicitScope) {
    return buildScopeError(
      400,
      "Para SUPER_ADMIN, informe empresa_id ou use scope=all explicitamente."
    );
  }

  return {
    ok: true,
    empresa_id: null,
    is_global: false,
    scope: "indefinido",
    explicit_global: false,
  };
};

const resolveEmpresaScope = (req) => {
  if (req.user?.role !== "SUPER_ADMIN") {
    const ownEmpresaId = toPositiveInt(req.user?.empresa_id);
    if (!ownEmpresaId) return req.user?.empresa_id;
    if (hasRequestedEmpresaId(req)) {
      const requestedEmpresaId = toPositiveInt(resolveRequestedEmpresaId(req));
      if (requestedEmpresaId !== ownEmpresaId) {
        const err = new Error(
          "Não é permitido informar empresa_id diferente da empresa autenticada."
        );
        err.statusCode = 403;
        throw err;
      }
    }
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
    const ownEmpresaId = toPositiveInt(req.user?.empresa_id);
    if (!ownEmpresaId) return req.user?.empresa_id ?? null;
    if (hasRequestedEmpresaId(req)) {
      const requestedEmpresaId = toPositiveInt(resolveRequestedEmpresaId(req));
      if (requestedEmpresaId !== ownEmpresaId) {
        const err = new Error(
          "Não é permitido informar empresa_id diferente da empresa autenticada."
        );
        err.statusCode = 403;
        throw err;
      }
    }
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
  resolveSensitiveTenantScope,
};
