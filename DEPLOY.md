# o.company · production deploy runbook

> The exact steps, in order, to take o.company from "passes `pnpm build` on your laptop" to "O'Shay signs in on his phone, the morning briefing arrives, the first photo variation lands in the brief inbox, the first invoice gets paid via Stripe, and a paying customer logs in and uses the product." Every step has the exact command, the exact dashboard click, the exact env var. The failure mode for skipping a step is named.

This is the runbook. Read it once before your first deploy. Use it every time you onboard a new environment (staging, a new region, a new customer-tenant-as-a-service). It is not aspirational. Every step here is something either this codebase already supports or something that takes 5-30 minutes of clicking in a dashboard.

The intended reader is the engineer (or operator) who is doing the deploy for the first time. It assumes you have shell access, a credit card, and patience for DNS propagation.

---

## Phase 0: Pre-flight (do these before touching any infra)

Before you create a single dashboard account, write these down somewhere you'll find them:

- [ ] **Domain you control.** `o.company` (the real one, owned by O'Shay). DNS access. Will be used for the marketing site, the API, the client portal, the email sender. **This blocks Phase 2 — don't proceed without it.**
- [ ] **Stripe account.** Free to create at https://dashboard.stripe.com/register. Will be used for invoice payments. Test mode is on by default; you don't need to verify identity for test mode.
- [ ] **Resend account.** Free at https://resend.com/signup. Will be used for transactional email. 100 emails/day on the free tier; 50k/month on the $20/mo plan.
- [ ] **Cloudflare account.** Free at https://dash.cloudflare.com/signup. Will be used for the photo worker (Cloudflare Workers) and R2 (object storage for photos).
- [ ] **Neon account.** Free at https://console.neon.tech/signup. Will be used for Postgres.
- [ ] **Vercel account.** Free at https://vercel.com/signup. Will be used for the API, web, internal, admin, and app.
- [ ] **OpenAI account.** Free to create at https://platform.openai.com/signup. Will be used for the operator's LLM calls. Needs $5 credit to be usable.
- [ ] **Replicate account.** Free at https://replicate.com/signup. Will be used for the photo pipeline's image models.
- [ ] **GitHub account.** For the repo. The deploy runs from a push to `main`.

**Time estimate:** 30-60 minutes of account creation. Some of these require email verification; do them in parallel.

---

## Phase 1: The database (Neon)

The database is the foundation. Everything else connects to it. Get this right first.

### 1.1 Create the project

1. Go to https://console.neon.tech
2. Click "Create a project"
3. Name: `o-company` (or `o-company-prod` if you'll have a staging too)
4. Region: **pick the region closest to your users.** For O'Shay's customer base (US), pick `us-east-2` (Ohio). For EU customers, pick `eu-central-1` (Frankfurt). **You cannot change region later without migrating.** Get this right.
5. Postgres version: 16 (the codebase is tested on 16)
6. Compute size: start with the free tier (0.25 CU). Neon autoscales; you'll be fine.
7. Click "Create project"

### 1.2 Get the connection string

1. In the project dashboard, click "Connection details"
2. Select "Pooled connection" (this is the one your app uses; it goes through PgBouncer and survives connection storms)
3. Copy the connection string. It looks like:
   ```
   postgresql://neondb_owner:xxx@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. **Save this somewhere safe.** This is your `DATABASE_URL`. It contains a password.

**Failure mode if you skip:** Every API call returns 500 with "getDb() called before DATABASE_URL was set." Or, if you set it to the wrong connection string, you get "connection refused" or "password authentication failed."

### 1.3 Run migrations

From the repo root:

```sh
# Set the env var in your shell (don't commit this)
export DATABASE_URL="postgresql://neondb_owner:xxx@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Apply all migrations (003 + 004 + 005 are the latest)
pnpm --filter @o/db migrate
```

Expected output:
```
o.company · database migrations
=================================

  001_initial  (applying...)  ✓
  002_rate_limit  (applying...)  ✓
  003_payments_hardening  (applying...)  ✓
  004_gdpr_and_pci  (applying...)  ✓
  005_operator_actions  (applying...)  ✓

✓ 5 migrations applied. (5 total)
```

**Failure mode if you skip:** Every API call returns 500 with "relation 'orgs' does not exist." Or with a specific migration failure (e.g. "operator_draft_kind already has value 'morning_briefing'") — that means you ran the migration twice, which is fine, but the runner will say "already applied" instead of "applying."

### 1.4 Seed the dev data (only on the very first deploy)

```sh
pnpm --filter @o/db seed
```

This creates:
- 1 org ("o.company")
- 3 staff (O'Shay / Felix / Mira — all with password `noira-demo`)
- 3 companies (Northwind, Helios, Polaris)
- 4 contacts
- 4 deals
- 1 project
- 2 invoices
- 3 brief entries
- 2 operator drafts

**Time estimate:** 1 minute. **Don't run this on a database with real customer data.** It overwrites. The seed is gated to be obvious about what it does.

### 1.5 Configure backups

1. In the Neon project, click "Settings" → "Backups"
2. Enable automated daily snapshots (this is on by default on the free tier but worth verifying)
3. Set the retention to 7 days minimum. **Production should be 30 days.**
4. The "Point-in-time recovery" feature is on the paid plan ($20/mo). **Turn it on for production.** It's the difference between "we lost the last 4 hours of data" and "we lost nothing."

**Failure mode if you skip:** Database gets corrupted / accidentally dropped / encrypted by a misconfigured backup, and you have no way to recover. The trust model calls this out: "The audit log is only as good as the database it's in."

---

## Phase 2: Auth secrets

These are the keys that every other service trusts.

### 2.1 Generate JWT_SECRET

```sh
openssl rand -hex 64
```

Output: a 128-character hex string. This signs every auth token in the system. **Do not rotate this in production** — every user's session will be invalidated.

Save as `JWT_SECRET`.

### 2.2 Generate ENCRYPTION_KEY

```sh
openssl rand -hex 32
```

Output: a 64-character hex string. This encrypts the columns the encryption helper covers. Rotation requires running a re-encryption batch job (not built yet; that's Workstream D).

Save as `ENCRYPTION_KEY`.

### 2.3 Save them in a password manager

Both keys go into 1Password / Bitwarden / LastPass / whatever you use. **Not in the repo. Not in a Slack message. Not in a Notion page. In a password manager.** If you lose them, you lose the ability to read encrypted data and the ability to issue valid auth tokens. The recovery story for either is "rotate everything and force-logout every user." Don't lose them.

---

## Phase 3: Stripe (live mode)

**This is the part that handles real money. Get it right. The boot guard catches a wrong key, but it doesn't catch "right key, account locked, charges disabled."**

### 3.1 Get the live API keys

1. Go to https://dashboard.stripe.com/apikeys
2. Click "Create restricted key" (NOT the default "Secret key" — restricted keys are scoped to what you need)
3. Name: `o-company-prod-api`
4. Permissions to grant:
   - `core: charges: write` (to create charges)
   - `core: customers: write` (to create customers)
   - `core: payment_intents: write` (to create PaymentIntents)
   - `core: checkout.sessions: write` (to create Checkout sessions)
   - `core: billing_portal: write` (to create Customer Portal sessions)
   - `core: refunds: write` (to issue refunds)
   - `webhook_endpoints: read` (to verify webhook endpoint config)
5. Click "Create key"
6. Copy the `sk_live_...` value. **This is your `STRIPE_SECRET_KEY`. Never log it. Never commit it.**

### 3.2 Get the publishable key

1. Same page, scroll to "Publishable key"
2. Copy the `pk_live_...` value. This is your `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. It IS safe to put in the front-end.

### 3.3 Run the live-mode smoke test

**Do this BEFORE you deploy the API.** If this fails, the deploy is going to fail when a real customer tries to pay. Find out now.

```sh
# In your shell
export STRIPE_SECRET_KEY="sk_live_..."

# Run the test
pnpm --filter @o/api stripe:test:live
```

Expected output (abbreviated):
```
o.company · Stripe LIVE smoke test
====================================

⚠️  This script charges real cards. Net cost: ~$0.00 (refunded).
    Use a low-volume test account, not your production account.

1. Verifying Stripe account...
   ✓ Account: acct_xxx
   ✓ Business: O'Shay Lighten
   ✓ Country: US
   ✓ Default currency: usd
   ✓ Charges enabled: true

2. Creating a $0.01 test charge...
   ✓ Customer: cus_xxx
   ✓ PaymentIntent: pi_xxx · $0.01 usd · status: succeeded

3. Refunding the $0.01 charge...
   ✓ Refund: re_xxx · $0.01 · status: succeeded

4. Creating a Checkout session...
   ✓ Session: cs_xxx
   ✓ URL: https://checkout.stripe.com/c/pay/cs_xxx...

5. Creating a Customer Portal session...
   ✓ Portal session: xxx
   ✓ URL: https://billing.stripe.com/...

6. Verifying webhook endpoint...
   ✓ Webhook: we_xxx
   ✓ URL: https://api.o.company/api/webhooks/stripe
   ✓ Status: enabled

7. Cleaning up test customer...
   ✓ deleted

====================================
✓ All live-mode Stripe operations succeeded.
====================================
```

**If this fails, STOP. Do not proceed.** The failure is one of:
- `Account has charges_enabled=false` — your account is locked. Go to the Stripe dashboard, complete the verification, retry.
- `PaymentIntent is "requires_action"` — your card is being declined. Use a different test card.
- `No URL returned from Checkout session` — your account doesn't have Checkout enabled. Enable it in the dashboard.

### 3.4 Set up the webhook endpoint

**Do this after the API is deployed (Phase 5).** For now, set up a placeholder so the smoke test can verify it.

1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. URL: `https://api.o.company/api/webhooks/stripe` (will fail until the API is up; you'll come back to this)
4. Events to send: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `payment_intent.requires_action`, `charge.refunded`, `charge.dispute.created`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
5. Click "Add endpoint"
6. Copy the "Signing secret" (`whsec_...`) — this is your `STRIPE_WEBHOOK_SECRET`
7. Copy the endpoint ID (`we_xxx`) — set this as `STRIPE_WEBHOOK_ID` so the smoke test can verify it

**Failure mode if you skip:** Invoices never transition to "paid" status. Customers pay, but the database doesn't know.

---

## Phase 4: Resend (email)

The operator's drafts become emails. The morning briefing is an email. The brief inbox entries can trigger emails. **All of this needs Resend to be wired up.**

### 4.1 Verify the sending domain

1. Go to https://resend.com/domains
2. Click "Add domain"
3. Domain: `o.company` (not `mail.o.company` — Resend wants the bare domain)
4. Resend will show you DNS records. **Add these to your DNS provider (Cloudflare, Route53, wherever `o.company` lives).** Specifically:
   - `TXT` record for `o.company` with the verification value
   - `MX` records for `send.o.company` (Resend's sending subdomain)
   - `TXT` record for `send.o.company` for SPF
   - `TXT` record for `resend._domainkey.o.company` for DKIM
5. Click "Verify DNS records" in Resend. **This takes 5 minutes to 48 hours depending on DNS propagation.** Don't proceed until this is verified.

**Failure mode if you skip:** All email sends return 403 with "Domain not verified." The morning briefing never arrives. The brief inbox never notifies. The operator's drafts never send.

### 4.2 Get the API key

1. Go to https://resend.com/api-keys
2. Click "Create API key"
3. Name: `o-company-prod`
4. Permission: "Full access" (yes, we want full access — this is a server-side key)
5. Click "Create"
6. Copy the `re_...` value. This is your `RESEND_API_KEY`. Server-side only.

### 4.3 Set the from address

After the domain is verified:
1. Go to https://resend.com/domains
2. Click on `o.company`
3. Set the default "From" address: `operator@o.company` (or `hello@o.company` — pick one and stick with it)
4. Save

Set in env: `EMAIL_FROM="operator@o.company"`, `EMAIL_REPLY_TO="oshay@o.company"`.

---

## Phase 5: Cloudflare (R2 + Workers)

The photo worker needs R2 (object storage) and Cloudflare Workers (the runtime). Both are configured the same way.

### 5.1 Create the R2 bucket

```sh
# Install the Wrangler CLI
npm install -g wrangler

# Login to Cloudflare (opens browser)
wrangler login

# Create the bucket
wrangler r2 bucket create o-photos
wrangler r2 bucket create o-photos-dev  # for staging, if you have one
```

### 5.2 Create R2 API credentials

1. Cloudflare dashboard → R2 → "Manage R2 API Tokens"
2. Click "Create API token"
3. Name: `o-company-prod`
4. Permissions: "Object Read & Write"
5. Specify bucket: `o-photos` (and `o-photos-dev` for staging)
6. Click "Create"
7. Copy the Access Key ID and Secret Access Key. These are:
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
8. Note the account ID (in the URL or the API token page). Construct the endpoint:
   ```
   R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
   ```
9. Set the public host (the URL your gallery uses to serve the images):
   ```
   R2_PUBLIC_HOST="https://photos.o.company"
   ```
   You'll set up the custom domain on the bucket in step 5.3.

### 5.3 Set up the public domain on the bucket

1. Cloudflare dashboard → R2 → `o-photos` → Settings
2. "Custom Domains" → "Connect Domain"
3. Enter `photos.o.company`
4. Cloudflare will add a CNAME record to your DNS automatically (because the domain is on Cloudflare). **If `o.company` is NOT on Cloudflare, you'll need to add a CNAME record manually at your DNS provider.**

### 5.4 Deploy the photo worker

```sh
cd apps/photo-worker

# Set the worker's secrets (these are environment variables that the
# worker reads at runtime; they don't go in wrangler.toml)
wrangler secret put REPLICATE_API_TOKEN
# paste your Replicate token when prompted
wrangler secret put API_BASE_URL
# paste https://api.o.company when prompted
wrangler secret put API_SERVICE_TOKEN
# paste a long random string (32+ bytes); same value goes in the API's env

# Deploy
wrangler deploy
```

Expected output:
```
Total Upload: 47.12 KiB / gzip: 12.34 KiB
Uploaded o-photo-worker (1.23 sec)
Published o-photo-worker (0.45 sec)
  https://o-photo-worker.<your-account>.workers.dev
```

Save that URL. It's your `PHOTO_WORKER_URL`.

### 5.5 Set up the worker → API auth

The worker authenticates to the API with a service token. The value of `API_SERVICE_TOKEN` set in step 5.4 must match `API_SERVICE_TOKEN` set in the API's env. **Two different values = worker can't call API. They must be the same.**

---

## Phase 6: OpenAI (the operator's LLM)

The operator calls OpenAI for all 10 actions. This is the cost line item. The morning briefing uses `gpt-4o`; the other 9 use `gpt-4o-mini`.

### 6.1 Get the API key

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Name: `o-company-prod`
4. Permissions: "All" (or "Restricted" if you want to limit, but the operator needs all model access)
5. Click "Create"
6. Copy the `sk-...` value. This is your `OPENAI_API_KEY`. **This key costs real money. Treat it like a credit card.**

### 6.2 Set a spending limit

1. https://platform.openai.com/account/limits
2. Set "Hard limit" to something reasonable for your scale. $50/month for a single-customer deployment. $500/month for ~10 customers. Adjust as you grow.
3. The operator's worst-case monthly cost is documented in `packages/operator/MANUAL.md`. **Read that section before setting the limit.**

---

## Phase 7: Replicate (photo pipeline's image models)

The photo pipeline's variations (upscale, no-bg, color-grade) run on Replicate.

### 7.1 Get the API token

1. https://replicate.com/account/api-tokens
2. Click "Create token"
3. Name: `o-company-prod`
4. Copy the `r8_...` value. This is your `REPLICATE_API_TOKEN`.

### 7.2 Set a spending limit

1. https://replicate.com/account/billing
2. Set a monthly limit. The operator docs say the full-set preset costs $0.65. 100 photos × $0.65 = $65. Set the limit to $100/month to start.

---

## Phase 8: Vercel (the hosting)

Five apps deploy to Vercel: api, web, internal, admin, app. They share an env config.

### 8.1 Create the project

1. https://vercel.com/new
2. Import `brahimamirzerbout/o-company` from GitHub
3. Project name: `o-company`
4. Root directory: leave as `.` for now (we'll set per-app)
5. Build command: leave default
6. Output directory: leave default
7. **Don't click Deploy yet.** We need to set up env vars first.

### 8.2 Set up the env vars

For each app (api, web, internal, admin, app), the same env vars apply. The way to do this in Vercel is to set them at the project level (they cascade to all apps). Click "Environment Variables" and add:

```
DATABASE_URL=postgresql://neondb_owner:xxx@...neon.../neondb?sslmode=require
JWT_SECRET=<from step 2.1>
ENCRYPTION_KEY=<from step 2.2>
STRIPE_SECRET_KEY=<from step 3.1>
STRIPE_WEBHOOK_SECRET=<from step 3.4>
STRIPE_WEBHOOK_ID=<from step 3.4>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<from step 3.2>
RESEND_API_KEY=<from step 4.2>
EMAIL_FROM=operator@o.company
EMAIL_REPLY_TO=oshay@o.company
OPENAI_API_KEY=<from step 6.1>
REPLICATE_API_TOKEN=<from step 7.1>
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=o-photos
R2_ACCESS_KEY_ID=<from step 5.2>
R2_SECRET_ACCESS_KEY=<from step 5.2>
R2_PUBLIC_HOST=https://photos.o.company
PHOTO_WORKER_URL=https://o-photo-worker.<account>.workers.dev
API_SERVICE_TOKEN=<from step 5.4 — same value the worker has>
NEXT_PUBLIC_APP_URL=https://app.o.company
NEXT_PUBLIC_WEB_URL=https://o.company
ALLOWED_ORIGINS=https://o.company,https://app.o.company,https://admin.o.company
```

Important: **these are secrets.** Vercel encrypts them at rest and only exposes them to the build process and the runtime. Don't print them in logs. Don't commit them. Don't paste them in Slack.

### 8.3 Set up multiple apps

This is the tricky part. Vercel projects are one-repo-one-app by default. o.company has 5 apps. The simplest approach:

1. Deploy each app as a **separate Vercel project** from the same GitHub repo
2. For each, set the "Root Directory" to that app:
   - `apps/api` → Vercel project "o-company-api"
   - `apps/web` → Vercel project "o-company-web"
   - `apps/internal` → Vercel project "o-company-internal"
   - `apps/admin` → Vercel project "o-company-admin"
   - `apps/app` → Vercel project "o-company-app"
3. Each gets the same env vars
4. **Yes, this means 5 deploys per push.** It's the simplest setup. If you want monorepo-aware deploys (only deploy the app that changed), that's a Turborepo + Vercel integration, which is a 1-day setup. **For the first deploy, do the 5-project approach.**

### 8.4 Deploy

```sh
# From the repo root, with all env vars set
./scripts/deploy.sh vercel
```

The script will:
1. Validate that `STRIPE_SECRET_KEY` starts with `sk_live_`
2. Run migrations (against the Neon DB)
3. Run the live-mode Stripe smoke test
4. Deploy to Vercel

If the smoke test fails, the script aborts. **Don't override this.** The smoke test is the only thing standing between you and a Friday afternoon where a customer's payment doesn't go through.

---

## Phase 9: Custom domains

The 5 apps each get a subdomain:

| Subdomain | Vercel project | Public? |
|---|---|---|
| `api.o.company` | `o-company-api` | No (private API) |
| `o.company` | `o-company-web` | Yes (marketing) |
| `internal.o.company` | `o-company-internal` | No (O'Shay's staff console) |
| `admin.o.company` | `o-company-admin` | No (owner console) |
| `app.o.company` | `o-company-app` | Yes (client portal) |

For each:
1. Vercel project → Settings → Domains → Add the domain
2. Vercel will give you a CNAME record. Add it to your DNS provider.
3. Wait for Vercel to verify (5-60 minutes)

---

## Phase 10: First end-to-end test

This is the moment. Sign in, use the product, see the AI work.

1. **Open `internal.o.company`** in your browser
2. **Sign in** as `oshay@o.company` with password `noira-demo` (from the seed)
3. **Change the password** immediately
4. **Click around.** You should see the dashboard, the contacts page, the deals kanban, the invoices, the operator briefing page
5. **Open `app.o.company`** in a different browser tab
6. **The brief inbox** should have 3 entries (from the seed)
7. **On the internal site, go to `/briefing`**
8. **Approve the morning briefing draft** (or any draft)
9. **Watch the log** for the send — the email should arrive at `oshay@o.company` within seconds
10. **Open the photo upload screen** (in dev, on `/photos` in the client portal)
11. **Upload a photo**, pick a preset, submit
12. **Wait 20-30 seconds** for the photo worker to process
13. **See the variations in the gallery**
14. **Check the brief inbox** — there should be a new "Photos ready" entry

If all of that works, **the product is live**. The next step is the first paying customer.

---

## Phase 11: Going live checklist

Before opening the doors to a real customer:

- [ ] All 11 phases above complete
- [ ] All passwords rotated (O'Shay's seed password, Stripe test password, etc.)
- [ ] Stripe account is in **live mode** with charges_enabled
- [ ] Stripe webhook endpoint is configured and receiving events
- [ ] Resend domain is verified
- [ ] Cloudflare worker is deployed and accessible
- [ ] Vercel custom domains are connected
- [ ] The first end-to-end test passes
- [ ] Backups are configured (Neon automated snapshots)
- [ ] Encryption migration has been run on existing data
- [ ] GDPR endpoints have been tested with real data
- [ ] CI is in place (Phase 12 below — recommended but not blocking)
- [ ] O'Shay has reviewed the trust model and signed off
- [ ] O'Shay has tested the product end-to-end himself
- [ ] A support email is configured (`support@o.company`)
- [ ] A status page is configured (the trust model flags this; Statuspage, Instatus, or BetterUptime all work)

---

## Phase 12: Recommended next steps (not blocking)

These are the things to do in the first week of running production:

- **CI on GitHub Actions.** The deploy script assumes local tests. Add a workflow that runs migrations against an ephemeral Postgres, runs the Stripe smoke test, typechecks, builds.
- **Stress test in production.** Run `pnpm --filter @o/stress all` against the deployed env. Capture the numbers in `STRESS_REPORT.md`. The dev numbers are a floor; the prod numbers are the truth.
- **Real customer onboarding.** Use the seed data as a demo. Walk the prospect through the dashboard. Charge $1,000/month. Don't add features for 30 days; spend the time understanding what the customer actually needs.
- **GDPR endpoint testing.** Run the `DELETE /api/people/:id/gdpr-delete` and `GET /api/people/:id/export` endpoints with real (test) data. Verify the cascade works. Verify the export is correct.
- **Encryption migration.** Run the batch job that encrypts the existing `people.email`, `contacts.email`, `contacts.notes` rows. The helper is in `packages/auth/src/encryption.ts`. The job is not built yet — see `ROADMAP.md` Workstream D.
- **Audit log viewer.** The audit_events table is recording every external side effect. There's no UI to view it. The trust model says the audit log is the source of truth for "what did the AI do?" A page that shows the recent events is the next thing to build.

---

## Total time estimate

| Phase | Time |
|---|---|
| 0. Pre-flight (account creation) | 30-60 min |
| 1. Database (Neon) | 15-30 min |
| 2. Auth secrets | 5 min |
| 3. Stripe live mode | 30 min (+ 24-48h DNS if domain is new) |
| 4. Resend (email) | 30 min (+ 24-48h DNS) |
| 5. Cloudflare (R2 + Workers) | 30-60 min |
| 6. OpenAI | 5 min (+ 24h for hard limit to take effect) |
| 7. Replicate | 5 min |
| 8. Vercel | 60-90 min |
| 9. Custom domains | 30 min (+ 1-24h DNS) |
| 10. First end-to-end test | 30 min |
| 11. Going live checklist | varies |
| **Total** | **~6-8 hours, mostly waiting on DNS** |

The bottleneck is DNS. Resend verification, Cloudflare worker DNS, custom domain CNAMEs — they all take time. **Do the account-creation and domain-verification steps in parallel; don't wait for one to finish before starting the next.**

---

## If something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm migrate` fails with "permission denied" | Wrong DB user | Use the `neondb_owner` user, not `neondb` |
| `stripe:test:live` fails with "Account has charges_enabled=false" | Stripe account not verified | Complete Stripe identity verification |
| `stripe:test:live` fails with "PaymentIntent is requires_action" | Test card needs 3DS | Use a different test card or skip 3DS |
| Resend returns 403 with "Domain not verified" | DNS not propagated | Wait, or check DNS records |
| Worker can't call API | API_SERVICE_TOKEN mismatch | Same value in both envs |
| Photo upload returns 500 | R2 credentials wrong | Test with `aws s3 ls` against the endpoint |
| Brief inbox is empty | No drafts created | Check the operator worker is running, or trigger a tick manually |
| Morning briefing never arrives | Email not configured | Check Resend dashboard, look for bounce/complaint |

The trust model says "every external side effect must be enforced, not just documented." This runbook is the documentation. The smoke tests are the enforcement. **If the smoke tests pass and the end-to-end test fails, the runbook is wrong. Fix the runbook before fixing the system.**

---

Last updated: 2026-06-20. This runbook is the source of truth for "how do I deploy o.company." The trust model is the source of truth for "what is the AI allowed to do." SETUP.md is the source of truth for "what env vars exist." The roadmap is the source of truth for "what's next." When in doubt, read all four.
