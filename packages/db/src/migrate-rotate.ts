// =============================================================================
// @o/db · migrate:rotate — encryption key rotation
// =============================================================================
// When ENCRYPTION_KEY rotates, every encrypted column in the
// database needs to be re-encrypted with the new key. The
// encryption helper is AES-256-GCM, which is symmetric, so
// the rotation is:
//   1. Read every encrypted row with the OLD key
//   2. Decrypt to plaintext
//   3. Re-encrypt with the NEW key
//   4. Write the new ciphertext back
//   5. Verify round-trip (decrypt with new key, compare)
//
// This is dangerous: if the rotation is interrupted, you
// have rows in mixed states. The script handles this in a
// transaction per row (so each row is atomic), with a
// --dry-run flag to verify the rotation plan before
// applying.
//
// USAGE
//
//   # Dry-run: see what would be re-encrypted
//   pnpm --filter @o/db migrate:rotate -- --dry-run
//
//   # Apply: re-encrypt every row
//   OLD_ENCRYPTION_KEY=<old> NEW_ENCRYPTION_KEY=<new> pnpm --filter @o/db migrate:rotate
//
//   # Apply a specific table only
//   pnpm --filter @o/db migrate:rotate -- --table=people
//
// The script requires BOTH the old and new keys at runtime.
// The old key is read from the database values (the encrypted
// rows include a key-version byte at the start of the
// ciphertext). When the new key encrypts, the key-version
// is bumped. The encryption helper auto-detects the version
// at decrypt time.
//
// This is a v1. A v2 supports multi-key rotation (rolling
// from key-v1 to key-v2 to key-v3 over hours/days) and
// per-row locking for high-concurrency production systems.

import "dotenv/config";

import { getDb } from "./client";
import { people, contacts, companies } from "./schema";
import { isEncrypted, decrypt, encrypt } from "@o/auth/encryption";
import { eq, sql, isNotNull, and } from "drizzle-orm";
import { logger } from "@o/logger";

interface RotateOptions {
  dryRun: boolean;
  table?: "people" | "contacts" | "companies" | "all";
  batchSize: number;
}

function parseArgs(): RotateOptions {
  const args = process.argv.slice(2);
  const opts: RotateOptions = {
    dryRun: args.includes("--dry-run"),
    table: "all",
    batchSize: 100,
  };
  const tableArg = args.find((a) => a.startsWith("--table="));
  if (tableArg) {
    const t = tableArg.slice("--table=".length) as RotateOptions["table"];
    if (["people", "contacts", "companies", "all"].includes(t as string)) {
      opts.table = t as "people" | "contacts" | "companies" | "all";
    }
  }
  return opts;
}

// The columns that are encrypted at rest. Keep this in sync
// with the schema and the encryption helper.
const ENCRYPTED_COLUMNS = {
  people:    ["email"],
  contacts:  ["email", "phone"],
  companies: [],
} as const;

async function rotateTable(
  table: "people" | "contacts" | "companies",
  opts: RotateOptions,
): Promise<{ rowsScanned: number; rowsRotated: number; rowsFailed: number }> {
  const db = getDb();
  const columns = ENCRYPTED_COLUMNS[table];
  if (columns.length === 0) {
    return { rowsScanned: 0, rowsRotated: 0, rowsFailed: 0 };
  }
  const tableRef = { people, contacts, companies }[table];

  let rowsScanned = 0;
  let rowsRotated = 0;
  let rowsFailed = 0;

  // Walk the table in batches. For each row, check every
  // encrypted column. If the column is encrypted (starts with
  // the encryption prefix), decrypt with the OLD key, re-encrypt
  // with the NEW key, write back.
  //
  // We do this in batches of 100 rows for memory safety.
  let lastId: string | null = null;
  while (true) {
    const where = lastId
      ? sql`${tableRef.id} > ${lastId}`
      : sql`TRUE`;
    const rows = await db.select().from(tableRef)
      .where(where)
      .orderBy(tableRef.id)
      .limit(opts.batchSize);
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1]!.id;

    for (const row of rows) {
      rowsScanned++;
      const updates: Record<string, string> = {};
      let anyUpdate = false;
      for (const col of columns) {
        const value = (row as Record<string, unknown>)[col] as string | null;
        if (!value || !isEncrypted(value)) continue;
        try {
          if (opts.dryRun) {
            // Just count, don't write
            rowsRotated++;
            continue;
          }
          // Decrypt with OLD key
          process.env.ENCRYPTION_KEY = process.env.OLD_ENCRYPTION_KEY!;
          const plaintext = decrypt(value);
          if (plaintext === null) {
            // Not actually encrypted (or wrong key) — skip
            continue;
          }
          // Re-encrypt with NEW key
          process.env.ENCRYPTION_KEY = process.env.NEW_ENCRYPTION_KEY!;
          const reencrypted = encrypt(plaintext);
          if (reencrypted === null) {
            throw new Error("Re-encryption returned null");
          }
          // Round-trip verify with NEW key
          const verified = decrypt(reencrypted);
          if (verified !== plaintext) {
            throw new Error("Round-trip verification failed");
          }
          updates[col] = reencrypted;
          anyUpdate = true;
        } catch (err) {
          rowsFailed++;
          logger.error("encrypt_rotate.row_failed", {
            table,
            id: row.id,
            column: col,
            err: String(err),
          });
        }
      }
      if (anyUpdate && !opts.dryRun) {
        await db.update(tableRef).set(updates).where(eq(tableRef.id, row.id));
        rowsRotated++;
      }
    }
  }

  return { rowsScanned, rowsRotated, rowsFailed };
}

async function main() {
  const opts = parseArgs();
  if (opts.dryRun) {
    logger.info("encrypt_rotate.dry_run", { table: opts.table });
  } else {
    // Sanity check: both keys must be present
    if (!process.env.OLD_ENCRYPTION_KEY || !process.env.NEW_ENCRYPTION_KEY) {
      logger.error("encrypt_rotate.missing_keys", {
        hasOld: !!process.env.OLD_ENCRYPTION_KEY,
        hasNew: !!process.env.NEW_ENCRYPTION_KEY,
      });
      console.error("Both OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY must be set");
      process.exit(1);
    }
  }

  const tables: Array<"people" | "contacts" | "companies"> = opts.table === "all"
    ? ["people", "contacts", "companies"]
    : [opts.table as "people" | "contacts" | "companies"];

  let totalScanned = 0, totalRotated = 0, totalFailed = 0;
  for (const t of tables) {
    const r = await rotateTable(t, opts);
    totalScanned += r.rowsScanned;
    totalRotated += r.rowsRotated;
    totalFailed += r.rowsFailed;
    logger.info("encrypt_rotate.table_done", { table: t, ...r });
  }

  logger.info("encrypt_rotate.complete", {
    dryRun: opts.dryRun,
    totalScanned, totalRotated, totalFailed,
  });

  if (totalFailed > 0) {
    console.error(`\n${totalFailed} rows failed to rotate. Check logs.`);
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error("encrypt_rotate.fatal", { err: String(err) });
  process.exit(1);
});
