// =============================================================================
// @o/db/client — Postgres connection
// =============================================================================
// Single shared Postgres client. Connection pooling via postgres-js.
// Drizzle ORM on top.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. " +
      "In dev, run `docker compose up -d` and `cp .env.example .env.local`. " +
      "In prod, set it in your platform's env config."
    );
  }

  // Connection pool settings
  const max = parseInt(process.env.DATABASE_POOL_MAX ?? "10");
  const idleTimeout = parseInt(process.env.DATABASE_IDLE_TIMEOUT ?? "20");
  const connectTimeout = parseInt(process.env.DATABASE_CONNECT_TIMEOUT ?? "10");

  _sql = postgres(url, {
    max,
    idle_timeout: idleTimeout,
    connect_timeout: connectTimeout,
    ssl: process.env.DATABASE_SSL === "true" ? "require" : false,
    onnotice: () => {},  // suppress notice-level messages
  });

  _db = drizzle(_sql, { schema, logger: process.env.DATABASE_LOG === "true" });
  return _db;
}

export function getSql() {
  if (!_sql) getDb();
  return _sql!;
}

export async function closeDb() {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
  }
}
