"use client";

import * as React from "react";
import Link from "next/link";
import { Card, Pill, Button, EmptyState } from "@o/ui";
import {
  Sparkles, Clock, FileText, Image as ImageIcon, CheckCircle2,
  MessageSquare, Bell, BellOff, ArrowRight, RefreshCw, Inbox,
  AlertCircle, Briefcase, FileCheck, Receipt,
} from "lucide-react";
import { cn } from "@o/ui";

// =============================================================================
// Brief Inbox — the client portal's home page
// =============================================================================
// What the client sees first when they open their portal. One feed.
// Every entry: AI summary, action button, "talk to us" link.
// Reads in 10 seconds. Replaces the need to ask "what's happening?"
//
// Data shape: matches what /api/brief returns. In dev mode, we use mock
// data and dispatch events locally to mark read/archive.

interface BriefEntry {
  id: string;
  kind: "photo_ready" | "invoice_sent" | "invoice_paid" | "invoice_overdue"
       | "milestone_complete" | "milestone_started" | "file_shared"
       | "time_logged" | "message_received" | "project_started"
       | "project_completed" | "lead_update" | "system";
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  summary: string;
  actionLabel: string | null;
  actionHref: string | null;
  groupId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface DayGroup {
  day: string;
  label: string;
  entries: BriefEntry[];
}

const KIND_META: Record<BriefEntry["kind"], { icon: React.ReactNode; tone: "accent" | "info" | "success" | "warning" | "danger" | "neutral"; verb: string }> = {
  photo_ready:        { icon: <ImageIcon className="h-3.5 w-3.5" />,     tone: "success",  verb: "Photos" },
  invoice_sent:       { icon: <FileText className="h-3.5 w-3.5" />,      tone: "info",     verb: "Invoice" },
  invoice_paid:       { icon: <FileCheck className="h-3.5 w-3.5" />,      tone: "success",  verb: "Payment" },
  invoice_overdue:    { icon: <AlertCircle className="h-3.5 w-3.5" />,   tone: "danger",   verb: "Overdue" },
  milestone_complete: { icon: <CheckCircle2 className="h-3.5 w-3.5" />,   tone: "success",  verb: "Milestone" },
  milestone_started:  { icon: <Briefcase className="h-3.5 w-3.5" />,      tone: "info",     verb: "Started" },
  file_shared:        { icon: <FileText className="h-3.5 w-3.5" />,      tone: "neutral",  verb: "File" },
  time_logged:        { icon: <Clock className="h-3.5 w-3.5" />,         tone: "neutral",  verb: "Work" },
  message_received:   { icon: <MessageSquare className="h-3.5 w-3.5" />, tone: "info",     verb: "Message" },
  project_started:    { icon: <Briefcase className="h-3.5 w-3.5" />,      tone: "accent",   verb: "Project" },
  project_completed:  { icon: <CheckCircle2 className="h-3.5 w-3.5" />,   tone: "success",  verb: "Done" },
  lead_update:        { icon: <Sparkles className="h-3.5 w-3.5" />,      tone: "neutral",  verb: "Update" },
  system:             { icon: <Bell className="h-3.5 w-3.5" />,          tone: "neutral",  verb: "Note" },
};

const MOCK_GROUPS: DayGroup[] = [
  {
    day: "2026-06-20",
    label: "Today",
    entries: [
      {
        id: "brf_001",
        kind: "photo_ready",
        priority: "normal",
        title: "Photos ready: brand-shoot-04.jpg",
        summary: "Your 8 variations are ready. Cropped, color-graded, and upscaled. View and download the ones you want — they'll stay in your gallery for 90 days.",
        actionLabel: "View variations",
        actionHref: "/photos",
        groupId: "grp_photo_xyz",
        readAt: null,
        createdAt: "2026-06-20T14:32:00Z",
      },
      {
        id: "brf_002",
        kind: "invoice_sent",
        priority: "normal",
        title: "Invoice INV-2026-022 · $31,000",
        summary: "Invoice for the Brightline analytics engagement was sent. Net 30, due July 12. Pay from your portal or reply if anything's off.",
        actionLabel: "View invoice",
        actionHref: "/invoices",
        groupId: null,
        readAt: null,
        createdAt: "2026-06-20T11:15:00Z",
      },
      {
        id: "brf_003",
        kind: "milestone_complete",
        priority: "high",
        title: "Done: Helios lead-form v1",
        summary: "The first version of the lead-form is live in staging. Next: review and approve, then we move it to production.",
        actionLabel: "Review",
        actionHref: "/projects",
        groupId: null,
        readAt: null,
        createdAt: "2026-06-20T09:48:00Z",
      },
    ],
  },
  {
    day: "2026-06-19",
    label: "Yesterday",
    entries: [
      {
        id: "brf_004",
        kind: "time_logged",
        priority: "low",
        title: "Work on Northwind website refresh",
        summary: "2.5 hours on the hero section. Wireframes ready, design pass starting tomorrow.",
        actionLabel: "View project",
        actionHref: "/projects",
        groupId: null,
        readAt: "2026-06-19T18:00:00Z",
        createdAt: "2026-06-19T17:20:00Z",
      },
      {
        id: "brf_005",
        kind: "message_received",
        priority: "normal",
        title: "Reply from Priya (Helios)",
        summary: "Priya confirmed the SOW for Phase 2. She wants to start next Monday. Reply with any questions or approve to lock the timeline.",
        actionLabel: "Open thread",
        actionHref: "/messages",
        groupId: null,
        readAt: "2026-06-19T15:42:00Z",
        createdAt: "2026-06-19T15:30:00Z",
      },
    ],
  },
  {
    day: "2026-06-18",
    label: "Wednesday",
    entries: [
      {
        id: "brf_006",
        kind: "file_shared",
        priority: "normal",
        title: "New file: brand-kit-final.zip",
        summary: "Updated brand kit with the new wordmark and color tokens. 12 MB.",
        actionLabel: "Download",
        actionHref: "/files",
        groupId: null,
        readAt: "2026-06-18T16:00:00Z",
        createdAt: "2026-06-18T15:45:00Z",
      },
    ],
  },
  {
    day: "2026-06-17",
    label: "Tuesday",
    entries: [
      {
        id: "brf_007",
        kind: "invoice_paid",
        priority: "low",
        title: "Paid · INV-2026-020 · $12,000",
        summary: "Payment received. Receipt is in your portal. Thanks.",
        actionLabel: "Download receipt",
        actionHref: "/invoices",
        groupId: null,
        readAt: "2026-06-17T10:00:00Z",
        createdAt: "2026-06-17T09:18:00Z",
      },
    ],
  },
];

export function BriefInbox() {
  const [groups, setGroups] = React.useState<DayGroup[]>(MOCK_GROUPS);
  const [filter, setFilter] = React.useState<"unread" | "all">("unread");
  const [showAll, setShowAll] = React.useState(false);

  function markRead(id: string) {
    setGroups((prev) => prev.map((g) => ({
      ...g,
      entries: g.entries.map((e) => e.id === id ? { ...e, readAt: new Date().toISOString() } : e),
    })));
  }
  function markAllRead() {
    const now = new Date().toISOString();
    setGroups((prev) => prev.map((g) => ({
      ...g,
      entries: g.entries.map((e) => e.readAt ? e : { ...e, readAt: now }),
    })));
  }
  function archive(id: string) {
    setGroups((prev) => prev
      .map((g) => ({ ...g, entries: g.entries.filter((e) => e.id !== id) }))
      .filter((g) => g.entries.length > 0)
    );
  }

  // Dev-only: listen for photo-ready events from the gallery component
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onPhotoReady = (e: Event) => {
      const detail = (e as CustomEvent).detail as { jobId: string; filename: string; variationCount: number; totalCostUsd: number };
      const newEntry: BriefEntry = {
        id: `brf_dev_${Date.now()}`,
        kind: "photo_ready",
        priority: "normal",
        title: `Photos ready: ${detail.filename}`,
        summary: `Your ${detail.variationCount} variations are ready. $${detail.totalCostUsd.toFixed(2)} total. View and download the ones you want.`,
        actionLabel: "View variations",
        actionHref: "/photos",
        groupId: `grp_photo_${detail.jobId}`,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      setGroups((prev) => {
        const today = prev[0]?.day ?? new Date().toISOString().slice(0, 10);
        if (prev[0]?.day === today) {
          return [{ ...prev[0], entries: [newEntry, ...prev[0].entries] }, ...prev.slice(1)];
        }
        return [{ day: today, label: "Today", entries: [newEntry] }, ...prev];
      });
    };
    window.addEventListener("o:brief-photo-ready-dev", onPhotoReady as EventListener);
    return () => window.removeEventListener("o:brief-photo-ready-dev", onPhotoReady as EventListener);
  }, []);

