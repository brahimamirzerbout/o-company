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
import { findSimilarPastDecisions, type FewShotExample } from "./learning";

/**
 * Wraps a callStructured call with the learning loop. Looks up past
 * decisions for the same (kind, subjectType) and includes the most
 * recent 3 as few-shot examples in the prompt. The model uses them
 * as guidance for style and judgment, not as rules.
 *
 * If the lookup fails (e.g. DB down, table doesn't exist yet), we
 * fall through to the call without examples. Learning is a
 * nice-to-have, not a must-have.
 */
async function withLearning<T>(args: Parameters<typeof callStructured<T>>[0] & {
  kind: string;
  subjectType: string;
  context: Record<string, unknown>;
  orgId: string;
}): Promise<Awaited<ReturnType<typeof callStructured<T>>>> {
  let fewShot: FewShotExample[] = [];
  try {
    fewShot = await findSimilarPastDecisions({
      kind: args.kind,
      subjectType: args.subjectType,
      context: args.context,
      orgId: args.orgId,
      limit: 3,
    });
  } catch {
    // Learning is optional; the call proceeds without examples.
  }
  return callStructured<T>({
    ...args,
    fewShotExamples: fewShot.length > 0 ? fewShot : undefined,
  });
}
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

  const result = await withLearning<z.infer<typeof DealFollowupSchema>>({
    model: pickModel("draft"),
    system, user,
    schema: DealFollowupSchema,
    schemaName: "DealFollowup",
    kind: "deal_followup_draft",
    subjectType: "deal",
    context: { dealStage: deal.stage, daysSinceActivity, contactId: deal.contactId },
    orgId,
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

// =============================================================================
// 6. lead_reengagement
// =============================================================================
// Fires when a lead has gone 30+ days without activity. The operator
// drafts a "checking back in" message. Not automatic — the human
// reviews and sends. Tone: warm, not salesy.

const leadReengagementDef: ActionDefinition = {
  kind: "lead_reengagement",
  label: "Lead re-engagement",
  description: "Drafts a check-in for a lead who has gone 30+ days without activity.",
  channel: "email",
  triggers: [{ kind: "interval", minutes: 60 * 24 }],  // check daily
  requiresApproval: true,
  scope: "per_entity",
  cooldownMinutes: 60 * 24 * 14,  // max once per 14 days per lead
  defaultExpiryDays: 14,
};
registerAction(leadReengagementDef);

const LeadReengagementSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Markdown body. 60-100 words. Warm, not salesy. Reference the original context if known."),
  reasoning: z.string().describe("Why this is worth checking back in now."),
});

export async function runLeadReengagement(orgId: string, contactId: string) {
  const db = (await import("@o/db/client")).getDb();
  const { contacts, activities } = await import("@o/db/schema");
  const { eq, and, desc } = await import("drizzle-orm");

  const [contact] = await db.select().from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);
  if (!contact) throw new Error(`Contact ${contactId} not found`);
  if (contact.status === "customer") throw new Error("Lead is already a customer, skipping re-engagement");

  const recent = await db.select().from(activities)
    .where(eq(activities.contactId, contactId))
    .orderBy(desc(activities.createdAt))
    .limit(5);

  const daysSinceActivity = contact.lastContactedAt
    ? Math.floor((Date.now() - new Date(contact.lastContactedAt).getTime()) / 86400000)
    : 90;  // never contacted = assume 90 days

  const system = `You draft a check-in email for a creative operations company. The lead is a prospect who went cold. Your job is to write a short, warm, non-salesy message that gives them a reason to respond. Never use "just checking in." Never use "circle back." Never start with "I hope this email finds you well." Be specific. Reference the original context if you have it. End with a single low-friction question.`;

  const user = `Draft a check-in for:

Contact: ${contact.firstName} ${contact.lastName}
Title: ${contact.title ?? "unknown"}
Days since last activity: ${daysSinceActivity}

Recent activity on this contact:
${JSON.stringify(recent.slice(0, 3), null, 2)}

Notes from when they first reached out:
${contact.notes ?? "(no notes)"}

Return JSON with subject, body (60-100 words, markdown), and reasoning.`;

  const result = await withLearning<z.infer<typeof LeadReengagementSchema>>({
    model: pickModel("draft"),
    system, user,
    schema: LeadReengagementSchema,
    schemaName: "LeadReengagement",
    kind: "lead_reengagement",
    subjectType: "contact",
    context: { daysSinceActivity, lastNote: contact.notes?.slice(0, 100) },
    orgId,
  });

  return draftFromStructuredResult({
    orgId, kind: "lead_reengagement", subjectType: "contact", subjectId: contactId,
    title: `Re-engage: ${contact.firstName} ${contact.lastName}`,
    reasoning: result.value.reasoning,
    structured: result.value,
    model: result.model,
    promptTokens: result.promptTokens, completionTokens: result.completionTokens, costUsd: result.costUsd,
  });
}

