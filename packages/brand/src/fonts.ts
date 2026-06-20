/**
 * o.company fonts
 *
 * One canonical set of font loaders so every app has the same typography.
 * Next.js (web, app, internal, admin) uses next/font for self-hosting and
 * zero CLS. Other surfaces (mobile, PDF) use the same family names via
 * system fonts declared in tokens.ts.
 *
 * Self-hosting Inter and Instrument Serif means we never leak a visitor's
 * IP to Google Fonts — consistent with the company's "no third-party
 * trackers" stance.
 */

import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";

export const fontSans = Inter({
  subsets: ["latin"],
  variable: "--o-font-sans-var",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const fontDisplay = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--o-font-serif-var",
  display: "swap",
});

export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--o-font-mono-var",
  display: "swap",
});

/** Class names to drop on the root <html> element. */
export function fontClassNames(): string {
  return [fontSans.variable, fontDisplay.variable, fontMono.variable].join(" ");
}
