const { pool } = require("../db");
const { logError, logInfo } = require("./loggerService");

const runAuthStartupDiagnostic = async () => {
  const duplicateAdminEmail = await pool.query(
    `SELECT LOWER(COALESCE(email, '')) AS credential, role, COUNT(*)::int AS total, ARRAY_AGG(id ORDER BY id) AS ids
     FROM usuarios
     WHERE role IN ('ADMIN_EMPRESA', 'SUPER_ADMIN')
     GROUP BY LOWER(COALESCE(email, '')), role
     HAVING COUNT(*) > 1`
  );

  const duplicateMotoristaCpf = await pool.query(
    `SELECT empresa_id, cpf_id AS credential, role, COUNT(*)::int AS total, ARRAY_AGG(id ORDER BY id) AS ids
     FROM usuarios
     WHERE role = 'MOTORISTA'
     GROUP BY empresa_id, cpf_id, role
     HAVING COUNT(*) > 1`
  );

  const invalidPasswordHash = await pool.query(
    `SELECT id, role, email, cpf_id
     FROM usuarios
     WHERE senha_hash IS NULL OR senha_hash !~ '^\\$2[aby]\\$'`
  );

  const issues = [
    ...duplicateAdminEmail.rows.map((row) => ({ tipo: "admin_email_duplicado", ...row })),
    ...duplicateMotoristaCpf.rows.map((row) => ({ tipo: "motorista_cpf_duplicado", ...row })),
    ...invalidPasswordHash.rows.map((row) => ({ tipo: "hash_invalido", ...row })),
  ];

  if (issues.length) {
    logError("auth:startup-diagnostic-failed", { total: issues.length, issues });
    const strictMode = String(process.env.AUTH_DIAGNOSTIC_STRICT || "").toLowerCase() === "true";
    if (strictMode) {
      throw new Error("Falha no diagnóstico de autenticação. Corrija duplicidades/credenciais inválidas.");
    }
    return { ok: false, total: issues.length, issues };
  }

  logInfo("auth:startup-diagnostic-ok", { total: 0 });
  return { ok: true, total: 0, issues: [] };
};

module.exports = {
  runAuthStartupDiagnostic,
};
