// =============================================================================
// @o/operator/drafts — persistence + approval
// =============================================================================
// All draft reads and writes go through this module. Actions produce Drafts,
// this module saves them. The human reviews them. Approval transitions
// trigger the side effect (send email, score lead, etc).
//
// Why a separate module: actions should be testable in isolation. They take
// a DB handle, return a Draft, and don't care how it gets stored or sent.

import { eq, and, desc, isNull, lte, inArray, sql } from "drizzle-orm";
import { getDb } from "@o/db/client";
import { operatorDrafts, people, contacts, deals, invoices, photoJobs, projects } from "@o/db/schema";
import { Draft, DraftStatus, ActionKind } from "./index";
import { logger } from "@o/logger";
import { errors, AppError } from "@o/errors";
import { sendEmail } from "@o/email";
import {
  MorningBriefingEmail, DealFollowupEmail, InvoiceReminderEmail, PhotoReadyEmail,
  LeadReengagementEmail, ProjectKickoffEmail, ProjectCloseoutEmail, WeeklyClientDigestEmail,
} from "@o/email/templates";
import { render } from "@react-email/render";

// -----------------------------------------------------------------------------
// Save a freshly-drafted draft
// -----------------------------------------------------------------------------

export interface SaveDraftInput extends Omit<Draft, "createdAt" | "updatedAt"> {}

export async function saveDraft(input: SaveDraftInput): Promise<Draft> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.insert(operatorDrafts).values({
    id: input.id,
    orgId: input.orgId,
    kind: input.kind,
    channel: input.channel,
    status: input.status,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    assigneeId: input.assigneeId,
    approverId: input.approverId,
    title: input.title,
    body: input.body,
    context: input.context,
    reasoning: input.reasoning,
    modelUsed: input.modelUsed,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    costUsd: input.costUsd,
    approvedAt: input.approvedAt,
    approvedBy: input.approvedBy,
    editedBody: input.editedBody,
    sentAt: input.sentAt,
    sendError: input.sendError,
    feedbackScore: input.feedbackScore,
    feedbackNote: input.feedbackNote,
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt,
  });

  return { ...input, createdAt: now, updatedAt: now };
}

// -----------------------------------------------------------------------------
// List drafts (for the human review UI)
// -----------------------------------------------------------------------------

export interface ListDraftsOptions {
  orgId: string;
  assigneeId?: string;
  status?: DraftStatus | DraftStatus[];
  kinds?: ActionKind[];
  limit?: number;
}

export async function listDrafts(opts: ListDraftsOptions): Promise<Draft[]> {
  const db = getDb();
  const conditions = [eq(operatorDrafts.orgId, opts.orgId)];

  if (opts.assigneeId) conditions.push(eq(operatorDrafts.assigneeId, opts.assigneeId));
  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    conditions.push(inArray(operatorDrafts.status, statuses));
  }
  if (opts.kinds) conditions.push(inArray(operatorDrafts.kind, opts.kinds));

  const rows = await db.select().from(operatorDrafts)
    .where(and(...conditions))
    .orderBy(desc(operatorDrafts.createdAt))
    .limit(opts.limit ?? 50);

  return rows as Draft[];
}

export async function getDraft(orgId: string, draftId: string): Promise<Draft | null> {
  const db = getDb();
  const [row] = await db.select().from(operatorDrafts)
    .where(and(eq(operatorDrafts.orgId, orgId), eq(operatorDrafts.id, draftId)))
    .limit(1);
  return (row as Draft) ?? null;
}

// -----------------------------------------------------------------------------
// Approve / edit / reject
// -----------------------------------------------------------------------------

export interface ApproveOptions {
  orgId: string;
  draftId: string;
  approverId: string;
  editedBody?: string;
  feedbackNote?: string;
}

export async function approveDraft(opts: ApproveOptions): Promise<Draft> {
  const db = getDb();
  const draft = await getDraft(opts.orgId, opts.draftId);
  if (!draft) throw errors.notFound("Draft");
  if (draft.status !== "pending") {
    throw new AppError("VALIDATION", `Draft is already ${draft.status}`, 409);
  }

  const finalBody = opts.editedBody ?? draft.body;
  const finalStatus: DraftStatus = opts.editedBody ? "edited" : "approved";
  const now = new Date().toISOString();

  await db.update(operatorDrafts).set({
    status: finalStatus,
    approvedAt: now,
    approvedBy: opts.approverId,
    editedBody: opts.editedBody ?? null,
    feedbackNote: opts.feedbackNote ?? null,
    updatedAt: now,
  }).where(eq(operatorDrafts.id, opts.draftId));

  // Record the decision in the learning loop. This is what makes the
  // next similar draft better: the model sees this as a few-shot example.
  await recordLearningDecision({
    orgId: opts.orgId,
    draft,
    decision: opts.editedBody ? "edited" : "approved",
    finalBody,
    reason: opts.feedbackNote ?? null,
  });

  return { ...draft, status: finalStatus, body: finalBody, editedBody: opts.editedBody ?? null, approvedAt: now, approvedBy: opts.approverId, updatedAt: now };
}

