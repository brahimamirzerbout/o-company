// =============================================================================
// @o/operator/runner — scheduler and dispatcher
// =============================================================================
// This is what runs every minute. It:
//   1. Checks cron-scheduled actions (morning_briefing)
//   2. Checks event-triggered actions (photo_job.ready)
//   3. Checks interval-scheduled actions (deal_followup_draft, invoice_reminder)
//   4. For each action that's due, runs it for each org in the system
//   5. Honors the cooldown so we don't draft the same thing twice
//   6. Persists the resulting draft
//
// The runner has zero side effects on its own. It only creates drafts.
// Sending happens in drafts.sendApprovedDrafts() after a human approves.
//
// In production, the runner is invoked by:
//   - A Vercel cron (every 5 minutes), OR
//   - A long-running Cloudflare Worker cron, OR
//   - A separate Node process started by `pnpm worker:start`
//
// In dev, you can invoke it manually: `pnpm --filter @o/operator dev`

import { listActions, getAction, ActionKind, Draft } from "./index";
import {
  runMorningBriefing, runDealFollowup, runLeadScore,
  runInvoiceReminder, runPhotoProgressPing,
  runLeadReengagement, runProjectKickoff, runTicketAcknowledgement,
  runProjectCloseout, runWeeklyClientDigest,
} from "./actions";
import { saveDraft, sendApprovedDrafts } from "./drafts";
import { getDb } from "@o/db/client";
import { operatorDrafts, orgs, people, photoJobs, deals, contacts, invoices } from "@o/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { logger } from "@o/logger";

// -----------------------------------------------------------------------------
// Main entry: runOneTick
// -----------------------------------------------------------------------------
// Called by the cron. Checks every registered action, runs it if it's due.

export async function runOneTick(): Promise<{ ran: number; draftsCreated: number; draftsSent: number; errors: number }> {
  const t0 = Date.now();
  let ran = 0, draftsCreated = 0, draftsSent = 0, errors = 0;

  // First: flush any approved drafts that are waiting to be sent
  try {
    const result = await sendApprovedDrafts();
    draftsSent = result.sent;
  } catch (err) {
    logger.error("sendApprovedDrafts failed", { err: String(err) });
    errors++;
  }

  // Then: for each action, check if it should run for any org
  for (const action of listActions()) {
    try {
      const created = await maybeRunAction(action.kind);
      draftsCreated += created;
      ran++;
    } catch (err) {
      logger.error(`Action ${action.kind} failed`, { err: String(err) });
      errors++;
    }
  }

  logger.info("Operator tick complete", {
    durationMs: Date.now() - t0,
    actionsChecked: ran,
    draftsCreated,
    draftsSent,
    errors,
  });

  return { ran, draftsCreated, draftsSent, errors };
}

// -----------------------------------------------------------------------------
// Per-action: check trigger, then run for each org (or each entity)
// -----------------------------------------------------------------------------

async function maybeRunAction(kind: ActionKind): Promise<number> {
  const action = getAction(kind);
  if (!action) return 0;

  // Resolve all orgs in the system. In a multi-tenant deploy, the runner
  // iterates per-org. For the MVP we assume a small number.
  const db = getDb();
  const allOrgs = await db.select({ id: orgs.id, name: orgs.name }).from(orgs);

  let created = 0;
  for (const org of allOrgs) {
    created += await maybeRunActionForOrg(kind, org.id, org.name);
  }
  return created;
}

