"use client";

import * as React from "react";
import { PageHeader, Card, Pill, Stat, Button, EmptyState } from "@o/ui";
import {
  Sparkles, Clock, FileText, Image as ImageIcon, CheckCircle2,
  MessageSquare, Bell, BellOff, ArrowRight, Inbox, AlertCircle,
  Briefcase, FileCheck, RefreshCw, Send,
} from "lucide-react";
import { cn } from "@o/ui";

// =============================================================================
// Internal · Brief preview
// =============================================================================
// What O'Shay sees: every brief entry for every contact in his org, in
// one place. He can:
//   - see what the operator is sending to clients
//   - spot bad summaries (the LLM is doing a poor job on a contact)
//   - see who's been "told" what (compliance / audit)
//   - re-trigger a summary if the original was bad
//
// In dev, mock data. In prod, the same /api/brief endpoints, with the
// `contactId` query param set to inspect a specific contact's feed.

interface BriefEntry {
  id: string;
  contactId: string;
  contactName: string;
  company: string;
  kind: "photo_ready" | "invoice_sent" | "invoice_paid" | "invoice_overdue"
       | "milestone_complete" | "milestone_started" | "file_shared"
       | "time_logged" | "message_received" | "project_started"
       | "project_completed" | "lead_update" | "system";
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  summary: string;
  actionLabel: string | null;
  actionHref: string | null;
  readAt: string | null;
  createdAt: string;
  modelUsed: string;
  costUsd: number;
}

const KIND_META: Record<BriefEntry["kind"], { tone: "accent" | "info" | "success" | "warning" | "danger" | "neutral"; verb: string }> = {
  photo_ready:        { tone: "success",  verb: "Photos" },
  invoice_sent:       { tone: "info",     verb: "Invoice" },
  invoice_paid:       { tone: "success",  verb: "Payment" },
  invoice_overdue:    { tone: "danger",   verb: "Overdue" },
  milestone_complete: { tone: "success",  verb: "Milestone" },
  milestone_started:  { tone: "info",     verb: "Started" },
  file_shared:        { tone: "neutral",  verb: "File" },
  time_logged:        { tone: "neutral",  verb: "Work" },
  message_received:   { tone: "info",     verb: "Message" },
  project_started:    { tone: "accent",   verb: "Project" },
  project_completed:  { tone: "success",  verb: "Done" },
  lead_update:        { tone: "neutral",  verb: "Update" },
  system:             { tone: "neutral",  verb: "Note" },
};

const MOCK: BriefEntry[] = [
  { id: "brf_001", contactId: "c_northwind", contactName: "Marcus Reyes",   company: "Northwind",  kind: "photo_ready",        priority: "normal", title: "Photos ready: brand-shoot-04.jpg", summary: "Your 8 variations are ready. Cropped, color-graded, and upscaled.", actionLabel: "View variations", actionHref: "/photos", readAt: null,     createdAt: "2026-06-20T14:32:00Z", modelUsed: "gpt-4o-mini", costUsd: 0.0008 },
  { id: "brf_002", contactId: "c_brightline", contactName: "Omar Said",     company: "Brightline", kind: "invoice_sent",       priority: "normal", title: "Invoice INV-2026-022 · $31,000", summary: "Invoice for the analytics engagement was sent. Net 30, due July 12.", actionLabel: "View invoice", actionHref: "/invoices", readAt: null,     createdAt: "2026-06-20T11:15:00Z", modelUsed: "gpt-4o-mini", costUsd: 0.0006 },
  { id: "brf_003", contactId: "c_helios",    contactName: "Priya Anand",    company: "Helios",     kind: "milestone_complete", priority: "high",   title: "Done: Helios lead-form v1", summary: "The first version of the lead-form is live in staging. Next: review and approve.", actionLabel: "Review", actionHref: "/projects", readAt: null,     createdAt: "2026-06-20T09:48:00Z", modelUsed: "gpt-4o-mini", costUsd: 0.0007 },
  { id: "brf_004", contactId: "c_northwind", contactName: "Marcus Reyes",   company: "Northwind",  kind: "time_logged",        priority: "low",    title: "Work on Northwind website refresh", summary: "2.5 hours on the hero section. Wireframes ready, design pass starting tomorrow.", actionLabel: "View project", actionHref: "/projects", readAt: "2026-06-19T18:00:00Z", createdAt: "2026-06-19T17:20:00Z", modelUsed: "gpt-4o-mini", costUsd: 0.0004 },
  { id: "brf_005", contactId: "c_polaris",   contactName: "Lila Okafor",    company: "Polaris",    kind: "file_shared",        priority: "normal", title: "New file: brand-kit-final.zip", summary: "Updated brand kit with the new wordmark and color tokens. 12 MB.", actionLabel: "Download", actionHref: "/files", readAt: null,     createdAt: "2026-06-18T15:45:00Z", modelUsed: "gpt-4o-mini", costUsd: 0.0003 },
  { id: "brf_006", contactId: "c_northwind", contactName: "Marcus Reyes",   company: "Northwind",  kind: "invoice_paid",       priority: "low",    title: "Paid · INV-2026-020 · $12,000", summary: "Payment received. Receipt is in your portal. Thanks.", actionLabel: "Download receipt", actionHref: "/invoices", readAt: "2026-06-17T10:00:00Z", createdAt: "2026-06-17T09:18:00Z", modelUsed: "gpt-4o-mini", costUsd: 0.0002 },
];

