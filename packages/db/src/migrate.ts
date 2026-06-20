import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getClient, getDb } from "./client";

// Standalone migration runner. Run with: `pnpm --filter @o/db migrate`
// In CI: `pnpm db:migrate` (after build).
async function main() {
  const client = getClient();
  const db = getDb();
  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Done.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
