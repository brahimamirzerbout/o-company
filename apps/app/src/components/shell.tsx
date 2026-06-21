"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, Wordmark, Avatar, Card } from "@o/ui";

const NAV = [
  { href: "/",          label: "Overview" },
  { href: "/projects",  label: "Projects" },
  { href: "/photos",    label: "Photos" },
  { href: "/invoices",  label: "Invoices" },
  { href: "/files",     label: "Files" },
  { href: "/messages",  label: "Messages" },
];

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-ink3 bg-ink/85 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo size="md" variant="cream" />
            <Wordmark variant="cream" />
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-sm px-3 py-1.5 text-sm transition ${
                    active ? "bg-accent/10 text-accent" : "text-cream2 hover:text-cream"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Avatar name="Northwind" size="sm" />
            <span className="hidden sm:inline text-sm text-cream">Northwind Logistics</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
