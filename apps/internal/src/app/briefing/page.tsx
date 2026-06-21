"use client";

import * as React from "react";
import Link from "next/link";
import { Card, Pill, Button, PageHeader, Stat, EmptyState } from "@o/ui";
import {
  Check, X, Edit3, Clock, Mail, Sparkles, Send, ChevronDown, ChevronUp,
  TrendingUp, AlertCircle, Image as ImageIcon, FileText, User,
} from "lucide-react";
import { cn } from "@o/ui";

// =============================================================================
// Operator · Briefing page
// =============================================================================
// What O'Shay sees when he opens /briefing:
//   1. KPI strip: pending drafts, sent this week, AI cost, approval rate
//   2. Pending drafts, one card per draft, with the AI's reasoning and a
//      preview of the drafted body
//   3. Approve / Edit / Reject buttons
//   4. "Approve & send now" vs "Approve & send at next sync"
//
// The data shape in this scaffold is the same one the real API returns.
// In dev mode (no API), we use a hardcoded set of mock drafts and dispatch
// approve/reject events to update the local state.

interface Draft {
  id: string;
  kind: "morning_briefing" | "deal_followup_draft" | "lead_score" | "invoice_reminder" | "photo_progress_ping";
  channel: "email" | "sms" | "in_app" | "task" | "score" | "route";
  status: "pending" | "approved" | "edited" | "rejected" | "sent" | "skipped" | "failed";
  title: string;
  body: string;
  reasoning: string;
  context: Record<string, unknown>;
  costUsd: number;
  modelUsed: string;
  createdAt: string;
}

const KIND_META: Record<Draft["kind"], { label: string; icon: React.ReactNode; tone: "accent" | "info" | "success" | "warning" | "danger" | "neutral" }> = {
  morning_briefing:    { label: "Morning briefing",    icon: <Sparkles className="h-3.5 w-3.5" />, tone: "accent" },
  deal_followup_draft: { label: "Deal follow-up",      icon: <TrendingUp className="h-3.5 w-3.5" />, tone: "info" },
  lead_score:          { label: "Lead score",          icon: <User className="h-3.5 w-3.5" />, tone: "neutral" },
  invoice_reminder:    { label: "Invoice reminder",    icon: <FileText className="h-3.5 w-3.5" />, tone: "warning" },
  photo_progress_ping: { label: "Photos ready",        icon: <ImageIcon className="h-3.5 w-3.5" />, tone: "success" },
};

