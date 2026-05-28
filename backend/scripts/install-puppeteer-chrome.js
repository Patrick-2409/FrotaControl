const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), ".cache", "puppeteer");
const chromeDir = path.join(cacheDir, "chrome");

const runInstall = () =>
  spawnSync("npx", ["puppeteer", "browsers", "install", "chrome"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

const removeChromeCache = () => {
  try {
    fs.rmSync(chromeDir, { recursive: true, force: true });
    console.log(`[postinstall] cache Chromium limpo: ${chromeDir}`);
  } catch (error) {
    console.warn("[postinstall] falha ao limpar cache Chromium:", error?.message || error);
  }
};

const firstTry = runInstall();
if (firstTry.status === 0) {
  process.exit(0);
}

console.warn("[postinstall] instalação inicial do Chrome falhou. Tentando limpar cache e repetir...");
removeChromeCache();
const secondTry = runInstall();

if (secondTry.status !== 0) {
  process.exit(secondTry.status || 1);
}

process.exit(0);
