"use client";

import * as React from "react";
import { PageHeader, Card, Pill, Button } from "@o/ui";
import { Plus } from "lucide-react";

const SAMPLE = [
  { id: "i1", number: "INV-2026-022", client: "Brightline",     amount: 31000, currency: "USD", status: "sent",    due: "Jul 12" },
  { id: "i2", number: "INV-2026-021", client: "Helios",         amount: 28000, currency: "USD", status: "overdue", due: "Jun 14" },
  { id: "i3", number: "INV-2026-020", client: "Northwind",      amount: 12000, currency: "USD", status: "paid",    due: "Jun 18" },
  { id: "i4", number: "INV-2026-019", client: "Quanta",         amount:  6500, currency: "USD", status: "paid",    due: "Jun 11" },
  { id: "i5", number: "INV-2026-018", client: "Atlas Foundry",  amount:  4200, currency: "USD", status: "overdue", due: "Jun 09" },
  { id: "i6", number: "INV-2026-017", client: "Polaris",        amount:  9500, currency: "USD", status: "draft",   due: "Aug 05" },
];

const TONE: Record<string, "info" | "success" | "danger" | "warning" | "neutral"> = {
  draft: "neutral", sent: "info", viewed: "info", partial: "warning", paid: "success", overdue: "danger", void: "neutral", uncollectible: "danger",
};

function fmt(n: number, c: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n); }

export default function InvoicesPage() {
  const total = SAMPLE.reduce((a, i) => a + i.amount, 0);
  const paid = SAMPLE.filter((i) => i.status === "paid").reduce((a, i) => a + i.amount, 0);
  const overdue = SAMPLE.filter((i) => i.status === "overdue").reduce((a, i) => a + i.amount, 0);
  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={`${paid.toLocaleString()} paid · ${overdue.toLocaleString()} overdue · ${total.toLocaleString()} total`}
        action={<Button><Plus className="h-4 w-4" /> New invoice</Button>}
      />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink3 bg-ink3/30 text-xs uppercase tracking-wider text-cream3">
              <th className="px-4 py-3 text-left">Invoice</th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Amount</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Due</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE.map((i) => (
              <tr key={i.id} className="border-b border-ink3/40 last:border-0 hover:bg-ink3/30">
                <td className="px-4 py-3 text-cream font-mono text-xs">{i.number}</td>
                <td className="px-4 py-3 text-cream2">{i.client}</td>
                <td className="px-4 py-3 text-cream font-mono">{fmt(i.amount, i.currency)}</td>
                <td className="px-4 py-3"><Pill tone={TONE[i.status]}>{i.status}</Pill></td>
                <td className="px-4 py-3 text-cream3 text-xs font-mono">{i.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
