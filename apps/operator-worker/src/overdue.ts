// =============================================================================
// Invoice overdue flippper
// =============================================================================
// Cron: every 15 minutes, find invoices that are still "sent" but past
// their due date, and flip them to "overdue".
//
// Why this exists: the operator's invoice reminder action counts
// invoices where status='sent' AND due_date < now. If we never flip
// the status, the front-end shows them as normal pending invoices.
// The operator only drafts reminders for invoices that are already
// flagged "overdue" in the DB. So this cron is a prerequisite for
// the operator's invoice_reminder action to work.

import { getDb } from "@o/db/client";
import { invoices } from "@o/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { logger } from "@o/logger";

export async function flipOverdueInvoices(): Promise<{ flipped: number }> {
  const db = getDb();
  const now = new Date();

  // We do the UPDATE with a WHERE that includes "not already overdue"
  // to make this idempotent. Calling this every 5 minutes will not
  // double-flip anything.
  const result = await db.update(invoices)
    .set({ status: "overdue" })
    .where(and(
      eq(invoices.status, "sent"),
      lt(invoices.dueDate, now.toISOString().slice(0, 10)),
    ))
    .returning({ id: invoices.id });

  if (result.length > 0) {
    logger.info("invoices.overdue_flipped", { count: result.length });
  }
  return { flipped: result.length };
}
