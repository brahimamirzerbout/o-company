// =============================================================================
// o.company · Postgres schema (Drizzle ORM)
// =============================================================================
// One schema, one source of truth. Every app reads from this. We use Drizzle
// because: (a) it's TypeScript-native, (b) it generates clean migrations,
// (c) the inferred types match our @o/types 1:1.
//
// Conventions:
//   - every table has id (uuid), orgId (uuid), createdAt, updatedAt
//   - soft deletes use deletedAt IS NULL
//   - monetary values are stored as integer cents, never floats
//   - free-form JSON uses jsonb with explicit type guards in the app
//   - indexes are declared inline so they're versioned with the table

import {
  pgTable, uuid, text, timestamp, integer, boolean, jsonb,
  pgEnum, index, uniqueIndex, primaryKey, real, doublePrecision,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// =============================================================================
// Enums
// =============================================================================

export const roleEnum = pgEnum("role", [
  "owner", "admin", "manager", "operator", "client", "guest",
] as const);

export const departmentEnum = pgEnum("department", [
  "engineering", "operations", "sales", "creative", "finance", "people",
] as const);

export const personStatusEnum = pgEnum("person_status", [
  "active", "on_leave", "invited", "deactivated",
] as const);

export const contactStatusEnum = pgEnum("contact_status", [
  "lead", "active", "customer", "churned", "archived",
] as const);

export const lifecycleEnum = pgEnum("lifecycle", [
  "subscriber", "lead", "mql", "sql", "opportunity", "customer", "evangelist",
] as const);

export const dealStageEnum = pgEnum("deal_stage", [
  "lead", "qualified", "proposal", "negotiation", "won", "lost",
] as const);

export const projectStatusEnum = pgEnum("project_status", [
  "scoping", "proposed", "active", "review", "delivered", "paused", "cancelled",
] as const);

export const serviceEnum = pgEnum("service", [
  "website", "lead_form", "automation", "crm_setup", "photo_pipeline", "creative", "custom",
] as const);

export const billingEnum = pgEnum("billing", [
  "fixed", "hourly", "retainer", "milestone",
] as const);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "pending", "in_progress", "review", "complete", "blocked",
] as const);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft", "sent", "viewed", "partial", "paid", "overdue", "void", "uncollectible",
] as const);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending", "processing", "succeeded", "failed", "refunded", "partially_refunded", "disputed",
] as const);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open", "waiting_customer", "waiting_internal", "in_progress", "resolved", "closed",
] as const);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "low", "normal", "high", "urgent",
] as const);

export const notificationKindEnum = pgEnum("notification_kind", [
  "mention", "assignment", "comment", "status_change",
  "payment_received", "payment_failed", "invoice_overdue",
  "ticket_reply", "system",
] as const);

