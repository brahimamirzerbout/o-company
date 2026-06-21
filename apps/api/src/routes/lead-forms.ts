// =============================================================================
// o.company · /api/lead-forms/submit — public lead capture endpoint
// =============================================================================
// Receives a form submission from the MultiStepLeadForm component.
// Validates the payload, creates a contact, scores the lead via
// the operator, and returns a confirmation.
//
// This is the public-facing endpoint. It is:
//   - unauthenticated (forms are filled in by anonymous visitors)
//   - rate-limited (5/min per IP — same as login, prevents spam)
//   - schema-validated (the MultiStepLeadForm sends a known shape)
//   - idempotent (the formId from the client is the dedupe key)

import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/middleware/with-auth";
import { checkRateLimit, keyFromRequest } from "@o/ratelimit";
import { getDb } from "@o/db/client";
import { contacts, leadFormSubmissions, orgs } from "@o/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { errors } from "@o/errors";
import { logger } from "@o/logger";
import { randomUUID } from "crypto";

const LeadSubmissionSchema = z.object({
  // Form fields (variable; we accept any string keys)
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  company: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  // Form metadata
  formId: z.string().min(1).max(100),  // client-generated, dedup key
  source: z.string().max(100).optional(),  // e.g. "homepage", "contact-page"
  // Anything else the form includes
}).passthrough();

export const POST_lead_form_submit = withAuth(async (ctx) => {
  // Rate limit: 5/min per IP. Same shape as /api/auth/login. Forms
  // get spammed.
  const limited = await checkRateLimit({
    key: keyFromRequest(ctx.req, "leadform:submit"),
    limit: 5,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const raw = LeadSubmissionSchema.safeParse(await ctx.req.json());
  if (!raw.success) {
    throw errors.validation("Invalid form submission", { issues: raw.error.issues });
  }
  const data = raw.data;

  const db = getDb();

  // Idempotency: if this formId was already submitted, return the
  // existing contact. Prevents double-creation if the user clicks
  // submit twice or the form retries.
  const [existing] = await db.select().from(leadFormSubmissions)
    .where(and(
      eq(leadFormSubmissions.formId, data.formId),
      eq(leadFormSubmissions.orgId, ctx.org.id),
    ))
    .limit(1);
  if (existing) {
    return NextResponse.json({
      ok: true,
      contactId: existing.contactId,
      duplicate: true,
    });
  }

  // Find or create the contact. We use email as the unique key.
  // If a contact with this email exists in this org, we update
  // their last_contacted_at. If not, we create them.
  const [existingContact] = await db.select().from(contacts)
    .where(and(eq(contacts.email, data.email), eq(contacts.orgId, ctx.org.id)))
    .limit(1);

  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
    await db.update(contacts).set({
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company ?? existingContact.company,
      phone: data.phone ?? existingContact.phone,
      lastContactedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(contacts.id, contactId));
  } else {
    contactId = `ct_${randomUUID()}`;
    await db.insert(contacts).values({
      id: contactId,
      orgId: ctx.org.id,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      company: data.company ?? null,
      phone: data.phone ?? null,
      title: null,
      status: "lead",
      lifecycle: "lead",
      source: data.source ?? "lead_form",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Record the submission for idempotency
  await db.insert(leadFormSubmissions).values({
    id: `lfs_${randomUUID()}`,
    orgId: ctx.org.id,
    formId: data.formId,
    contactId,
    payload: data as Record<string, unknown>,
    receivedAt: new Date().toISOString(),
  });

  // Fire the lead_score operator event. The runner will pick it up
  // on its next tick and create a draft for the new lead.
  // (We do this async — the form submission response doesn't wait
  // for the LLM call.)
  setTimeout(() => {
    import("@o/operator/runner").then((m) => {
      m.triggerEvent("lead.created", { orgId: ctx.org.id, entityId: contactId }).catch((err) => {
        logger.warn("lead_form.operator_trigger_failed", { contactId, err: String(err) });
      });
    });
  }, 0);

  logger.info("lead_form.submitted", {
    orgId: ctx.org.id,
    contactId,
    formId: data.formId,
    isNew: !existingContact,
  });

  return NextResponse.json({
    ok: true,
    contactId,
    duplicate: false,
  });
}, { publicRoute: true });
