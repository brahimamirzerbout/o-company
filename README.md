# o.company

The operating system for a worldwide creative operations business.

This is a [pnpm workspace](https://pnpm.io/workspaces) monorepo. It contains every app and every shared package the company needs to run, bill, support, and grow.

## The shape of the company

```
o.company/                     the monorepo
├── apps/                      the surfaces (the things users see)
│   ├── web/                   public marketing site  (port 3000)
│   ├── app/                   client portal          (port 4003)
│   ├── internal/              staff console          (port 4001)
│   ├── admin/                 owner console          (port 4002)
│   └── api/                   the backend            (port 4000)
└── packages/                  the shared code
    ├── brand/                 design tokens, fonts, voice, logo
    ├── ui/                    shadcn-style components
    ├── db/                    Postgres schema + Drizzle client
    ├── types/                 every domain type
    ├── auth/                  RBAC, sessions, password hashing
    ├── money/                 multi-currency formatting, FX
    ├── crypto/                ENS, Trust Score, on-chain payment verification
    ├── payments/              Stripe (cards, ACH, SEPA, subscriptions)
    ├── email/                 Resend + 10 React Email templates
    ├── i18n/                  English, Spanish, pt-BR, fr, ar, hi, tl
    ├── errors/                stable error codes + AppError
    ├── logger/                JSON-lines structured logger
    ├── jobs/                  Postgres-backed background jobs
    ├── legal/                 MSA, DPA, AUP, SLA — all in code
    └── obs/                   metrics (Prometheus-compatible) + tracing
```

## The hierarchy

| Role | Email | App | What they do |
|---|---|---|---|
| **Owner** | oshay@o.company | `admin` | Owns the company. Can transfer ownership, change billing, view audit log, perform dangerous actions. |
| **Admin** | you@o.company | `internal` | Runs the operator. Manages people, sees all CRM data, configures services. |
| **Manager** | — | `internal` | Manages a team. Sees CRM data for projects they own. |
| **Operator** | — | `internal` | Does the work. Sees assigned projects, logs time, sees their own tasks. |
| **Client** | client@their.com | `app` | Sees only their own projects, invoices, files, messages. |

All defined in `packages/types/src/index.ts` (`ROLES`, `PERMISSIONS`, `ROLE_PERMISSIONS`).

## Quick start

```sh
# 1. Install pnpm if you don't have it
npm install -g pnpm@9

# 2. Install all workspace dependencies
pnpm install

# 3. Set up the environment
cp .env.example .env.local
# Fill in DATABASE_URL, JWT_SECRET (32+ chars), STRIPE_*, RESEND_API_KEY

# 4. Run database migrations
pnpm --filter @o/db migrate

# 5. Start the API
pnpm --filter @o/api dev          # → :4000

# 6. In another terminal, start the apps
pnpm dev                          # runs all apps in parallel
# → :3000  marketing site
# → :4000  api
# → :4001  internal console
# → :4002  admin console
# → :4003  client portal
```

## Build

```sh
pnpm build        # build every app
pnpm typecheck    # typecheck everything
pnpm test         # run all unit tests
```

## Deploy

- **API** — Vercel (single region for MVP, multi-region for scale). The Postgres connection string points to Supabase, Neon, or RDS.
- **Web** (marketing) — Vercel, Cloudflare Pages, or any static host. Edge-rendered, sub-100ms globally.
- **Internal / Admin / App** — Vercel for the MVP. Long-term, run on Cloudflare Workers for true edge.
- **Jobs worker** — Fly.io or Railway with a long-running process. Run `pnpm --filter @o/api worker:start` after building.

## Money rails

Two payment processors, one source of truth:

- **Card / ACH / SEPA** via Stripe — `packages/payments` exposes the wrapper. The API routes wire it to invoices and subscriptions.
- **Crypto** via direct on-chain transfers — `packages/crypto` handles ENS resolution, Trust Score, and payment verification on Ethereum / Base / Polygon / Arbitrum.

Both write to the same `payments` table. The `invoices.status` field flips to `paid` based on either path.

## Web3

The web app supports ENS, Basenames, and Unstoppable Domains. Connect a wallet from the header; we resolve it across 5 EVM chains in parallel. The Trust Score is computed from public RPC data (wallet age, tx volume, contracts deployed, DAO votes). No custody, no KYC, no signature requests.

## Internationalization

English, Spanish, pt-BR, French, Arabic, Hindi, Filipino. Locale auto-detection via `Accept-Language`. Translation strings live in `packages/i18n/src/index.ts`. RTL is handled at the layout level for Arabic.

## Legal

The Master Services Agreement, Data Processing Addendum, and Acceptable Use Policy live in `packages/legal/src/index.ts` as structured `Clause[]` arrays. The `/legal/*` pages on the public site render them via `marked`. When terms change, the change is a code change — auditable, reviewable, version-controlled.

## License

- **Clients** (web, internal, admin, app) — MIT
- **Packages** (db, types, auth, money, crypto, payments, email, i18n, errors, logger, jobs, legal, obs) — MIT
- **API server** — Business Source License 1.1 (source-available; converts to Apache 2.0 four years after each release)
- **Brand** ("o.company" name and logo) — All rights reserved

## Deploying to production

Read **[DEPLOY.md](./DEPLOY.md)** for the full runbook: every
account you need, every dashboard click, every env var, in
the exact order to do them. Total: ~6-8 hours, mostly DNS.

Read **[SETUP.md](./SETUP.md)** for the env-var reference and
the failure-mode table. SETUP.md is the *what*; DEPLOY.md is
the *how*.

## The operator

The AI parts of o.company (the `morning_briefing`, `deal_followup_draft`,
`lead_score`, `invoice_reminder`, and 6 other actions) operate under a
non-negotiable contract: **the AI drafts, the AI never sends.** Every
external action goes through a human review at `/briefing`. There is no
fully-autonomous mode. There is no agent mode. There is no
auto-approval flag. This is by design.

- **`TRUST_MODEL.md`** at the root — the one-paragraph version, where
  the contract is enforced in code, and what you cannot do.
- **`packages/operator/MANUAL.md`** — the full manual. Action set,
  model choices, cost numbers, extension guide, non-goals, future.

Read both before changing anything in `packages/operator/`,
`apps/operator-worker/`, or the API routes that produce side effects.
