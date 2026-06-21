// =============================================================================
// @o/operator/actions — the 5 actions the operator knows how to do
// =============================================================================
// Each action:
//   1. Defines an ActionDefinition (trigger, channel, scope)
//   2. Has a `run()` function that gathers context via tools
//   3. Calls the LLM to draft the output
//   4. Returns a Draft row ready to be inserted
//
// The action does NOT send anything. The draft goes into the database.
// The human (O'Shay) reviews and approves. Only then does the draft
// transition to "sent" and the underlying effect fire.

import { z } from "zod";
import { callStructured, callText, pickModel, MODELS, ModelName } from "./llm";
import {
  listStaleDeals, getContact, listOverdueInvoices, getPipelineSummary,
  getThisMonthRevenue, listReadyPhotoJobs, getRecentActivity,
} from "./tools";
import {
  ActionDefinition, ActionKind, Draft, registerAction, getAction,
} from "./index";
import { randomUUID } from "crypto";

// =============================================================================
// 1. morning_briefing
// =============================================================================
// 6am daily. O'Shay's inbox. "Here's the brief. 4 things need your
// attention today." Written as prose. Uses the smart model.

const morningBriefingDef: ActionDefinition = {
  kind: "morning_briefing",
  label: "Morning briefing",
  description: "A daily 6am email summarizing pipeline, revenue, what's stale, and what to act on.",
  channel: "email",
  triggers: [{ kind: "cron", expression: "0 6 * * *", tz: "America/Chicago" }],
  requiresApproval: true,    // O'Shay reviews before it sends (in v1; auto-send in v2)
  scope: "org",
  cooldownMinutes: 60 * 18,  // 18 hours
  defaultExpiryDays: 1,
};
registerAction(morningBriefingDef);

const MorningBriefingSchema = z.object({
  subject: z.string().describe("Email subject line. Specific to today."),
  headline: z.string().describe("The one-line TL;DR."),
  top_priorities: z.array(z.object({
    title: z.string(),
    why: z.string(),
    suggested_action: z.string(),
  })).min(1).max(5).describe("The 1-5 things that need attention today."),
  pipeline_summary: z.string().describe("1-2 sentence summary of pipeline state."),
  revenue_summary: z.string().describe("1-2 sentence summary of revenue state."),
  wins_and_flags: z.array(z.object({
    kind: z.enum(["win", "flag"]),
    text: z.string(),
  })).describe("Wins (good things) and flags (things to watch)."),
  full_brief: z.string().describe("The full prose briefing, markdown formatted."),
});

export async function runMorningBriefing(orgId: string, context: { orgName: string; today: string; recipientName: string }) {
  // Gather context
  const [pipeline, revenue, recentActivity, staleDeals, overdue] = await Promise.all([
    getPipelineSummary.execute({}, { orgId }),
    getThisMonthRevenue.execute({}, { orgId }),
    getRecentActivity.execute({ hours: 24 }, { orgId }),
    listStaleDeals.execute({ daysSinceActivity: 4 }, { orgId }),
    listOverdueInvoices.execute({ daysOverdue: 0 }, { orgId }),
  ]);

  const system = `You are the chief of staff for ${context.orgName}, a creative operations company. Every morning at 6am you write a brief to the owner, ${context.recipientName}. The brief is short, specific, and actionable. It tells them what to do today, not what already happened. Tone: direct, warm, no fluff. Never use exclamation marks. Never start with "I". Never end with "Let me know if you need anything."`;

  const user = `Today is ${context.today}. Write the morning brief.

Pipeline (open deals by stage):
${JSON.stringify(pipeline, null, 2)}

Revenue (this month vs last):
${JSON.stringify(revenue, null, 2)}

Recent activity (last 24h):
${JSON.stringify(recentActivity, null, 2)}

Stale deals (no activity in 4+ days):
${JSON.stringify(staleDeals, null, 2)}

Overdue invoices:
${JSON.stringify(overdue, null, 2)}

Return JSON matching the schema. The "top_priorities" should be the 1-5 things ${context.recipientName} should do TODAY. Be specific: name the deal, the contact, the dollar amount, the suggested action. The "full_brief" is the prose version of the same information, formatted for email.`;

  const result = await callStructured({
    model: pickModel("briefing"),
    system, user,
    schema: MorningBriefingSchema,
    schemaName: "MorningBriefing",
    temperature: 0.5,
  });

  return draftFromStructuredResult({
    orgId, kind: "morning_briefing", subjectType: "org", subjectId: orgId,
    title: `Morning brief · ${context.today}`,
    reasoning: "Daily 6am briefing. Always runs unless explicitly disabled.",
    structured: result.value,
    model: result.model,
    promptTokens: result.promptTokens, completionTokens: result.completionTokens, costUsd: result.costUsd,
  });
}

