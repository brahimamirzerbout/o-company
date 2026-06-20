import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

const services: Record<string, { name: string; tagline: string; description: string; deliverables: string[]; process: string[]; pricing: string }> = {
  website: {
    name: "Websites",
    tagline: "Designed around your workflow, not a template you have to fit into.",
    description: "We design and build websites that work the way your business works. Landing pages, multi-page sites, e-commerce, custom CMS — built to convert, easy to maintain, and yours forever.",
    deliverables: ["Landing pages", "Multi-page sites", "E-commerce", "Custom CMS", "Hosting + maintenance"],
    process: ["Discovery call (30 min)", "Wireframes + design (3 days)", "Build (5-7 days)", "Launch + handoff"],
    pricing: "From $4,000. Retainers from $400/mo for ongoing edits + hosting.",
  },
  "lead-form": {
    name: "Lead forms",
    tagline: "Multi-step forms that capture the right info and pipe it where it needs to go.",
    description: "Forms that convert. Conditional logic, A/B tested, spam-protected, integrated with your CRM and email — so leads land in the right place, attributed correctly, the first time.",
    deliverables: ["Form design + UX", "Conditional logic", "Email + CRM routing", "Spam protection", "Conversion tracking"],
    process: ["Audit existing form", "Design + copy", "Build + integrate", "A/B test for 14 days"],
    pricing: "From $1,500 per form. $200/mo for hosting + monitoring.",
  },
  automation: {
    name: "Automation",
    tagline: "Lead notifications, follow-up sequences, pipeline tracking.",
    description: "We build the workflows that make your team faster. New lead → instant notification. Deal stage change → CFO dashboard update. Invoice paid → thank-you email. We connect the tools and define the rules.",
    deliverables: ["Email sequences", "Slack notifications", "CRM stage updates", "Invoice triggers", "Webhook orchestration"],
    process: ["Map your current workflow", "Identify the 3 highest-leverage automations", "Build + test", "Document for your team"],
    pricing: "From $2,500 per automation suite. $300/mo for monitoring + adjustments.",
  },
  "crm-setup": {
    name: "CRM setup",
    tagline: "Client tracking, projects, invoicing — all in one place, zero subscription fees.",
    description: "We set up o.company for your team. Schema design, data migration from whatever you're using now, custom objects, reporting, training. You own the data, you own the system, the subscription is $19/seat/mo.",
    deliverables: ["Schema design", "Data migration", "Custom objects", "Reporting", "Team training"],
    process: ["Discovery call (1 hour)", "Schema + migration plan (1 week)", "Build + migrate (1-2 weeks)", "Train the team (1 day)"],
    pricing: "From $8,000 setup. $19/seat/mo or self-host for $0/mo.",
  },
  "photo-pipeline": {
    name: "Photo pipeline",
    tagline: "Send photos in, get enhanced variations back.",
    description: "Send iPhone photos from the shoot, get on-style, on-spec variations back in hours, not days. The pipeline is built around your style — color grading, crop ratios, output formats. You review and approve; we ship.",
    deliverables: ["Style guardrails", "Batch processing", "Output formats", "Review + approve", "Asset library"],
    process: ["Calibrate on 50 of your existing shots", "Build the pipeline", "Test on a new shoot", "Hand off for ongoing use"],
    pricing: "From $3,000 setup. $0.50/photo processed at runtime.",
  },
  creative: {
    name: "Creative",
    tagline: "Film, video, ad management, content scraping.",
    description: "The full creative stack. Production, post-production, ad buying across Meta/Google/TikTok, content scraping from anywhere. We work with you or your existing team.",
    deliverables: ["Production", "Post-production", "Ad operations", "Content sourcing", "Distribution"],
    process: ["Brief", "Estimate", "Produce", "Iterate", "Ship + report"],
    pricing: "Project-based. Most engagements $5k-$25k.",
  },
};

export function generateStaticParams() {
  return Object.keys(services).map((id) => ({ id }));
}

export default function ServicePage({ params }: { params: { id: string } }) {
  const svc = services[params.id];
  if (!svc) notFound();
  return (
    <article>
      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 py-20 md:py-28">
          <Link href="/services" className="text-xs uppercase tracking-widest text-cream3 hover:text-cream">← All services</Link>
          <h1 className="mt-3 font-serif text-5xl md:text-6xl text-cream max-w-3xl">{svc.name}</h1>
          <p className="mt-6 text-xl text-cream2 max-w-2xl">{svc.tagline}</p>
        </div>
      </section>

      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 py-16 max-w-3xl">
          <p className="text-lg text-cream2 leading-relaxed">{svc.description}</p>
        </div>
      </section>

      <section className="border-b border-ink3 bg-ink2">
        <div className="container mx-auto px-6 py-16 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">What you get</p>
          <ul className="mt-6 space-y-3">
            {svc.deliverables.map((d) => (
              <li key={d} className="flex items-start gap-3 text-cream">
                <Check className="h-4 w-4 text-accent mt-1 flex-shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 py-16 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">How it works</p>
          <ol className="mt-6 space-y-4">
            {svc.process.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="font-mono text-xs text-accent pt-1 w-6">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-cream">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 py-16 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">Pricing</p>
          <p className="mt-4 text-xl text-cream2">{svc.pricing}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link href="/contact?service={params.id}" className="o-btn-primary">Get a quote<ArrowRight className="h-4 w-4" /></Link>
            <Link href="/services" className="o-btn-ghost">All services</Link>
          </div>
        </div>
      </section>
    </article>
  );
}