// =============================================================================
// 7. project_kickoff
// =============================================================================
// Fires when a project moves to status='active'. The operator drafts a
// kickoff message: timeline, who-does-what, what-to-expect-first.

const projectKickoffDef: ActionDefinition = {
  kind: "project_kickoff",
  label: "Project kickoff",
  description: "Drafts a kickoff message when a project moves to active.",
  channel: "email",
  triggers: [{ kind: "on_event", event: "project.activated" }],
  requiresApproval: true,
  scope: "per_entity",
  cooldownMinutes: 0,  // once per project activation
  defaultExpiryDays: 14,
};
registerAction(projectKickoffDef);

const ProjectKickoffSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Markdown body. 150-250 words. Includes: timeline summary, who-does-what, what-to-expect-first-week."),
  reasoning: z.string(),
});

export async function runProjectKickoff(orgId: string, projectId: string) {
  const db = (await import("@o/db/client")).getDb();
  const { projects, contacts, milestones, timeEntries, people } = await import("@o/db/schema");
  const { eq, and, asc } = await import("drizzle-orm");

  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .limit(1);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const [client] = project.clientId
    ? await db.select().from(contacts).where(eq(contacts.id, project.clientId)).limit(1)
    : [null];

  const projectMilestones = await db.select().from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(asc(milestones.dueDate));

  const recentTime = await db.select().from(timeEntries)
    .where(eq(timeEntries.projectId, projectId))
    .limit(5);

  const system = `You draft a kickoff message for a creative operations company. The message is sent to the client when their project starts. It's warm, specific, and short. It says: here's what we're doing, here's when, here's who-does-what, here's what to expect in the first week. Never use exclamation marks. Never over-promise. If milestones are sparse, say so honestly.`;

  const user = `Draft a project kickoff for:

Project: ${project.name}
Service: ${project.service}
Value: ${project.value} ${project.currency}
Start date: ${project.startDate ?? "today"}
Due date: ${project.dueDate ?? "TBD"}

Client: ${client ? `${client.firstName} ${client.lastName} (${client.email})` : "unknown"}

Milestones (in order):
${JSON.stringify(projectMilestones, null, 2)}

Recent time logged:
${JSON.stringify(recentTime, null, 2)}

Return JSON with subject, body (150-250 words, markdown), and reasoning.`;

  const result = await withLearning<z.infer<typeof ProjectKickoffSchema>>({
    model: pickModel("summary"),
    system, user,
    schema: ProjectKickoffSchema,
    schemaName: "ProjectKickoff",
    kind: "project_kickoff",
    subjectType: "project",
    context: { service: project.service, value: project.value, milestoneCount: projectMilestones.length },
    orgId,
  });

  return draftFromStructuredResult({
    orgId, kind: "project_kickoff", subjectType: "project", subjectId: projectId,
    title: `Kickoff: ${project.name}`,
    reasoning: result.value.reasoning,
    structured: result.value,
    model: result.model,
    promptTokens: result.promptTokens, completionTokens: result.completionTokens, costUsd: result.costUsd,
  });
}

// =============================================================================
// 8. ticket_acknowledgement
// =============================================================================
// Fires on a new ticket. The operator drafts an in-app notification
// to the client: "we got your ticket, here's when to expect a response."
// Auto-approved (low risk, no external side effect).

const ticketAckDef: ActionDefinition = {
  kind: "ticket_acknowledgement",
  label: "Ticket acknowledgement",
  description: "Notifies the client that we got their ticket and when to expect a response.",
  channel: "in_app",
  triggers: [{ kind: "on_event", event: "ticket.created" }],
  requiresApproval: false,  // auto-approved; it's a status notification
  scope: "per_entity",
  cooldownMinutes: 0,  // once per ticket
  defaultExpiryDays: 7,
};
registerAction(ticketAckDef);

