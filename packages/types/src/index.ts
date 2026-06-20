// =============================================================================
// o.company · domain types
// =============================================================================
// Every type the company touches lives here. Internal apps and the public
// site import from "@o/types" so the wire format, the DB schema, and the UI
// stay in sync. If you change a type, you change it once, here.

export type ID = string;
export type ISODate = string;
export type ISODateTime = string;
export type Email = string;
export type URL = string;
export type Cents = number; // all money stored as integer cents
export type Address = string; // 0x-prefixed EVM address

// =============================================================================
// Identity & access
// =============================================================================

/** Roles in the org chart, ordered by privilege. */
export const ROLES = [
  "owner",      // O'Shay — full access including billing
  "admin",      // you — can do everything except transfer ownership
  "manager",    // team lead — can manage their direct reports
  "operator",   // employee — can do their assigned work
  "client",     // external — can only see their own projects
  "guest",      // external read-only — for prospects
] as const;

export type Role = (typeof ROLES)[number];

/** Permissions — every action the system can authorize. */
export const PERMISSIONS = [
  // Org
  "org:read",
  "org:write",
  "org:billing",
  "org:transfer_ownership",

  // People
  "people:read",
  "people:write",
  "people:invite",
  "people:terminate",
  "people:assign_role",

  // CRM
  "contacts:read",
  "contacts:write",
  "contacts:delete",
  "contacts:export",
  "deals:read",
  "deals:write",
  "deals:delete",

  // Projects
  "projects:read",
  "projects:write",
  "projects:delete",
  "projects:assign",

  // Files
  "files:read",
  "files:write",
  "files:delete",

  // Money
  "invoices:read",
  "invoices:write",
  "invoices:send",
  "invoices:delete",
  "payments:read",
  "payments:refund",
  "payouts:read",
  "payouts:initiate",

  // Client portal
  "client:view_own",
  "client:comment",
  "client:approve",
  "client:pay",

  // Support
  "support:read",
  "support:respond",
  "support:assign",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Role → permission set. Owner has everything; client has only their scope. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== "org:transfer_ownership"),
  manager: [
    "org:read",
    "people:read",
    "people:invite",
    "contacts:read", "contacts:write",
    "deals:read", "deals:write",
    "projects:read", "projects:write", "projects:assign",
    "files:read", "files:write",
    "invoices:read", "invoices:write", "invoices:send",
    "payments:read",
    "support:read", "support:respond", "support:assign",
  ],
  operator: [
    "org:read",
    "people:read",
    "contacts:read", "contacts:write",
    "deals:read", "deals:write",
    "projects:read", "projects:write",
    "files:read", "files:write",
    "invoices:read", "invoices:write",
    "support:read", "support:respond",
  ],
  client: ["client:view_own", "client:comment", "client:approve", "client:pay"],
  guest: [],
};

// =============================================================================
// Org & people
// =============================================================================

export interface Org {
  id: ID;
  name: string;
  slug: string;
  legalName: string;
  taxId?: string;
  taxJurisdiction: string; // "US", "EU-DE", "GB", ...
  baseCurrency: string;    // ISO 4217: "USD"
  country: string;         // ISO 3166-1 alpha-2: "US"
  timezone: string;         // IANA: "America/Chicago"
  fiscalYearStart: string;  // "01-01" or "04-01"
  logo?: URL;
  website?: URL;
  /** Operational email for the org. */
  contactEmail: Email;
  /** Public-facing support email. */
  supportEmail: Email;
  /** Billing email for invoices. */
  billingEmail: Email;
  /** Active plan. */
  plan: "free" | "team" | "scale" | "enterprise";
  /** Created at. */
  createdAt: ISODateTime;
}