// =============================================================================
// 2. deal_followup_draft
// =============================================================================
// Fires when a deal has been in the same stage for N days with no activity.
// The operator drafts a follow-up email; O'Shay reviews and sends.

const dealFollowupDef: ActionDefinition = {
  kind: "deal_followup_draft",
  label: "Deal follow-up draft",
  description: "Drafts a follow-up email for a deal that has been stale in its stage.",
  channel: "email",
  triggers: [{ kind: "interval", minutes: 60 * 6 }],  // check every 6 hours
  requiresApproval: true,
  scope: "per_entity",
  cooldownMinutes: 60 * 48,  // max once per 48h per deal
  defaultExpiryDays: 7,
};
registerAction(dealFollowupDef);

const DealFollowupSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Markdown body. Short, specific, references the original conversation."),
  reasoning: z.string().describe("Why this follow-up is appropriate now."),
  tone: z.enum(["gentle", "direct", "urgent"]),
});

export async function runDealFollowup(orgId: string, dealId: string) {
  const db = (await import("@o/db/client")).getDb();
  const { deals, contacts, companies, activities } = await import("@o/db/schema");
  const { eq, and, desc } = await import("drizzle-orm");

  const [deal] = await db.select().from(deals).where(and(eq(deals.id, dealId), eq(deals.orgId, orgId))).limit(1);
  if (!deal) throw new Error(`Deal ${dealId} not found`);

  const [contact] = deal.contactId
    ? await db.select().from(contacts).where(eq(contacts.id, deal.contactId)).limit(1)
    : [null];

  const recentActivities = await db.select().from(activities)
    .where(eq(activities.dealId, dealId))
    .orderBy(desc(activities.createdAt))
    .limit(5);

  const daysSinceActivity = Math.floor(
    (Date.now() - new Date(deal.lastActivityAt ?? deal.updatedAt).getTime()) / 86400000,
  );

  const system = `You are the chief of staff for a creative operations company. You draft follow-up emails for the owner to send to prospects. The emails are short (under 120 words), warm but direct, and reference the specific context of the deal. Never use exclamation marks. Never open with "I hope this finds you well." Never end with "Let me know if you have any questions." The owner signs off personally.`;

  const user = `Draft a follow-up email.

Deal: ${deal.name}
Stage: ${deal.stage}
Value: ${deal.amount} ${deal.currency}
Days since last activity: ${daysSinceActivity}

Contact: ${contact ? `${contact.firstName} ${contact.lastName} <${contact.email}>` : "unknown"}

Recent activity on this deal:
${JSON.stringify(recentActivities, null, 2)}

Return JSON with subject, body (markdown), reasoning, and tone. The tone should be "gentle" if <7 days, "direct" if 7-14 days, "urgent" if 14+ days.`;

  const result = await callStructured({
    model: pickModel("draft"),
    system, user,
    schema: DealFollowupSchema,
    schemaName: "DealFollowup",
  });

  return draftFromStructuredResult({
    orgId, kind: "deal_followup_draft", subjectType: "deal", subjectId: dealId,
    title: `Follow-up: ${deal.name}`,
    reasoning: result.value.reasoning,
    structured: result.value,
    model: result.model,
    promptTokens: result.promptTokens, completionTokens: result.completionTokens, costUsd: result.costUsd,
  });
}

// =============================================================================
// 3. lead_score
// =============================================================================
// Fires on new lead. Reads form data + email domain + (optionally) company
// info, returns a score 0-100 and a routing decision. No approval needed —
// this is a decision, not a message.

const leadScoreDef: ActionDefinition = {
  kind: "lead_score",
  label: "Lead scoring",
  description: "Scores new leads 0-100 and routes them to the right person.",
  channel: "score",
  triggers: [{ kind: "on_event", event: "lead.created" }],
  requiresApproval: false,
  scope: "per_entity",
  cooldownMinutes: 0,
  defaultExpiryDays: 30,
};
registerAction(leadScoreDef);

const LeadScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  tier: z.enum(["cold", "warm", "hot", "qualified"]),
  reasoning: z.string().describe("Why this score. The owner will see this."),
  suggested_owner_id: z.string().nullable().describe("Person ID to route to, or null if the lead goes to the queue."),
  suggested_first_reply: z.string().describe("A 2-3 sentence reply the owner can send immediately."),
});

export async function runLeadScore(orgId: string, leadId: string) {
  const db = (await import("@o/db/client")).getDb();
  const { contacts, people: peopleT } = await import("@o/db/schema");
  const { eq, and, desc } = await import("drizzle-orm");

  const [lead] = await db.select().from(contacts).where(and(eq(contacts.id, leadId), eq(contacts.orgId, orgId))).limit(1);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  // Find the owners we could route to
  const owners = await db.select().from(peopleT)
    .where(and(eq(peopleT.orgId, orgId), eq(peopleT.role, "operator")))
    .limit(20);

  const system = `You score new leads for a creative operations company. You return a 0-100 score, a tier, reasoning, a suggested owner, and a suggested first reply. Score based on: company size (if available), email domain (free = lower), job title (decision-maker = higher), message content (specific = higher, vague = lower), and any explicit budget/timeline signals.`;

  const user = `Score this lead.

Lead: ${lead.firstName} ${lead.lastName}
Email: ${lead.email}
Title: ${lead.title ?? "unknown"}
Company: ${lead.company ?? "unknown"}
Message / form data: ${lead.notes ?? "(none)"}
Source: ${lead.source ?? "unknown"}

Available operators to route to:
${JSON.stringify(owners.map((o) => ({ id: o.id, name: o.name, role: o.role })), null, 2)}

Return JSON. Pick the operator whose role or skills best match the lead's apparent need, or null if the lead should go to the general queue.`;

  const result = await callStructured({
    model: pickModel("score"),
    system, user,
    schema: LeadScoreSchema,
    schemaName: "LeadScore",
  });

  return draftFromStructuredResult({
    orgId, kind: "lead_score", subjectType: "lead", subjectId: leadId,
    title: `Lead scored: ${lead.firstName} ${lead.lastName} (${result.value.tier})`,
    reasoning: result.value.reasoning,
    structured: result.value,
    model: result.model,
    promptTokens: result.promptTokens, completionTokens: result.completionTokens, costUsd: result.costUsd,
  });
}

// =============================================================================
// 4. invoice_reminder
// =============================================================================
// Fires on overdue invoice. Drafts a reminder email. The owner can edit
// the tone (firmer for repeat offenders).

const invoiceReminderDef: ActionDefinition = {
  kind: "invoice_reminder",
  label: "Invoice reminder",
  description: "Drafts a reminder email for an overdue invoice.",
  channel: "email",
  triggers: [{ kind: "interval", minutes: 60 * 12 }],  // check twice a day
  requiresApproval: true,
  scope: "per_entity",
  cooldownMinutes: 60 * 24 * 3,  // max once per 3 days
  defaultExpiryDays: 14,
};
registerAction(invoiceReminderDef);

const InvoiceReminderSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Markdown body. Professional, not passive-aggressive."),
  tone: z.enum(["friendly", "firm", "final"]),
  reasoning: z.string(),
});

export async function runInvoiceReminder(orgId: string, invoiceId: string) {
  const db = (await import("@o/db/client")).getDb();
  const { invoices, contacts } = await import("@o/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId))).limit(1);
  if (!inv) throw new Error(`Invoice ${invoiceId} not found`);

  const [contact] = inv.contactId
    ? await db.select().from(contacts).where(eq(contacts.id, inv.contactId)).limit(1)
    : [null];

  const daysOverdue = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);

  const system = `You draft invoice reminder emails for a creative operations company. Tone: friendly if <7 days overdue, firm if 7-21 days, final if 21+ days. Always include the invoice number, amount, and a link to pay. Never threaten legal action in a first reminder.`;

  const user = `Draft an invoice reminder.

Invoice: ${inv.number}
Amount: ${inv.amount} ${inv.currency}
Due date: ${inv.dueDate} (${daysOverdue} days overdue)

Contact: ${contact ? `${contact.firstName} ${contact.lastName} <${contact.email}>` : "unknown"}

Return JSON with subject, body, tone, and reasoning.`;

  const result = await callStructured({
    model: pickModel("draft"),
    system, user,
    schema: InvoiceReminderSchema,
    schemaName: "InvoiceReminder",
  });

  return draftFromStructuredResult({
    orgId, kind: "invoice_reminder", subjectType: "invoice", subjectId: invoiceId,
    title: `Reminder: ${inv.number}`,
    reasoning: result.value.reasoning,
    structured: result.value,
    model: result.model,
    promptTokens: result.promptTokens, completionTokens: result.completionTokens, costUsd: result.costUsd,
  });
}

