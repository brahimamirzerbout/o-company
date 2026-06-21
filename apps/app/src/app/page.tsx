import { Stat, Card } from "@o/ui";
import { BriefInbox } from "./_components/brief-inbox";

// =============================================================================
// Client portal home — the brief inbox
// =============================================================================
// The brief inbox is the home. KPIs at the top, brief below, talk-to-us at
// the bottom. No nav needed. The client opens the portal and sees what's
// happening.

export default function ClientHome() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Stat label="Open projects" value="2" sub="across 2 workstreams" />
        <Stat label="Outstanding" value="$31,000" sub="next invoice · Jul 12" />
        <Stat label="YTD with us" value="$84,000" sub="since Feb 2026" trend={{ dir: "up", pct: 12 }} />
      </div>
      <BriefInbox />
    </>
  );
}
