const { loadEnvOptional } = require("./loadEnvOptional");
loadEnvOptional();

console.log("DATABASE_URL existe?", !!process.env.DATABASE_URL);
console.log("JWT_SECRET existe?", !!process.env.JWT_SECRET);

const { app } = require("./app");
const { initDb } = require("./db");
const { seedIfEmpty, ensureSuperAdminSeed } = require("./seed");
const { logError, logInfo } = require("./services/loggerService");
const { runAuthStartupDiagnostic } = require("./services/authDiagnosticService");
const { runUserNameStartupDiagnostic } = require("./services/userNameDiagnosticService");

const PORT = process.env.PORT || 4000;

const start = async () => {
  const requiredEnv = ["DATABASE_URL", "JWT_SECRET"];
  const missing = requiredEnv.filter((key) => !String(process.env[key] || "").trim());
  if (missing.length) {
    throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(", ")}`);
  }
  await initDb();
  await ensureSuperAdminSeed();
  if (process.env.NODE_ENV !== "production") {
    await seedIfEmpty();
  }
  await runAuthStartupDiagnostic();
  await runUserNameStartupDiagnostic();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    logInfo("server:start", { port: PORT, node_env: process.env.NODE_ENV || "development" });
  });
};

start().catch((err) => {
  logError("server:startup-error", { message: err.message, stack: err.stack });
  console.error(
    JSON.stringify({
      level: "error",
      message: "server:startup-error",
      meta: {
        error: err.message,
        code: err.code,
        detail: err.detail,
        constraint: err.constraint,
        table: err.table,
      },
    })
  );
  process.exit(1);
});