export default function BriefPage() {
  const [entries, setEntries] = React.useState<BriefEntry[]>(MOCK);
  const [filterContact, setFilterContact] = React.useState<string | null>(null);

  const visible = filterContact
    ? entries.filter((e) => e.contactId === filterContact)
    : entries;

  const totalCost = entries.reduce((a, e) => a + e.costUsd, 0);
  const unread = entries.filter((e) => !e.readAt).length;
  const byContact = new Map<string, number>();
  for (const e of entries) byContact.set(e.contactId, (byContact.get(e.contactId) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Brief inbox"
        subtitle="What the operator is telling your clients, in one place."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost"><RefreshCw className="h-4 w-4" /> Re-run summaries</Button>
            <Button><Send className="h-4 w-4" /> Generate test entry</Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        <Stat label="Sent (7d)" value={entries.length} sub="brief entries to clients" />
        <Stat label="Unread by clients" value={unread} sub="haven't opened their portal yet" />
        <Stat label="AI cost (7d)" value={`$${totalCost.toFixed(4)}`} sub="all summaries combined" />
        <Stat label="Contacts notified" value={byContact.size} sub="with at least 1 entry" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {visible.length === 0 ? (
            <Card><EmptyState icon={<Inbox className="h-8 w-8" />} title="No entries match" description="Try clearing the filter." /></Card>
          ) : (
            visible.map((e) => <EntryRow key={e.id} entry={e} />)
          )}
        </div>
        <div>
          <Card title="By contact" description="Who is getting told what">
            <ul className="space-y-1">
              <li>
                <button onClick={() => setFilterContact(null)} className={cn("w-full text-left px-2 py-1.5 rounded-sm text-sm flex items-center justify-between", filterContact === null ? "bg-accent/10 text-accent" : "text-cream2 hover:bg-ink3/30")}>
                  <span>All contacts</span>
                  <Pill tone="neutral">{entries.length}</Pill>
                </button>
              </li>
              {Array.from(byContact.entries()).map(([id, n]) => {
                const e = entries.find((x) => x.contactId === id)!;
                return (
                  <li key={id}>
                    <button onClick={() => setFilterContact(id)} className={cn("w-full text-left px-2 py-1.5 rounded-sm text-sm flex items-center justify-between", filterContact === id ? "bg-accent/10 text-accent" : "text-cream2 hover:bg-ink3/30")}>
                      <span className="truncate">{e.contactName} <span className="text-cream3 text-xs">· {e.company}</span></span>
                      <Pill tone="neutral">{n}</Pill>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function EntryRow({ entry }: { entry: BriefEntry }) {
  const meta = KIND_META[entry.kind];
  const isUnread = !entry.readAt;
  return (
    <Card>
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Pill tone={meta.tone}>{meta.verb}</Pill>
            <Pill tone="neutral">{entry.contactName} · {entry.company}</Pill>
            {isUnread && <Pill tone="accent">Unread by client</Pill>}
            {entry.priority === "urgent" && <Pill tone="danger">Urgent</Pill>}
            <span className="text-xs text-cream3 font-mono ml-auto">${entry.costUsd.toFixed(4)} · {entry.modelUsed}</span>
          </div>
          <h3 className="font-serif text-lg text-cream">{entry.title}</h3>
        </div>
      </div>
      <p className="text-sm text-cream2 leading-relaxed pl-3 border-l-2 border-accent/30">{entry.summary}</p>
      <div className="mt-3 pt-3 border-t border-ink3 flex items-center justify-between text-xs text-cream3">
        <span>{new Date(entry.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
        <div className="flex items-center gap-2">
          <button className="hover:text-cream">Edit summary</button>
          <span>·</span>
          <button className="hover:text-cream">Re-run with feedback</button>
        </div>
      </div>
    </Card>
  );
}
