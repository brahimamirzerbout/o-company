"use client";

import * as React from "react";
import { PageHeader, Card, Pill, Button } from "@o/ui";
import { Plus, Briefcase } from "lucide-react";

const SAMPLE = [
  { id: "p1", name: "Northwind website refresh", client: "Northwind",  status: "active",    value: 12000, due: "Jul 12" },
  { id: "p2", name: "Helios lead-form + CRM",    client: "Helios",     status: "active",    value: 28000, due: "Aug 03" },
  { id: "p3", name: "Atlas automation suite",   client: "Atlas",      status: "review",    value:  8800, due: "Jun 28" },
  { id: "p4", name: "Quanta photo pipeline",    client: "Quanta",     status: "scoping",   value: 18000, due: "Aug 21" },
  { id: "p5", name: "Polaris onboarding",       client: "Polaris",    status: "proposed",  value:  9500, due: "Sep 05" },
  { id: "p6", name: "Brightline analytics",     client: "Brightline", status: "active",    value: 31000, due: "Aug 30" },
];

const TONE: Record<string, "info" | "success" | "warning" | "neutral" | "accent"> = {
  scoping: "neutral", proposed: "accent", active: "info", review: "warning", delivered: "success",
};

function fmt(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`${SAMPLE.length} active engagements`}
        action={<Button><Plus className="h-4 w-4" /> New project</Button>}
      />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink3 bg-ink3/30 text-xs uppercase tracking-wider text-cream3">
              <th className="px-4 py-3 text-left">Project</th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Value</th>
              <th className="px-4 py-3 text-left">Due</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE.map((p) => (
              <tr key={p.id} className="border-b border-ink3/40 last:border-0 hover:bg-ink3/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-4 w-4 text-accent" />
                    <span className="text-cream font-medium">{p.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-cream2">{p.client}</td>
                <td className="px-4 py-3"><Pill tone={TONE[p.status]}>{p.status}</Pill></td>
                <td className="px-4 py-3 text-cream font-mono">{fmt(p.value)}</td>
                <td className="px-4 py-3 text-cream3 text-xs font-mono">{p.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
