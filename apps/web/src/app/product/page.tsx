import { ArrowRight } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Product" };

export default function ProductPage() {
  return (
    <article>
      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 py-20 md:py-28">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">Product</p>
          <h1 className="mt-3 font-serif text-5xl md:text-6xl text-cream max-w-3xl leading-[1]">
            The platform behind the operator.
          </h1>
          <p className="mt-6 text-xl text-cream2 max-w-2xl">
            Every surface of o.company — the dashboard, the mobile apps, the client portal, the public site — is built on the same data model. One platform, four apps, one source of truth.
          </p>
        </div>
      </section>

      <Section
        id="contacts"
        title="Contacts"
        body="People, not rows. Lifecycle stages, last-contacted, follow-ups, and an on-chain Trust Score for anyone who's connected a wallet. Search by anything. Import from anywhere."
      />
      <Section
        id="deals"
        title="Deals"
        body="Six pipeline stages, probability-weighted forecasts, and a deal velocity score that tells you which opportunities are slipping. Drag-and-drop, or let the operator move them for you based on the rules you set."
      />
      <Section
        id="projects"
        title="Projects"
        body="Each project has a client, a contract value, a billing schedule, and a list of milestones. Time logged flows into invoices on completion. Status updates go to the client automatically."
      />
      <Section
        id="invoicing"
        title="Invoicing"
        body="Generate invoices from time entries, fixed contracts, or milestone completions. Send in your voice. Get paid by card, bank transfer, or crypto. Multi-currency, multi-region, multi-tax-jurisdiction."
      />
      <Section
        id="time"
        title="Time"
        body="Track time against projects and milestones. Bill it or don't. See your week, your month, your quarter. The operator's morning brief tells you what to focus on next."
      />
      <Section
        id="wallet"
        title="On-chain identity"
        body="Connect a wallet. Resolve ENS, Basenames, and Unstoppable Domains. We compute a Trust Score from public on-chain activity — no custody, no KYC, no spam. We never see your keys."
      />
    </article>
  );
}

function Section({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <section id={id} className="border-b border-ink3">
      <div className="container mx-auto px-6 py-16 md:py-20 grid gap-6 md:grid-cols-[1fr,2fr] items-start">
        <h2 className="font-serif text-3xl text-cream">{title}</h2>
        <div>
          <p className="text-lg text-cream2 leading-relaxed max-w-2xl">{body}</p>
        </div>
      </div>
    </section>
  );
}
