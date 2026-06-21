"use client";

import * as React from "react";
import Link from "next/link";
import { Card, Pill, Stat } from "@o/ui";
import { ArrowLeft, RefreshCw, Filter } from "lucide-react";
import { cn } from "@o/ui";

interface AuditEvent {
  id: string;
  type: string;
  actorId: string | null;
  actor: { name: string; email: string } | null;
  subjectType: string | null;
  subjectId: string | null;
  occurredAt: string;
}

const TYPE_META: Record<string, { tone: "accent" | "info" | "success" | "warning" | "danger" | "neutral"; label: string }> = {
  "auth.login":              { tone: "info",     label: "Login" },
  "auth.logout":             { tone: "neutral",  label: "Logout" },
  "auth.register":           { tone: "success",  label: "Register" },
  "auth.failed":             { tone: "danger",   label: "Login failed" },
  "person.invite":           { tone: "info",     label: "Person invited" },
  "person.role_change":      { tone: "warning",  label: "Role changed" },
  "person.deactivated":      { tone: "danger",   label: "Person deactivated" },
  "contact.create":          { tone: "success",  label: "Contact created" },
  "contact.update":          { tone: "info",     label: "Contact updated" },
  "contact.delete":          { tone: "danger",   label: "Contact deleted" },
  "deal.create":             { tone: "success",  label: "Deal created" },
  "deal.stage_change":       { tone: "info",     label: "Deal stage changed" },
  "invoice.create":          { tone: "success",  label: "Invoice created" },
  "invoice.send":            { tone: "info",     label: "Invoice sent" },
  "invoice.pay":             { tone: "success",  label: "Invoice paid" },
  "invoice.refund":          { tone: "warning",  label: "Invoice refunded" },
  "operator.draft_created":  { tone: "accent",   label: "Operator draft created" },
  "operator.draft_approved": { tone: "success",  label: "Operator draft approved" },
  "operator.draft_rejected": { tone: "danger",   label: "Operator draft rejected" },
  "operator.draft_sent":     { tone: "success",  label: "Operator draft sent" },
  "photo.upload":            { tone: "info",     label: "Photo upload" },
  "photo.process":           { tone: "info",     label: "Photo process" },
  "photo.deliver":           { tone: "success",  label: "Photo delivered" },
  "payment.stripe_event":    { tone: "neutral",  label: "Stripe event" },
  "org.create":              { tone: "success",  label: "Org created" },
  "org.transfer_ownership":  { tone: "warning",  label: "Ownership transferred" },
  "security.2fa_enabled":    { tone: "success",  label: "2FA enabled" },
  "security.api_key_created": { tone: "warning",  label: "API key created" },
};

function meta(type: string): { tone: "accent" | "info" | "success" | "warning" | "danger" | "neutral"; label: string } {
  return TYPE_META[type] ?? { tone: "neutral", label: type };
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AuditLogPage() {
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [summary, setSummary] = React.useState<{ total: number; last24h: number }>({ total: 0, last24h: 0 });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<string>("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filter) params.set("type", filter);
      const res = await fetch(`/api/audit?${params}`);
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const data = await res.json();
      setEvents(data.events);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); }, [filter]);

  return (
    <>
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl text-cream">Audit log</h1>
          <p className="text-sm text-cream3 mt-1">Every external side effect. Append-only.</p>
        </div>
        <button onClick={load} className="o-btn-ghost" disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Stat label="Total events" value={summary.total.toLocaleString()} sub="all time" />
        <Stat label="Last 24h" value={summary.last24h.toLocaleString()} sub="events recorded" />
        <Stat label="Filtered" value={filter || "All"} sub={filter ? "active filter" : "no filter"} />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-cream3 uppercase tracking-wider flex items-center gap-1">
          <Filter className="h-3 w-3" /> Filter by type
        </span>
        {["", "auth.login", "operator.draft_sent", "invoice.pay", "photo.deliver", "person.deactivated"].map((t) => (
          <button
            key={t || "all"}
            onClick={() => setFilter(t)}
            className={cn(
              "text-xs px-2 py-1 rounded-xs",
              filter === t
                ? "bg-accent/15 text-accent"
                : "bg-ink2 text-cream3 hover:text-cream"
            )}
          >
            {t || "All"}
          </button>
        ))}
      </div>

      {error && (
        <Card>
          <div className="text-sm text-danger">{error}</div>
        </Card>
      )}

      {loading && events.length === 0 ? (
        <Card>
          <div className="text-sm text-cream3">Loading…</div>
        </Card>
      ) : events.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-cream">No events match this filter.</p>
            <p className="text-sm text-cream3 mt-1">Try clearing the filter, or check that something has happened recently.</p>
          </div>
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink3 bg-ink3/30 text-xs uppercase tracking-wider text-cream3">
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Subject</th>
                <th className="px-4 py-3 text-left">When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const m = meta(e.type);
                return (
                  <tr key={e.id} className="border-b border-ink3/40 last:border-0 hover:bg-ink3/20">
                    <td className="px-4 py-3"><Pill tone={m.tone}>{m.label}</Pill></td>
                    <td className="px-4 py-3 text-cream2">
                      {e.actor ? (
                        <div>
                          <p className="text-cream">{e.actor.name}</p>
                          <p className="text-xs text-cream3">{e.actor.email}</p>
                        </div>
                      ) : (
                        <span className="text-cream3 italic">system</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-cream3 font-mono">
                      {e.subjectType ? `${e.subjectType}:${e.subjectId?.slice(0, 12)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-cream3 text-xs">
                      <span title={e.occurredAt}>{relativeTime(e.occurredAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mt-6 text-xs text-cream3">
        Showing {events.length} of {summary.total} events. Audit log is append-only — events are never modified or deleted.
      </div>
    </>
  );
}
