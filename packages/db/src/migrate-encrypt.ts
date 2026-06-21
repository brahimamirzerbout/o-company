// =============================================================================
// @o/db/migrate-encrypt — encryption migration (one-shot)
// =============================================================================
// This is a one-shot script. It:
//   1. Reads every people.email, contacts.email, contacts.notes row
//   2. Encrypts the values that aren't already encrypted
//   3. Writes them back
//   4. Verifies the decrypt works (round-trip check)
//
// Run ONCE per environment after ENCRYPTION_KEY is set. After this
// runs, all writes go through the encryption helper automatically.
// The schema is unchanged: TEXT columns can hold either plaintext
// (legacy) or base64 ciphertext (post-migration). New writes are
// always encrypted.
//
// Idempotency: this script can be run multiple times. It checks
// isEncrypted() before encrypting; rows that are already encrypted
// are skipped.
//
// Rollback: a corresponding decrypt script is in src/migrate-decrypt.ts.
// That one reads every row, decrypts, and writes plaintext. Use
// it if you need to roll back the migration. The decrypt script
// should be DELETED after a successful migration, or at minimum
// guarded with an env var, because running it in production is a
// data loss.

import { sql, isNotNull } from "drizzle-orm";
import { getDb, closeDb } from "./client";
import { people, contacts } from "./schema";
import { isNull, eq } from "drizzle-orm";
import { encrypt, decrypt, isEncrypted } from "@o/auth";
import { logger } from "@o/logger";

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error("\n❌ ENCRYPTION_KEY is not set. Aborting.\n");
    console.error("   Generate one: openssl rand -hex 32");
    console.error("   See SETUP.md step 4.\n");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_ENCRYPTION_MIGRATION) {
    console.error("\n❌ Running the encryption migration in production requires ALLOW_ENCRYPTION_MIGRATION=1.\n");
    console.error("   This is a one-way operation. The rollback script is in src/migrate-decrypt.ts.\n");
    console.error("   Read the trust model section on data safety before proceeding.\n");
    process.exit(1);
  }

  console.log("\no.company · encryption migration");
  console.log("==================================\n");

  const db = getDb();

  // People: encrypt email
  console.log("• Encrypting people.email...");
  const allPeople = await db.select({ id: people.id, email: people.email })
    .from(people)
    .where(isNotNull(people.email));

  let peopleEncrypted = 0;
  let peopleSkipped = 0;
  for (const p of allPeople) {
    if (!p.email) { peopleSkipped++; continue; }
    if (isEncrypted(p.email)) { peopleSkipped++; continue; }
    const encrypted = encrypt(p.email);
    if (!encrypted) { peopleSkipped++; continue; }
    // Round-trip check
    const roundtrip = decrypt(encrypted);
    if (roundtrip !== p.email) {
      throw new Error(`Round-trip check failed for person ${p.id}: encrypt→decrypt produced different output`);
    }
    await db.update(people).set({ email: encrypted, updatedAt: new Date() }).where(eq(people.id, p.id));
    peopleEncrypted++;
  }
  console.log(`  ✓ ${peopleEncrypted} encrypted, ${peopleSkipped} skipped (already encrypted or null)\n`);

  // Contacts: encrypt email and notes
  console.log("• Encrypting contacts.email...");
  const allContacts = await db.select({ id: contacts.id, email: contacts.email, notes: contacts.notes })
    .from(contacts);

  let contactsEmailEncrypted = 0;
  let contactsEmailSkipped = 0;
  let contactsNotesEncrypted = 0;
  let contactsNotesSkipped = 0;
  for (const c of allContacts) {
    // Email
    if (c.email) {
      if (isEncrypted(c.email)) {
        contactsEmailSkipped++;
      } else {
        const encrypted = encrypt(c.email);
        if (encrypted) {
          const roundtrip = decrypt(encrypted);
          if (roundtrip !== c.email) {
            throw new Error(`Round-trip check failed for contact ${c.id} email`);
          }
          await db.update(contacts).set({ email: encrypted, updatedAt: new Date() }).where(eq(contacts.id, c.id));
          contactsEmailEncrypted++;
        } else {
          contactsEmailSkipped++;
        }
      }
    } else {
      contactsEmailSkipped++;
    }

    // Notes (may be null)
    if (c.notes) {
      if (isEncrypted(c.notes)) {
        contactsNotesSkipped++;
      } else {
        const encrypted = encrypt(c.notes);
        if (encrypted) {
          const roundtrip = decrypt(encrypted);
          if (roundtrip !== c.notes) {
            throw new Error(`Round-trip check failed for contact ${c.id} notes`);
          }
          await db.update(contacts).set({ notes: encrypted, updatedAt: new Date() }).where(eq(contacts.id, c.id));
          contactsNotesEncrypted++;
        } else {
          contactsNotesSkipped++;
        }
      }
    } else {
      contactsNotesSkipped++;
    }
  }
  console.log(`  ✓ ${contactsEmailEncrypted} encrypted, ${contactsEmailSkipped} skipped`);
  console.log(`• Encrypting contacts.notes...`);
  console.log(`  ✓ ${contactsNotesEncrypted} encrypted, ${contactsNotesSkipped} skipped\n`);

  // Sanity check: count rows that look unencrypted
  const unencryptedPeople = (await db.execute(sql`
    SELECT COUNT(*)::int as n FROM people WHERE email IS NOT NULL AND email NOT LIKE 'deleted+%' AND length(email) < 100 AND email !~ '^[A-Za-z0-9+/=]+$'
  `) as unknown as { n: number }[];
  const unencryptedContacts = (await db.execute(sql`
    SELECT COUNT(*)::int as n FROM contacts WHERE email IS NOT NULL AND email NOT LIKE 'deleted+%' AND length(email) < 100 AND email !~ '^[A-Za-z0-9+/=]+$'
  `) as unknown as { n: number }[];

  console.log("Post-migration sanity check:");
  console.log(`  people with plaintext-looking email: ${unencryptedPeople[0]?.n ?? 0}`);
  console.log(`  contacts with plaintext-looking email: ${unencryptedContacts[0]?.n ?? 0}`);
  console.log("");

  if ((unencryptedPeople[0]?.n ?? 0) > 0 || (unencryptedContacts[0]?.n ?? 0) > 0) {
    console.warn("⚠️  Some rows still look like plaintext. These may be:");
    console.warn("   - System accounts (e.g. 'deleted+<id>@anonymized.local' from GDPR)");
    console.warn("   - Test data inserted directly via SQL");
    console.warn("   - Or the encryption didn't run on them. Investigate.\n");
  } else {
    console.log("✓ All rows are encrypted. Migration complete.\n");
  }

  console.log("==================================");
  console.log("Migration summary:");
  console.log(`  people.email:       ${peopleEncrypted} encrypted, ${peopleSkipped} skipped`);
  console.log(`  contacts.email:     ${contactsEmailEncrypted} encrypted, ${contactsEmailSkipped} skipped`);
  console.log(`  contacts.notes:     ${contactsNotesEncrypted} encrypted, ${contactsNotesSkipped} skipped`);
  console.log("==================================\n");

  console.log("Next steps:");
  console.log("  1. Verify the audit log shows no data-quality complaints");
  console.log("  2. Spot-check a few rows: psql -c \"SELECT email FROM people LIMIT 5\"");
  console.log("  3. The app continues to work — new writes are encrypted automatically");
  console.log("  4. If you need to roll back: src/migrate-decrypt.ts (DELETE this file after a successful migration)\n");

  logger.info("encryption.migration_complete", {
    people: peopleEncrypted,
    contactsEmail: contactsEmailEncrypted,
    contactsNotes: contactsNotesEncrypted,
    skipped: peopleSkipped + contactsEmailSkipped + contactsNotesSkipped,
  });

  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n❌ Migration failed:", err);
  console.error("\nDO NOT RE-RUN. The migration is not transactional. Some rows may be encrypted, some may not. Investigate manually before doing anything else.\n");
  await closeDb();
  process.exit(1);
});
