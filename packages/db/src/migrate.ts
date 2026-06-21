// =============================================================================
// @o/db · migrations runner
// =============================================================================
// Runs the SQL schema in src/schema.sql against the database. Idempotent.
// Tracks applied migrations in a `__migrations` table. Use:
//   pnpm --filter @o/db migrate         # apply pending
//   pnpm --filter @o/db reset           # drop everything, re-apply
//   pnpm --filter @o/db migrate --force  # re-apply from scratch (dev only)

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("\n❌ DATABASE_URL is not set.\n");
  console.error("   In dev, run `docker compose up -d` and `cp .env.example .env.local`.");
  console.error("   In prod, set DATABASE_URL in your environment.\n");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, ssl: process.env.DATABASE_SSL === "true" ? "require" : false });

const args = process.argv.slice(2);
const isReset = args.includes("--reset");
const isForce = args.includes("--force");

async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS __migrations (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum    TEXT NOT NULL
    )
  `;
}

async function getAppliedMigrations(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`SELECT name FROM __migrations ORDER BY id ASC`;
  return rows.map((r) => r.name);
}

async function dropEverything() {
  console.log("⚠️  Dropping everything...");
  // Drop all tables in the public schema
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`GRANT ALL ON SCHEMA public TO public`;
  console.log("✓ Schema dropped and recreated.\n");
}

async function applyMigrations() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  // Find the schema file
  const candidates = [
    join(process.cwd(), "src/schema.sql"),
    join(process.cwd(), "packages/db/src/schema.sql"),
  ];
  let schemaPath: string | null = null;
  for (const p of candidates) {
    if (existsSync(p)) { schemaPath = p; break; }
  }
  if (!schemaPath) {
    console.error("❌ Could not find src/schema.sql");
    process.exit(1);
  }

  const schema = readFileSync(schemaPath, "utf-8");

  // Each migration is a "name" + the SQL. We split on `-- === NAME: xxx ===` lines.
  const migrationRegex = /-- === NAME: ([^\s]+) ===\n([\s\S]*?)(?=(?:-- === NAME: )|$)/g;
  const migrations: { name: string; sql: string }[] = [];
  let match;
  while ((match = migrationRegex.exec(schema)) !== null) {
    migrations.push({ name: match[1], sql: match[2].trim() });
  }

  if (migrations.length === 0) {
    console.error("❌ No migrations found in schema.sql");
    console.error("   Each migration should start with: -- === NAME: 001_initial ===");
    process.exit(1);
  }

  let count = 0;
  for (const m of migrations) {
    if (applied.includes(m.name) && !isForce) {
      console.log(`  ${m.name}  (already applied)`);
      continue;
    }
    console.log(`  ${m.name}  (applying...)`);
    try {
      // Postgres restriction: statements like ALTER TYPE ... ADD VALUE
      // can't run inside a transaction block. We split any migration
      // that contains them: the non-ALTER statements run in a transaction,
      // the ALTER statements run outside one.
      const hasAlterType = /\bALTER\s+TYPE\b/i.test(m.sql);
      if (hasAlterType) {
        // Split on ALTER TYPE ... ; boundaries
        const parts = m.sql.split(/;\s*(?=ALTER\s+TYPE\b)/i);
        // First chunk: everything up to the first ALTER TYPE
        const before = parts[0].trim();
        const alterChunks = parts.slice(1).map((p) => p.trim().endsWith(";") ? p.trim() : p.trim() + ";");
        if (before) {
          await sql.begin(async (tx) => {
            await tx.unsafe(before);
          });
        }
        for (const alter of alterChunks) {
          await sql.unsafe(alter);
        }
        // Record the migration outside the transaction
        await sql.begin(async (tx) => {
          await tx`INSERT INTO __migrations (name, checksum) VALUES (${m.name}, ${"sha256:" + Buffer.from(m.sql).toString("base64").slice(0, 32)})`;
        });
      } else {
        await sql.begin(async (tx) => {
          await tx.unsafe(m.sql);
          await tx`INSERT INTO __migrations (name, checksum) VALUES (${m.name}, ${"sha256:" + Buffer.from(m.sql).toString("base64").slice(0, 32)})`;
        });
      }
      console.log(`  ${m.name}  ✓`);
      count++;
    } catch (err) {
      console.error(`\n❌ Migration ${m.name} failed: ${err}\n`);
      process.exit(1);
    }
  }
  console.log(`\n✓ ${count} migration${count === 1 ? "" : "s"} applied. (${migrations.length} total)\n`);
}

async function main() {
  console.log("o.company · database migrations");
  console.log("=================================\n");
  if (isReset) {
    await dropEverything();
  }
  await applyMigrations();
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