// =============================================================================
// Tables
// =============================================================================

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  legalName: text("legal_name").notNull(),
  taxId: text("tax_id"),
  taxJurisdiction: text("tax_jurisdiction").notNull(),
  baseCurrency: text("base_currency").notNull().default("USD"),
  country: text("country").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  fiscalYearStart: text("fiscal_year_start").notNull().default("01-01"),
  logo: text("logo"),
  website: text("website"),
  contactEmail: text("contact_email").notNull(),
  supportEmail: text("support_email").notNull(),
  billingEmail: text("billing_email").notNull(),
  plan: text("plan").notNull().default("team"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  avatar: text("avatar"),
  role: roleEnum("role").notNull().default("operator"),
  managerId: uuid("manager_id"),
  department: departmentEnum("department"),
  title: text("title"),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  status: personStatusEnum("status").notNull().default("invited"),
  baseSalaryCents: integer("base_salary_cents"),
  paymentMethod: jsonb("payment_method").$type<unknown>(),
  extraPermissions: jsonb("extra_permissions").$type<string[]>(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => ({
  emailUnique: uniqueIndex("people_email_unique").on(t.orgId, t.email),
  orgIdx: index("people_org_idx").on(t.orgId),
  roleIdx: index("people_role_idx").on(t.orgId, t.role),
}));

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("operator"),
  invitedBy: uuid("invited_by").notNull().references(() => people.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tokenIdx: index("invitations_token_idx").on(t.tokenHash),
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  /** Refresh token hash. */
  refreshTokenHash: text("refresh_token_hash").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain"),
  industry: text("industry"),
  size: text("size"),
  logo: text("logo"),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameIdx: index("companies_name_idx").on(t.orgId, t.name),
}));

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => people.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  title: text("title"),
  status: contactStatusEnum("status").notNull().default("lead"),
  lifecycle: lifecycleEnum("lifecycle").notNull().default("lead"),
  source: text("source"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  customFields: jsonb("custom_fields").$type<Record<string, unknown>>().notNull().default({}),
  wallet: text("wallet"),
  ensName: text("ens_name"),
  trustScore: integer("trust_score"),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  avatar: text("avatar"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => ({
  emailIdx: index("contacts_email_idx").on(t.orgId, t.email),
  ownerIdx: index("contacts_owner_idx").on(t.orgId, t.ownerId),
  companyIdx: index("contacts_company_idx").on(t.orgId, t.companyId),
  walletIdx: index("contacts_wallet_idx").on(t.orgId, t.wallet),
}));

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => people.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  stage: dealStageEnum("stage").notNull().default("lead"),
  probability: real("probability").notNull().default(0.1),
  expectedCloseDate: text("expected_close_date").notNull(),
  description: text("description"),
  stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  winReason: text("win_reason"),
  lossReason: text("loss_reason"),
}, (t) => ({
  stageIdx: index("deals_stage_idx").on(t.orgId, t.stage),
  closeIdx: index("deals_close_idx").on(t.orgId, t.expectedCloseDate),
  ownerIdx: index("deals_owner_idx").on(t.orgId, t.ownerId),
  activeIdx: index("deals_org_active_idx").on(t.orgId).where(sql`${t.deletedAt} IS NULL`),
  wonReasonsIdx: index("deals_won_reasons_idx").on(t.orgId, t.winReason).where(sql`${t.stage} = 'won' AND ${t.deletedAt} IS NULL`),
}));

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => people.id),
  clientId: uuid("client_id").notNull().references(() => contacts.id),
  name: text("name").notNull(),
  description: text("description"),
  status: projectStatusEnum("status").notNull().default("scoping"),
  service: serviceEnum("service").notNull().default("custom"),
  contractValueCents: integer("contract_value_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  billing: billingEnum("billing").notNull().default("fixed"),
  hourlyRateCents: integer("hourly_rate_cents"),
  retainerHoursPerMonth: integer("retainer_hours_per_month"),
  startDate: text("start_date").notNull(),
  dueDate: text("due_date"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index("projects_status_idx").on(t.orgId, t.status),
  clientIdx: index("projects_client_idx").on(t.orgId, t.clientId),
}));

