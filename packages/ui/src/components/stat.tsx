import * as React from "react";
import { cn } from "./cn";

interface StatProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { dir: "up" | "down" | "flat"; pct: number };
  icon?: React.ReactNode;
  tone?: "neutral" | "warning" | "success" | "danger" | "info";
  className?: string;
}

export function Stat({ label, value, sub, trend, icon, tone = "neutral", className }: StatProps) {
  return (
    <div className={cn(
      "o-card",
      tone === "warning" && "border-amber-500/30",
      tone === "danger" && "border-red-500/30",
      tone === "success" && "border-emerald-500/30",
      tone === "info" && "border-sky-500/30",
      className,
    )}>
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-wider text-cream3">{label}</p>
        {icon && <span className="text-cream3">{icon}</span>}
      </div>
      <p className={cn(
        "mt-2 font-serif text-3xl",
        tone === "warning" && "text-amber-300",
        tone === "danger" && "text-red-300",
        tone === "success" && "text-emerald-300",
        tone === "neutral" && "text-cream",
        tone === "info" && "text-sky-300",
      )}>{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend && (
          <span className={cn(
            "font-mono",
            trend.dir === "up"   && "text-emerald-400",
            trend.dir === "down" && "text-red-400",
            trend.dir === "flat" && "text-cream3",
          )}>
            {trend.dir === "up"   ? "↑" : trend.dir === "down" ? "↓" : "→"}{" "}
            {trend.pct}%
          </span>
        )}
        {sub && <span className="text-cream3">{sub}</span>}
      </div>
    </div>
  );
}