const MOCK_DRAFTS: Draft[] = [
  {
    id: "opd_001",
    kind: "morning_briefing",
    channel: "email",
    status: "pending",
    title: "Morning brief · Thursday, June 20",
    body: `# Today

**3 things need your attention.**

1. **Polaris proposal — 4 days stale.** No reply since last Friday. Worth a 2-sentence nudge, or close the loop and move on. $18,500 deal.

2. **Helios SOW — awaiting your signature.** Priya sent the redlined version yesterday. You said you'd review by EOD Wednesday. It's now Thursday morning.

3. **Northwind renewal** — Marcus said "let's get this over the line" on Tuesday. No follow-up yet. $24,000, your biggest renewal of the quarter.

## Pipeline
$284k open across 12 deals. Forecast this month: $42k, up 22% from last month.

## Yesterday
Quanta renewed ($24k). Auto-invoice sent.

## What the operator is watching
- Atlas invoice INV-2026-018 is 7 days overdue ($4,200). Reminder drafted below.
- 2 new leads came in overnight. Both scored "warm" by the operator.`,
    reasoning: "Daily 6am briefing. Always runs unless explicitly disabled.",
    context: {},
    costUsd: 0.014,
    modelUsed: "gpt-4o",
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  },
  {
    id: "opd_002",
    kind: "deal_followup_draft",
    channel: "email",
    status: "pending",
    title: "Follow-up: Northwind renewal",
    body: `Subject: Re: Northwind renewal

Hi Marcus,

Wanted to follow up on the renewal paperwork before it slips through the cracks. The SOW hasn't changed since Tuesday — are we good to sign?

If something's blocking, I'd rather hear about it now than at the end of the quarter.

O'Shay`,
    reasoning: "Deal has been in 'negotiation' for 4 days with no activity. The contact (Marcus Reyes) said 'let's get this over the line' on Tuesday. Tone: gentle, specific, references the prior conversation.",
    context: { dealId: "dl_15", daysSinceActivity: 4 },
    costUsd: 0.002,
    modelUsed: "gpt-4o-mini",
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: "opd_003",
    kind: "invoice_reminder",
    channel: "email",
    status: "pending",
    title: "Reminder: INV-2026-018",
    body: `Subject: Invoice INV-2026-018 — past due

Hi Jonas,

Friendly reminder that invoice INV-2026-018 ($4,200, due June 13) is now a week past due. If payment is already in flight, please disregard.

The invoice is still payable from your portal: [link]

Let me know if there's anything blocking payment.

O'Shay`,
    reasoning: "Invoice 7 days overdue. First reminder — friendly tone, includes invoice number and amount. Not yet 'firm' (that comes at 14 days).",
    context: { invoiceId: "inv_018", daysOverdue: 7 },
    costUsd: 0.001,
    modelUsed: "gpt-4o-mini",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "opd_004",
    kind: "lead_score",
    channel: "score",
    status: "pending",
    title: "Lead scored: Lila Okafor (warm)",
    body: `**Score: 64/100 · warm tier**

Reasoning: Form submission references a $30k website budget and a Q3 timeline. Email domain is polaris.com (corporate, not free). Job title "Head of Marketing" is a clear decision-maker. The message is specific ("looking for someone to handle design + Webflow build, not just templates"). Suggests they know what they want.

Suggested first reply:
---
Hi Lila — saw your note about the Polaris website refresh. Sounds like a fit. Two questions: are you thinking Q3 launch, and do you have a brand kit / designs already, or starting from scratch?

O'Shay
---

Suggested owner: Felix (operator, "design + Webflow" is in his bio).`,
    reasoning: "Score 64/100. Warm tier. Specific budget + timeline signal in form. Decision-maker title. Route to Felix.",
    context: { score: 64, tier: "warm", suggested_owner_id: "u_felix", suggested_first_reply: "..." },
    costUsd: 0.001,
    modelUsed: "gpt-4o-mini",
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "opd_005",
    kind: "photo_progress_ping",
    channel: "in_app",
    status: "pending",
    title: "Photos ready: headshot-04.jpg",
    body: `Your photo variations are ready.

**headshot-04.jpg**
8 variations · $0.65

[View variations →](/photos)`,
    reasoning: "Photo job phj_mock_42 finished processing with 8 variations.",
    context: { photoJobId: "phj_mock_42", variationCount: 8, totalCostUsd: 0.65 },
    costUsd: 0,
    modelUsed: "gpt-4o-mini",
    createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
  },
  {
    id: "opd_006",
    kind: "deal_followup_draft",
    channel: "email",
    status: "sent",
    title: "Follow-up: Helios SOW",
    body: "...",
    reasoning: "Sent 2 days ago. Auto-archived.",
    context: {},
    costUsd: 0.002,
    modelUsed: "gpt-4o-mini",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "opd_007",
    kind: "deal_followup_draft",
    channel: "email",
    status: "rejected",
    title: "Follow-up: Quanta brief",
    body: "...",
    reasoning: "O'Shay rejected. Reason: \"Quanta already paid; this is the renewal, not a new lead. Skip.\"",
    context: {},
    costUsd: 0.002,
    modelUsed: "gpt-4o-mini",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

export default function BriefingPage() {
  const [drafts, setDrafts] = React.useState<Draft[]>(MOCK_DRAFTS);
  const [filter, setFilter] = React.useState<"pending" | "all">("pending");
  const [expandedId, setExpandedId] = React.useState<string | null>("opd_001");

  function approve(id: string) {
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, status: "approved" as const } : d));
  }
  function reject(id: string) {
    const reason = prompt("Why reject? (the operator learns from this)");
    if (reason === null) return;
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, status: "rejected" as const } : d));
  }
  function edit(id: string) {
    alert("Edit mode: opens the editor in the real app. In dev, this just marks it as edited.");
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, status: "edited" as const } : d));
  }
  function send(id: string) {
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, status: "sent" as const } : d));
  }

  const pending = drafts.filter((d) => d.status === "pending");
  const sent = drafts.filter((d) => d.status === "sent").length;
  const totalCost = drafts.reduce((a, d) => a + d.costUsd, 0);
  const approvalRate = drafts.filter((d) => d.status === "approved" || d.status === "edited" || d.status === "sent").length / Math.max(1, drafts.filter((d) => d.status !== "pending").length);

  const visible = filter === "pending" ? pending : drafts;

  return (
    <>
      <PageHeader
        title="Operator"
        subtitle={`${pending.length} pending. ${sent} sent this week. ${totalCost.toFixed(3)} in AI cost.`}
        action={
          <div className="flex items-center gap-1 bg-ink2 border border-ink3 rounded-sm p-0.5">
            <button onClick={() => setFilter("pending")} className={cn("px-3 py-1.5 text-xs rounded-xs", filter === "pending" ? "bg-accent/15 text-accent" : "text-cream3")}>
              Pending ({pending.length})
            </button>
            <button onClick={() => setFilter("all")} className={cn("px-3 py-1.5 text-xs rounded-xs", filter === "all" ? "bg-accent/15 text-accent" : "text-cream3")}>
              All
            </button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        <Stat label="Pending" value={pending.length} sub="awaiting your review" />
        <Stat label="Sent this week" value={sent} sub="drafts approved & sent" />
        <Stat label="AI cost (7d)" value={`$${totalCost.toFixed(3)}`} sub="all drafts combined" />
        <Stat label="Approval rate" value={`${Math.round(approvalRate * 100)}%`} sub="approved or edited" trend={approvalRate > 0.5 ? { dir: "up", pct: 4 } : { dir: "down", pct: 2 }} />
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Check className="h-8 w-8" />}
            title="Inbox zero."
            description="No drafts waiting. The operator will surface new ones as they come up."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              expanded={expandedId === d.id}
              onToggle={() => setExpandedId(expandedId === d.id ? null : d.id)}
              onApprove={() => approve(d.id)}
              onReject={() => reject(d.id)}
              onEdit={() => edit(d.id)}
              onSend={() => send(d.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DraftCard({ draft, expanded, onToggle, onApprove, onReject, onEdit, onSend }: {
  draft: Draft;
  expanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onSend: () => void;
}) {
  const meta = KIND_META[draft.kind];
  return (
    <Card>
      <div className="flex items-start gap-3 cursor-pointer" onClick={onToggle}>
        <div className="mt-0.5">{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone={meta.tone}>{meta.label}</Pill>
            <Pill tone="neutral">{draft.channel}</Pill>
            <StatusPill status={draft.status} />
            <span className="text-xs text-cream3 font-mono ml-auto">${draft.costUsd.toFixed(4)} · {draft.modelUsed}</span>
          </div>
          <h3 className="mt-2 font-serif text-lg text-cream">{draft.title}</h3>
          {!expanded && <p className="mt-1 text-sm text-cream3 line-clamp-1">{draft.reasoning}</p>}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-cream3 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-cream3 flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="bg-ink3/30 border border-ink3 rounded-sm p-3">
            <p className="text-xs uppercase tracking-wider text-accent mb-1.5">Why the operator drafted this</p>
            <p className="text-sm text-cream2 leading-relaxed">{draft.reasoning}</p>
          </div>

          <div className="bg-ink border border-ink3 rounded-sm p-4 max-h-[400px] overflow-y-auto">
            <pre className="whitespace-pre-wrap font-sans text-sm text-cream leading-relaxed">{draft.body}</pre>
          </div>

          {draft.status === "pending" && (
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onReject}><X className="h-4 w-4" /> Reject</Button>
                <Button variant="ghost" onClick={onEdit}><Edit3 className="h-4 w-4" /> Edit</Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onApprove}><Check className="h-4 w-4" /> Approve · send at next sync</Button>
                <Button onClick={() => { onApprove(); onSend(); }}><Send className="h-4 w-4" /> Approve & send now</Button>
              </div>
            </div>
          )}
          {draft.status === "approved" && (
            <div className="flex items-center justify-between pt-2">
              <Pill tone="info"><Clock className="h-3 w-3" /> Approved · will send at next sync (within 5 min)</Pill>
              <Button onClick={onSend}><Send className="h-4 w-4" /> Send now</Button>
            </div>
          )}
          {draft.status === "sent" && (
            <Pill tone="success"><Check className="h-3 w-3" /> Sent</Pill>
          )}
          {draft.status === "rejected" && (
            <Pill tone="danger"><X className="h-3 w-3" /> Rejected · the operator learns from this</Pill>
          )}
          {draft.status === "edited" && (
            <Pill tone="warning"><Edit3 className="h-3 w-3" /> Edited · your version will be sent</Pill>
          )}
          {draft.status === "failed" && (
            <Pill tone="danger"><AlertCircle className="h-3 w-3" /> Send failed · check error in detail</Pill>
          )}
        </div>
      )}
    </Card>
  );
}

function StatusPill({ status }: { status: Draft["status"] }) {
  const meta: Record<Draft["status"], { tone: "neutral" | "info" | "warning" | "success" | "danger"; label: string }> = {
    pending: { tone: "warning", label: "Pending" },
    approved: { tone: "info", label: "Approved" },
    edited: { tone: "info", label: "Edited" },
    rejected: { tone: "danger", label: "Rejected" },
    sent: { tone: "success", label: "Sent" },
    skipped: { tone: "neutral", label: "Skipped" },
    failed: { tone: "danger", label: "Failed" },
  };
  const m = meta[status];
  return <Pill tone={m.tone}>{m.label}</Pill>;
}
