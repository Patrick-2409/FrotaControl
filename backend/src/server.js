require("dotenv").config();
const { app } = require("./app");
const { initDb } = require("./db");
const { seedIfEmpty } = require("./seed");
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
  process.exit(1);
});
