import Link from "next/link";
import { ArrowRight } from "lucide-react";

const services = [
  { id: "website", name: "Websites", tagline: "Designed around your workflow, not a template you have to fit into.",
    deliverables: ["Landing pages", "Multi-page sites", "E-commerce", "Custom CMS", "Hosting + maintenance"] },
  { id: "lead-form", name: "Lead forms", tagline: "Multi-step forms that capture the right info and pipe it where it needs to go.",
    deliverables: ["Form design + UX", "Conditional logic", "Email + CRM routing", "Spam protection", "Conversion tracking"] },
  { id: "automation", name: "Automation", tagline: "Lead notifications, follow-up sequences, pipeline tracking.",
    deliverables: ["Email sequences", "Slack notifications", "CRM stage updates", "Invoice triggers", "Webhook orchestration"] },
  { id: "crm-setup", name: "CRM setup", tagline: "Client tracking, projects, invoicing — all in one place, zero subscription fees.",
    deliverables: ["Schema design", "Data migration", "Custom objects", "Reporting", "Team training"] },
  { id: "photo-pipeline", name: "Photo pipeline", tagline: "Send photos in, get enhanced variations back.",
    deliverables: ["Style guardrails", "Batch processing", "Output formats", "Review + approve", "Asset library"] },
  { id: "creative", name: "Creative", tagline: "Film, video, ad management, content scraping.",
    deliverables: ["Production", "Post-production", "Ad operations", "Content sourcing", "Distribution"] },
];

export const metadata = { title: "Services" };

export default function ServicesPage() {
  return (
    <article>
      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 py-20 md:py-28">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">Services</p>
          <h1 className="mt-3 font-serif text-5xl md:text-6xl text-cream max-w-3xl">Six things, done well.</h1>
          <p className="mt-6 text-xl text-cream2 max-w-2xl">Each service is delivered with the system behind it. We don't hand you a deliverable and disappear — we hand you a deliverable and the operator that keeps it running.</p>
        </div>
      </section>
      <div className="container mx-auto px-6 py-16 grid gap-px bg-ink3 md:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <Link key={s.id} href={`/services/${s.id}`} className="bg-ink2 p-8 group hover:bg-ink3/30 transition">
            <p className="text-xs uppercase tracking-widest text-accent">{s.id.replace("-", " ")}</p>
            <h2 className="mt-2 font-serif text-2xl text-cream">{s.name}</h2>
            <p className="mt-2 text-sm text-cream2 leading-relaxed">{s.tagline}</p>
            <p className="mt-4 text-xs text-cream3 group-hover:text-accent transition flex items-center gap-1">Details <ArrowRight className="h-3 w-3" /></p>
          </Link>
        ))}
      </div>
    </article>
  );
}