export const projectTeam = pgTable("project_team", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("contributor"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.projectId, t.personId] }),
}));

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  dueDate: text("due_date").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  hoursLogged: real("hours_logged").notNull().default(0),
  invoiceId: uuid("invoice_id"),
  status: milestoneStatusEnum("status").notNull().default("pending"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectIdx: index("milestones_project_idx").on(t.projectId),
}));

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
  date: text("date").notNull(),
  hours: real("hours").notNull(),
  description: text("description").notNull().default(""),
  billable: boolean("billable").notNull().default(true),
  invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
  invoiceId: uuid("invoice_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  personDateIdx: index("time_entries_person_date_idx").on(t.personId, t.date),
  projectIdx: index("time_entries_project_idx").on(t.projectId),
}));

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  clientId: uuid("client_id").notNull().references(() => contacts.id),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  billToName: text("bill_to_name").notNull(),
  billToEmail: text("bill_to_email").notNull(),
  billToAddress: text("bill_to_address"),
  billToTaxId: text("bill_to_tax_id"),
  subtotalCents: integer("subtotal_cents").notNull(),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  fxRate: real("fx_rate"),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  memo: text("memo"),
  terms: text("terms").notNull().default("Net 14"),
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  numberUnique: uniqueIndex("invoices_number_unique").on(t.orgId, t.number),
  statusIdx: index("invoices_status_idx").on(t.orgId, t.status),
  dueIdx: index("invoices_due_idx").on(t.orgId, t.dueDate),
}));

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: real("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  taxRate: real("tax_rate"),
  totalCents: integer("total_cents").notNull(),
  position: integer("position").notNull().default(0),
}, (t) => ({
  invoiceIdx: index("invoice_lines_invoice_idx").on(t.invoiceId),
}));

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  method: jsonb("method").$type<unknown>().notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  txHash: text("tx_hash"),
  chain: text("chain"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  failureReason: text("failure_reason"),
  refundedAmountCents: integer("refunded_amount_cents"),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  invoiceIdx: index("payments_invoice_idx").on(t.invoiceId),
  stripeIdx: index("payments_stripe_idx").on(t.stripePaymentIntentId),
  txIdx: index("payments_tx_idx").on(t.txHash),
}));

export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: ticketStatusEnum("status").notNull().default("open"),
  priority: ticketPriorityEnum("priority").notNull().default("normal"),
  requesterId: uuid("requester_id").notNull().references(() => people.id),
  assigneeId: uuid("assignee_id").references(() => people.id),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  firstResponseDueAt: timestamp("first_response_due_at", { withTimezone: true }),
  resolutionDueAt: timestamp("resolution_due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => ({
  statusIdx: index("tickets_status_idx").on(t.orgId, t.status),
  assigneeIdx: index("tickets_assignee_idx").on(t.assigneeId),
}));

export const ticketMessages = pgTable("ticket_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => people.id),
  body: text("body").notNull(),
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  hash: text("hash").notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  uploadedBy: uuid("uploaded_by").notNull().references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  hashIdx: index("files_hash_idx").on(t.orgId, t.hash),
}));

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").notNull().references(() => people.id),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  before: jsonb("before").$type<Record<string, unknown>>(),
  after:  jsonb("after").$type<Record<string, unknown>>(),
  context: jsonb("context").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgTimeIdx: index("audit_org_time_idx").on(t.orgId, t.createdAt),
  subjectIdx: index("audit_subject_idx").on(t.subjectType, t.subjectId),
  actorIdx: index("audit_actor_idx").on(t.actorId),
}));

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  kind: notificationKindEnum("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  href: text("href"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  recipientIdx: index("notifications_recipient_idx").on(t.recipientId, t.createdAt),
}));

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  lastError: text("last_error"),
  status: text("status").notNull().default("queued"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({
  statusRunAtIdx: index("jobs_status_run_at_idx").on(t.status, t.runAt),
}));

// =============================================================================
// Relations (for Drizzle's query API)
// =============================================================================

export const orgRelations = relations(orgs, ({ many }) => ({
  people: many(people),
  contacts: many(contacts),
  projects: many(projects),
  invoices: many(invoices),
  jobs: many(jobs),
}));

export const personRelations = relations(people, ({ one, many }) => ({
  org: one(orgs, { fields: [people.orgId], references: [orgs.id] }),
  manager: one(people, { fields: [people.managerId], references: [orgs.id], relationName: "manager" }),
  reports: many(people, { relationName: "manager" }),
  sessions: many(sessions),
}));

export const contactRelations = relations(contacts, ({ one, many }) => ({
  org: one(orgs, { fields: [contacts.orgId], references: [orgs.id] }),
  owner: one(people, { fields: [contacts.ownerId], references: [people.id] }),
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  deals: many(deals),
  projects: many(projects),
}));

