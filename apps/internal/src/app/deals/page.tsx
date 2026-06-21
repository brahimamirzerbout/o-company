"use client";

import * as React from "react";
import { PageHeader, Card, Pill, Button, Input, Stat } from "@o/ui";
import { Plus, GripVertical } from "lucide-react";

interface Deal { id: string; name: string; contact: string; amount: number; stage: string }

const STAGES = [
  { id: "lead",        label: "Lead",        color: "#94A3B8" },
  { id: "qualified",   label: "Qualified",   color: "#38BDF8" },
  { id: "proposal",    label: "Proposal",    color: "#A78BFA" },
  { id: "negotiation", label: "Negotiation", color: "#FBBF24" },
  { id: "won",         label: "Won",         color: "#34D399" },
] as const;

const SAMPLE: Deal[] = [
  { id: "d1", name: "Northwind renewal",        contact: "Marcus Reyes",   amount: 24000, stage: "negotiation" },
  { id: "d2", name: "Helios SOW — Phase 2",    contact: "Priya Anand",    amount: 42000, stage: "proposal" },
  { id: "d3", name: "Atlas automation",        contact: "Jonas Lindqvist", amount:  8800, stage: "qualified" },
  { id: "d4", name: "Polaris onboarding",      contact: "Lila Okafor",    amount: 18500, stage: "lead" },
  { id: "d5", name: "Quanta creative brief",   contact: "Sofia Marin",    amount:  6500, stage: "proposal" },
  { id: "d6", name: "Brightline analytics",    contact: "Omar Said",      amount: 31000, stage: "negotiation" },
];

function fmt(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }

export default function DealsPage() {
  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="Drag deals between stages · probability-weighted forecast"
        action={<Button><Plus className="h-4 w-4" /> New deal</Button>}
      />
      <PipelineHealth />
      <div className="grid gap-4 lg:grid-cols-5">
        {STAGES.map((s) => {
          const stageDeals = SAMPLE.filter((d) => d.stage === s.id);
          const total = stageDeals.reduce((a, d) => a + d.amount, 0);
          return (
            <div key={s.id} className="bg-ink2 border border-ink3 rounded-md">
              <div className="px-3 py-3 border-b border-ink3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <h2 className="text-sm font-semibold text-cream">{s.label}</h2>
                </div>
                <Pill tone="neutral">{stageDeals.length}</Pill>
              </div>
              <div className="p-2 min-h-[200px] space-y-2">
                {stageDeals.map((d) => (
                  <div key={d.id} className="bg-ink border border-ink3 rounded-sm p-3 cursor-grab active:cursor-grabbing">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-medium text-cream">{d.name}</p>
                      <GripVertical className="h-3.5 w-3.5 text-cream3" />
                    </div>
                    <p className="mt-1 text-xs text-cream3">{d.contact}</p>
                    <p className="mt-2 text-sm font-mono text-accent">{fmt(d.amount)}</p>
                  </div>
                ))}
                {stageDeals.length === 0 && (
                  <div className="text-center text-xs text-cream3 py-6">Drop deals here</div>
                )}
              </div>
              <div className="px-3 py-2 border-t border-ink3 text-xs text-cream3 font-mono">
                {fmt(total)}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// =============================================================================
// Pipeline health strip
// =============================================================================
// Shows the headline numbers a sales lead looks at first:
//   - Total open value (sum of amountCents for open deals)
//   - Weighted value (sum of amount * probability)
//   - Stale deals (open deals not touched in 14+ days) — the "going cold" signal
//   - About to close (open deals expected to close in the next 7 days)
//   - Closed this month (count and value)
// All numbers come from GET /api/crm/deals/insights.

function PipelineHealth() {
  const [data, setData] = React.useState<null | {
    pipelineHealth: {
      stale: number;
      aboutToClose: number;
      totalOpenValueCents: number;
      weightedValueCents: number;
    };
    closedThisMonth: { count: number; totalCents: number };
    winsByReason: { reason: string; count: number; totalCents: number }[];
    lossesByReason: { reason: string; count: number; totalCents: number }[];
  }>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/crm/deals/insights")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return <div className="mb-4 text-sm text-cream3">Pipeline health unavailable.</div>;
  }
  if (!data) {
    return <div className="mb-4 h-20 bg-ink2 border border-ink3 rounded-md animate-pulse-soft" />;
  }

  const { pipelineHealth, closedThisMonth, winsByReason, lossesByReason } = data;
  const topWin = winsByReason[0];
  const topLoss = lossesByReason[0];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        <Stat label="Open value"          value={fmt(pipelineHealth.totalOpenValueCents)} sub="across all open deals" />
        <Stat label="Weighted forecast"   value={fmt(pipelineHealth.weightedValueCents)} sub="amount × probability" />
        <Stat label="Stale deals"         value={String(pipelineHealth.stale)} sub="untouched 14+ days" tone={pipelineHealth.stale > 0 ? "warning" : "neutral"} />
        <Stat label="About to close"      value={String(pipelineHealth.aboutToClose)} sub="expected in 7 days" />
        <Stat label="Closed this month"   value={fmt(closedThisMonth.totalCents)} sub={`${closedThisMonth.count} deals`} tone="success" />
      </div>
      {(topWin || topLoss) && (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          {topWin && (
            <Card title="Why we win" description="Top reason deals close won">
              <p className="text-sm text-cream2">"{topWin.reason}"</p>
              <p className="mt-1 text-xs text-cream3">{topWin.count} deals · {fmt(topWin.totalCents)}</p>
            </Card>
          )}
          {topLoss && (
            <Card title="Why we lose" description="Top reason deals close lost">
              <p className="text-sm text-cream2">"{topLoss.reason}"</p>
              <p className="mt-1 text-xs text-cream3">{topLoss.count} deals · {fmt(topLoss.totalCents)}</p>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
