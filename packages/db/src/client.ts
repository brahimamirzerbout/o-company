// =============================================================================
// o.company · Postgres client
// =============================================================================
// A single Drizzle client used by every app in the monorepo. The connection
// pool is per-process; in serverless contexts (Vercel) this is fine because
// each lambda is short-lived. For long-running services, tune the pool size
// via DATABASE_POOL_SIZE.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function getClient() {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false, // better for pgbouncer / serverless
  });
  return _client;
}

export function getDb() {
  if (_db) return _db;
  _db = drizzle(getClient(), { schema });
  return _db;
}

export { schema };
export type Db = ReturnType<typeof getDb>;