export const projectRelations = relations(projects, ({ one, many }) => ({
  org: one(orgs, { fields: [projects.orgId], references: [orgs.id] }),
  owner: one(people, { fields: [projects.ownerId], references: [people.id] }),
  client: one(contacts, { fields: [projects.clientId], references: [contacts.id] }),
  team: many(projectTeam),
  milestones: many(milestones),
  timeEntries: many(timeEntries),
}));

export const invoiceRelations = relations(invoices, ({ one, many }) => ({
  org: one(orgs, { fields: [invoices.orgId], references: [orgs.id] }),
  client: one(contacts, { fields: [invoices.clientId], references: [contacts.id] }),
  project: one(projects, { fields: [invoices.projectId], references: [projects.id] }),
  lines: many(invoiceLines),
  payments: many(payments),
}));

// =============================================================================
// Photo pipeline
// =============================================================================
// A photo job is one upload that produces N variations. The variations
// table is one row per kind — denormalized so we can update individual
// variations independently (one may fail, others succeed).

export const photoJobStatusEnum = pgEnum("photo_job_status", [
  "queued", "processing", "ready", "failed", "canceled",
]);

export const photoVariationKindEnum = pgEnum("photo_variation_kind", [
  "original", "upscaled-2x", "upscaled-4x", "color-noira",
  "no-bg", "restored", "crop-square", "crop-portrait", "denoised",
]);

export const photoJobs = pgTable("photo_jobs", {
  id:           text("id").primaryKey(),                    // phj_<uuid>
  orgId:        uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  uploadedBy:   uuid("uploaded_by").notNull().references(() => people.id),
  tenant:       text("tenant").notNull(),                    // storage key prefix (usually = orgId)

  // Original upload metadata
  originalKey:  text("original_key").notNull(),
  originalUrl:  text("original_url").notNull(),
  filename:     text("filename").notNull(),
  contentType:  text("content_type").notNull(),
  sizeBytes:    integer("size_bytes").notNull(),
  width:        integer("width"),
  height:       integer("height"),

  // What the client asked for
  requestedVariations: jsonb("requested_variations").$type<string[]>().notNull(),

  // Status
  status:       photoJobStatusEnum("status").notNull().default("queued"),
  totalCostUsd: real("total_cost_usd").notNull().default(0),

  // Optional metadata
  caption:      text("caption"),
  notes:        text("notes"),

  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt:   timestamp("finished_at", { withTimezone: true }),
}, (t) => ({
  orgIdx:    index("photo_jobs_org_idx").on(t.orgId),
  statusIdx: index("photo_jobs_status_idx").on(t.status),
  createdIdx: index("photo_jobs_created_idx").on(t.createdAt),
}));

export const photoVariations = pgTable("photo_variations", {
  id:          text("id").primaryKey(),                      // phv_<uuid>
  jobId:       text("job_id").notNull().references(() => photoJobs.id, { onDelete: "cascade" }),

  kind:        photoVariationKindEnum("kind").notNull(),

  // Result. All null while the variation is in flight.
  key:         text("key"),
  url:         text("url"),
  sizeBytes:   integer("size_bytes"),
  width:       integer("width"),
  height:      integer("height"),
  costUsd:     real("cost_usd"),
  durationMs:  integer("duration_ms"),
  error:       text("error"),

  finishedAt:  timestamp("finished_at", { withTimezone: true }),

  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  jobIdx:     index("photo_variations_job_idx").on(t.jobId),
  jobKindIdx: uniqueIndex("photo_variations_job_kind_idx").on(t.jobId, t.kind),
}));

export const photoJobRelations = relations(photoJobs, ({ one, many }) => ({
  org: one(orgs, { fields: [photoJobs.orgId], references: [orgs.id] }),
  uploader: one(people, { fields: [photoJobs.uploadedBy], references: [people.id] }),
  variations: many(photoVariations),
}));

export const photoVariationRelations = relations(photoVariations, ({ one }) => ({
  job: one(photoJobs, { fields: [photoVariations.jobId], references: [photoJobs.id] }),
}));

