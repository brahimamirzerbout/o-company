"use client";

import * as React from "react";
import { cn } from "./cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const toneClasses: Record<Tone, string> = {
  neutral: "border-ink3 bg-ink2 text-cream2",
  success: "border-emerald-700 bg-emerald-950 text-emerald-300",
  warning: "border-amber-700 bg-amber-950 text-amber-300",
  danger:  "border-red-700 bg-red-950 text-red-300",
  info:    "border-sky-700 bg-sky-950 text-sky-300",
  accent:  "border-accent bg-accent/10 text-accent",
};

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
