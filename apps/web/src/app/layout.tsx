import type { Metadata, Viewport } from "next";
import { fontClassNames } from "@o/brand/fonts";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const SITE_URL = "https://o.company";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "o.company — Your business, operated.",
    template: "%s · o.company",
  },
  description:
    "An AI operator that briefs you, runs your pipeline, manages your clients, and ships your work. CRM, projects, time, invoicing — all in one place, all yours, all local-first.",
  applicationName: "o.company",
  authors: [{ name: "o.company" }],
  keywords: ["CRM", "operations", "invoicing", "projects", "time tracking", "local-first", "AI operator"],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "o.company",
    title: "o.company — Your business, operated.",
    description: "An AI operator that briefs you, runs your pipeline, manages your clients, and ships your work.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "o.company" }],
  },
  twitter: { card: "summary_large_image", title: "o.company", description: "Your business, operated." },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0E0E0F",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontClassNames()}>
      <body className="min-h-dvh bg-ink text-cream antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-cream focus:px-3 focus:py-2 focus:text-ink">Skip to main</a>
        <SiteHeader />
        <main id="main" className="min-h-dvh">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
