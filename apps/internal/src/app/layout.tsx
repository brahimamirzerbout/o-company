import type { Metadata } from "next";
import { fontClassNames } from "@o/brand/fonts";
import { InternalShell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Console · o.company", template: "%s · Console" },
  description: "Internal operations console for o.company.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontClassNames()}>
      <body className="min-h-dvh bg-ink text-cream antialiased">
        <InternalShell>{children}</InternalShell>
      </body>
    </html>
  );
}
