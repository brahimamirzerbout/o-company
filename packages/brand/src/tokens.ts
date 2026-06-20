/**
 * o.company design tokens
 *
 * These are the only colors, type, and spacing values the rest of the
 * company is allowed to use. If you need a new one, add it here first,
 * then import it from the consuming app. This keeps the brand consistent
 * across web, app, internal, admin, and any future surface.
 *
 * Color philosophy:
 *   - "ink"   = the page background; warm near-black, never pure #000
 *   - "cream" = the body text; warm off-white, easy on the eyes
 *   - "accent"= the single highlight; warm gold (#d4a853) — used sparingly
 *   - all other grays are derived from cream or ink, not neutral gray
 *
 * This is the system that the noira.us site uses. We are extending it
 * for the company dashboard, not replacing it.
 */

export const tokens = {
  color: {
    // Brand
    ink:        "#0E0E0F",
    ink2:       "#16161A",
    ink3:       "#1F1F25",
    ink4:       "#2A2A33",
    cream:      "#E8E0D0",
    cream2:     "#BFB6A2",
    cream3:     "#8C8472",
    cream4:     "#5C5648",
    accent:     "#D4A853",
    accentSoft: "#B58D3F",
    accentLite: "#E8C788",

    // Semantic
    success: "#7AB87A",
    warning: "#D4A853",
    danger:  "#C75F5F",
    info:    "#7AA5C7",

    // Pure (use sparingly — prefer cream/ink)
    white: "#FFFFFF",
    black: "#000000",
    transparent: "transparent",
  },

  // Typography. The web app uses Instrument Serif (display) and
  // Inter (sans). These are the canonical weights and sizes.
  font: {
    serif: '"Instrument Serif", "Cormorant Garamond", Georgia, serif',
    sans:  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono:  '"JetBrains Mono", "SF Mono", Menlo, monospace',
  },

  size: {
    "2xs":  ["0.6875rem", { lineHeight: "1rem",   letterSpacing: "0.05em" }],
    "xs":   ["0.75rem",   { lineHeight: "1.1rem", letterSpacing: "0.05em" }],
    "sm":   ["0.875rem",  { lineHeight: "1.4rem", letterSpacing: "0.02em" }],
    "base": ["1rem",      { lineHeight: "1.6rem", letterSpacing: "0" }],
    "lg":   ["1.125rem",  { lineHeight: "1.8rem", letterSpacing: "0" }],
    "xl":   ["1.25rem",   { lineHeight: "2rem",   letterSpacing: "-0.01em" }],
    "2xl":  ["1.5rem",    { lineHeight: "2.2rem", letterSpacing: "-0.015em" }],
    "3xl":  ["1.875rem",  { lineHeight: "2.6rem", letterSpacing: "-0.02em" }],
    "4xl":  ["2.25rem",   { lineHeight: "3rem",   letterSpacing: "-0.025em" }],
    "5xl":  ["3rem",      { lineHeight: "3.6rem", letterSpacing: "-0.03em" }],
    "6xl":  ["3.75rem",   { lineHeight: "4.2rem", letterSpacing: "-0.035em" }],
    "7xl":  ["4.5rem",    { lineHeight: "5rem",   letterSpacing: "-0.04em" }],
    "8xl":  ["6rem",      { lineHeight: "6.4rem", letterSpacing: "-0.04em" }],
  },

  // Spacing — same scale as Tailwind. We define it here so design system
  // docs and Figma exports can both reference the same numbers.
  space: {
    px: "1px",
    0:  "0",
    0.5:"0.125rem",
    1:  "0.25rem",
    2:  "0.5rem",
    3:  "0.75rem",
    4:  "1rem",
    5:  "1.25rem",
    6:  "1.5rem",
    8:  "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem",
    20: "5rem",
    24: "6rem",
    32: "8rem",
    40: "10rem",
    48: "12rem",
    56: "14rem",
    64: "16rem",
  },

  radius: {
    none: "0",
    sm:   "0.25rem",
    md:   "0.5rem",
    lg:   "0.75rem",
    xl:   "1rem",
    "2xl":"1.5rem",
    "3xl":"2rem",
    full: "9999px",
  },

  // Animation. Minimal — the brand voice is calm.
  motion: {
    dur: { fast: "120ms", base: "200ms", slow: "320ms", slower: "560ms" },
    ease: {
      out:   "cubic-bezier(0.16, 1, 0.3, 1)",
      inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
      in:    "cubic-bezier(0.7, 0, 0.84, 0)",
    },
  },

  // Shadows — subtle, warm. No neon.
  shadow: {
    sm:   "0 1px 2px rgba(0,0,0,0.4)",
    base: "0 2px 8px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,168,83,0.04)",
    md:   "0 4px 16px rgba(0,0,0,0.55), 0 0 0 1px rgba(212,168,83,0.06)",
    lg:   "0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,168,83,0.08)",
    xl:   "0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(212,168,83,0.1)",
    glow: "0 0 24px rgba(212,168,83,0.18)",
  },

  // Layout — a single content max-width keeps the company aesthetic
  // consistent. Pages that need more (dashboards) can opt out.
  layout: {
    contentMax: "64rem",
    proseMax:   "44rem",
    dashboardMax: "96rem",
  },

  // Breakpoints — mobile first.
  bp: {
    sm:  "640px",
    md:  "768px",
    lg:  "1024px",
    xl:  "1280px",
    "2xl": "1536px",
  },
} as const;

export type Tokens = typeof tokens;

/** Convert any color in the palette to a CSS var() reference. */
export function cssVar(name: keyof typeof tokens.color): string {
  return `var(--o-${kebab(name)})`;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

/** Materialize the tokens as a flat CSS-vars string. */
export function toCssVars(): string {
  const lines: string[] = [":root {"];
  for (const [k, v] of Object.entries(tokens.color)) {
    lines.push(`  --o-${kebab(k)}: ${v};`);
  }
  for (const [k, v] of Object.entries(tokens.font)) {
    lines.push(`  --o-font-${k}: ${v};`);
  }
  lines.push("}");
  return lines.join("\n");
}