// =============================================================================
// Operator (the AI action system)
// =============================================================================
// Every action the operator takes produces a draft. A draft is a message
// or decision that needs human review. Approve = it executes. Reject = it
// doesn't, and the rejection is logged for the learning loop.

export const operatorDraftStatusEnum = pgEnum("operator_draft_status", [
  "pending", "approved", "edited", "rejected", "sent", "skipped", "failed",
]);

export const operatorDraftChannelEnum = pgEnum("operator_draft_channel", [
  "email", "sms", "in_app", "task", "score", "route",
]);

export const operatorDraftKindEnum = pgEnum("operator_draft_kind", [
  "morning_briefing", "deal_followup_draft", "lead_score",
  "invoice_reminder", "photo_progress_ping", "client_brief_summary",
]);

export const operatorDrafts = pgTable("operator_drafts", {
  id:            text("id").primaryKey(),                     // opd_<uuid>
  orgId:         uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),

  kind:          operatorDraftKindEnum("kind").notNull(),
  channel:       operatorDraftChannelEnum("channel").notNull(),
  status:        operatorDraftStatusEnum("status").notNull().default("pending"),

  // What this draft is about (polymorphic)
  subjectType:   text("subject_type").notNull(),              // "deal" | "contact" | ...
  subjectId:     text("subject_id").notNull(),

  // Who needs to approve it
  assigneeId:    uuid("assignee_id").notNull().references(() => people.id),
  approverId:    uuid("approver_id").references(() => people.id),

  // What we drafted
  title:         text("title").notNull(),
  body:          text("body").notNull(),                      // markdown
  context:       jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  reasoning:     text("reasoning").notNull(),                 // shown in UI: why the AI drafted this

  // The model cost
  modelUsed:     text("model_used").notNull(),
  promptTokens:  integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  costUsd:       real("cost_usd").notNull().default(0),

  // Approval
  approvedAt:    timestamp("approved_at", { withTimezone: true }),
  approvedBy:    uuid("approved_by").references(() => people.id),
  editedBody:    text("edited_body"),

  // Send
  sentAt:        timestamp("sent_at", { withTimezone: true }),
  sendError:     text("send_error"),

  // Feedback for the learning loop
  feedbackScore: integer("feedback_score"),                   // -1, 0, +1
  feedbackNote:  text("feedback_note"),

  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt:     timestamp("expires_at", { withTimezone: true }),
}, (t) => ({
  orgIdx:         index("operator_drafts_org_idx").on(t.orgId),
  statusIdx:      index("operator_drafts_status_idx").on(t.status),
  assigneeIdx:    index("operator_drafts_assignee_idx").on(t.assigneeId),
  subjectIdx:     index("operator_drafts_subject_idx").on(t.subjectType, t.subjectId),
  kindIdx:        index("operator_drafts_kind_idx").on(t.kind),
  createdIdx:     index("operator_drafts_created_idx").on(t.createdAt),
}));

export const operatorDraftRelations = relations(operatorDrafts, ({ one }) => ({
  org: one(orgs, { fields: [operatorDrafts.orgId], references: [orgs.id] }),
  assignee: one(people, { fields: [operatorDrafts.assigneeId], references: [people.id] }),
  approver: one(people, { fields: [operatorDrafts.approverId], references: [people.id] }),
}));

// =============================================================================
// Audit log for the learning loop
// =============================================================================
// Every approved/rejected/edit decision is recorded here. After 50+
// decisions on the same kind, the morning briefing action uses these
// examples to refine its prompt.

