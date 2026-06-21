# o.company · production deploy checklist

> The single source of truth for "what does it take to run o.company in
> production." Read this before your first deploy. Use this every time
> you onboard a new environment.

This file exists because the previous attempt at documenting the
deploy (the `.env.example` plus scattered README sections) was
incomplete. Three engineers have shipped the codebase at this point.
Each one missed a step. The steps are now here, in order, with the
exact commands and the exact failure mode if you skip a step.

## 0. Prerequisites

Before you start, you need accounts at:

- **Vercel** (or another Next.js host) — for the API, web, internal, admin, app
- **Neon** (or another Postgres provider) — for the database
- **Cloudflare** (free tier is fine) — for R2 (photos) and Workers (photo worker)
- **Resend** — for transactional email
- **OpenAI** — for the operator's LLM calls
- **Replicate** — for the photo pipeline's image models
- **Stripe** — for payments
- **GitHub** — for the source

Each of these has a free tier or a $0/month dev tier. You can run
o.company end-to-end for $0 in your first month.

## 1. Database (Neon)

```sh
# 1. Create a Neon project at https://console.neon.tech
# 2. Copy the connection string (the one that ends in ?sslmode=require)
# 3. Set it in your local .env.local:
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/o_company?sslmode=require"
```

**Failure mode if you skip this:** every API call returns 500 with
"getDb() called before DATABASE_URL was set" or
"relation 'orgs' does not exist."

## 2. Migrations

```sh
pnpm --filter @o/db migrate
```

This applies all 3 migrations in order. It is idempotent. Safe to run
multiple times. The migrations runner writes a `__migrations` table
that tracks what's been applied. It is **not safe to drop the
database in production** — use a fresh branch.

**Failure mode if you skip this:** every API call returns 500 with
"relation 'orgs' does not exist."

## 3. Seed (only for first run on a fresh DB)

```sh
SEED_ON_DEPLOY=1 pnpm --filter @o/db migrate
```

Or, equivalently:

```sh
pnpm --filter @o/db seed
```