export async function rejectDraft(opts: { orgId: string; draftId: string; approverId: string; reason: string }): Promise<Draft> {
  const db = getDb();
  const draft = await getDraft(opts.orgId, opts.draftId);
  if (!draft) throw errors.notFound("Draft");
  if (draft.status !== "pending") {
    throw new AppError("VALIDATION", `Draft is already ${draft.status}`, 409);
  }
  const now = new Date().toISOString();
  await db.update(operatorDrafts).set({
    status: "rejected",
    approvedAt: now,
    approvedBy: opts.approverId,
    feedbackScore: -1,
    feedbackNote: opts.reason,
    updatedAt: now,
  }).where(eq(operatorDrafts.id, opts.draftId));

  // Record the rejection. The model will see this as "don't do what
  // the original draft did" the next time a similar draft is made.
  await recordLearningDecision({
    orgId: opts.orgId,
    draft,
    decision: "rejected",
    finalBody: draft.body,  // the rejected body — the model should learn to NOT do this
    reason: opts.reason,
  });

  return { ...draft, status: "rejected", feedbackScore: -1, feedbackNote: opts.reason, approvedAt: now, approvedBy: opts.approverId, updatedAt: now };
}

async function recordLearningDecision(args: {
  orgId: string;
  draft: Draft;
  decision: "approved" | "rejected" | "edited";
  finalBody: string;
  reason: string | null;
}): Promise<void> {
  try {
    const db = getDb();
    const { operatorFeedback } = await import("@o/db/schema");
    const { hashDraftContext } = await import("./learning");
    const contextHash = hashDraftContext(args.draft.kind, args.draft.subjectType, args.draft.context);
    await db.insert(operatorFeedback).values({
      id: randomUUID(),
      orgId: args.orgId,
      draftId: args.draft.id,
      kind: args.draft.kind,
      decision: args.decision,
      originalBody: args.draft.body,
      finalBody: args.finalBody,
      reason: args.reason,
      // Store the context hash in the promptEmbedding field. It's not an
      // embedding, but the column is the right shape for a "prompt
      // similarity key" and we don't need a migration.
      promptEmbedding: [contextHash.length, contextHash.split("").reduce((a, c) => a + c.charCodeAt(0), 0)] as unknown as number[] | null,
      decidedAt: new Date(),
    });
  } catch (err) {
    // Learning-loop failures are never fatal. The draft is approved
    // either way. We just don't get the few-shot benefit next time.
    logger.warn("learning.record_failed", { draftId: args.draft.id, err: String(err) });
  }
}

// -----------------------------------------------------------------------------
// Send approved drafts
// -----------------------------------------------------------------------------
// Called by the runner on a schedule, or immediately after approval. Looks
// for drafts in "approved" or "edited" status, executes the side effect,
// marks them "sent" or "failed".
//
// "Send" means different things per channel:
//   email    → actually send via Resend
//   in_app   → mark as sent (the user will see it next time they open the app)
//   score    → apply the score to the contact record
//   route    → assign the lead to the suggested owner
//   task     → create a task assigned to a person
//   sms      → send via Twilio (not implemented in this scaffold)

export async function sendApprovedDrafts(): Promise<{ sent: number; failed: number; skipped: number }> {
  const db = getDb();
  const now = new Date().toISOString();
  let sent = 0, failed = 0, skipped = 0;

  // Pull all approved/edited drafts whose body is final
  const queue = await db.select().from(operatorDrafts)
    .where(inArray(operatorDrafts.status, ["approved", "edited"]))
    .limit(100);

  for (const draft of queue as Draft[]) {
    try {
      await executeDraftEffect(draft);
      await db.update(operatorDrafts).set({
        status: "sent",
        sentAt: now,
        updatedAt: now,
      }).where(eq(operatorDrafts.id, draft.id));
      sent++;
    } catch (err) {
      logger.error("Draft send failed", { draftId: draft.id, kind: draft.kind, err: String(err) });
      await db.update(operatorDrafts).set({
        status: "failed",
        sendError: err instanceof Error ? err.message : String(err),
        updatedAt: now,
      }).where(eq(operatorDrafts.id, draft.id));
      failed++;
    }
  }

  return { sent, failed, skipped };
}

