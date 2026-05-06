const fs = require("fs");
const path = require("path");

const defaultRoot = path.join(__dirname, "..");

/**
 * Carrega `.env` do diretório do backend apenas se o arquivo existir.
 * Em produção (Render, etc.) as variáveis vêm só de `process.env` — nada é obrigatório aqui.
 */
function loadEnvOptional(rootDir = defaultRoot) {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  try {
    require("dotenv").config({ path: envPath });
  } catch {
    // dotenv ausente ou falha ao ler: segue apenas com process.env
  }
}

module.exports = { loadEnvOptional };
