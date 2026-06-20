import * as React from "react";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** Color variant. */
  variant?: "ink" | "cream" | "accent";
}

/**
 * o.company mark.
 *
 * A flame in a circle — minimal, immediately recognizable, monogram-friendly
 * at small sizes. The flame nods to the original Noira name; the circle is
 * the "operator" — closed, dependable, watching.
 */
export function Logo({ className, size = "md", variant = "cream" }: LogoProps) {
  const sizeClass = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
    xl: "h-20 w-20",
  }[size];

  const colorClass = {
    ink: "text-ink",
    cream: "text-cream",
    accent: "text-accent",
  }[variant];

  return (
    <span
      className={`inline-flex items-center justify-center ${sizeClass} ${className ?? ""}`}
      aria-label="o.company"
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
        <circle
          cx="16"
          cy="16"
          r="15"
          stroke="currentColor"
          strokeWidth="1"
          className="opacity-40"
        />
        <path
          d="M16 6L18.4 13.2L25.6 14L20 18.4L21.6 25.6L16 21.4L10.4 25.6L12 18.4L6.4 14L13.6 13.2L16 6Z"
          fill="currentColor"
          className={colorClass}
        />
      </svg>
    </span>
  );
}

/** Wordmark — the "o." with a literal period. */
export function Wordmark({
  className,
  variant = "cream",
}: {
  className?: string;
  variant?: "ink" | "cream" | "accent";
}) {
  const colorClass = {
    ink: "text-ink",
    cream: "text-cream",
    accent: "text-accent",
  }[variant];
  return (
    <span
      className={`font-serif text-2xl leading-none ${colorClass} ${className ?? ""}`}
    >
      o.<span className="text-accent">.</span>
    </span>
  );
}
