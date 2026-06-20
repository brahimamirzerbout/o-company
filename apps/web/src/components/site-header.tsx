import Link from "next/link";
import { Logo } from "@o/brand/logo";

const links = [
  { href: "/product",  label: "Product" },
  { href: "/services", label: "Services" },
  { href: "/pricing",  label: "Pricing" },
  { href: "/customers", label: "Customers" },
  { href: "/about",   label: "About" },
  { href: "/blog",    label: "Blog" },
  { href: "/changelog", label: "Changelog" },
  { href: "/docs",    label: "Docs" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink3 bg-ink/85 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo size="md" variant="cream" />
          <span className="font-serif text-lg leading-none">o.<span className="text-accent">.</span></span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          {links.slice(0, 8).map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-cream2 hover:text-cream transition">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:inline-block o-btn-ghost text-xs">Sign in</Link>
          <Link href="/signup" className="o-btn-primary text-xs">Start a brief</Link>
        </div>
      </div>
    </header>
  );
}
