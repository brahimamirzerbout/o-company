import Link from "next/link";
import { Logo } from "@o/brand/logo";

const sections = [
  { title: "Product", links: [
    { href: "/product", label: "Overview" },
    { href: "/product#contacts", label: "Contacts" },
    { href: "/product#deals", label: "Deals" },
    { href: "/product#projects", label: "Projects" },
    { href: "/product#invoicing", label: "Invoicing" },
    { href: "/changelog", label: "Changelog" },
  ]},
  { title: "Services", links: [
    { href: "/services/website", label: "Websites" },
    { href: "/services/lead-form", label: "Lead forms" },
    { href: "/services/automation", label: "Automation" },
    { href: "/services/crm-setup", label: "CRM setup" },
    { href: "/services/photo-pipeline", label: "Photo pipeline" },
    { href: "/services/creative", label: "Creative" },
  ]},
  { title: "Company", links: [
    { href: "/about", label: "About" },
    { href: "/customers", label: "Customers" },
    { href: "/blog", label: "Blog" },
    { href: "/contact", label: "Contact" },
    { href: "/careers", label: "Careers" },
  ]},
  { title: "Legal", links: [
    { href: "/legal/terms", label: "Terms" },
    { href: "/legal/privacy", label: "Privacy" },
    { href: "/legal/dpa", label: "DPA" },
    { href: "/legal/cookies", label: "Cookies" },
    { href: "/security", label: "Security" },
  ]},
];

export function SiteFooter() {
  return (
    <footer className="border-t border-ink3 mt-32 bg-ink2">
      <div className="container mx-auto px-6 py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2">
              <Logo size="md" variant="cream" />
              <span className="font-serif text-lg leading-none">o.<span className="text-accent">.</span></span>
            </div>
            <p className="mt-3 text-sm text-cream3 max-w-xs">
              Your business, operated. An AI operator for the work that pays.
            </p>
            <p className="mt-4 text-xs text-cream4">Bolivar, Missouri · Worldwide</p>
          </div>
          {sections.map((s) => (
            <div key={s.title}>
              <h3 className="text-xs uppercase tracking-widest text-cream3">{s.title}</h3>
              <ul className="mt-4 space-y-2">
                {s.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-cream2 hover:text-accent transition">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-ink3 pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-cream3">
          <p>© {new Date().getFullYear()} o.company. All rights reserved.</p>
          <p className="font-mono">v1.0.0 · last sync {new Date().toISOString().slice(0, 10)}</p>
        </div>
      </div>
    </footer>
  );
}