export const operatorFeedback = pgTable("operator_feedback", {
  id:            text("id").primaryKey(),
  orgId:         uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  draftId:       text("draft_id").notNull().references(() => operatorDrafts.id, { onDelete: "cascade" }),
  kind:          operatorDraftKindEnum("kind").notNull(),
  decision:      text("decision").notNull(),                  // "approved" | "rejected" | "edited"
  originalBody:  text("original_body").notNull(),
  finalBody:     text("final_body"),
  reason:        text("reason"),
  // Embedding of the original prompt — used for similarity lookup at draft time
  // (filled in by a separate job; left nullable for now)
  promptEmbedding: jsonb("prompt_embedding").$type<number[] | null>(),
  decidedAt:     timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx:      index("operator_feedback_org_idx").on(t.orgId),
  kindIdx:     index("operator_feedback_kind_idx").on(t.kind),
  decidedIdx:  index("operator_feedback_decided_idx").on(t.decidedAt),
}));

// =============================================================================
// Brief inbox
// =============================================================================
// One row per (client-visible event). The feed in the client portal reads
// from this table. Entries are pre-computed by the operator's
// client_brief_summary action and cached here. The portal never has to call
// the LLM at request time — it just reads and renders.

export const briefEntryKindEnum = pgEnum("brief_entry_kind", [
  "photo_ready",          // photo job finished
  "invoice_sent",         // new invoice sent to the client
  "invoice_paid",         // client paid an invoice
  "invoice_overdue",      // invoice went past due
  "milestone_complete",   // a project milestone was marked done
  "milestone_started",    // a milestone began
  "file_shared",          // a file was uploaded to the client's portal
  "time_logged",          // time was logged on a project
  "message_received",     // a ticket / message was received from the client
  "project_started",      // a new project kicked off
  "project_completed",    // a project was marked complete
  "lead_update",          // (for prospects) lead was scored / routed
  "system",               // catch-all for misc updates
]);

export const briefEntryPriorityEnum = pgEnum("brief_entry_priority", [
  "low", "normal", "high", "urgent",
]);

export const briefEntries = pgTable("brief_entries", {
  id:            text("id").primaryKey(),                   // brf_<uuid>
  orgId:         uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),

  // Who is this about (the client / contact)
  contactId:     uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),

  // What kind of event
  kind:          briefEntryKindEnum("kind").notNull(),
  priority:      briefEntryPriorityEnum("priority").notNull().default("normal"),

  // What the entry is about (polymorphic)
  subjectType:   text("subject_type").notNull(),            // "photo_job" | "invoice" | "project" | ...
  subjectId:     text("subject_id").notNull(),

  // The brief's content
  title:         text("title").notNull(),                   // "Photos ready: headshot-04.jpg"
  summary:       text("summary").notNull(),                 // 2-sentence AI summary, plain English
  actionLabel:   text("action_label"),                      // "View photos" | "Pay invoice" | "Approve"
  actionHref:    text("action_href"),                       // "/photos" | "/invoices/INV-2026-018" | ...

  // For grouping: a date stamp the client can scan ("Yesterday", "Mon, Jun 17")
  dayBucket:     text("day_bucket").notNull(),              // "2026-06-20"

  // Group identifier: entries with the same groupId render in a single card
  // (e.g. "1 photo job with 8 variations" is 1 card, not 8)
  groupId:       text("group_id"),

  // Read tracking
  readAt:        timestamp("read_at", { withTimezone: true }),
  archivedAt:    timestamp("archived_at", { withTimezone: true }),

  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx:        index("brief_entries_org_idx").on(t.orgId),
  contactIdx:    index("brief_entries_contact_idx").on(t.contactId),
  createdIdx:    index("brief_entries_created_idx").on(t.createdAt),
  dayBucketIdx:  index("brief_entries_day_bucket_idx").on(t.dayBucket),
  // The feed query: WHERE contactId = ? AND archivedAt IS NULL ORDER BY createdAt DESC
  feedIdx:       index("brief_entries_feed_idx").on(t.contactId, t.archivedAt, t.createdAt),
}));

export const briefEntryRelations = relations(briefEntries, ({ one }) => ({
  org: one(orgs, { fields: [briefEntries.orgId], references: [orgs.id] }),
  contact: one(contacts, { fields: [briefEntries.contactId], references: [contacts.id] }),
}));