export async function runTicketAcknowledgement(orgId: string, ticketId: string) {
  const db = (await import("@o/db/client")).getDb();
  const { tickets } = await import("@o/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const [ticket] = await db.select().from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, orgId)))
    .limit(1);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  // No LLM call for this one — it's a structured notification.
  const expectedResponseHours = ticket.priority === "urgent" ? 2
    : ticket.priority === "high" ? 8
    : ticket.priority === "normal" ? 24
    : 72;

  const body = `We got your ticket "${ticket.subject}" and we're on it.

Expected first response: within ${expectedResponseHours} hours.

You'll get a notification here when we reply. If it's urgent, mark it so and we'll prioritize.`;

  return draftFromStructuredResult({
    orgId, kind: "ticket_acknowledgement", subjectType: "ticket", subjectId: ticketId,
    title: `Ticket received: ${ticket.subject}`,
    reasoning: `New ${ticket.priority}-priority ticket from a client. Auto-acknowledged.`,
    structured: { subject: `Ticket received: ${ticket.subject}`, body },
    model: "gpt-4o-mini",  // not actually called
    promptTokens: 0, completionTokens: 0, costUsd: 0,
  });
}

// =============================================================================
// 9. project_closeout
// =============================================================================
// Fires when a project moves to status='delivered'. The operator
// drafts a closeout summary: what was delivered, what's left, the
// final invoice nudge.

const projectCloseoutDef: ActionDefinition = {
  kind: "project_closeout",
  label: "Project closeout",
  description: "Drafts a closeout summary when a project is delivered.",
  channel: "email",
  triggers: [{ kind: "on_event", event: "project.delivered" }],
  requiresApproval: true,
  scope: "per_entity",
  cooldownMinutes: 0,
  defaultExpiryDays: 14,
};
registerAction(projectCloseoutDef);

const ProjectCloseoutSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Markdown body. 150-300 words. Includes: what was delivered, what's outstanding, the final invoice status, and a thank-you."),
  reasoning: z.string(),
});

export async function runProjectCloseout(orgId: string, projectId: string) {
  const db = (await import("@o/db/client")).getDb();
  const { projects, contacts, milestones, timeEntries, invoices } = await import("@o/db/schema");
  const { eq, and, asc, desc } = await import("drizzle-orm");

  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .limit(1);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const [client] = project.clientId
    ? await db.select().from(contacts).where(eq(contacts.id, project.clientId)).limit(1)
    : [null];

  const projectMilestones = await db.select().from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(asc(milestones.dueDate));

  const completedMilestones = projectMilestones.filter((m) => m.status === "complete");
  const incompleteMilestones = projectMilestones.filter((m) => m.status !== "complete" && m.status !== "canceled");

  const totalHours = (await db.select().from(timeEntries)
    .where(eq(timeEntries.projectId, projectId)))
    .reduce((sum, e) => sum + (e.hours ?? 0), 0);

  const projectInvoices = await db.select().from(invoices)
    .where(eq(invoices.projectId, projectId))
    .orderBy(desc(invoices.createdAt));

  const unpaid = projectInvoices.filter((i) => i.status !== "paid");

  const system = `You draft a project closeout message for a creative operations company. The project is done; the client gets a summary of what was delivered, what's outstanding, the financial state, and a thank-you. Be specific: name the milestones that were completed, name the ones that weren't. If there are unpaid invoices, mention them honestly but not aggressively. Never use exclamation marks. Never write "It was a pleasure" — find a real thing to thank them for.`;

  const user = `Draft a project closeout for:

Project: ${project.name}
Service: ${project.service}
Value: ${project.value} ${project.currency}

Client: ${client ? `${client.firstName} ${client.lastName} (${client.email})` : "unknown"}

Completed milestones (${completedMilestones.length}):
${completedMilestones.map((m) => `- ${m.name}`).join("\n") || "(none)"}

Outstanding milestones (${incompleteMilestones.length}):
${incompleteMilestones.map((m) => `- ${m.name} (${m.status})`).join("\n") || "(none)"}

Time logged: ${totalHours.toFixed(1)} hours total

Invoices:
${projectInvoices.map((i) => `- ${i.number}: $${(i.amount / 100).toFixed(2)} · ${i.status}`).join("\n")}

${unpaid.length > 0 ? `⚠️  ${unpaid.length} unpaid invoice(s) totaling $${unpaid.reduce((s, i) => s + i.amount, 0) / 100}.` : "All invoices paid."}

Return JSON with subject, body (150-300 words, markdown), and reasoning.`;

  const result = await withLearning<z.infer<typeof ProjectCloseoutSchema>>({
    model: pickModel("summary"),
    system, user,
    schema: ProjectCloseoutSchema,
    schemaName: "ProjectCloseout",
    kind: "project_closeout",
    subjectType: "project",
    context: { service: project.service, value: project.value, completed: completedMilestones.length, outstanding: incompleteMilestones.length, unpaid: unpaid.length },
    orgId,
  });

  return draftFromStructuredResult({
    orgId, kind: "project_closeout", subjectType: "project", subjectId: projectId,
    title: `${project.name} — wrapped`,
    reasoning: result.value.reasoning,
    structured: result.value,
    model: result.model,
    promptTokens: result.promptTokens, completionTokens: result.completionTokens, costUsd: result.costUsd,
  });
}

