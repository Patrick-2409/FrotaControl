const { pool } = require("../db");

const DEFAULT_TIMEOUT_MS = Math.min(
  15_000,
  Math.max(3000, Number(process.env.PG_QUERY_TIMEOUT_MS || 8000))
);

/**
 * Executa SQL via pool.query (sem pool.connect por consulta) com timeout em JS.
 * Evita esgotar o pool quando várias rotas disparam queries em paralelo.
 */
async function queryTimed(text, params, { label, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const started = Date.now();
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error("A consulta excedeu o tempo limite. Tente novamente.");
      err.code = "QUERY_TIMEOUT";
      err.status = 503;
      reject(err);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([pool.query(text, params), timeoutPromise]);
    if (label && process.env.NODE_ENV !== "production") {
      console.log(`[query] ${label}: ${Date.now() - started}ms`);
    }
    return result;
  } catch (e) {
    if (e.code === "57014") {
      const err = new Error("A consulta excedeu o tempo limite. Tente novamente.");
      err.code = "QUERY_TIMEOUT";
      err.status = 503;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { queryTimed, DEFAULT_TIMEOUT_MS };
