import { ArrowUpRight, ArrowDownRight, Phone, Mail, Calendar, Briefcase, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Card, CardRow, Stat, Pill, PageHeader } from "@o/ui";

// =============================================================================
// o.company · internal dashboard
// =============================================================================
// This is what O'Shay looks at first thing in the morning. The same data
// the operator's morning brief is generated from. KPIs at the top, today's
// actions in the middle, recent activity at the bottom.

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Good morning, O'Shay."
        subtitle="Here's the brief. 4 things need your attention today."
      />
      <KpiRow />
      <TodayActions />
      <RecentActivity />
    </>
  );
}

function KpiRow() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
      <Stat
        label="Pipeline (open)"
        value="$284,000"
        sub="across 12 deals"
        trend={{ dir: "up", pct: 8 }}
      />
      <Stat
        label="This month (revenue)"
        value="$42,500"
        sub="3 wins"
        trend={{ dir: "up", pct: 22 }}
      />
      <Stat
        label="Overdue invoices"
        value="$3,200"
        sub="2 invoices"
        trend={{ dir: "down", pct: 1 }}
      />
      <Stat
        label="Open tickets"
        value="4"
        sub="1 urgent"
      />
    </div>
  );
}

function TodayActions() {
  return (
    <div className="grid gap-4 lg:grid-cols-3 mb-8">
      <Card title="Follow-ups" description="People waiting for a reply" action={<Link href="/contacts?filter=followup" className="text-xs text-accent">All →</Link>}>
        <ul className="space-y-3">
          {[
            { name: "Marcus Reyes",  company: "Northwind",       when: "yesterday" },
            { name: "Hassan Reza",   company: "Helios",         when: "2 days ago" },
            { name: "Lila Okafor",   company: "Polaris",        when: "3 days ago" },
          ].map((c) => (
            <li key={c.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                  {c.name.split(" ").map((p) => p[0]).join("")}
                </div>
                <div>
                  <p className="text-sm text-cream">{c.name}</p>
                  <p className="text-xs text-cream3">{c.company}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="o-btn-ghost p-2" aria-label="Email">
                  <Mail className="h-3.5 w-3.5" />
                </button>
                <button className="o-btn-ghost p-2" aria-label="Call">
                  <Phone className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Today" description="Your schedule" action={<Link href="/calendar" className="text-xs text-accent">Calendar →</Link>}>
        <ul className="space-y-3">
          {[
            { time: "10:00", title: "Discovery · Northwind",  with: "Marcus R." },
            { time: "13:30", title: "SOW review · Helios",      with: "Hassan R." },
            { time: "16:00", title: "Weekly pipeline review",  with: "Team" },
          ].map((m, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="font-mono text-xs text-cream3 w-12 pt-0.5">{m.time}</span>
              <div>
                <p className="text-sm text-cream">{m.title}</p>
                <p className="text-xs text-cream3">with {m.with}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Wins & flags" description="Money in. Problems.">
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <ArrowUpRight className="h-4 w-4 text-emerald-400 mt-1" />
            <div>
              <p className="text-sm text-cream">Quanta renewal · $24,000</p>
              <p className="text-xs text-cream3">closed yesterday · auto-invoice sent</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-400 mt-1" />
            <div>
              <p className="text-sm text-cream">Polaris proposal · 4 days stale</p>
              <p className="text-xs text-cream3">no reply since last Friday</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <ArrowDownRight className="h-4 w-4 text-red-400 mt-1" />
            <div>
              <p className="text-sm text-cream">Atlas invoice INV-2026-018 · 7d overdue</p>
              <p className="text-xs text-cream3">$4,200 · reminder sent</p>
            </div>
          </li>
        </ul>
      </Card>
    </div>
  );
}

function RecentActivity() {
  const items = [
    { who: "Felix Brennan", what: "moved deal to Negotiation",     when: "2m ago",  href: "/deals/dl_15" },
    { who: "Auto · billing", what: "sent invoice INV-2026-022 to Brightline", when: "12m ago", href: "/invoices" },
    { who: "Priya Anand",    what: "signed SOW · $18,000",          when: "1h ago",  href: "/projects/p_15" },
    { who: "Auto · sync",    what: "Mira synced 14 contacts",       when: "2h ago",  href: "/contacts" },
    { who: "O'Shay",         what: "closed-won · Northwind renewal", when: "yesterday", href: "/deals/dl_0" },
  ];
  return (
    <Card title="Activity" description="What happened recently">
      <ul>
        {items.map((i, idx) => (
          <CardRow key={idx}>
            <div className="flex items-center gap-3 min-w-0">
              <Pill tone="accent">{i.who.split(" ")[0]}</Pill>
              <p className="text-sm text-cream truncate">{i.what}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs text-cream3 font-mono">{i.when}</span>
              <Link href={i.href} className="text-cream3 hover:text-accent">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardRow>
        ))}
      </ul>
    </Card>
  );
}