// =============================================================================
// 5. photo_progress_ping
// =============================================================================
// Fires when a photo job finishes. Notifies the client that their
// variations are ready. Auto-approves (no human review needed for a
// notification that's just a status update).

const photoPingDef: ActionDefinition = {
  kind: "photo_progress_ping",
  label: "Photo ready notification",
  description: "Notifies a client when their photo variations are ready to view.",
  channel: "in_app",
  triggers: [{ kind: "on_event", event: "photo_job.ready" }],
  requiresApproval: false,
  scope: "per_entity",
  cooldownMinutes: 0,
  defaultExpiryDays: 30,
};
registerAction(photoPingDef);

export async function runPhotoProgressPing(orgId: string, photoJobId: string) {
  const db = (await import("@o/db/client")).getDb();
  const { photoJobs: pj, contacts, photoVariations: pv } = await import("@o/db/schema");
  const { eq, and, count, sum } = await import("drizzle-orm");

  const [job] = await db.select().from(pj).where(and(eq(pj.id, photoJobId), eq(pj.orgId, orgId))).limit(1);
  if (!job) throw new Error(`Photo job ${photoJobId} not found`);

  const [uploader] = job.uploadedBy
    ? await db.select().from(contacts).where(eq(contacts.id, job.uploadedBy)).limit(1)
    : [null];

  const [varStats] = await db.select({
    count: count(),
    totalCost: sum(pv.costUsd),
  }).from(pv).where(eq(pv.jobId, photoJobId));

  const body = `Your photo variations are ready.

**${job.filename}**
${varStats?.count ?? 0} variations · $${(Number(varStats?.totalCost) || 0).toFixed(2)}

[View variations →](/photos)`;

  return draftFromStructuredResult({
    orgId, kind: "photo_progress_ping", subjectType: "photo_job", subjectId: photoJobId,
    title: `Photos ready: ${job.filename}`,
    reasoning: `Photo job ${photoJobId} finished processing with ${varStats?.count ?? 0} variations.`,
    structured: { subject: `Your photos are ready — ${job.filename}`, body },
    model: "gpt-4o-mini",  // not actually called — we just construct the draft
    promptTokens: 0, completionTokens: 0, costUsd: 0,
  });
}

// =============================================================================
// Helper: turn a structured LLM result into a Draft
// =============================================================================

interface StructuredResult {
  subject?: string;
  body?: string;
  full_brief?: string;
  headline?: string;
  reasoning: string;
  [k: string]: unknown;
}

interface DraftInput {
  orgId: string;
  kind: ActionKind;
  subjectType: "deal" | "contact" | "lead" | "invoice" | "ticket" | "project" | "photo_job" | "org";
  subjectId: string;
  title: string;
  reasoning: string;
  structured: StructuredResult;
  model: ModelName | string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

function draftFromStructuredResult(input: DraftInput): Omit<Draft, "assigneeId" | "approverId" | "createdAt" | "updatedAt"> {
  const def = getAction(input.kind) as ActionDefinition;
  const id = `opd_${randomUUID()}`;
  const subject = (input.structured.subject as string) ?? input.title;
  const body = (input.structured.body as string) ?? (input.structured.full_brief as string) ?? "";

  return {
    id,
    orgId: input.orgId,
    kind: input.kind,
    channel: def.channel,
    status: "pending",
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    title: input.title,
    body,
    context: { ...input.structured },
    reasoning: input.reasoning,
    modelUsed: String(input.model),
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    costUsd: input.costUsd,
    approvedAt: null,
    approvedBy: null,
    editedBody: null,
    sentAt: null,
    sendError: null,
    feedbackScore: null,
    feedbackNote: null,
    expiresAt: new Date(Date.now() + def.defaultExpiryDays * 24 * 60 * 60 * 1000).toISOString(),
  };
}
