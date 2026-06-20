import { Card, Stat, Pill, PageHeader } from "@o/ui";
import { ArrowRight, Briefcase, FileText, MessageSquare } from "lucide-react";
import Link from "next/link";

const projects = [
  { id: "p1", name: "Website refresh",     status: "active",   next: "Design review · Jul 8" },
  { id: "p2", name: "Lead form + routing", status: "review",   next: "Approval · Jul 3" },
];

const invoices = [
  { id: "i1", number: "INV-2026-022", amount: 12000, due: "Jul 12", status: "sent" },
  { id: "i2", number: "INV-2026-020", amount:  6000, due: "—",     status: "paid" },
];

const files = [
  { name: "Hero wireframes v3.pdf", size: "2.1 MB",  date: "Jun 18" },
  { name: "Brand kit.zip",         size: "48 MB",   date: "Jun 15" },
  { name: "Logo final.svg",        size: "12 KB",   date: "Jun 12" },
];

function fmt(n: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n); }

export default function ClientHome() {
  return (
    <>
      <PageHeader title="Welcome back, Northwind." subtitle="Here's where everything stands." />
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Stat label="Open projects" value={`${projects.length}`} sub="across 2 workstreams" />
        <Stat label="Outstanding" value={fmt(invoices[0].amount)} sub="next invoice · Jul 12" />
        <Stat label="YTD with us" value={fmt(84000)} sub="since Feb 2026" trend={{ dir: "up", pct: 12 }} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Projects" action={<Link href="/projects" className="text-xs text-accent">All →</Link>}>
          <ul className="space-y-3">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Briefcase className="h-4 w-4 text-accent" />
                  <div>
                    <p className="text-sm text-cream">{p.name}</p>
                    <p className="text-xs text-cream3">Next: {p.next}</p>
                  </div>
                </div>
                <Pill tone={p.status === "active" ? "info" : "warning"}>{p.status}</Pill>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Invoices" action={<Link href="/invoices" className="text-xs text-accent">All →</Link>}>
          <ul className="space-y-3">
            {invoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-accent" />
                  <div>
                    <p className="text-sm font-mono text-cream">{i.number}</p>
                    <p className="text-xs text-cream3">Due {i.due}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-cream">{fmt(i.amount)}</span>
                  <Pill tone={i.status === "paid" ? "success" : "info"}>{i.status}</Pill>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Files" action={<Link href="/files" className="text-xs text-accent">All →</Link>}>
          <ul className="space-y-3">
            {files.map((f) => (
              <li key={f.name} className="flex items-center justify-between">
                <p className="text-sm text-cream">{f.name}</p>
                <p className="text-xs text-cream3">{f.size} · {f.date}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Talk to us" description="The operator replies within 1 business hour.">
          <Link href="/messages" className="o-btn-primary w-full justify-center">
            <MessageSquare className="h-4 w-4" />
            Open messages
          </Link>
        </Card>
      </div>
    </>
  );
}