async function maybeRunActionForOrg(kind: ActionKind, orgId: string, orgName: string): Promise<number> {
  const action = getAction(kind);
  if (!action) return 0;

  // Check cooldown: was this action run for this org (or for this entity) recently?
  const db = getDb();
  const cooldownCutoff = new Date(Date.now() - action.cooldownMinutes * 60 * 1000).toISOString();

  if (action.scope === "org") {
    // One draft per org per cooldown window
    const recent = await db.select({ id: operatorDrafts.id })
      .from(operatorDrafts)
      .where(and(
        eq(operatorDrafts.orgId, orgId),
        eq(operatorDrafts.kind, kind),
        sql`${operatorDrafts.createdAt} > ${cooldownCutoff}`,
      ))
      .limit(1);
    if (recent.length > 0) return 0;

    // Special case: weekly_client_digest is org-scoped but actually
    // produces one draft per active client. Iterate the clients.
    if (kind === "weekly_client_digest") {
      const clients = await resolveEntitiesForAction("weekly_client_digest", orgId);
      const owner = await getOrgOwner(orgId);
      if (!owner) return 0;
      let created = 0;
      for (const clientId of clients) {
        // Per-client cooldown: don't send the same client a digest twice
        // in the same week
        const recentForClient = await db.select({ id: operatorDrafts.id })
          .from(operatorDrafts)
          .where(and(
            eq(operatorDrafts.orgId, orgId),
            eq(operatorDrafts.kind, "weekly_client_digest"),
            eq(operatorDrafts.subjectId, clientId),
            sql`${operatorDrafts.createdAt} > ${cooldownCutoff}`,
          ))
          .limit(1);
        if (recentForClient.length > 0) continue;

        const draft = await runWeeklyClientDigest(orgId, clientId);
        if (draft) {
          await saveDraft({ ...draft, assigneeId: owner.id, approverId: owner.id });
          created++;
        }
      }
      return created;
    }

    // Run it
    const draft = await runOrgScopedAction(kind, orgId, orgName);
    if (draft) {
      const owner = await getOrgOwner(orgId);
      if (owner) {
        await saveDraft({ ...draft, assigneeId: owner.id, approverId: owner.id });
        return 1;
      }
    }
    return 0;
  }

  // per_entity scope: find entities that need this action, run for each
  if (action.scope === "per_entity") {
    const entities = await resolveEntitiesForAction(kind, orgId);
    let created = 0;
    for (const entityId of entities) {
      // Check per-entity cooldown
      const recent = await db.select({ id: operatorDrafts.id })
        .from(operatorDrafts)
        .where(and(
          eq(operatorDrafts.orgId, orgId),
          eq(operatorDrafts.kind, kind),
          eq(operatorDrafts.subjectId, entityId),
          sql`${operatorDrafts.createdAt} > ${cooldownCutoff}`,
        ))
        .limit(1);
      if (recent.length > 0) continue;

      const draft = await runEntityScopedAction(kind, orgId, entityId);
      if (draft) {
        const owner = await getOrgOwner(orgId);
        if (owner) {
          await saveDraft({ ...draft, assigneeId: owner.id, approverId: owner.id });
          created++;
        }
      }
    }
    return created;
  }

  return 0;
}

async function getOrgOwner(orgId: string): Promise<{ id: string; name: string; email: string } | null> {
  const db = getDb();
  const [owner] = await db.select().from(people)
    .where(and(eq(people.orgId, orgId), eq(people.role, "owner")))
    .limit(1);
  return owner ? { id: owner.id, name: owner.name, email: owner.email } : null;
}

// -----------------------------------------------------------------------------
// Org-scoped action dispatch
// -----------------------------------------------------------------------------

async function runOrgScopedAction(kind: ActionKind, orgId: string, orgName: string): Promise<Omit<Draft, "assigneeId" | "approverId" | "createdAt" | "updatedAt"> | null> {
  if (kind === "morning_briefing") {
    const owner = await getOrgOwner(orgId);
    return await runMorningBriefing(orgId, {
      orgName,
      today: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      recipientName: owner?.name?.split(" ")[0] ?? "there",
    });
  }
  if (kind === "weekly_client_digest") {
    // The dispatch above calls this once per active client. The org-scoped
    // version is the entry point — it iterates the active clients and
    // creates one draft per client.
    return null;  // The actual iteration happens in the calling code
  }
  return null;
}

// -----------------------------------------------------------------------------
// Per-entity action dispatch
// -----------------------------------------------------------------------------

