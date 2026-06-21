// =============================================================================
// @o/db · seed
// =============================================================================
// Seeds a fresh database with realistic dev data: an org, an owner, 4
// contacts across 3 companies, deals in 4 stages, a project, an
// invoice, a ticket, a photo job, a couple of operator drafts, a brief
// inbox. The result is the same data shape that the iOS app's mock
// mode shows, just in real Postgres.
//
// Run:  pnpm --filter @o/db seed
// Reset and reseed:  pnpm --filter @o/db reset && pnpm --filter @o/db seed

import { getDb, closeDb } from "./client";
import { sql } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function main() {
  const db = getDb();
  console.log("o.company · seeding dev data");
  console.log("============================\n");

  // 1) The org
  console.log("• Creating org 'o.company'…");
  const [org] = await db.execute<{ id: string }>(sql`
    INSERT INTO orgs (name, subdomain, default_currency, default_timezone)
    VALUES ('o.company', 'o', 'USD', 'America/Chicago')
    RETURNING id
  `);
  const orgId = org!.id;
  console.log(`  ✓ org_id = ${orgId}\n`);

  // 2) Owner + 2 staff
  console.log("• Creating people (owner + staff)…");
  const [owner] = await db.execute<{ id: string }>(sql`
    INSERT INTO people (org_id, email, name, password_hash, role, department, status)
    VALUES (${orgId}, 'oshay@o.company', 'O''Shay Lighten', ${await hashPassword("noira-demo")}, 'owner', 'operations', 'active')
    RETURNING id
  `);
  const [staff1] = await db.execute<{ id: string }>(sql`
    INSERT INTO people (org_id, email, name, password_hash, role, department, status)
    VALUES (${orgId}, 'felix@o.company', 'Felix Brennan', ${await hashPassword("noira-demo")}, 'operator', 'operations', 'active')
    RETURNING id
  `);
  const [staff2] = await db.execute<{ id: string }>(sql`
    INSERT INTO people (org_id, email, name, password_hash, role, department, status)
    VALUES (${orgId}, 'mira@o.company', 'Mira Hassan', ${await hashPassword("noira-demo")}, 'operator', 'creative', 'active')
    RETURNING id
  `);
  const ownerId = owner!.id;
  console.log(`  ✓ O'Shay (owner) · oshay@o.company / noira-demo`);
  console.log(`  ✓ Felix (operator) · felix@o.company / noira-demo`);
  console.log(`  ✓ Mira (operator) · mira@o.company / noira-demo\n`);

  // 3) Companies
  console.log("• Creating companies…");
  const [northwind] = await db.execute<{ id: string }>(sql`
    INSERT INTO companies (org_id, name, domain, industry, size, owner_id)
    VALUES (${orgId}, 'Northwind Logistics', 'northwind.io', 'Logistics', '50-200', ${ownerId})
    RETURNING id
  `);
  const [helios] = await db.execute<{ id: string }>(sql`
    INSERT INTO companies (org_id, name, domain, industry, size, owner_id)
    VALUES (${orgId}, 'Helios Health', 'helios.health', 'Healthcare', '200-500', ${ownerId})
    RETURNING id
  `);
  const [polaris] = await db.execute<{ id: string }>(sql`
    INSERT INTO companies (org_id, name, domain, industry, size, owner_id)
    VALUES (${orgId}, 'Polaris Studios', 'polaris.com', 'Creative', '10-50', ${ownerId})
    RETURNING id
  `);
  console.log(`  ✓ Northwind, Helios, Polaris\n`);

  // 4) Contacts
  console.log("• Creating contacts…");
  const [marcus] = await db.execute<{ id: string }>(sql`
    INSERT INTO contacts (org_id, first_name, last_name, email, phone, title, company_id, owner_id, status, lifecycle, lead_score, lead_tier)
    VALUES (${orgId}, 'Marcus', 'Reyes', 'marcus@northwind.io', '+1-555-0101', 'VP Marketing', ${northwind!.id}, ${ownerId}, 'active', 'opportunity', 78, 'hot')
    RETURNING id
  `);
  const [priya] = await db.execute<{ id: string }>(sql`
    INSERT INTO contacts (org_id, first_name, last_name, email, phone, title, company_id, owner_id, status, lifecycle, lead_score, lead_tier)
    VALUES (${orgId}, 'Priya', 'Anand', 'priya@helios.health', '+1-555-0102', 'CTO', ${helios!.id}, ${ownerId}, 'active', 'sql', 64, 'warm')
    RETURNING id
  `);
  const [lila] = await db.execute<{ id: string }>(sql`
    INSERT INTO contacts (org_id, first_name, last_name, email, phone, title, company_id, owner_id, status, lifecycle, lead_score, lead_tier)
    VALUES (${orgId}, 'Lila', 'Okafor', 'lila@polaris.com', '+1-555-0103', 'Head of Marketing', ${polaris!.id}, ${ownerId}, 'active', 'lead', 42, 'warm')
    RETURNING id
  `);
  const [omar] = await db.execute<{ id: string }>(sql`
    INSERT INTO contacts (org_id, first_name, last_name, email, phone, title, company_id, owner_id, status, lifecycle, lead_score, lead_tier)
    VALUES (${orgId}, 'Omar', 'Said', 'omar@brightline.energy', '+1-555-0104', 'Director of Ops', NULL, ${ownerId}, 'active', 'sql', 71, 'hot')
    RETURNING id
  `);
  console.log(`  ✓ Marcus (Northwind), Priya (Helios), Lila (Polaris), Omar (Brightline)\n`);

  // 5) Deals
  console.log("• Creating deals…");
  await db.execute(sql`
    INSERT INTO deals (org_id, name, contact_id, company_id, owner_id, stage, amount, currency, probability, status, position, last_activity_at)
    VALUES
      (${orgId}, 'Northwind website refresh', ${marcus!.id}, ${northwind!.id}, ${ownerId}, 'negotiation', 2400000, 'USD', 0.7, 'open', 0, NOW() - INTERVAL '4 days'),
      (${orgId}, 'Helios lead-form + CRM', ${priya!.id}, ${helios!.id}, ${ownerId}, 'proposal', 2800000, 'USD', 0.5, 'open', 1, NOW() - INTERVAL '1 day'),
      (${orgId}, 'Polaris onboarding', ${lila!.id}, ${polaris!.id}, ${ownerId}, 'qualified', 1850000, 'USD', 0.3, 'open', 2, NOW() - INTERVAL '3 days'),
      (${orgId}, 'Brightline analytics', ${omar!.id}, NULL, ${ownerId}, 'proposal', 3100000, 'USD', 0.5, 'open', 3, NOW() - INTERVAL '6 hours')
  `);
  console.log(`  ✓ 4 deals across 4 stages\n`);

  // 6) Projects
  console.log("• Creating projects…");
  const [proj1] = await db.execute<{ id: string }>(sql`
    INSERT INTO projects (org_id, name, client_id, owner_id, service, status, value, currency, start_date, due_date)
    VALUES (${orgId}, 'Northwind website refresh', ${marcus!.id}, ${ownerId}, 'websites', 'active', 2400000, 'USD', '2026-06-01', '2026-07-12')
    RETURNING id
  `);
  console.log(`  ✓ Northwind website refresh (active, due Jul 12)\n`);

  // 7) Invoice
  console.log("• Creating invoices…");
  await db.execute(sql`
    INSERT INTO invoices (org_id, number, contact_id, project_id, currency, subtotal, total, status, due_date, sent_at)
    VALUES
      (${orgId}, 'INV-2026-022', ${omar!.id}, NULL, 'USD', 3100000, 3100000, 'sent', '2026-07-12', NOW() - INTERVAL '6 hours'),
      (${orgId}, 'INV-2026-020', ${marcus!.id}, ${proj1!.id}, 'USD', 1200000, 1200000, 'paid', '2026-06-18', NOW() - INTERVAL '14 days')
  `);
  console.log(`  ✓ INV-2026-022 (sent, due Jul 12) · INV-2026-020 (paid)\n`);

  // 8) Brief inbox
  console.log("• Seeding brief inbox…");
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO brief_entries (id, org_id, contact_id, kind, priority, subject_type, subject_id, title, summary, action_label, action_href, day_bucket, created_at)
    VALUES
      ('brf_seed_001', ${orgId}, ${marcus!.id}, 'invoice_sent', 'normal', 'invoice', 'INV-2026-022', 'Invoice INV-2026-022 · $31,000', 'Invoice for the Brightline analytics engagement was sent. Net 30, due July 12. Pay from your portal or reply if anything''s off.', 'View invoice', '/invoices', ${today}, NOW() - INTERVAL '6 hours'),
      ('brf_seed_002', ${orgId}, ${priya!.id}, 'milestone_complete', 'high', 'milestone', 'ms_001', 'Done: Helios lead-form v1', 'The first version of the lead-form is live in staging. Next: review and approve, then we move it to production.', 'Review', '/projects', ${today}, NOW() - INTERVAL '2 hours'),
      ('brf_seed_003', ${orgId}, ${marcus!.id}, 'time_logged', 'low', 'project', ${proj1!.id}, 'Work on Northwind website refresh', '2.5 hours on the hero section. Wireframes ready, design pass starting tomorrow.', 'View project', '/projects', ${yesterday}, NOW() - INTERVAL '1 day' - INTERVAL '5 hours')
  `);
  console.log(`  ✓ 3 brief entries (2 today, 1 yesterday)\n`);

  // 9) Operator drafts
  console.log("• Creating operator drafts…");
  await db.execute(sql`
    INSERT INTO operator_drafts (id, org_id, kind, channel, status, subject_type, subject_id, assignee_id, title, body, context, reasoning, model_used, cost_usd)
    VALUES
      ('opd_seed_001', ${orgId}, 'morning_briefing', 'email', 'pending', 'org', ${orgId}, ${ownerId},
       'Morning brief · ' || TO_CHAR(NOW(), 'Day, Month DD'),
       '**3 things need your attention today.**\n\n1. Polaris proposal — 4 days stale. No reply since last Friday.\n2. Helios SOW — awaiting your signature.\n3. Northwind renewal — Marcus said ''let's get this over the line'' on Tuesday.',
       '{}'::jsonb, 'Daily 6am briefing', 'gpt-4o', 0.014),
      ('opd_seed_002', ${orgId}, 'deal_followup_draft', 'email', 'pending', 'deal', 'dl_seed_001', ${ownerId},
       'Follow-up: Northwind renewal',
       'Hi Marcus,\n\nWanted to follow up on the renewal paperwork before it slips through the cracks.\n\nO''Shay',
       '{"dealId": "dl_seed_001"}'::jsonb, 'Deal has been in negotiation for 4 days. Tone: gentle.', 'gpt-4o-mini', 0.002)
  `);
  console.log(`  ✓ 2 operator drafts (morning brief + deal follow-up)\n`);

  console.log("================================================");
  console.log("✓ Seed complete.");
  console.log("================================================");
  console.log("Sign in as:");
  console.log("  • O'Shay (owner)    oshay@o.company / noira-demo");
  console.log("  • Felix (operator)  felix@o.company / noira-demo");
  console.log("  • Mira (operator)   mira@o.company / noira-demo");
  console.log("================================================\n");

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
