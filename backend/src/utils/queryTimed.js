const { pool } = require("../db");

const DEFAULT_TIMEOUT_MS = Math.min(
  15_000,
  Math.max(3000, Number(process.env.PG_QUERY_TIMEOUT_MS || 8000))
);

/**
 * Executa SQL com statement_timeout (PostgreSQL) e log opcional em dev.
 */
async function queryTimed(text, params, { label, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const client = await pool.connect();
  const started = Date.now();
  try {
    await client.query(`SET statement_timeout = ${Math.floor(timeoutMs)}`);
    const result = await client.query(text, params);
    if (label && process.env.NODE_ENV !== "production") {
      const ms = Date.now() - started;
      console.log(`[query] ${label}: ${ms}ms`);
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
    client.release();
  }
}

module.exports = { queryTimed, DEFAULT_TIMEOUT_MS };
