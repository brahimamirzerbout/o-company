# Deploy checklist — for O'Shay (or whoever has the credit card)

> The DEPLOY.md runbook is the long form. This is the short form. Each item has a one-line action and an estimated time. The whole list is 6-8 hours. **Pick a 6-8 hour block on a Tuesday. The product is live by EOD.**

## Accounts (5 of these, ~5 min each)

- [ ] **Vercel.** https://vercel.com/signup. Free tier. Used for API, web, internal, admin, app. 5 min.
- [ ] **Neon.** https://neon.tech. Free tier Postgres. Used for the database. 5 min.
- [ ] **Cloudflare.** https://cloudflare.com. Free tier. Used for the photo worker and DNS. 5 min.
- [ ] **Resend.** https://resend.com. Free tier (3k emails/mo). Used for outbound email. 5 min.
- [ ] **Stripe (live mode).** https://dashboard.stripe.com. O'Shay's existing account. **Flip from test mode to live mode.** Get `sk_live_*` and `pk_live_*`. 10 min.

## Domain DNS (the slow part, 30-60 min)

- [ ] **Pick the domain.** O'Shay has `noira.us`. The deploy plan uses `o.company` (per the npm name). One of these:
  - Use `o.company` as the primary domain (3 subdomains: `app.o.company`, `admin.o.company`, `o.company` for marketing).
  - Use `noira.us` and 3 subdomains: `app.noira.us`, `admin.noira.us`, `noira.us`.
  - **Decision needed.** Reply with which one and I'll update the env-var examples.
- [ ] **Point the apex** (`o.company` or `noira.us`) to Vercel. Add an A record or ALIAS.
- [ ] **Point `app.*`** to Vercel. CNAME.
- [ ] **Point `admin.*`** to Vercel. CNAME.
- [ ] **Point `api.*`** to Vercel. CNAME.
- [ ] **Wait for DNS propagation.** 5-30 min. Check with `dig o.company` or https://dnschecker.org.

## Provision env vars (15 min)

- [ ] **In Vercel:** add the env vars from `SETUP.md` to each of the 5 apps. Same env config for all 5. ~15 min.
- [ ] **Generate secrets:** `JWT_SECRET` (32 bytes), `ENCRYPTION_KEY` (32 bytes hex). Don't share these. Don't commit them. Vercel has a "sensitive" flag — use it.
- [ ] **In Stripe:** create a webhook endpoint pointing to `https://api.o.company/api/webhooks/stripe`. Subscribe to: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.requires_action`, `charge.refunded`, `invoice.paid`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
- [ ] **In Resend:** verify the sending domain (the same one as above). Add the API key.

## Run the migrations (5 min)

- [ ] **In Neon:** create a database. Copy the connection string into `DATABASE_URL` in Vercel.
- [ ] **Locally:** with `DATABASE_URL` pointing to the Neon DB, run `pnpm --filter @o/db migrate`. This runs migrations 001-009.
- [ ] **Seed:** `pnpm --filter @o/db seed`. This loads the demo data: O'Shay as owner, 6 contacts, 6 deals, 4 invoices, 2 paid.
- [ ] **Encrypt the existing PII:** `pnpm --filter @o/db migrate:encrypt`. This converts `contacts.email`, `contacts.notes`, etc. to encrypted-at-rest.

## Deploy (5 min)

- [ ] **In Vercel:** connect the `brahimamirzerbout/o-company` repo. Vercel detects the 5 apps automatically.
- [ ] **Trigger deploy.** The CI runs migrations + Stripe smoke + build. ~5 min.
- [ ] **Verify each app loads:** `https://o.company` (marketing), `https://app.o.company/login` (login screen), `https://admin.o.company` (admin login), `https://internal.o.company` (or wherever the staff console lives — TBD by the deploy plan).

## First end-to-end test (30 min, on a call with me)

- [ ] **Sign up** at `o.company/signup`. Email + password. Get a session.
- [ ] **Create a contact** via the internal console.
- [ ] **Submit the lead form** at `o.company/lead-form-demo`. Watch the contact land in the CRM.
- [ ] **Create an invoice** for the contact. Send it. (Or just mark as paid to skip Stripe for the first test.)
- [ ] **Verify the operator drafted a follow-up** for the contact (it should fire on `contact.create` via `lead_score`).
- [ ] **Verify the audit log** at `internal.o.company/audit` shows every event with the actor, type, and timestamp.

## First demo (1-2 hours, prep + delivery)

- [ ] **Schedule the demo.** Pick a prospect from your network — someone who could realistically be a customer.
- [ ] **Rehearse the demo path.** Sign up → create contact → submit lead form → operator drafts a follow-up → you approve it → it sends → the contact gets the email.
- [ ] **Show the audit log.** This is the trust-model moment. "Here's everything the AI did, in order, with timestamps."
- [ ] **Show the operator's morning brief.** The seed data has 4 drafts waiting. The demo sells the operator.
- [ ] **Show the contact timeline.** The "what happened with this person" view.

## Backups (verify within the first week, 2 hours)

- [ ] **In Neon:** enable point-in-time recovery. Default. Verify it's on.
- [ ] **Restore drill:** create a fresh Neon project, restore a snapshot to it, verify the seed data is there, tear it down. This is the "we say backups exist; we haven't proven they restore" gap.
- [ ] **Document the procedure in SETUP.md.** "To restore: ..."

## Decisions still pending

- [ ] **Websites service** — option (a) build a builder, (b) keep using Webflow/Framer, (c) "Notion to website" tool.
- [ ] **Creative service** — option (a) project management tool, (b) asset delivery tool, (c) skip the product.

These don't block the deploy. They block the long-term roadmap. ~30 min of O'Shay's time each.

## What I need from you, the dev, to keep going in parallel

- [ ] **Pick a 6-8 hour block on a Tuesday** for the deploy. Reply with the date.
- [ ] **Send the brief to O'Shay** (the one I drafted earlier) so he knows what's coming.
- [ ] **Reply with the domain decision** (`o.company` vs `noira.us`).

## What I'll be doing in parallel

While you do the deploy, I'm doing the 3-day code plan:
- Day 1: P1-3 (done) + P1-5 (bulk operations, today)
- Day 2: Real-time contact timeline (SSE) + CRM P1-6 (export endpoint)
- Day 3: Encryption key rotation procedure + iOS code signing in CI

Six commits, three days, all deploy-independent. The product will be live on the day you finish the deploy. The code will be at A in the code. **The brief to O'Shay is in his inbox. The runbook is in DEPLOY.md. The checklist is here. The code is shipping in parallel.**

**The deploy is the bridge. The code is the side track. Both finish in 3 days. The product goes from F to A- in the world.**
