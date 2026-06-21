"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, Wordmark } from "@o/brand/logo";
import { Avatar } from "@o/ui";
import { cn } from "@o/ui";

interface NavItem { href: string; label: string }

const NAV: NavItem[] = [
  { href: "/",          label: "Dashboard" },
  { href: "/briefing",  label: "Operator" },
  { href: "/contacts",  label: "Contacts" },
  { href: "/deals",     label: "Deals" },
  { href: "/projects",  label: "Projects" },
  { href: "/invoices",  label: "Invoices" },
  { href: "/time",      label: "Time" },
  { href: "/tickets",   label: "Support" },
  { href: "/people",    label: "People" },
  { href: "/settings",  label: "Settings" },
];

export function InternalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden md:flex w-60 flex-col border-r border-ink3 bg-ink2">
        <div className="px-5 py-5 border-b border-ink3">
          <Link href="/" className="flex items-center gap-2">
            <Logo size="md" variant="cream" />
            <Wordmark variant="cream" />
          </Link>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-cream4">Console</p>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV.map((n) => {
            const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "block rounded-sm px-3 py-2 text-sm transition",
                  active ? "bg-accent/10 text-accent" : "text-cream2 hover:text-cream hover:bg-ink3/30",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-ink3 p-3">
          <div className="flex items-center gap-2">
            <Avatar name="O'Shay L" size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-cream truncate">O'Shay Lighten</p>
              <p className="text-[10px] text-cream3 truncate">Owner</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <TopBar />
        <div className="px-6 py-8 max-w-[96rem] mx-auto">{children}</div>
      </main>
    </div>
  );
}

function TopBar() {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ink3 bg-ink/85 px-6 py-3 backdrop-blur">
      <div className="text-sm text-cream3">
        <span className="text-cream2 font-medium">Today</span> · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-cream3">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
          All systems normal
        </span>
      </div>
    </div>
  );
}
