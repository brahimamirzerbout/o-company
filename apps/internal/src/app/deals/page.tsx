"use client";

import * as React from "react";
import { PageHeader, Card, Pill, Button, Input } from "@o/ui";
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
