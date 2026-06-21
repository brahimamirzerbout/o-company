# o.company · roadmap

> The work to get from "platform with C+ grade" to "full product with A- grade." Every workstream has a stop condition. Every workstream has a decision point where O'Shay (or whoever owns the business) needs to make a call.

## The shape of the remaining work

The platform is shipped. 13 commits, ~170 files, ~15,000 lines. The trust model is in place. The brand is real. The infrastructure is real. **What's missing is product completion, deployment, and distribution.**

There are six workstreams remaining. They are not equally important. They are not equally code-heavy. The order below is the order I would do them in; the order you want to do them in may differ, and that's fine — the roadmap is the menu, you pick the dish.

---

## Workstream A: The operator is complete

**Why this is first.** The headline of the product is "your business, operated." The operator is the only way that headline is true. Today, 5 of 10 planned actions ship. The headline is half-true. This workstream makes the headline fully true.

**The work.**

1. **The 5 missing operator actions.**
   - `lead_reengagement` — when a lead goes cold (30+ days, no activity), the operator drafts a "checking back in" message. Not automatic. Drafted, reviewed, sent.
   - `project_kickoff` — when a project moves to `active`, the operator drafts a kickoff message to the client: timeline, who-does-what, what-to-expect-first.
   - `ticket_acknowledgement` — when a new ticket comes in, the operator drafts an in-app notification to the client: "we got your ticket, here's when to expect a response." Auto-approved (low risk, no external side effect).
   - `project_closeout` — when a project moves to `delivered`, the operator drafts a closeout summary: what was delivered, what's left, the final invoice nudge.
   - `weekly_client_digest` — Friday 4pm, the operator drafts a one-paragraph summary of the client's week: what was done, what's coming, anything that needs their attention.

   Each is ~150 lines: a Zod schema, a runner dispatch, a draft producer, a template.

2. **The LLM retry on 429.** The operator-storm stress test surfaces this. When OpenAI rate-limits us, the runner should back off and retry, not give up. ~30 lines in `packages/operator/src/runner.ts`.

3. **The learning loop made real.** The `operator_feedback` table is in place. The prompt-time retrieval is a 1-day add-on: when drafting, find the 5 most similar past decisions (approved or rejected) via a simple hash of the prompt, include them as few-shot examples. ~150 lines.

**Stop condition.** All 10 actions are registered, draftable, approvable, and tested in dev. The learning loop measurably improves the next draft after a human approves or rejects one. The 429 retry is exercised by the stress test.

**Decision point.** None. This is mechanical work. Ship it.

**Effort.** ~3 days of focused code. ~600 lines. ~3 commits.

---

## Workstream B: The deploy

**Why this is second.** A product that doesn't run in production is a project, not a product. Workstream A makes the operator complete; this workstream makes it real. The deploy is mostly **operator work**, not code: Vercel, Neon, Cloudflare, Resend, Stripe — each of these has a dashboard and a 30-minute setup.

**The work.**

1. **Stripe live-mode test run.** `pnpm --filter @o/api stripe:test:live` against the real Stripe account. The test was written in the last turn; it needs to actually pass against a real key.
2. **Vercel project created.** All 5 apps, each with the right env vars. Each with the right build command. The deploy script handles the validation; Vercel handles the hosting.
3. **Neon project created.** Postgres URL in env. Migrations run. Seed runs once. Backups configured.
4. **Cloudflare worker deployed.** R2 bucket created. Worker secrets set. Worker URL in the API's env.
5. **Resend domain verified.** DNS records added. `EMAIL_FROM` set to a verified address. Test email sent to confirm.
6. **Custom domain connected.** `o.company` → Vercel. `app.o.company` → Vercel. `api.o.company` → Vercel.
7. **The first run.** Sign in as O'Shay. Upload a photo. See the variations arrive. Approve a draft. See the email arrive. The whole loop, end to end, on real infrastructure.

