import Link from "next/link";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <article>
      <section className="border-b border-ink3">
        <div className="container mx-auto px-6 py-20 md:py-28">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">About</p>
          <h1 className="mt-3 font-serif text-5xl md:text-6xl text-cream max-w-3xl">
            A small company in Bolivar, Missouri building the operator we wished existed.
          </h1>
          <div className="mt-8 max-w-2xl text-lg text-cream2 leading-relaxed space-y-5">
            <p>
              o.company is built and run by O'Shay Lighten. We do six things — websites, lead forms, automation, CRM setup, photo pipelines, creative — and we do them with the same operator carrying the work. No ticket handoffs. No "let me check with the team." Just one person, one company, and a system that doesn't drop the ball.
            </p>
            <p>
              We started in 2024 because the tools we needed didn't exist. We wanted a CRM that didn't rent our data back to us. We wanted an invoicing system that didn't charge per-seat for the privilege of getting paid. We wanted a place where the calendar, the pipeline, the time tracking, the briefs, and the money all lived in the same view. So we built it.
            </p>
            <p>
              Today o.company is used by 2,800+ teams in 142 countries. The platform is open source. The data is yours. The operator is calm.
            </p>
          </div>
        </div>
      </section>
      <section className="border-b border-ink3 bg-ink2">
        <div className="container mx-auto px-6 py-20">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">What we believe</p>
          <div className="mt-8 grid gap-px bg-ink3 md:grid-cols-2">
            {[
              ["Your data is yours.", "Not a feature on a pricing tier. The default. Export a single file. Self-host. Cancel."],
              ["Privacy by default.", "No third-party trackers. No session replay. No analytics phone-home. Your absence is the feature."],
              ["Open beats closed.", "Clients are MIT. Server is source-available. Wire format is documented. We can't lock you in even if we wanted to."],
              ["Native beats wrapped.", "Native iOS, native Android, native desktop. The mobile apps feel like the OS made them."],
              ["Offline is a feature.", "A plane, a basement, a coffee shop with bad WiFi. The product works the same."],
              ["Calm is competitive.", "We don't shout. We don't gamify. We don't dark-pattern. We do the work, then we tell you what we did."],
            ].map(([h, b]) => (
              <div key={h} className="bg-ink2 p-8">
                <h3 className="font-serif text-2xl text-cream">{h}</h3>
                <p className="mt-2 text-cream2 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="container mx-auto px-6 py-20 text-center">
        <Link href="/contact" className="o-btn-primary">Work with us</Link>
      </section>
    </article>
  );
}
