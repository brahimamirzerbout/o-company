"use client";

import * as React from "react";
import { cn } from "./cn";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
}

const toneClasses = {
  neutral: "bg-ink3 text-cream2",
  success: "bg-emerald-900 text-emerald-200",
  warning: "bg-amber-900 text-amber-200",
  danger:  "bg-red-900 text-red-200",
  info:    "bg-sky-900 text-sky-200",
  accent:  "bg-accent/15 text-accent",
};

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
