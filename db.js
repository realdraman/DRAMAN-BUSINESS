const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

function usesTls(connectionString) {
  if (!connectionString) return false;
  const { hostname } = new URL(connectionString);
  return !["localhost", "127.0.0.1", "::1"].includes(hostname);
}

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: usesTls(databaseUrl) ? { rejectUnauthorized: true } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    })
  : null;

if (pool) {
  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error);
  });
}

module.exports = { pool, databaseUrl };
