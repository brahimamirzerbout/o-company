// =============================================================================
// o.company · shared CRM schemas
// =============================================================================
// The Zod schemas for contacts, companies, and deals. Used by both
// the per-entity routes (crm.ts) and the bulk operations routes
// (crm-bulk.ts). One source of truth for the shape of the CRM
// data on the wire.

import { z } from "zod";

export const companySchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  logo: z.string().url().optional(),
  address: z.string().optional(),
});

export const contactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  companyId: z.string().uuid().optional(),
  title: z.string().optional(),
  status: z.enum(["lead", "active", "customer", "churned", "archived"]).default("lead"),
  lifecycle: z.enum(["subscriber", "lead", "mql", "sql", "opportunity", "customer", "evangelist"]).default("lead"),
  source: z.string().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.unknown()).default({}),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  ensName: z.string().optional(),
  trustScore: z.number().int().min(0).max(100).optional(),
  lastContactedAt: z.string().optional(),
  avatar: z.string().url().optional(),
});

export const dealSchema = z.object({
  name: z.string().min(1),
  contactId: z.string().uuid(),
  companyId: z.string().uuid().optional(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().default("USD"),
  stage: z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"]).default("lead"),
  probability: z.number().min(0).max(1).default(0.1),
  expectedCloseDate: z.string(), // ISO date
  description: z.string().optional(),
  // Win/loss reasons. Required when stage is won/lost, ignored
  // otherwise. Free-form text; structured categories are a v2.
  winReason: z.string().max(1000).optional(),
  lossReason: z.string().max(1000).optional(),
});
