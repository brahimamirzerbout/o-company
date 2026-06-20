"use client";

import * as React from "react";
import { PageHeader, Card, Pill, Button } from "@o/ui";
import { Plus, MessageSquare } from "lucide-react";

const SAMPLE = [
  { id: "t1", subject: "Polaris: SOW feedback",          requester: "Lila Okafor",  priority: "high",   status: "open" },
  { id: "t2", subject: "Helios: invoice question",        requester: "Priya Anand",  priority: "normal", status: "in_progress" },
  { id: "t3", subject: "Quanta: API rate limit question", requester: "Sofia Marin",  priority: "normal", status: "waiting_customer" },
  { id: "t4", subject: "Atlas: timing for Q3 deliverables", requester: "Jonas Lindqvist", priority: "low", status: "open" },
  { id: "t5", subject: "Brightline: on-chain payment failed", requester: "Omar Said", priority: "urgent", status: "open" },
];

const PTONE: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral", normal: "info", high: "warning", urgent: "danger",
};
const STONE: Record<string, "neutral" | "info" | "success" | "warning"> = {
  open: "warning", waiting_customer: "neutral", waiting_internal: "info", in_progress: "info", resolved: "success", closed: "success",
};

export default function TicketsPage() {
  return (
    <>
      <PageHeader
        title="Support"
        subtitle="Tickets from customers, prospects, and the team"
        action={<Button><Plus className="h-4 w-4" /> New ticket</Button>}
      />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink3 bg-ink3/30 text-xs uppercase tracking-wider text-cream3">
              <th className="px-4 py-3 text-left">Subject</th>
              <th className="px-4 py-3 text-left">Requester</th>
              <th className="px-4 py-3 text-left">Priority</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE.map((t) => (
              <tr key={t.id} className="border-b border-ink3/40 last:border-0 hover:bg-ink3/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-cream">
                    <MessageSquare className="h-3.5 w-3.5 text-cream3" />
                    {t.subject}
                  </div>
                </td>
                <td className="px-4 py-3 text-cream2">{t.requester}</td>
                <td className="px-4 py-3"><Pill tone={PTONE[t.priority]}>{t.priority}</Pill></td>
                <td className="px-4 py-3"><Pill tone={STONE[t.status]}>{t.status.replace("_", " ")}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