**Stop condition.** A real human (O'Shay or the first paying customer) can sign in, use the product, and have the AI send them an email that arrives in their inbox.

**Decision point.** The email domain. O'Shay has to pick the `from` address. `hello@o.company` is the obvious choice but the verification process takes 24-48 hours (DNS propagation). Plan for this in advance.

**Effort.** ~1 week of operator time, mostly waiting on DNS and Stripe verification. ~0 lines of code (the deploy script and SETUP.md already exist).

---

## Workstream C: The CI

**Why this is third.** Workstream A is done. Workstream B is deployed. The CI is what prevents regressions. Every PR runs migrations, runs the stress suite, typechecks, builds. Without it, the next "small change" can quietly break the photo pipeline and we don't notice until a customer notices.

**The work.**

1. **GitHub Actions workflow** at `.github/workflows/ci.yml`. Runs on every PR. Steps: install, build, typecheck, run migrations against an ephemeral Postgres, run `stripe:test` in test mode, run the stress suite, build the iOS app.
2. **An ephemeral Postgres for CI.** A Neon branch that gets created and destroyed on every CI run. ~5 lines of GitHub Actions YAML.
3. **A nightly stress run.** A separate workflow that runs the operator-storm and pool-exhaustion scenarios on the deployed staging env. Catches the slow regressions.

**Stop condition.** Every PR runs the suite. The suite catches the regressions. A weekly run produces a stress report that's reviewed.

**Decision point.** The CI cost. GitHub Actions minutes are free for public repos; private repos get 2,000 minutes/month on the free tier. The full suite uses ~10 minutes per run. A team of 5 doing 5 PRs a day each uses ~2,500 minutes/month, which is over the free tier. Either: make the repo public, or pay for the plan ($4/user/month for the team plan). O'Shay's call.

**Effort.** ~1 day. ~200 lines of YAML.

---

## Workstream D: The data-safety production pass

**Why this is fourth.** Workstream B is live. The data-safety work isn't visible until someone reads the trust model or hits a GDPR endpoint. But it's load-bearing for the trust model. The encryption migration has to run before we have a paying customer (the customer has to trust that their data is encrypted at rest). The backups have to be configured before we have a paying customer (the customer has to trust that we won't lose their data).

**The work.**

1. **Run the encryption migration.** A 1-day batch job that encrypts the existing `people.email`, `contacts.email`, `contacts.notes` rows. The helper is in place; the job needs to read the plaintext, write the ciphertext, and verify the decrypt works. ~150 lines.
2. **Configure backups.** Neon automated snapshots on the paid plan. A second backup store (S3 or R2) for the snapshot. A documented restore procedure. Not code; ops.
3. **Test the GDPR endpoints with real data.** A test script that creates a person, runs the export, runs the delete, verifies the export matches the data and the delete anonymizes the right fields. ~100 lines.
4. **Redact customer-side fields in production logs.** The webhook handler currently logs `invoiceId`, `piId`, `orgId`. None of these are PII, but together they identify a transaction. Redact in production. ~30 lines.

**Stop condition.** A real person (the first paying customer) is in the database, their data is encrypted, their export is correct, their delete is anonymized, and a backup can be restored from a known-good state.

**Decision point.** The encryption key rotation procedure. The current setup has one `ENCRYPTION_KEY`. Rotating it requires a re-encryption batch job. That job exists in spec but not in code. The decision is whether to build the rotation job now (before the first customer, when it's painless) or later (when it's a migration). Build it now.

**Effort.** ~1 week. ~280 lines. Plus the ops work for backups.

---

## Workstream E: The remaining services

**Why this is fifth.** Workstreams A-D make the platform solid. Workstream E is what makes the product match the marketing. O'Shay's website advertises 6 services. The platform delivers 2.5. Workstream E delivers the rest.

This is the biggest workstream by far. It's also the most product-decision-heavy. **I should not attempt this in a single turn of code.** Each of the 3.5 missing services is its own conversation.

**The work (in order).**

1. **Lead forms UX.** The API supports it. The schema is right. There's no `<MultiStepLeadForm />` component. The "piped to wherever you need" webhook is not built. This is a 1-2 week build: a multi-step form component, a webhook router, integrations to Mailchimp / HubSpot / Pipedrive / "send to a webhook URL." Decision points: which integrations first, what the form schema looks like, whether the form is hosted or embedded.

2. **Websites service.** The marketing site exists. The "we build your website" service is not in the product. This is the most ambiguous one. The decision is: do we build a website builder (huge, multi-month), or do we build a "post a Notion doc and we turn it into a website" tool (smaller, more focused)? Or do we skip the product entirely and just keep using external tools (Webflow, Framer) and charge for the implementation? O'Shay's call.

3. **Creative service.** The table exists. The brief intake doesn't. The asset delivery doesn't. The "we do your video" service is the most labor-intensive of the 6. The decision is: do we scope it as "we manage the project" (CRM-like, fits the platform), or "we do the creative work" (labor, doesn't fit)? O'Shay's call.

**Stop condition.** All 6 services are real, working, and at least one paying customer is using each.

**Decision point.** Per service. I cannot make these decisions in code; they have to be made in conversation with O'Shay.

**Effort.** Lead forms: 1-2 weeks. Websites: depends on decision (1-12 weeks). Creative: depends on decision (1-8 weeks). ~3-25 weeks total. **This is the long pole.**

---

## Workstream F: The second customer

**Why this is sixth.** Workstream B is deployed. Workstream A is complete. The first customer is using the product. **The second customer is the proof that the product works for someone other than the founder.** Until the second customer, every bug fix is "the founder noticed." After the second customer, every bug fix is "a real user noticed" and the team has to take it seriously.

**The work.** Not code. Sales. Onboarding. Documentation. The first customer is the hardest; the second is "do what we did for the first one, again." The product is the same; the work is the people work.

**Stop condition.** Two paying customers, both using the platform, both on the same monthly plan, both with at least one photo job and one operator-approved draft per week.

**Decision point.** Pricing. The current spec says $1,000/month for the Team plan. Is that right? Is the per-user pricing ($19/user) right? The first customer is the test; the second customer confirms the test. O'Shay's call.

**Effort.** ~2-4 weeks of sales + onboarding. Zero code. (Or near-zero — there will be a small feature request from the second customer that turns into a commit. That's the test.)

---

## The order, summarized

| # | Workstream | What it produces | Effort | Decision points |
|---|---|---|---|---|
| A | Operator is complete | The headline is fully true | 3 days, 600 LoC | None |
| B | The deploy | The product runs in production | 1 week, 0 LoC | Email domain |
| C | The CI | Regressions are caught | 1 day, 200 LoC | CI cost |
| D | Data-safety production pass | A paying customer can trust the data | 1 week, 280 LoC | Key rotation |
| E | The remaining services | 6/6 services delivered | 3-25 weeks | Per service |
| F | The second customer | The product works for someone other than the founder | 2-4 weeks | Pricing |

**The 30-turn forecast.** Workstream A is 3 days of code, so it gets done in the next 1-2 turns. Workstream B is operator work, so it gets done in 1-2 turns of conversation. Workstream C is one commit. Workstream D is operator work + one commit. Workstream E is the long pole and breaks into 3 sub-conversations (lead forms, websites, creative). Workstream F is people work.

If we do all 6 workstreams in order, the product is "full" in roughly 8-15 weeks of work, depending on how the Workstream E decisions shake out. **That's the honest timeline.** It's not "a few more turns of code." It's months of focused work across code, ops, and people.

## What I will do this turn

I will execute **Workstream A** in 3 commits:

1. The 5 missing operator actions (one commit, all 5)
2. The LLM retry on 429 (one commit, ~30 lines)
3. The learning loop made real (one commit, ~150 lines)

After these 3 commits, the operator is complete. The next turn is your call: deploy, CI, data-safety pass, or start on the lead forms.

If any of the 3 commits feel wrong, that's a signal that the order is wrong, or the scope is wrong, or the workstream I picked first isn't the one you want me to do. Tell me. We adjust. **The roadmap is the menu; you pick.**

---

Last updated: 2026-06-20. This file is the source of truth for "what's next" in o.company. The trust model is the source of truth for "what the AI is allowed to do." The SETUP.md is the source of truth for "how to deploy." When in doubt, read all three.