async function executeDraftEffect(draft: Draft): Promise<void> {
  const db = getDb();
  const body = draft.editedBody ?? draft.body;

  switch (draft.channel) {
    case "email": {
      // Resolve recipient
      const to = await resolveEmailRecipient(draft);
      if (!to) throw new Error(`No recipient for draft ${draft.id}`);
      // Pick the right template
      const template = pickEmailTemplate(draft);
      const html = await render(template({
        subject: extractSubject(draft) ?? draft.title,
        body,
        preview: draft.reasoning,
        draftId: draft.id,
      }));
      await sendEmail({
        to,
        from: process.env.EMAIL_FROM ?? "operator@o.company",
        subject: extractSubject(draft) ?? draft.title,
        html,
      });
      return;
    }

    case "in_app": {
      // No external send. The client portal polls /api/operator/drafts and
      // shows unread ones. Marking as sent means "the user has been notified
      // that there's something new."
      return;
    }

    case "score": {
      // Apply the score to the lead
      const score = (draft.context.score as number) ?? null;
      const tier = (draft.context.tier as string) ?? null;
      if (score === null) throw new Error("Score draft missing score in context");
      await db.update(contacts).set({
        leadScore: score,
        leadTier: tier as never,
        scoredAt: new Date().toISOString(),
        scoredByDraftId: draft.id,
      }).where(eq(contacts.id, draft.subjectId));
      return;
    }

    case "route": {
      const ownerId = (draft.context.suggested_owner_id as string) ?? null;
      if (!ownerId) throw new Error("Route draft missing suggested_owner_id in context");
      await db.update(contacts).set({
        ownerId,
        routedAt: new Date().toISOString(),
        routedByDraftId: draft.id,
      }).where(eq(contacts.id, draft.subjectId));
      return;
    }

    case "task": {
      const { tasks } = await import("@o/db/schema");
      await db.insert(tasks).values({
        id: `tsk_${crypto.randomUUID()}`,
        orgId: draft.orgId,
        title: draft.title,
        description: body,
        assigneeId: (draft.context.assigneeId as string) ?? draft.assigneeId,
        dueDate: (draft.context.dueDate as string) ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    case "sms": {
      throw new Error("SMS sending not yet implemented");
    }
  }
}

async function resolveEmailRecipient(draft: Draft): Promise<string | null> {
  const db = getDb();
  switch (draft.subjectType) {
    case "deal": {
      const [deal] = await db.select().from(deals).where(eq(deals.id, draft.subjectId)).limit(1);
      if (!deal?.contactId) return null;
      const [c] = await db.select().from(contacts).where(eq(contacts.id, deal.contactId)).limit(1);
      return c?.email ?? null;
    }
    case "invoice": {
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, draft.subjectId)).limit(1);
      if (!inv?.contactId) return null;
      const [c] = await db.select().from(contacts).where(eq(contacts.id, inv.contactId)).limit(1);
      return c?.email ?? null;
    }
    case "lead":
    case "contact": {
      const [c] = await db.select().from(contacts).where(eq(contacts.id, draft.subjectId)).limit(1);
      return c?.email ?? null;
    }
    case "org": {
      // The org-scoped drafts (like the morning briefing) go to the owner
      const [owner] = await db.select().from(people)
        .where(and(eq(people.orgId, draft.orgId), eq(people.role, "owner")))
        .limit(1);
      return owner?.email ?? null;
    }
    case "ticket":
    case "project":
    case "photo_job":
      return null;
  }
}

function extractSubject(draft: Draft): string | null {
  if (typeof draft.context.subject === "string") return draft.context.subject;
  return null;
}

function pickEmailTemplate(draft: Draft) {
  // Imported lazily so the bundle doesn't pull React Email into every call
  switch (draft.kind) {
    case "morning_briefing":       return MorningBriefingEmail;
    case "deal_followup_draft":    return DealFollowupEmail;
    case "invoice_reminder":       return InvoiceReminderEmail;
    case "photo_progress_ping":    return PhotoReadyEmail;
    case "lead_reengagement":      return LeadReengagementEmail;
    case "project_kickoff":        return ProjectKickoffEmail;
    case "project_closeout":       return ProjectCloseoutEmail;
    case "weekly_client_digest":   return WeeklyClientDigestEmail;
    // ticket_acknowledgement uses in_app channel, not email
    default:                       return MorningBriefingEmail;  // fallback
  }
}
