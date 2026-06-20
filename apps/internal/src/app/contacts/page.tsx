"use client";

import * as React from "react";
import Link from "next/link";
import { Card, PageHeader, Avatar, Pill, Input, Button } from "@o/ui";
import { Search, Plus, Filter } from "lucide-react";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  status: "lead" | "active" | "customer" | "churned";
  lifecycle: "subscriber" | "lead" | "mql" | "sql" | "opportunity" | "customer" | "evangelist";
  lastContacted: string;
  wallet?: string;
}

const SAMPLE: Contact[] = [
  { id: "c1", firstName: "Marcus",   lastName: "Reyes",   email: "marcus@northwind.io",   company: "Northwind",    status: "active",     lifecycle: "opportunity", lastContacted: "2 days ago" },
  { id: "c2", firstName: "Priya",    lastName: "Anand",   email: "priya@helios.health",   company: "Helios",       status: "active",     lifecycle: "sql",         lastContacted: "1 week ago" },
  { id: "c3", firstName: "Jonas",    lastName: "Lindqvist", email: "jonas@atlasfoundry.com", company: "Atlas Foundry", status: "customer",  lifecycle: "customer",    lastContacted: "yesterday" },
  { id: "c4", firstName: "Lila",     lastName: "Okafor",  email: "lila@polaris.com",      company: "Polaris",      status: "active",     lifecycle: "lead",        lastContacted: "3 days ago" },
  { id: "c5", firstName: "Sofia",    lastName: "Marin",   email: "sofia@quanta.ai",       company: "Quanta",       status: "customer",   lifecycle: "evangelist",  lastContacted: "5 days ago" },
  { id: "c6", firstName: "Omar",     lastName: "Said",    email: "omar@brightline.energy", company: "Brightline",  status: "active",     lifecycle: "sql",         lastContacted: "1 week ago" },
];

export default function ContactsPage() {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"all" | Contact["status"]>("all");
  const filtered = SAMPLE.filter((c) => {
    if (status !== "all" && c.status !== status) return false;
    if (!q) return true;
    return `${c.firstName} ${c.lastName} ${c.email} ${c.company}`.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={`${filtered.length} of ${SAMPLE.length} people`}
        action={<Button><Plus className="h-4 w-4" /> New contact</Button>}
      />
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-cream3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, company…" className="pl-9" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as never)} className="o-input cursor-pointer w-auto">
            <option value="all">All statuses</option>
            <option value="lead">Lead</option>
            <option value="active">Active</option>
            <option value="customer">Customer</option>
            <option value="churned">Churned</option>
          </select>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink3 bg-ink3/30 text-xs uppercase tracking-wider text-cream3">
              <th className="px-4 py-3 text-left">Person</th>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Lifecycle</th>
              <th className="px-4 py-3 text-left">Last contact</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-ink3/40 last:border-0 hover:bg-ink3/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={`${c.firstName} ${c.lastName}`} size="sm" />
                    <div>
                      <Link href={`/contacts/${c.id}`} className="text-cream hover:text-accent font-medium">{c.firstName} {c.lastName}</Link>
                      <p className="text-xs text-cream3">{c.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-cream2">{c.company}</td>
                <td className="px-4 py-3"><Pill tone={c.status === "customer" ? "success" : c.status === "active" ? "info" : c.status === "lead" ? "accent" : "neutral"}>{c.status}</Pill></td>
                <td className="px-4 py-3"><Pill tone="neutral">{c.lifecycle}</Pill></td>
                <td className="px-4 py-3 text-cream3 text-xs">{c.lastContacted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
