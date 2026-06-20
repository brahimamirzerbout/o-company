import * as React from "react";
import { cn } from "./cn";

interface StatProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { dir: "up" | "down" | "flat"; pct: number };
  icon?: React.ReactNode;
  className?: string;
}

export function Stat({ label, value, sub, trend, icon, className }: StatProps) {
  return (
    <div className={cn("o-card", className)}>
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-wider text-cream3">{label}</p>
        {icon && <span className="text-cream3">{icon}</span>}
      </div>
      <p className="mt-2 font-serif text-3xl text-cream">{value}</p>
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