// =============================================================================
// 10. weekly_client_digest
// =============================================================================
// Friday 4pm. The operator drafts a one-paragraph summary of each
// active client's week: what was done, what's coming, anything that
// needs their attention. Sent as one email per client.

const weeklyClientDigestDef: ActionDefinition = {
  kind: "weekly_client_digest",
  label: "Weekly client digest",
  description: "Friday 4pm: drafts a weekly summary for each active client.",
  channel: "email",
  triggers: [{ kind: "cron", expression: "0 16 * * 5", tz: "America/Chicago" }],
  requiresApproval: true,
  scope: "org",  // runs once per org, drafts per active client
  cooldownMinutes: 60 * 24 * 6,  // weekly
  defaultExpiryDays: 7,
};
registerAction(weeklyClientDigestDef);

const WeeklyClientDigestSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Markdown body. 100-200 words. Three short sections: this week, next week, anything that needs your attention."),
  reasoning: z.string(),
});

export async function runWeeklyClientDigest(orgId: string, contactId: string) {
  const db = (await import("@o/db/client")).getDb();
  const { contacts, projects, timeEntries, tickets, milestones, invoices } = await import("@o/db/schema");
  const { eq, and, gte, desc } = await import("drizzle-orm");

  const [contact] = await db.select().from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [contactProjects, weekTimeEntries, weekTickets, openInvoices] = await Promise.all([
    db.select().from(projects).where(and(eq(projects.clientId, contactId), eq(projects.status, "active"))),
    db.select().from(timeEntries)
      .where(and(eq(timeEntries.orgId, orgId), gte(timeEntries.occurredAt, weekAgo)))
      .limit(20),
    db.select().from(tickets)
      .where(and(eq(tickets.contactId, contactId), eq(tickets.status, "open")))
      .limit(5),
    db.select().from(invoices)
      .where(and(eq(invoices.contactId, contactId), eq(invoices.status, "sent")))
      .limit(5),
  ]);

  // Aggregate time per project for the week
  const timeByProject = new Map<string, number>();
  for (const e of weekTimeEntries) {
    timeByProject.set(e.projectId, (timeByProject.get(e.projectId) ?? 0) + (e.hours ?? 0));
  }

  const system = `You write a short weekly digest for a creative operations company's client. The digest is one email per client, sent Friday afternoon. It's three short sections: this week (what was done, in 1-2 sentences), next week (what's planned), and anything that needs their attention (open tickets, unpaid invoices, decisions they're holding up). Never use exclamation marks. Never write "I hope you had a great week." The tone is: we did the work, here's what's next, here's what we need from you.`;

  const user = `Write the weekly digest for:

Client: ${contact.firstName} ${contact.lastName}

Active projects:
${contactProjects.map((p) => `- ${p.name} (${p.service})`).join("\n") || "(none active this week)"}

Hours logged this week (by project):
${Array.from(timeByProject.entries()).map(([id, h]) => `- ${id}: ${h.toFixed(1)}h`).join("\n") || "(no time logged this week)"}

Open tickets:
${weekTickets.map((t) => `- ${t.subject} (${t.priority})`).join("\n") || "(none)"}

Unpaid invoices:
${openInvoices.map((i) => `- ${i.number}: $${(i.amount / 100).toFixed(2)}, due ${i.dueDate}`).join("\n") || "(none)"}

Return JSON with subject, body (100-200 words, markdown), and reasoning.`;

  const result = await withLearning<z.infer<typeof WeeklyClientDigestSchema>>({
    model: pickModel("summary"),
    system, user,
    schema: WeeklyClientDigestSchema,
    schemaName: "WeeklyClientDigest",
    kind: "weekly_client_digest",
    subjectType: "contact",
    context: { activeProjectCount: contactProjects.length, openTicketCount: weekTickets.length, unpaidCount: openInvoices.length, totalHours: Array.from(timeByProject.values()).reduce((a, b) => a + b, 0) },
    orgId,
  });

  return draftFromStructuredResult({
    orgId, kind: "weekly_client_digest", subjectType: "contact", subjectId: contactId,
    title: `Weekly digest · ${contact.firstName}`,
    reasoning: result.value.reasoning,
    structured: result.value,
    model: result.model,
    promptTokens: result.promptTokens, completionTokens: result.completionTokens, costUsd: result.costUsd,
  });
}
