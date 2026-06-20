import type { Metadata } from "next";
import { fontClassNames } from "@o/brand/fonts";
import { ClientShell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "o.company · Client portal", template: "%s · o.company" },
  description: "Your projects, invoices, and deliverables.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontClassNames()}>
      <body className="min-h-dvh bg-ink text-cream antialiased">
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
