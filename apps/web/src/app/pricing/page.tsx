import { ArrowRight } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Pricing" };

const tiers = [
  { name: "Solo",    price: "Free",   period: "forever", forWho: "1 user · 100 contacts · 1 pipeline", features: ["All 4 platform apps", "Local-first sync", "Public API", "Community support"] },
  { name: "Team",    price: "$19",    period: "per user / mo", forWho: "Up to 25 seats", features: ["Unlimited contacts + projects", "Time tracking & invoicing", "Crypto + card payments", "On-chain Trust Score", "Email support"], featured: true },
  { name: "Scale",   price: "$49",    period: "per user / mo", forWho: "Unlimited seats", features: ["Multi-team org chart", "Role-based permissions + audit log", "SAML SSO", "SLA + dedicated CSM", "SOC 2 Type II report"] },
  { name: "On-prem", price: "Custom", period: "annual license", forWho: "Air-gapped deployment", features: ["Self-hosted", "Source-available server", "FIPS crypto", "No data leaves your network", "Dedicated SE"] },
];

export default function PricingPage() {
  return (
    <article>
      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 py-20 md:py-28 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">Pricing</p>
          <h1 className="mt-3 font-serif text-5xl md:text-6xl text-cream">Honest. Per-seat. Free for one.</h1>
          <p className="mt-6 text-xl text-cream2 max-w-2xl mx-auto">Every tier includes all 4 apps, the public API, and on-chain identity. You pay for people, not features.</p>
        </div>
      </section>
      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 grid gap-px bg-ink3 lg:grid-cols-4">
          {tiers.map((t) => (
            <div key={t.name} className={`p-8 ${t.featured ? "bg-ink2" : "bg-ink"}`}>
              {t.featured && <p className="text-xs uppercase tracking-widest text-accent">Most popular</p>}
              <h2 className="mt-2 font-serif text-2xl text-cream">{t.name}</h2>
              <p className="mt-1 text-sm text-cream3">{t.forWho}</p>
              <p className="mt-6 font-serif text-4xl text-cream">{t.price}</p>
              <p className="text-xs text-cream3">{t.period}</p>
              <Link href="/signup" className={`mt-6 block text-center ${t.featured ? "o-btn-primary" : "o-btn-ghost"}`}>
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <ul className="mt-6 space-y-2 text-sm text-cream2">
                {t.features.map((f) => <li key={f}>· {f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section className="container mx-auto px-6 py-16 text-center">
        <p className="text-cream3">Non-profit? Education? Email <a href="mailto:education@o.company" className="text-accent">education@o.company</a> with proof — Team tier free.</p>
      </section>
    </article>
  );
}
