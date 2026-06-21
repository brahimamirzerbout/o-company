"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, PageHeader, Avatar, Pill } from "@o/ui";
import { ArrowLeft, Mail, Phone, Briefcase, Calendar, RefreshCw, RadioTower } from "lucide-react";
import { cn } from "@o/ui";

interface TimelineEvent {
  id: string;
  at: string;
  type: string;
  channel: "email" | "sms" | "in_app" | "system" | "payment" | "ticket" | "photo";
  summary: string;
  actorName: string | null;
  meta: Record<string, unknown>;
}

const CHANNEL_META: Record<TimelineEvent["channel"], { tone: "accent" | "info" | "success" | "warning" | "danger" | "neutral"; symbol: string }> = {
  email:    { tone: "accent",  symbol: "✉" },
  payment:  { tone: "success", symbol: "✓" },
  ticket:   { tone: "warning", symbol: "!" },
  photo:    { tone: "info",    symbol: "▢" },
  in_app:   { tone: "neutral",  symbol: "•" },
  system:   { tone: "neutral",  symbol: "·" },
  sms:      { tone: "info",    symbol: "✉" },
};

const ACTION_SUMMARY: Record<string, string> = {
  "operator.draft_created":    "Operator drafted a follow-up",
  "operator.draft_approved":   "Approved a draft and prepared it to send",
  "operator.draft_rejected":   "Rejected a draft",
  "operator.draft_sent":       "Sent an email",
  "invoice.create":            "Invoice drafted",
  "invoice.send":              "Invoice sent",
  "invoice.pay":               "Invoice paid",
  "invoice.refund":            "Invoice refunded",
  "ticket.create":             "Ticket opened",
  "ticket.reply":              "Replied to ticket",
  "ticket.resolve":            "Ticket resolved",
  "photo.upload":              "Photo uploaded",
  "photo.deliver":             "Photo delivered",
  "deal.create":               "Deal created",
  "deal.stage_change":         "Deal stage changed",
  "deal.delete":               "Deal deleted",
  "deal.won":                  "Deal won",
  "deal.lost":                 "Deal lost",
  "contact.create":            "Contact added",
  "contact.update":            "Contact updated",
  "contact.bulk_update":       "Contact updated (bulk)",
  "contact.bulk_delete":       "Contact deleted (bulk)",
  "person.invite":             "Invited to the team",
  "auth.login":                "Signed in",
};

function inferChannel(action: string): TimelineEvent["channel"] {
  if (action.startsWith("operator.")) return "email";
  if (action.startsWith("invoice.") || action.startsWith("payment.")) return "payment";
  if (action.startsWith("ticket.")) return "ticket";
  if (action.startsWith("photo.")) return "photo";
  if (action.startsWith("auth.")) return "system";
  return "in_app";
}

function humanize(action: string): string {
  if (ACTION_SUMMARY[action]) return ACTION_SUMMARY[action];
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ContactDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [events, setEvents] = React.useState<TimelineEvent[]>([]);
  const [contactName, setContactName] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [streaming, setStreaming] = React.useState(false);
  const [lastLiveAt, setLastLiveAt] = React.useState<string | null>(null);

  // Initial load via REST. Subsequent updates via SSE.
  async function loadInitial() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${id}/timeline?limit=50`);
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const data = await res.json();
      setEvents(data.events);
      setContactName(data.contactName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // SSE subscription. Reconnects on disconnect.
  React.useEffect(() => {
    if (!id) return;
    loadInitial();

    let es: EventSource | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      es = new EventSource(`/api/contacts/${id}/timeline/stream`);
      es.addEventListener("ready", () => {
        setStreaming(true);
      });
      es.addEventListener("event", (e) => {
        try {
          const ev = JSON.parse((e as MessageEvent).data) as {
            id: string;
            type: string;
            subjectType: string;
            subjectId: string;
            at: string;
            actorId: string | null;
          };
          setEvents((prev) => {
            if (prev.some((p) => p.id === ev.id)) return prev;
            return [{
              id: ev.id,
              at: ev.at,
              type: ev.type,
              channel: inferChannel(ev.type),
              summary: humanize(ev.type),
              actorName: null,  // we don't resolve names in the stream; could
              meta: { subjectType: ev.subjectType, subjectId: ev.subjectId },
            }, ...prev];
          });
          setLastLiveAt(new Date().toISOString());
        } catch { /* ignore parse errors */ }
      });
      es.onerror = () => {
        setStreaming(false);
        es?.close();
        // Reconnect after 3s
        if (!cancelled) setTimeout(connect, 3_000);
      };
    }

    connect();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [id]);

  return (
    <>
      <div className="mb-4">
        <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-cream3 hover:text-accent">
          <ArrowLeft className="h-3.5 w-3.5" /> All contacts
        </Link>
      </div>

      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl text-cream">{contactName || "Contact"}</h1>
          <p className="text-sm text-cream3 mt-1 flex items-center gap-2">
            Activity timeline. Newest first.
            {streaming && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <RadioTower className="h-3 w-3" />
                live
                {lastLiveAt && <span className="text-cream3">· {relativeTime(lastLiveAt)}</span>}
              </span>
            )}
            {!streaming && !loading && (
              <span className="text-xs text-cream3">reconnecting…</span>
            )}
          </p>
        </div>
        <button onClick={loadInitial} className="o-btn-ghost" disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {error && (
        <Card>
          <div className="text-sm text-danger">{error}</div>
        </Card>
      )}

      {loading && events.length === 0 ? (
        <Card>
          <div className="text-sm text-cream3">Loading timeline…</div>
        </Card>
      ) : events.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-cream">No activity yet.</p>
            <p className="text-sm text-cream3 mt-1">
              Once the operator sends a draft, an invoice is paid, or a photo is delivered,
              the activity will appear here — live, without refreshing.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <ol className="relative">
            {events.map((e, idx) => {
              const meta = CHANNEL_META[e.channel] ?? CHANNEL_META.in_app;
              const isLast = idx === events.length - 1;
              return (
                <li key={e.id} className="flex gap-4 pb-6 relative">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium",
                      meta.tone === "accent" && "bg-accent/15 text-accent",
                      meta.tone === "success" && "bg-emerald-500/15 text-emerald-400",
                      meta.tone === "warning" && "bg-amber-500/15 text-amber-400",
                      meta.tone === "danger" && "bg-red-500/15 text-red-400",
                      meta.tone === "info" && "bg-sky-500/15 text-sky-400",
                      meta.tone === "neutral" && "bg-ink3 text-cream3",
                    )}>
                      {meta.symbol}
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-ink3 mt-2" />}
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm text-cream">{e.summary}</p>
                      <span className="text-xs text-cream3 flex-shrink-0" title={e.at}>
                        {relativeTime(e.at)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-cream3">
                      <Pill tone={meta.tone}>{e.channel}</Pill>
                      {e.actorName && <span>by {e.actorName}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <div className="mt-6 text-xs text-cream3">
        Showing {events.length} events. New events appear live as the operator fires, payments arrive, and photos deliver. No refresh needed.
      </div>
    </>
  );
}
