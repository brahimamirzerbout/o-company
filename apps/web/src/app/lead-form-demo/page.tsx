import { MultiStepLeadForm, type LeadFormStep } from "@o/ui";

// =============================================================================
// o.company · lead forms demo
// =============================================================================
// A demo page that uses the MultiStepLeadForm to capture a lead.
// The webhook URL points to the API. In dev (no API), the request
// fails and the user sees the error state. In prod, the API receives
// the submission, creates the contact, scores the lead, and the
// operator's draft appears in O'Shay's /briefing page.

const STEPS: LeadFormStep[] = [
  {
    title: "Who are you?",
    description: "We'll be in touch within one business day.",
    fields: [
      { name: "firstName", label: "First name", type: "text", required: true, placeholder: "Alex" },
      { name: "lastName",  label: "Last name",  type: "text", required: true, placeholder: "Rivera" },
      { name: "email",     label: "Email",      type: "email", required: true, placeholder: "alex@example.com" },
    ],
  },
  {
    title: "What do you need?",
    description: "Help us route this to the right person on our side.",
    fields: [
      { name: "company",  label: "Company",        type: "text",  placeholder: "Acme Logistics" },
      { name: "phone",    label: "Phone (optional)", type: "tel",   placeholder: "+1 555 0100" },
      {
        name: "projectType", label: "What do you need?", type: "select", required: true,
        options: ["Website", "Lead forms", "Automation", "CRM setup", "Photo pipeline", "Creative"],
      },
      {
        name: "budget", label: "Budget range", type: "select", required: true,
        options: ["<$1k", "$1k–$5k", "$5k–$20k", "$20k+", "Not sure yet"],
      },
      {
        name: "timeline", label: "When do you need this?", type: "select", required: true,
        options: ["This week", "This month", "This quarter", "Just exploring"],
      },
    ],
  },
  {
    title: "Anything else?",
    description: "Optional. Links, references, anything that helps us prepare.",
    fields: [
      { name: "notes", label: "Notes", type: "textarea", placeholder: "Anything else we should know?" },
      {
        name: "referrer", label: "How did you hear about us?", type: "text", placeholder: "Twitter, friend, etc."
      },
    ],
  },
  {
    title: "Ready to send?",
    description: "We'll reply within one business day with next steps.",
    fields: [],
  },
];

export default function LeadFormDemoPage() {
  return (
    <div className="container mx-auto px-6 py-12 max-w-2xl">
      <div className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">Lead form</p>
        <h1 className="mt-2 font-serif text-4xl text-cream">Let's talk.</h1>
        <p className="mt-3 text-cream3">
          Three short steps. O'Shay reads every submission himself.
        </p>
      </div>
      <MultiStepLeadForm
        steps={STEPS}
        webhookUrl="/api/lead-forms/submit"
        metadata={{ source: "demo-page" }}
        submitLabel="Send to O'Shay"
      />
      <div className="mt-8 text-xs text-cream3 text-center">
        This page is a demo. The form posts to the API; the API creates a
        contact, scores it, and the operator's draft appears in /briefing.
      </div>
    </div>
  );
}
