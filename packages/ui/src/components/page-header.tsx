import * as React from "react";
import { cn } from "./cn";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  back?: { href: string; label?: string };
  className?: string;
}

export function PageHeader({ title, subtitle, action, back, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-4 pb-6 border-b border-ink3 mb-6", className)}>
      <div>
        {back && (
          <a
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-xs uppercase tracking-wider text-cream3 hover:text-cream"
          >
            ← {back.label ?? "Back"}
          </a>
        )}
        <h1 className="font-serif text-3xl text-cream">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-cream3">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
