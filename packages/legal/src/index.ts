// =============================================================================
// o.company · legal
// =============================================================================
// All contracts live in code. This module is the single source of truth for
// the Master Services Agreement, the Data Processing Addendum, the
// acceptable-use policy, and the per-plan terms. When terms change, the
// change is a code change — auditable, reviewable, version-controlled.
//
// In production, the rendered text lives at /legal/{slug} on the public site.

export interface Clause {
  /** Stable identifier so we can reference clauses by id in code. */
  id: string;
  /** Human-readable section heading. */
  heading: string;
  /** Markdown body. */
  body: string;
}

export const MSA: Clause[] = [
  {
    id: "msa.parties",
    heading: "1. Parties",
    body: "This Master Services Agreement (\"Agreement\") is between **o.company** (\"Provider\") and the entity that signs the order form (\"Customer\"). By signing the order form, Customer agrees to these terms.",
  },
  {
    id: "msa.service",
    heading: "2. Service",
    body: "Provider operates the **o.company platform** — a local-first, privacy-respecting customer relationship and operations platform. The platform includes the web application, mobile applications, public website, and the integrations described in the order form.",
  },
  {
    id: "msa.uptime",
    heading: "3. Service level",
    body: "Provider targets 99.9% monthly uptime for the Team and Scale plans, 99.95% for Enterprise. Uptime is measured at the load balancer, excluding scheduled maintenance. Credits for missed SLA are issued at the next billing cycle per the published schedule.",
  },
  {
    id: "msa.data",
    heading: "4. Customer data",
    body: "Customer retains all right, title, and interest in their data. Provider processes Customer data only as needed to deliver the service, never sells it, and never uses it to train models. The Data Processing Addendum (\"DPA\") governs the handling of personal data and is incorporated by reference.",
  },
  {
    id: "msa.term",
    heading: "5. Term and termination",
    body: "This Agreement begins on the order form's effective date and continues for the initial term. Either party may terminate for material breach with 30 days' written notice. Customer may terminate for convenience at any time; fees for the current term are non-refundable except as required by law. Upon termination, Customer may export all data for 30 days; thereafter Provider deletes Customer data.",
  },
  {
    id: "msa.fees",
    heading: "6. Fees",
    body: "Customer pays the fees specified in the order form. Fees are non-refundable except as required by law. Provider may change fees for renewal terms with 60 days' notice; the change takes effect at the next renewal.",
  },
  {
    id: "msa.confidentiality",
    heading: "7. Confidentiality",
    body: "Each party will protect the other's confidential information with the same care it uses for its own (and no less than reasonable care). Confidentiality obligations survive termination for 5 years.",
  },
  {
    id: "msa.warranty",
    heading: "8. Warranties and disclaimers",
    body: "Provider warrants that the service will perform materially as described. Except as expressly stated, the service is provided \"as is\" without other warranties of any kind. Provider does not warrant that the service will be uninterrupted or error-free.",
  },
  {
    id: "msa.liability",
    heading: "9. Limitation of liability",
    body: "To the maximum extent permitted by law, neither party's aggregate liability arising from this Agreement exceeds the fees paid by Customer in the 12 months preceding the claim. Neither party is liable for indirect, incidental, or consequential damages.",
  },
  {
    id: "msa.law",
    heading: "10. Governing law",
    body: "This Agreement is governed by the laws of the State of Missouri, USA, without regard to conflict-of-laws principles. Any dispute will be resolved in the state or federal courts located in Polk County, Missouri.",
  },
];

export const DPA: Clause[] = [
  {
    id: "dpa.scope",
    heading: "1. Scope",
    body: "This Data Processing Addendum (\"DPA\") forms part of the Master Services Agreement. It applies to the extent Provider processes personal data on behalf of Customer in the course of providing the service.",
  },
  {
    id: "dpa.roles",
    heading: "2. Roles",
    body: "Customer is the Controller. Provider is the Processor. Provider processes personal data only on the documented instructions of Customer (the Agreement and Customer's use of the service).",
  },
  {
    id: "dpa.subprocessors",
    heading: "3. Sub-processors",
    body: "Provider engages the sub-processors listed at `/legal/subprocessors`. Provider will give Customer 30 days' notice of any new sub-processor. Customer may object on reasonable grounds; if the parties cannot resolve, Customer may terminate the affected services.",
  },
  {
    id: "dpa.security",
    heading: "4. Security measures",
    body: "Provider implements appropriate technical and organizational measures to protect personal data, including: AES-256 encryption at rest, TLS 1.3 in transit, role-based access control, audit logging, 24/7 intrusion monitoring, and an annual SOC 2 Type II audit (available under NDA for Scale and Enterprise customers).",
  },
  {
    id: "dpa.breach",
    heading: "5. Breach notification",
    body: "Provider will notify Customer without undue delay, and in any case within 72 hours, of becoming aware of a personal data breach affecting Customer's data.",
  },
  {
    id: "dpa.requests",
    heading: "6. Data subject requests",
    body: "Provider will assist Customer in responding to data subject requests, including access, rectification, and deletion requests, using the tools provided in the platform.",
  },
  {
    id: "dpa.transfer",
    heading: "7. International transfers",
    body: "Personal data is primarily stored in the United States. Transfers from the EEA, UK, or Switzerland are governed by the European Commission's Standard Contractual Clauses. Provider will enter into a UK International Data Transfer Addendum on request.",
  },
  {
    id: "dpa.audit",
    heading: "8. Audit",
    body: "Customer may audit Provider's compliance with this DPA once per calendar year, on 30 days' notice, during business hours, subject to confidentiality. The SOC 2 Type II report is the primary audit artifact.",
  },
];

export const AUP: Clause[] = [
  {
    id: "aup.scope",
    heading: "1. What this covers",
    body: "This Acceptable Use Policy (\"AUP\") applies to your use of the o.company platform, including the web app, mobile apps, public website, and any integration.",
  },
  {
    id: "aup.prohibited",
    heading: "2. Prohibited use",
    body: "You agree not to use the service to: (a) send spam, phishing, or unsolicited messages; (b) harass, defame, or threaten any person; (c) upload content that infringes a third party's rights; (d) attempt to gain unauthorized access to the service or another customer's data; (e) reverse-engineer the service except as permitted by the open-source license; (f) use the service to violate any applicable law.",
  },
  {
    id: "aup.content",
    heading: "3. Your content",
    body: "You retain ownership of content you upload. You grant Provider a limited license to host, transmit, and process that content as needed to provide the service. You represent that you have the right to upload the content and that it does not violate this AUP.",
  },
  {
    id: "aup.enforcement",
    heading: "4. Enforcement",
    body: "We may investigate violations of this AUP. We may suspend or terminate access for violations. We will notify you in advance when practicable. Material violations may be reported to law enforcement.",
  },
];

export const SLA_CREDITS: { uptimeBelow: number; creditPercent: number }[] = [
  { uptimeBelow: 99.9, creditPercent: 0 },
  { uptimeBelow: 99.0, creditPercent: 10 },
  { uptimeBelow: 95.0, creditPercent: 25 },
  { uptimeBelow: 90.0, creditPercent: 50 },
];

/** Render a contract as a flat Markdown document. */
export function renderContract(clauses: Clause[]): string {
  return clauses.map((c) => `## ${c.heading}\n\n${c.body}`).join("\n\n");
}
