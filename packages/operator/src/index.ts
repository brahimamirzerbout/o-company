// =============================================================================
// @o/operator — the action system
// =============================================================================
// An "action" is one thing the operator knows how to do. It is always:
//   1. Scheduled (cron, or on-event)
//   2. Reads state (DB, external APIs)
//   3. Drafts output (never sends, never executes without approval)
//   4. Writes a draft row
//   5. Notifies the human (email, in-app badge, or both)
//
// Six actions ship in v1:
//   • morning_briefing       6am daily, O'Shay's inbox
//   • deal_followup_draft    on-deal-stale, queue to draft
//   • lead_score             on-new-lead, score and route
//   • invoice_reminder       on-invoice-overdue, draft a reminder
//   • photo_progress_ping    on-photo-job-ready, notify client
//   • client_brief_summary   weekly, generate the client's brief inbox digest
//
// The Learning loop:
//   Every draft has approve/reject/edit. We log the decision + the original
//   draft + the final version. After 50+ decisions, the morning briefing
//   action starts using those examples to fine-tune its prompt.

import { z } from "zod";

// -----------------------------------------------------------------------------
// Action kinds
// -----------------------------------------------------------------------------

export const ACTION_KINDS = [
  "morning_briefing",
  "deal_followup_draft",
  "lead_score",
  "invoice_reminder",
  "photo_progress_ping",
  "client_brief_summary",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

// -----------------------------------------------------------------------------
// Draft status lifecycle
// -----------------------------------------------------------------------------

export const DRAFT_STATUSES = [
  "pending",   // created, waiting for human
  "approved",  // human approved, will be sent/executed at next sync
  "edited",    // human edited, will be sent with the edited version
  "rejected",  // human rejected, won't be sent
  "sent",      // approved/edited draft was sent
  "skipped",   // system or human decided not to send (e.g. already done)
  "failed",    // send failed
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

// -----------------------------------------------------------------------------
// Draft
// -----------------------------------------------------------------------------

export const DraftChannelSchema = z.enum([
  "email",       // outbound email (most common)
  "sms",         // outbound SMS
  "in_app",      // in-app notification (no external send)
  "task",        // creates a task assigned to a person
  "score",       // a score, not a message (lead_score, deal_score)
  "route",       // a routing decision, not a message
]);
export type DraftChannel = z.infer<typeof DraftChannelSchema>;

export interface Draft {
  id: string;             // opd_<uuid>
  orgId: string;
  kind: ActionKind;
  channel: DraftChannel;
  status: DraftStatus;

  // Who/what is this about
  subjectType: "deal" | "contact" | "lead" | "invoice" | "ticket" | "project" | "photo_job" | "org";
  subjectId: string;

  // Who needs to approve it
  assigneeId: string;     // person.id of the operator
  approverId: string | null;

  // What we drafted
  title: string;          // short label: "Follow-up: Northwind renewal"
  body: string;           // the drafted message, markdown
  context: Record<string, unknown>;  // structured inputs (deal value, days stale, etc.)
  reasoning: string;      // why the operator drafted this (shown in UI)

  // The model cost
  modelUsed: string;      // "gpt-4o-mini" | "claude-haiku-4-5" | ...
  promptTokens: number;
  completionTokens: number;
  costUsd: number;

  // Approval
  approvedAt: string | null;
  approvedBy: string | null;
  editedBody: string | null;

  // Send
  sentAt: string | null;
  sendError: string | null;

  // Feedback for learning
  feedbackScore: number | null;     // -1, 0, +1
  feedbackNote: string | null;

  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;        // drafts auto-expire after N days
}

// -----------------------------------------------------------------------------
// Action trigger
// -----------------------------------------------------------------------------

export type Trigger =
  | { kind: "cron"; expression: string; tz?: string }       // "0 6 * * *"
  | { kind: "interval"; minutes: number }
  | { kind: "on_event"; event: string };                     // "deal.stale", "invoice.overdue", "photo_job.ready"

export interface ActionDefinition {
  kind: ActionKind;
  label: string;
  description: string;
  channel: DraftChannel;
  triggers: Trigger[];
  /** Whether this action requires human approval before send. */
  requiresApproval: boolean;
  /** Whether the action runs once per org or per-entity. */
  scope: "org" | "per_entity";
  /** The minimum time between runs (per org, for cron) or per entity (per-entity actions). */
  cooldownMinutes: number;
  /** Default expiry for the draft. */
  defaultExpiryDays: number;
}

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------

const REGISTRY = new Map<ActionKind, ActionDefinition>();

export function registerAction(def: ActionDefinition) {
  REGISTRY.set(def.kind, def);
}

export function getAction(kind: ActionKind): ActionDefinition | null {
  return REGISTRY.get(kind) ?? null;
}

export function listActions(): ActionDefinition[] {
  return Array.from(REGISTRY.values());
}
