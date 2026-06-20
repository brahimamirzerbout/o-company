import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Logo } from "@o/brand/logo";

// =============================================================================
// o.company · homepage
// =============================================================================
// The single page that explains what we are. The narrative is the operator
// pitch, expanded to the full platform surface. We do NOT use 3D, parallax,
// or any other "look at me" technique — the brand voice is calm.

export default function HomePage() {
  return (
    <>
      <Hero />
      <Services />
      <HowItWorks />
      <Proof />
      <Pricing />
      <CTA />
    </>
  );
}

function Hero() {
  return (
    <section className="relative border-b border-ink3">
      <div className="container mx-auto px-6 py-24 md:py-36">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">o.company</p>
          <h1 className="mt-4 font-serif text-5xl md:text-7xl leading-[0.95] tracking-tight text-cream">
            Your business,<br /><span className="text-accent">operated.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg md:text-xl text-cream2 text-pretty">
            An AI operator that briefs you every morning, tracks your pipeline, manages your clients, and ships your work — so you can focus on the work that pays.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Link href="/signup" className="o-btn-primary">
              Start a brief
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/product" className="o-btn-ghost">See how it works</Link>
          </div>
          <p className="mt-4 text-xs text-cream3">
            Free for 1 user. No credit card. Cancel anytime.
          </p>
        </div>
      </div>
    </section>
  );
}

