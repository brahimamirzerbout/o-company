"use client";

import * as React from "react";
import { cn } from "./cn";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
};

const palette = [
  ["#1E1B4B", "#A5B4FC"],
  ["#4C0519", "#FDA4AF"],
  ["#451A03", "#FCD34D"],
  ["#022C22", "#6EE7B7"],
  ["#082F49", "#7DD3FC"],
  ["#2E1065", "#C4B5FD"],
  ["#4A044E", "#F0ABFC"],
  ["#042F2E", "#5EEAD4"],
  ["#431407", "#FDBA74"],
  ["#083344", "#67E8F9"],
] as const;

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % palette.length;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).map((s) => s[0] ?? "").slice(0, 2).join("").toUpperCase() || "?";
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn("rounded-full object-cover", sizes[size], className)} />;
  }
  const [bg, fg] = palette[hashName(name)];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
