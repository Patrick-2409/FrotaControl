/**
 * Aplica o schema completo (mesmo conteúdo de initDb em src/db.js) e encerra.
 * Uso com banco remoto (ex.: Render): defina DATABASE_URL em process.env (sem precisar de arquivo .env).
 *
 * Exemplos (PowerShell):
 *   $env:DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"; npm run db:init
 *
 * Exemplos (bash):
 *   DATABASE_URL="postgresql://..." NODE_ENV=production npm run db:init
 */
const path = require("path");
const { loadEnvOptional } = require("../src/loadEnvOptional");
loadEnvOptional(path.join(__dirname, ".."));

const { initDb, pool } = require("../src/db");

(async () => {
  console.log("DATABASE_URL existe?", !!process.env.DATABASE_URL);
  if (!String(process.env.DATABASE_URL || "").trim()) {
    console.error("Erro: defina DATABASE_URL (connection string do PostgreSQL).");
    process.exit(1);
  }
  try {
    await initDb();
    console.log("OK: estrutura do banco aplicada (idempotente — seguro repetir).");
    process.exitCode = 0;
  } catch (err) {
    console.error("Falha ao aplicar schema:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