export interface Person {
  id: ID;
  orgId: ID;
  /** First + last name. */
  firstName: string;
  lastName: string;
  email: Email;
  phone?: string;
  avatar?: URL;
  role: Role;
  /** Direct manager (for org chart). */
  managerId?: ID;
  /** Department. */
  department?: "engineering" | "operations" | "sales" | "creative" | "finance" | "people";
  /** Title. */
  title?: string;
  /** Locale preferences. */
  locale: string;
  timezone: string;
  /** Employment. */
  status: "active" | "on_leave" | "invited" | "deactivated";
  /** Compensation. Stored in cents in home currency. */
  baseSalaryCents?: Cents;
  /** Payment details. */
  paymentMethod?: PaymentMethod;
  /** Custom permissions (overrides role defaults). */
  extraPermissions?: Permission[];
  /** Last activity. */
  lastSeenAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Invitation {
  id: ID;
  orgId: ID;
  email: Email;
  role: Role;
  invitedBy: ID;
  /** Token used to accept the invite. Hashed at rest. */
  tokenHash: string;
  expiresAt: ISODateTime;
  acceptedAt?: ISODateTime;
  createdAt: ISODateTime;
}

// =============================================================================
// CRM
// =============================================================================

export type ContactStatus = "lead" | "active" | "customer" | "churned" | "archived";
export type ContactLifecycle = "subscriber" | "lead" | "mql" | "sql" | "opportunity" | "customer" | "evangelist";

export interface Contact {
  id: ID;
  orgId: ID;
  ownerId: ID;
  firstName: string;
  lastName: string;
  email?: Email;
  phone?: string;
  companyId?: ID;
  title?: string;
  status: ContactStatus;
  lifecycle: ContactLifecycle;
  source?: string;
  tags: string[];
  /** Free-form JSON. Properties users can add themselves. */
  customFields: Record<string, unknown>;
  /** On-chain identity. */
  wallet?: Address;
  ensName?: string;
  trustScore?: number; // 0-100
  lastContactedAt?: ISODateTime;
  avatar?: URL;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Company {
  id: ID;
  orgId: ID;
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  logo?: URL;
  address?: string;
  createdAt: ISODateTime;
}

export const DEAL_STAGES = [
  "lead",        // new, uncontacted
  "qualified",   // BANT confirmed
  "proposal",    // sent quote/SOW
  "negotiation", // redlines, final terms
  "won",         // closed-won
  "lost",        // closed-lost
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export interface Deal {
  id: ID;
  orgId: ID;
  ownerId: ID;
  contactId: ID;
  companyId?: ID;
  name: string;
  amountCents: Cents;
  currency: string;
  stage: DealStage;
  probability: number; // 0-1
  expectedCloseDate: ISODate;
  description?: string;
  /** Last time the stage changed — for stage-age analytics. */
  stageChangedAt: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  closedAt?: ISODateTime;
}

// =============================================================================
// Projects (the operator's primary unit of work)
// =============================================================================

export const PROJECT_STATUS = [
  "scoping",      // in conversation, no SOW yet
  "proposed",     // SOW sent, awaiting signature
  "active",       // work in progress
  "review",       // delivered, awaiting client approval
  "delivered",    // client approved, project closed
  "paused",       // on hold, reason required
  "cancelled",    // killed before delivery
] as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[number];

export interface Project {
  id: ID;
  orgId: ID;
  ownerId: ID;
  clientId: ID;             // the contact who is the client
  name: string;
  description?: string;
  status: ProjectStatus;
  /** Type of service — the 6 things Noira does. */
  service:
    | "website"
    | "lead_form"
    | "automation"
    | "crm_setup"
    | "photo_pipeline"
    | "creative"
    | "custom";
  /** Contract value, in cents. */
  contractValueCents: Cents;
  currency: string;
  /** Billing schedule. */
  billing: "fixed" | "hourly" | "retainer" | "milestone";
  hourlyRateCents?: Cents; // if billing = "hourly" or "retainer"
  retainerHoursPerMonth?: number;
  /** Dates. */
  startDate: ISODate;
  dueDate?: ISODate;
  deliveredAt?: ISODate;
  /** The operator-defined workflow for this project. */
  milestones: Milestone[];
  /** Team. */
  teamIds: ID[];
  /** Tags. */
  tags: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Milestone {
  id: ID;
  projectId: ID;
  name: string;
  description?: string;
  /** Date the milestone is due. */
  dueDate: ISODate;
  /** Date the milestone was actually completed. */
  completedAt?: ISODateTime;
  /** Hours logged on this milestone (if billing = hourly). */
  hoursLogged: number;
  /** Linked invoice, if any. */
  invoiceId?: ID;
  status: "pending" | "in_progress" | "review" | "complete" | "blocked";
}

// =============================================================================
// Time tracking
// =============================================================================

export interface TimeEntry {
  id: ID;
  orgId: ID;
  personId: ID;
  projectId: ID;
  milestoneId?: ID;
  /** Date the work was done (not when the entry was logged). */
  date: ISODate;
  /** Minutes worked. Decimal hours for billing precision. */
  hours: number;
  description: string;
  billable: boolean;
  /** If true, this entry was already included on an invoice. */
  invoicedAt?: ISODateTime;
  invoiceId?: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// =============================================================================
// Money — invoices, payments, payouts
// =============================================================================

export const CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "NZD",
  "BRL", "MXN", "ARS", "CLP", "COP", "PEN",
  "INR", "PHP", "IDR", "VND", "THB", "MYR", "SGD",
  "NGN", "GHS", "KES", "ZAR",
  "AED", "SAR",
] as const;
export type Currency = (typeof CURRENCIES)[number];

export type PaymentMethod =
  | { kind: "card";     brand: string; last4: string }
  | { kind: "bank";     bankName: string; last4: string }
  | { kind: "crypto";   chain: "ethereum" | "base" | "polygon" | "arbitrum"; token: "USDC" | "USDT" | "ETH" }
  | { kind: "wire";     reference: string }
  | { kind: "manual";   note: string };

export const INVOICE_STATUS = [
  "draft",
  "sent",
  "viewed",
  "partial",     // partially paid
  "paid",
  "overdue",
  "void",
  "uncollectible",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export interface Invoice {
  id: ID;
  orgId: ID;
  /** Sequential per-org invoice number, human-friendly: "INV-2026-0042". */
  number: string;
  clientId: ID;
  projectId?: ID;
  /** Issued to. */
  billTo: {
    name: string;
    email: Email;
    address?: string;
    taxId?: string;
  };
  /** Line items. */
  lines: InvoiceLine[];
  /** Totals are computed from lines, but cached for query speed. */
  subtotalCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
  currency: Currency;
  /** Exchange rate to home currency at issue time. */
  fxRate?: number;
  /** Status. */
  status: InvoiceStatus;
  /** Issued. */
  issueDate: ISODate;
  /** Due. */
  dueDate: ISODate;
  /** Sent + paid timestamps. */
  sentAt?: ISODateTime;
  paidAt?: ISODateTime;
  /** Memo on the invoice. */
  memo?: string;
  /** Payment terms (free text: "Net 14", "Due on receipt", ...). */
  terms: string;
  /** Internal notes (not shown on the invoice PDF). */
  internalNotes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface InvoiceLine {
  id: ID;
  description: string;
  quantity: number;
  unitPriceCents: Cents;
  /** Optional tax rate as a decimal (0.0825 = 8.25%). */
  taxRate?: number;
  /** Pre-computed line total in cents. */
  totalCents: Cents;
}

export const PAYMENT_STATUS = [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "refunded",
  "partially_refunded",
  "disputed",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export interface Payment {
  id: ID;
  orgId: ID;
  invoiceId: ID;
  /** Customer who paid. */
  contactId: ID;
  amountCents: Cents;
  currency: Currency;
  /** Method. */
  method: PaymentMethod;
  /** External processor IDs. */
  stripePaymentIntentId?: string;
  txHash?: Address; // for crypto
  chain?: "ethereum" | "base" | "polygon" | "arbitrum";
  status: PaymentStatus;
  /** Failure reason. */
  failureReason?: string;
  /** Refund details. */
  refundedAmountCents?: Cents;
  refundedAt?: ISODateTime;
  /** When the funds settled to the business bank account. */
  settledAt?: ISODateTime;
  paidAt: ISODateTime;
  createdAt: ISODateTime;
}

// =============================================================================
// Support
// =============================================================================

export const TICKET_STATUS = [
  "open",
  "waiting_customer",
  "waiting_internal",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUS)[number];

export const TICKET_PRIORITY = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITY)[number];

export interface Ticket {
  id: ID;
  orgId: ID;
  /** Subject + body. */
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  /** Who raised it. */
  requesterId: ID;
  /** Who's on it. */
  assigneeId?: ID;
  /** Conversation thread. */
  messages: TicketMessage[];
  /** Tags. */
  tags: string[];
  /** SLA targets. */
  firstResponseDueAt?: ISODateTime;
  resolutionDueAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  resolvedAt?: ISODateTime;
  closedAt?: ISODateTime;
}

export interface TicketMessage {
  id: ID;
  ticketId: ID;
  authorId: ID;
  body: string;
  /** Whether the message was sent to the customer via email. */
  emailedAt?: ISODateTime;
  createdAt: ISODateTime;
}

// =============================================================================
// Files & media
// =============================================================================

export interface File {
  id: ID;
  orgId: ID;
  /** Original filename. */
  name: string;
  /** MIME type. */
  mime: string;
  /** Size in bytes. */
  size: number;
  /** Storage URL. */
  url: URL;
  /** Thumbnail URL, if applicable. */
  thumbnailUrl?: URL;
  /** SHA-256 for dedup. */
  hash: string;
  /** Linked to. */
  projectId?: ID;
  invoiceId?: ID;
  contactId?: ID;
  uploadedBy: ID;
  createdAt: ISODateTime;
}

// =============================================================================
// Audit log
// =============================================================================

export interface AuditEvent {
  id: ID;
  orgId: ID;
  actorId: ID;
  /** What happened. */
  action: string;
  /** What it happened to. */
  subjectType: string;
  subjectId: ID;
  /** What changed. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** Free-form context. */
  context?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: ISODateTime;
}

// =============================================================================
// Notifications
// =============================================================================

export const NOTIFICATION_KIND = [
  "mention",
  "assignment",
  "comment",
  "status_change",
  "payment_received",
  "payment_failed",
  "invoice_overdue",
  "ticket_reply",
  "system",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KIND)[number];

export interface Notification {
  id: ID;
  orgId: ID;
  recipientId: ID;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Optional deep link. */
  href?: string;
  readAt?: ISODateTime;
  createdAt: ISODateTime;
}

// =============================================================================
// Jobs (background work)
// =============================================================================

export type JobKind =
  | "send_email"
  | "send_invoice"
  | "charge_subscription"
  | "sync_wallet"
  | "score_trust"
  | "process_photo"
  | "build_site"
  | "publish_blog"
  | "renew_dns"
  | "monthly_close";

export interface Job<T = unknown> {
  id: ID;
  kind: JobKind;
  payload: T;
  runAt: ISODateTime;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  status: "queued" | "running" | "succeeded" | "failed" | "dead";
  startedAt?: ISODateTime;
  finishedAt?: ISODateTime;
}
