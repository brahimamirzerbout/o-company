"use client";

import * as React from "react";
import { PageHeader, Card, Avatar, Pill, Button } from "@o/ui";
import { Plus, UserPlus } from "lucide-react";

const SAMPLE = [
  { id: "u1", name: "O'Shay Lighten",   email: "oshay@o.company",  role: "owner",    status: "active", department: "Operations" },
  { id: "u2", name: "Felix Brennan",   email: "felix@o.company",  role: "operator", status: "active", department: "Operations" },
  { id: "u3", name: "Mira Hassan",      email: "mira@o.company",   role: "operator", status: "active", department: "Creative" },
  { id: "u4", name: "Sam Okafor",       email: "sam@o.company",    role: "manager",  status: "active", department: "Sales" },
  { id: "u5", name: "Lila Park",        email: "lila@o.company",   role: "operator", status: "on_leave", department: "Engineering" },
];

const RTONE: Record<string, "accent" | "info" | "neutral"> = {
  owner: "accent", admin: "accent", manager: "info", operator: "neutral", client: "neutral", guest: "neutral",
};

export default function PeoplePage() {
  return (
    <>
      <PageHeader
        title="People"
        subtitle="Your team, your clients, your guests"
        action={<Button><UserPlus className="h-4 w-4" /> Invite</Button>}
      />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink3 bg-ink3/30 text-xs uppercase tracking-wider text-cream3">
              <th className="px-4 py-3 text-left">Person</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Department</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE.map((u) => (
              <tr key={u.id} className="border-b border-ink3/40 last:border-0 hover:bg-ink3/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} size="sm" />
                    <span className="text-cream font-medium">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-cream2 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-3"><Pill tone={RTONE[u.role]}>{u.role}</Pill></td>
                <td className="px-4 py-3 text-cream2">{u.department}</td>
                <td className="px-4 py-3"><Pill tone={u.status === "active" ? "success" : "warning"}>{u.status.replace("_", " ")}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
