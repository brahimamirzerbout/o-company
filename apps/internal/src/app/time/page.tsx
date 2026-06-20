"use client";

import * as React from "react";
import { PageHeader, Card, Button } from "@o/ui";
import { Plus, Play, Square } from "lucide-react";

const SAMPLE = [
  { id: "e1", project: "Northwind website", milestone: "Design", date: "2026-06-20", hours: 2.5, billable: true,  description: "Wireframes for hero + pricing" },
  { id: "e2", project: "Helios lead-form",  milestone: "Build",   date: "2026-06-20", hours: 1.0, billable: true,  description: "Webhook routing" },
  { id: "e3", project: "Quanta photo",     milestone: "Calibrate", date: "2026-06-19", hours: 3.5, billable: true, description: "Style guardrails v2" },
  { id: "e4", project: "Internal",         milestone: "—",       date: "2026-06-19", hours: 1.0, billable: false, description: "Hiring review" },
  { id: "e5", project: "Atlas automation", milestone: "Build",   date: "2026-06-18", hours: 4.0, billable: true,  description: "Slack integration" },
];

export default function TimePage() {
  const total = SAMPLE.reduce((a, e) => a + e.hours, 0);
  const billable = SAMPLE.filter((e) => e.billable).reduce((a, e) => a + e.hours, 0);
  return (
    <>
      <PageHeader
        title="Time"
        subtitle={`${total.toFixed(1)} hours this week · ${billable.toFixed(1)} billable`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost"><Square className="h-4 w-4" /> Stop</Button>
            <Button><Plus className="h-4 w-4" /> Log time</Button>
          </div>
        }
      />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink3 bg-ink3/30 text-xs uppercase tracking-wider text-cream3">
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Project</th>
              <th className="px-4 py-3 text-left">Milestone</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-left">Hours</th>
              <th className="px-4 py-3 text-left">Billable</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE.map((e) => (
              <tr key={e.id} className="border-b border-ink3/40 last:border-0 hover:bg-ink3/30">
                <td className="px-4 py-3 text-cream3 font-mono text-xs">{e.date}</td>
                <td className="px-4 py-3 text-cream">{e.project}</td>
                <td className="px-4 py-3 text-cream2">{e.milestone}</td>
                <td className="px-4 py-3 text-cream2">{e.description}</td>
                <td className="px-4 py-3 text-cream font-mono">{e.hours.toFixed(1)}</td>
                <td className="px-4 py-3">{e.billable ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