The seed creates:
- 1 org ("o.company")
- 3 staff (O'Shay / Felix / Mira — all with password "noira-demo")
- 3 companies (Northwind, Helios, Polaris)
- 4 contacts
- 4 deals
- 1 project
- 2 invoices
- 3 brief entries
- 2 operator drafts

**Failure mode if you skip this on a fresh DB:** the app loads but
has no data. Sign in fails because no users exist.

**Don't run this on a production DB with real data.** It will
overwrite the org, contacts, and deals. The seed is gated to dev
by default; only enable it on the first run.

## 4. Auth secrets

```sh
# Generate a JWT signing key. 64 bytes of randomness.
openssl rand -hex 64

# Generate an encryption key for column-level encryption. 32 bytes.
openssl rand -hex 32
```

Set both in `.env.local`. **Do not rotate the JWT_SECRET in
production** — every user's session will be invalidated. The
encryption key rotation is a separate, more complex procedure.

```sh
JWT_SECRET="..."
ENCRYPTION_KEY="..."
```

## 5. Stripe

```sh
# 1. Get a test secret key at https://dashboard.stripe.com/test/apikeys
# 2. Get the webhook signing secret after you set up the endpoint
#    (see step 9 below)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# 3. Test it. This script creates a customer, a PaymentIntent, a
#    refund, a Checkout session, and a Customer Portal session. If
#    any step fails, the script exits non-zero.
pnpm --filter @o/api stripe:test
```

**Failure mode if you skip this:** the `/api/payments/checkout`
endpoint returns 500 with "STRIPE_SECRET_KEY not set."

## 6. Email (Resend)

```sh
# 1. Get an API key at https://resend.com/api-keys
RESEND_API_KEY="re_..."

# 2. Verify your sending domain at https://resend.com/domains
#    (you'll add a few DNS records; the dashboard walks you through it)
EMAIL_FROM="hello@yourdomain.com"
EMAIL_REPLY_TO="oshay@yourdomain.com"
```

**In production, this is required.** In dev, the email package
auto-detects: if `RESEND_API_KEY` is set, it sends. If not, it
logs the email to the application log (mode: "log") so the rest
of the flow still works.

**Failure mode if you skip this in production:** the operator's
drafts transition to "sent" but the email never arrives. The
client sees a brief inbox entry saying "photos ready" but never
gets the email. This is a real product bug, not a dev one.

## 7. OpenAI (the operator's LLM)

```sh
# Get an API key at https://platform.openai.com/api-keys
OPENAI_API_KEY="sk-..."
```

Used for the operator's 5 actions. The morning briefing uses
`gpt-4o` (~$0.014 per call). All other drafts use `gpt-4o-mini`
(~$0.001-0.003 per call).

**Failure mode if you skip this:** the operator's runner throws
"OPENAI_API_KEY is not set" and every draft fails. The brief inbox
is empty.

## 8. Replicate (the photo pipeline)

```sh
# Get an API token at https://replicate.com/account/api-tokens
REPLICATE_API_TOKEN="r8_..."
```

Used for the photo worker's variation models: Real-ESRGAN, rembg,
SDXL color grading. Without this token, the photo worker still
runs the local variations (crop, color) but the model-based
ones (upscale, no-bg, color-grade) fail with a 401.

## 9. R2 + photo worker (Cloudflare)

```sh
# 1. Create an R2 bucket:
wrangler r2 bucket create o-photos

# 2. Set R2 credentials in your Cloudflare dashboard (Workers > R2 > Manage R2 API Tokens)
R2_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
R2_BUCKET="o-photos"
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_PUBLIC_HOST="https://photos.yourdomain.com"

# 3. Set the worker's secrets:
cd apps/photo-worker
wrangler secret put REPLICATE_API_TOKEN
wrangler secret put API_BASE_URL           # e.g. https://api.yourdomain.com
wrangler secret put API_SERVICE_TOKEN      # same value as below

# 4. Deploy the worker:
wrangler deploy
```

Then set the worker URL on the API side:

```sh
PHOTO_WORKER_URL="https://o-photo-worker.<account>.workers.dev"
PHOTO_WORKER_TOKEN="<long random string>"
```

The worker authenticates to the API via this token. The API
authenticates the worker via `API_SERVICE_TOKEN` in its env. **The
two values must match.**

**Failure mode if you skip this:** photo uploads return 500 with
"PHOTO_WORKER_URL not set." Or, if R2 isn't configured, uploads
succeed but the resulting URLs are invalid.

## 10. App URLs

```sh
NEXT_PUBLIC_APP_URL="https://app.yourdomain.com"
NEXT_PUBLIC_WEB_URL="https://yourdomain.com"
```

These are used in email templates and in OAuth redirects. **Set them
to your real domain, not localhost.** OAuth flows will fail otherwise.

## 11. CORS

```sh
ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"
```

Comma-separated list of origins the API will respond to. The
default in dev is `http://localhost:3000,http://localhost:4001,
http://localhost:4003`. **In production, do not include localhost.**

## 12. Deploy

```sh
./scripts/deploy.sh vercel
```

The script will:
1. Validate that all required env vars are set
2. Run migrations
3. Optionally seed (only if SEED_ON_DEPLOY=1)
4. Deploy to Vercel

## 13. Post-deploy

After the deploy completes:

1. **Hit `/api/health`** on the deployed URL. Should return
   `{status: "ok", ...}` with a 200. If it returns 503, the
   database isn't reachable from the deployed environment.
2. **Set up the Stripe webhook** in the Stripe dashboard to
   point at `<your-api-domain>/api/webhooks/stripe`. Copy the
   signing secret to `STRIPE_WEBHOOK_SECRET`.
3. **Set up the email domain** in Resend: verify DNS, set
   `EMAIL_FROM` to an address on the verified domain.
4. **Test the photo flow**: upload a photo from the client
   portal, wait 20 seconds, see the variations in the gallery.
5. **Test the operator**: sign in as O'Shay, approve a draft,
   check that the email arrives.

## What's still rough

- **No CI yet.** The deploy assumes you ran tests locally. A
  GitHub Actions workflow that runs migrations against an
  ephemeral Postgres, runs `stripe:test`, runs `typecheck`, and
  builds every PR is the next thing to add.
- **No CDN in front of the API.** Vercel provides this for the
  web client automatically, but the API sits behind Vercel's
  edge. If you hit Vercel's function timeout (10s on the free
  tier, 60s on pro), the morning briefing's gpt-4o call may
  exceed it. Test it. If it does, the fix is to move the LLM
  call out of the request lifecycle (already in the operator's
  draft-and-approve model — just make sure your operator worker
  has a long enough timeout).
- **The seed password is "noira-demo".** Change it on first
  login. Or, better, delete the seed users entirely and use
  real signup.

## If something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| 500 on every API call with "DATABASE_URL not set" | env not loaded | check Vercel env, redeploy |
| 500 with "relation 'orgs' does not exist" | migrations not run | `pnpm --filter @o/db migrate` |
| 500 with "JWT_SECRET not set" | env var typo | check spelling, case matters |
| Stripe checkout returns 500 | wrong mode (test vs live) | check `STRIPE_SECRET_KEY` prefix |
| Email "sent" but never arrives | domain not verified in Resend | check DNS records |
| Photo upload returns 500 | PHOTO_WORKER_URL not set | check env |
| Operator drafts transition to "failed" | OPENAI_API_KEY missing or rate-limited | check OpenAI dashboard |

The trust model said: "the next person to deploy should be able to
ship in 30 minutes." This checklist is the realization of that.
If a step is unclear, fix this file before you fix the code.
