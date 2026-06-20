/**
 * The company voice.
 *
 * Every string the company emits — error messages, success toasts, emails,
 * invoices, support replies, marketing copy — flows through this file. The
 * voice is the same across every app because the brand is the same.
 *
 * Tone:
 *   - Calm. We're an operator, not a hype machine.
 *   - Precise. Numbers in spec, dates in ISO, status in plain English.
 *   - Direct. No exclamation points unless O'Shay sends them himself.
 *   - Warm. We work with humans, for humans.
 */

export const voice = {
  app: {
    error: {
      generic:    "Something went wrong. We're looking into it.",
      network:     "Can't reach our servers. Check your connection and try again.",
      unauthorized:"You don't have access to this. Sign in or ask the owner for permission.",
      notFound:    "We couldn't find that. It may have been moved or deleted.",
      validation:  "Some fields need attention. Check the highlighted items.",
      rateLimit:   "Too many requests in a short time. Wait a moment and try again.",
      offline:     "You're offline. Changes will sync when you're back online.",
      unauthorized_payment: "This payment was declined. Check the card details and try again.",
      kyc_required: "This action requires identity verification. We'll guide you through it.",
    },
    success: {
      saved:        "Saved.",
      created:      "Created.",
      deleted:      "Deleted.",
      sent:         "Sent.",
      invited:       "Invite sent.",
      paid:         "Payment received. Thank you.",
      refunded:     "Refund issued. It may take 5-10 business days to appear.",
      uploaded:     "Uploaded.",
      synced:       "Synced.",
    },
    empty: {
      contacts:   "No contacts yet. Add one to get started.",
      deals:      "No deals in this stage. Drag a deal here, or create a new one.",
      invoices:   "No invoices yet. Create one from a deal when you're ready.",
      projects:   "No projects. Start one to begin.",
      tasks:      "Inbox zero. Nothing needs you right now.",
      notifications: "All caught up. We'll let you know when something happens.",
    },
  },

  /** Sales / marketing copy. Used on the website and in outbound. */
  marketing: {
    tagline: "Your business, operated.",
    subtagline: "An AI operator that briefs you, runs your pipeline, manages your clients, and ships your work — so you can focus on the work that pays.",
    cta: {
      primary:   "Start a brief",
      secondary: "See how it works",
      pricing:   "See pricing",
    },
    social: {
      twitter:  "An AI operator for your business. Briefs, pipeline, clients — operated end-to-end.",
      linkedin: "An AI operator that runs your operations: briefings, pipeline tracking, client management, invoicing. From $0 to multi-team, with the same calm voice.",
    },
  },

  /** Support replies. Calmer than the marketing copy. */
  support: {
    greeting: (name: string) => `Hi ${name}`,
    acknowledgement: "Thanks for reaching out.",
    eta: "We'll get back to you within 1 business hour.",
    signoff: (name: string) => `Best,\n${name}\no.company`,
  },

  /** Legal copy. Plain English where possible. */
  legal: {
    effectiveDate: (date: string) => `Effective ${date}.`,
  },
} as const;

/** Pluralize a word. English-only for now. */
export function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? singular + "s"}`;
}

/** Format a number as currency-aware short: 12400 → "12.4K", 1_500_000 → "1.5M" */
export function compactNumber(n: number): string {
  if (Math.abs(n) < 1_000) return n.toString();
  if (Math.abs(n) < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}K`;
  if (Math.abs(n) < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}
