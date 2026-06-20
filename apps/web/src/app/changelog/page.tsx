export const metadata = { title: "Changelog" };

const entries = [
  { v: "1.0.0", date: "2026-06-20", title: "The full operator", body: "iOS, Android, Web, macOS, Windows, Linux. On-chain Trust Score. Multi-currency, multi-language, multi-region. The platform is open source." },
  { v: "0.9.4", date: "2026-06-10", title: "Pipeline kanban + voice notes", body: "Drag-and-drop deals across stages with probability-weighted forecasts. Voice notes land in the contact timeline automatically." },
  { v: "0.9.0", date: "2026-05-28", title: "Closed beta", body: "Limited release to 200 design partners. Onboarded 12,400 contacts in the first week." },
  { v: "0.5.0", date: "2026-04-15", title: "First internal build", body: "A working CRM, 14 days from kickoff. The team has been using it for sales ever since." },
];

export default function ChangelogPage() {
  return (
    <article className="container mx-auto px-6 py-20 md:py-28 max-w-3xl">
      <p className="text-xs uppercase tracking-[0.3em] text-accent">Changelog</p>
      <h1 className="mt-3 font-serif text-5xl md:text-6xl text-cream">Every release. In order.</h1>
      <p className="mt-6 text-lg text-cream2">
        Subscribe via <a href="/rss.xml" className="text-accent">RSS</a> or{" "}
        <a href="https://github.com/o-company" className="text-accent">GitHub releases</a>.
      </p>
      <ol className="mt-12 relative border-l border-ink3 pl-6 space-y-12">
        {entries.map((e) => (
          <li key={e.v} className="relative">
            <span className="absolute -left-[34px] top-0 h-7 w-7 rounded-full border-2 border-ink bg-ink2 flex items-center justify-center text-accent text-xs font-mono">
              v{e.v.split(".")[1]}
            </span>
            <div className="flex items-baseline gap-3">
              <h2 className="font-serif text-2xl text-cream">v{e.v}</h2>
              <time className="text-xs text-cream3 font-mono">{e.date}</time>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-cream">{e.title}</h3>
            <p className="mt-2 text-cream2 leading-relaxed">{e.body}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