  const allEntries = groups.flatMap((g) => g.entries);
  const unread = allEntries.filter((e) => !e.readAt);
  const visibleGroups = groups
    .map((g) => ({ ...g, entries: filter === "unread" ? g.entries.filter((e) => !e.readAt) : g.entries }))
    .filter((g) => g.entries.length > 0);

  // Show first 3 day groups by default; show the rest if "showAll"
  const displayedGroups = showAll ? visibleGroups : visibleGroups.slice(0, 3);

  return (
    <div>
      {/* Header strip */}
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="font-serif text-2xl text-cream">Your brief</h2>
          <p className="text-sm text-cream3 mt-1">
            {unread.length === 0
              ? "You're all caught up."
              : `${unread.length} new ${unread.length === 1 ? "update" : "updates"} since you last looked.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
          <div className="flex items-center bg-ink2 border border-ink3 rounded-sm p-0.5">
            <button onClick={() => setFilter("unread")} className={cn("px-3 py-1.5 text-xs rounded-xs", filter === "unread" ? "bg-accent/15 text-accent" : "text-cream3")}>
              Unread ({unread.length})
            </button>
            <button onClick={() => setFilter("all")} className={cn("px-3 py-1.5 text-xs rounded-xs", filter === "all" ? "bg-accent/15 text-accent" : "text-cream3")}>
              All
            </button>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {visibleGroups.length === 0 && (
        <Card>
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title={filter === "unread" ? "Inbox zero." : "Nothing yet."}
            description={
              filter === "unread"
                ? "You've read everything. New updates will show up here as they happen."
                : "Updates from your projects will show up here."
            }
          />
        </Card>
      )}

      {/* Day groups */}
      <div className="space-y-6">
        {displayedGroups.map((g) => (
          <div key={g.day}>
            <div className="flex items-baseline gap-3 mb-2">
              <h3 className="text-xs uppercase tracking-[0.25em] text-accent font-medium">{g.label}</h3>
              <span className="text-xs text-cream3 font-mono">{g.day}</span>
              <div className="flex-1 h-px bg-ink3" />
            </div>
            <div className="space-y-2">
              {g.entries.map((e) => (
                <EntryCard key={e.id} entry={e} onRead={() => markRead(e.id)} onArchive={() => archive(e.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Show older */}
      {visibleGroups.length > 3 && !showAll && (
        <div className="mt-6 text-center">
          <Button variant="ghost" onClick={() => setShowAll(true)}>
            <RefreshCw className="h-3.5 w-3.5" /> Show {visibleGroups.length - 3} older
          </Button>
        </div>
      )}

      {/* Talk to us — always visible at the bottom */}
      <Card className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-4 w-4 text-accent" />
            <div>
              <p className="text-cream text-sm font-medium">Need something else?</p>
              <p className="text-xs text-cream3">The operator replies within 1 business hour.</p>
            </div>
          </div>
          <Link href="/messages" className="o-btn-primary">
            <MessageSquare className="h-4 w-4" /> Message us
          </Link>
        </div>
      </Card>
    </div>
  );
}

function EntryCard({ entry, onRead, onArchive }: { entry: BriefEntry; onRead: () => void; onArchive: () => void }) {
  const meta = KIND_META[entry.kind];
  const isUnread = !entry.readAt;
  return (
    <div
      onClick={onRead}
      className={cn(
        "group relative rounded-sm border transition cursor-pointer",
        isUnread
          ? "border-accent/30 bg-accent/[0.04]"
          : "border-ink3 bg-ink2/50 hover:bg-ink2",
      )}
    >
      {isUnread && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-accent" />
      )}
      <div className={cn("p-4", isUnread && "pl-7")}>
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone={meta.tone}>
              <span className="flex items-center gap-1">{meta.icon} {meta.verb}</span>
            </Pill>
            {entry.priority === "urgent" && <Pill tone="danger">Urgent</Pill>}
            {entry.priority === "high" && <Pill tone="warning">High</Pill>}
            {isUnread && <Pill tone="accent">New</Pill>}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="opacity-0 group-hover:opacity-100 text-cream3 hover:text-cream text-xs p-1"
            title="Archive"
          >
            <BellOff className="h-3.5 w-3.5" />
          </button>
        </div>
        <h4 className={cn("font-serif text-lg", isUnread ? "text-cream" : "text-cream2")}>{entry.title}</h4>
        <p className="mt-1.5 text-sm text-cream3 leading-relaxed">{entry.summary}</p>
        {entry.actionHref && entry.actionLabel && (
          <div className="mt-3">
            <Link
              href={entry.actionHref}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              {entry.actionLabel} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
