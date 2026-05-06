const { pool } = require("../db");
const { logError, logInfo } = require("./loggerService");

const hasFullName = (value) => {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  return normalized.split(" ").filter(Boolean).length >= 2;
};

const isGenericName = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.startsWith("motorista ") ||
    normalized.startsWith("admin ") ||
    normalized.startsWith("administrador ") ||
    normalized.includes("teste")
  );
};

const runUserNameStartupDiagnostic = async () => {
  const result = await pool.query(
    `SELECT id, nome, email, cpf_id, role, empresa_id
     FROM usuarios
     WHERE role IN ('MOTORISTA', 'ADMIN_EMPRESA', 'SUPER_ADMIN')`
  );

  const invalidUsers = result.rows
    .filter((row) => !hasFullName(row.nome) || isGenericName(row.nome))
    .map((row) => ({
      ...row,
      motivo: !hasFullName(row.nome) ? "nome_incompleto" : "nome_generico",
    }));
  if (!invalidUsers.length) {
    logInfo("user-name:startup-diagnostic-ok", { total: 0 });
    return { ok: true, total: 0, users: [] };
  }

  logError("user-name:startup-diagnostic-failed", {
    total: invalidUsers.length,
    users: invalidUsers,
  });
  const strictMode = String(process.env.USER_NAME_DIAGNOSTIC_STRICT || "").toLowerCase() === "true";
  if (strictMode) {
    throw new Error("Falha no diagnóstico de nomes completos. Corrija os cadastros de usuários.");
  }
  return { ok: false, total: invalidUsers.length, users: invalidUsers };
};

module.exports = {
  runUserNameStartupDiagnostic,
};