function Services() {
  const services = [
    { id: "website",         name: "Websites",         blurb: "Landing pages, multi-page sites, e-commerce. Built around your workflow." },
    { id: "lead_form",       name: "Lead forms",       blurb: "Multi-step forms that capture the right info and pipe it where it needs to go." },
    { id: "automation",      name: "Automation",      blurb: "Lead notifications, follow-up sequences, pipeline tracking." },
    { id: "crm_setup",       name: "CRM setup",       blurb: "Client tracking, projects, invoicing — all in one place. Zero subscription fees." },
    { id: "photo_pipeline",  name: "Photo pipeline",  blurb: "Send photos in, get enhanced variations back. Style guardrails included." },
    { id: "creative",        name: "Creative",        blurb: "Film, video, ad management, content scraping. The full stack." },
  ];
  return (
    <section className="border-b border-ink3">
      <div className="container mx-auto px-6 py-20 md:py-28">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">What we build</p>
        <h2 className="mt-3 font-serif text-4xl md:text-5xl text-cream max-w-2xl">
          Six services. One operator.
        </h2>
        <p className="mt-4 text-cream2 max-w-2xl">
          Each service ships with a system behind it — not just a deliverable. Design to deployment, with the same operator carrying the work.
        </p>
        <div className="mt-12 grid gap-px bg-ink3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Link
              key={s.id}
              href={`/services/${s.id}`}
              className="bg-ink2 p-8 group hover:bg-ink3/40 transition"
            >
              <p className="text-xs uppercase tracking-widest text-accent">{s.id.replace("_", " ")}</p>
              <h3 className="mt-3 font-serif text-2xl text-cream">{s.name}</h3>
              <p className="mt-2 text-sm text-cream2 leading-relaxed">{s.blurb}</p>
              <p className="mt-4 text-xs text-cream3 group-hover:text-accent transition flex items-center gap-1">
                Learn more <ArrowRight className="h-3 w-3" />
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Brief",         d: "Every morning the operator reads your pipeline, your follow-ups, your calendar, and your wins. You start the day briefed." },
    { n: "02", t: "Operate",       d: "It tracks deals, sends follow-ups, logs calls, updates contacts. You stay in the loop without being in the way." },
    { n: "03", t: "Ship",          d: "Websites, lead forms, automations, CRM setups, photo pipelines, creative work — all tracked, all delivered, all billed." },
    { n: "04", t: "Bill",          d: "Invoices generated from time entries, contracts, or milestones. Sent in your voice, in your client's currency, on the schedule you set." },
  ];
  return (
    <section className="border-b border-ink3 bg-ink2">
      <div className="container mx-auto px-6 py-20 md:py-28">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">How it works</p>
        <h2 className="mt-3 font-serif text-4xl md:text-5xl text-cream max-w-2xl">
          A closed loop.
        </h2>
        <p className="mt-4 text-cream2 max-w-2xl">
          The same data flows through every stage. No manual re-entry, no copy-paste between tools, no lost context. The brief, the work, the money.
        </p>
        <ol className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="border-t border-ink3 pt-6">
              <p className="font-mono text-xs text-accent">{s.n}</p>
              <h3 className="mt-2 font-serif text-2xl text-cream">{s.t}</h3>
              <p className="mt-2 text-sm text-cream2 leading-relaxed">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Proof() {
  const logos = ["Northwind", "Helios", "Atlas Foundry", "Lumen Studios", "Verdant", "Quanta", "Sable & Co.", "Polaris"];
  return (
    <section className="border-b border-ink3">
      <div className="container mx-auto px-6 py-16">
        <p className="text-center text-xs uppercase tracking-widest text-cream3">Trusted by 2,800+ teams</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
          {logos.map((n) => (
            <span key={n} className="font-serif text-xl text-cream3/60 select-none">{n}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const tiers = [
    { name: "Solo",    price: "Free",   blurb: "For freelancers and founders.", cta: "Start free",         features: ["1 user", "Up to 100 contacts", "Single pipeline", "Mobile + web apps", "Local-first"] },
    { name: "Team",    price: "$19",    blurb: "Per user / month. The small-team workhorse.", cta: "Start 14-day trial", features: ["Unlimited contacts", "Unlimited projects", "Time tracking & invoicing", "Crypto + card payments", "Email support"], featured: true },
    { name: "Scale",   price: "$49",    blurb: "Per user / month. For growing ops teams.", cta: "Talk to sales",     features: ["Multi-team org chart", "Role-based permissions", "Audit log", "SSO", "SLA + dedicated CSM"] },
    { name: "On-prem", price: "Custom", blurb: "Air-gapped, on your hardware.",               cta: "Contact us",        features: ["Self-hosted", "Source-available server", "FIPS crypto", "No data leaves your network"] },
  ];
  return (
    <section className="border-b border-ink3">
      <div className="container mx-auto px-6 py-20 md:py-28">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">Pricing</p>
        <h2 className="mt-3 font-serif text-4xl md:text-5xl text-cream max-w-2xl">
          Honest. Per-seat. Free for one.
        </h2>
        <div className="mt-12 grid gap-px bg-ink3 lg:grid-cols-4">
          {tiers.map((t) => (
            <div key={t.name} className={`p-8 ${t.featured ? "bg-ink2" : "bg-ink"}`}>
              {t.featured && <p className="text-xs uppercase tracking-widest text-accent">Most popular</p>}
              <h3 className="mt-2 font-serif text-2xl text-cream">{t.name}</h3>
              <p className="mt-1 text-sm text-cream3">{t.blurb}</p>
              <p className="mt-6 font-serif text-3xl text-cream">{t.price}</p>
              {t.price !== "Free" && t.price !== "Custom" && <p className="text-xs text-cream3">per user / month</p>}
              {t.price === "Custom" && <p className="text-xs text-cream3">for your scale</p>}
              <Link href="/signup" className={`mt-6 block text-center ${t.featured ? "o-btn-primary" : "o-btn-ghost"}`}>
                {t.cta}
              </Link>
              <ul className="mt-6 space-y-2">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-cream2">
                    <Check className="h-3.5 w-3.5 text-accent mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section>
      <div className="container mx-auto px-6 py-24 md:py-32">
        <div className="border-t border-b border-ink3 py-20 text-center">
          <Sparkles className="h-6 w-6 text-accent mx-auto" />
          <h2 className="mt-4 font-serif text-4xl md:text-5xl text-cream max-w-2xl mx-auto">
            Start a brief.
          </h2>
          <p className="mt-4 text-cream2 max-w-md mx-auto">
            Free for 1 user. No credit card. The operator's first briefing ships within 60 seconds of signup.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-center">
            <Link href="/signup" className="o-btn-primary">
              Start a brief
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="o-btn-ghost">Talk to us</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
