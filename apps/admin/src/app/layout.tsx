import type { Metadata } from "next";
import { fontClassNames } from "@o/brand/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admin · o.company",
  description: "Owner-only console.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontClassNames()}>
      <body className="min-h-dvh bg-ink text-cream antialiased">{children}</body>
    </html>
  );
}