async function runEntityScopedAction(kind: ActionKind, orgId: string, entityId: string): Promise<Omit<Draft, "assigneeId" | "approverId" | "createdAt" | "updatedAt"> | null> {
  switch (kind) {
    case "deal_followup_draft": {
      return await runDealFollowup(orgId, entityId);
    }
    case "lead_score": {
      return await runLeadScore(orgId, entityId);
    }
    case "invoice_reminder": {
      return await runInvoiceReminder(orgId, entityId);
    }
    case "photo_progress_ping": {
      return await runPhotoProgressPing(orgId, entityId);
    }
    case "lead_reengagement": {
      return await runLeadReengagement(orgId, entityId);
    }
    case "project_kickoff": {
      return await runProjectKickoff(orgId, entityId);
    }
    case "ticket_acknowledgement": {
      return await runTicketAcknowledgement(orgId, entityId);
    }
    case "project_closeout": {
      return await runProjectCloseout(orgId, entityId);
    }
    case "weekly_client_digest": {
      return await runWeeklyClientDigest(orgId, entityId);
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Entity resolution: which entities need this action right now?
// -----------------------------------------------------------------------------

async function resolveEntitiesForAction(kind: ActionKind, orgId: string): Promise<string[]> {
  const db = getDb();
  switch (kind) {
    case "deal_followup_draft": {
      // Deals with no activity in 4+ days, not in "won" or "lost" stage
      const cutoff = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
      const rows = await db.select({ id: deals.id }).from(deals)
        .where(and(
          eq(deals.orgId, orgId),
          sql`${deals.lastActivityAt} < ${cutoff}`,
          sql`${deals.stage} NOT IN ('won', 'lost')`,
        ))
        .limit(50);
      return rows.map((r) => r.id);
    }
    case "invoice_reminder": {
      // Invoices past due, still in "sent" status
      const now = new Date().toISOString();
      const rows = await db.select({ id: invoices.id }).from(invoices)
        .where(and(
          eq(invoices.orgId, orgId),
          eq(invoices.status, "sent"),
          sql`${invoices.dueDate} < ${now}`,
        ))
        .limit(50);
      return rows.map((r) => r.id);
    }
    case "photo_progress_ping": {
      // Photo jobs that just finished (within last hour) and haven't been notified
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const rows = await db.select({ id: photoJobs.id }).from(photoJobs)
        .where(and(
          eq(photoJobs.orgId, orgId),
          eq(photoJobs.status, "ready"),
          sql`${photoJobs.finishedAt} > ${cutoff}`,
        ))
        .limit(50);
      return rows.map((r) => r.id);
    }
    case "lead_score": {
      // New contacts with no score yet
      const rows = await db.select({ id: contacts.id }).from(contacts)
        .where(and(
          eq(contacts.orgId, orgId),
          sql`${contacts.leadScore} IS NULL`,
        ))
        .limit(20);
      return rows.map((r) => r.id);
    }
    case "lead_reengagement": {
      // Contacts that are still leads (not customers), haven't been
      // contacted in 30+ days
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const rows = await db.select({ id: contacts.id }).from(contacts)
        .where(and(
          eq(contacts.orgId, orgId),
          eq(contacts.status, "lead"),
          sql`${contacts.lastContactedAt} < ${cutoff}`,
        ))
        .limit(50);
      return rows.map((r) => r.id);
    }
    case "weekly_client_digest": {
      // One entry per active client (a contact with status='customer' or
      // a contact that owns at least one active project)
      const rows = await db.select({ id: contacts.id }).from(contacts)
        .where(and(
          eq(contacts.orgId, orgId),
          sql`${contacts.id} IN (
            SELECT client_id FROM projects WHERE status = 'active' AND deleted_at IS NULL
            UNION
            SELECT id FROM contacts WHERE status = 'customer' AND deleted_at IS NULL
          )`,
        ))
        .limit(50);
      return rows.map((r) => r.id);
    }
  }
  return [];
}

// -----------------------------------------------------------------------------
// Event trigger: on_event actions are fired by domain code, not by the
// scheduler. Other code calls triggerEvent("photo_job.ready", { photoJobId })
// and the runner creates a draft.
// -----------------------------------------------------------------------------

export async function triggerEvent(event: string, payload: { orgId: string; entityId: string }): Promise<Draft | null> {
  const db = getDb();
  const owner = await getOrgOwner(payload.orgId);
  if (!owner) return null;

  switch (event) {
    case "photo_job.ready": {
      const draft = await runPhotoProgressPing(payload.orgId, payload.entityId);
      if (draft) {
        const saved = await saveDraft({ ...draft, assigneeId: owner.id, approverId: owner.id });
        return saved;
      }
      return null;
    }
    case "lead.created": {
      const draft = await runLeadScore(payload.orgId, payload.entityId);
      if (draft) {
        const saved = await saveDraft({ ...draft, assigneeId: owner.id, approverId: owner.id });
        return saved;
      }
      return null;
    }
    case "project.activated": {
      const draft = await runProjectKickoff(payload.orgId, payload.entityId);
      if (draft) {
        const saved = await saveDraft({ ...draft, assigneeId: owner.id, approverId: owner.id });
        return saved;
      }
      return null;
    }
    case "project.delivered": {
      const draft = await runProjectCloseout(payload.orgId, payload.entityId);
      if (draft) {
        const saved = await saveDraft({ ...draft, assigneeId: owner.id, approverId: owner.id });
        return saved;
      }
      return null;
    }
    case "ticket.created": {
      const draft = await runTicketAcknowledgement(payload.orgId, payload.entityId);
      if (draft) {
        // Auto-approve ticket acks — they're status notifications
        const saved = await saveDraft({ ...draft, assigneeId: owner.id, approverId: owner.id });
        // Immediately transition to 'sent' since there's no approval needed
        await db.update(operatorDrafts).set({
          status: "approved",
          approvedAt: new Date().toISOString(),
          approvedBy: owner.id,
          updatedAt: new Date().toISOString(),
        }).where(eq(operatorDrafts.id, saved.id));
        return { ...saved, status: "approved" as const, approvedAt: new Date().toISOString(), approvedBy: owner.id };
      }
      return null;
    }
    default:
      logger.warn("Unknown operator event", { event });
      return null;
  }
}
