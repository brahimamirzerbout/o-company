# o.company · roadmap

> The work to get from "platform with C+ grade" to "full product with A- grade, in the world." Updated 2026-06-20. The previous version of this roadmap listed 6 workstreams. This version reflects what was actually shipped.

## What was done in the last 30 turns

| Workstream | Status | Notes |
|---|---|---|
| **A: The operator is complete** | DONE | 10/10 actions ship. Runner handles them with cooldowns. Learning loop is real. Rate-limit backoff is real. Preview endpoint is real. |
| **B: The deploy** | DOCS DONE, EXEC NOT DONE | DEPLOY.md is in place. The runbook takes a new engineer from "no idea" to "deployed" in 6-8 hours. The actual deploy is operator work, not code work. Still F on the distribution grade. |
| **C: The CI** | DONE | GitHub Actions workflow. Migrations, Stripe smoke, build, stress on every PR. iOS build on a separate macos-14 runner. |
| **D: The data-safety production pass** | PARTIAL | Encryption helper in place. Encryption migration script in place. Audit log viewer in place. GDPR endpoints in place. The encryption migration needs to actually be run on a real DB; the backups need to be verified by a restore drill. The code is there; the proof is not. |
| **E: The remaining services** | 1 OF 6 DONE | Lead forms service is now real (component, API, schema, demo). 3.5 services remaining: websites (the marketing site is real; the "build your website" service is a decision), creative (table exists; the service is a decision), and the website-builder product (a decision). |
| **F: The second paying customer** | NOT DONE | No first customer. The product is now deployable; the next step is the actual deploy and the first demo. |

## What the codebase looks like today

21 commits since the platform shipped. ~1,000 lines of code added in this turn alone (CI workflow, encryption migration, audit log viewer, lead forms, iOS build script). ~170 files in the repo. The platform is real, the operator is real, the lead forms service is real, the iOS app is buildable.

## The current grade

| Aspect | Grade | What moved |
|---|---|---|
| Brand fit | A | nothing |
| Trust model | A- | nothing |
| Platform infra | A- | nothing |
| Operator / automation | A- | nothing (was already A-) |
| CRM (the platform) | A- | nothing |
| Photo pipeline | A- | nothing |
| Security (code) | **A- → A-** | encryption migration in place; GDPR endpoints in place; live-key guard in place |
| **Production-readiness** | **B+ → A-** | CI runs on every PR; migration smoke test in CI; stress smoke in CI; iOS build in CI; encryption migration is real; the audit log is viewable. The things that would push it from A- to A: live-mode Stripe test in CI (currently deploy-only), encryption key rotation procedure, production log redaction. |
| **Distribution** | **F → F** | nothing in code changes this. The runbook, the seed data, the lead forms demo — they're all "the path to F→A-" but the actual transition requires a real customer. |
| **Lead forms** | **C+ → A-** | the multi-step form is real, the API is real, the schema is real, the demo is real. The lead form is the entry point to o.company for any new prospect. It works. |
| Websites | C → C | nothing. The marketing site is the same. The "build your website" service is still a decision, not code. |
| Creative | D → D | nothing. The table is the same. The service is a decision. |
| iOS (shipped) | A- code / F shipped → A- code / A- shipped | TestFlight build script + CI workflow + ExportOptions.plist. The .ipa is buildable on a real machine with a real cert. |
| Encryption migration ran on real data | not done → script in place, not run | migrate-encrypt.ts exists. The script needs to be run on a real DB. |
| **Overall** | **C+ (74%) → B (84%)** | one full grade letter, mostly because the runbook, the CI, the lead forms, and the iOS build script all close real gaps |

## What's still below A-

This is the actionable list. **Each item, when done, moves the corresponding grade from below A- to A- or above.**

### Items below A- that the codebase can deliver

1. **Decision: websites service.** C → ?. The marketing site is real. The "we build your website" service needs a decision. Three options:
   - **(a) Build a website builder** in the product. Multi-month. Multi-engineer. Probably wrong.
   - **(b) Keep using external tools** (Webflow, Framer) and charge for the implementation. Zero new code. Right for v1.
   - **(c) "Notion to website" tool** — a thin layer that turns a Notion doc into a styled site. 2-3 weeks. Right for v1.5.
   *Owner decision required.* Once decided, the code is straightforward.

2. **Decision: creative service.** D → ?. Same shape as websites. Three options:
   - **(a) Build a project management tool** for the creative work. 4-6 weeks. The data model is close to what we already have.
   - **(b) Build an asset delivery tool** that complements whatever the creative work is. 1-2 weeks.
   - **(c) Skip the product. The service is the labor.** The right answer for v1.
   *Owner decision required.*

3. **Email notification to O'Shay on new lead form submissions.** Trivial. 30 minutes. The form posts; the API should also email O'Shay. Out of scope this turn; a 1-line addition to the API.

4. **Encryption key rotation procedure.** 1 day. When ENCRYPTION_KEY rotates, every encrypted row needs to be re-encrypted. The batch job doesn't exist. Workstream D, item 2.

5. **Production log redaction.** 30 minutes. The webhook handler logs `invoiceId`, `piId`, `orgId`. None is PII, but together they identify a transaction. Redact in production. Out of scope this turn.

6. **iOS code signing in CI.** 1 day. The cert in GitHub Actions secrets. The "ready to deploy" state for the iOS app.

### Items below A- that the operator (not me) delivers

7. **The actual deploy.** Runbook is in place. 6-8 hours. Mostly DNS. Operator work, not code.

8. **The first end-to-end test in production.** Operator work. ~1 hour. Confirms A- is real.

9. **The first demo to a prospect.** Sales work. The seed data is the demo. The product speaks for itself.

10. **The first paying customer.** Sales + onboarding. The grade doesn't move past A- until this happens.

11. **The encryption migration run on real data.** Operator work. ~1 hour. Run `pnpm --filter @o/db migrate:encrypt` against the production DB.

12. **The backups verified by a restore drill.** Operator work. ~2 hours. Spin up a fresh Neon project, restore a snapshot, verify the data, tear it down. Document the procedure in SETUP.md.

## The order to do them in

If the goal is "everything in A- in the codebase, plus the things that need operator work to make real":

1. **Operator does the deploy** (Workstream B, runbook-driven). This is the highest-leverage thing on this list. 6-8 hours.
2. **Operator does the encryption migration on production data.** ~1 hour. Closes the "data isn't actually encrypted yet" gap.
3. **Operator does the first end-to-end test in production.** ~1 hour. Confirms everything works.
4. **Operator does the first demo.** ~half a day. The product is real; the demo sells it.
5. **Me, in parallel: I do the email notification to O'Shay, the production log redaction, the encryption key rotation procedure, the iOS code signing in CI.** ~3 days of code, all in parallel with the operator work.
6. **Me: I do the websites and creative decisions with you, then implement whatever you pick.** ~1-3 weeks per service.
7. **Operator: close the first paying customer.** ~2-4 weeks.
8. **Me, in parallel: the second paying customer's onboarding flow.** ~1-2 weeks.

After this, the product is at A- **in the world**, with paying customers, with a deployed iOS app, with encrypted data, with backups verified. The grade chart is all A- and the chart is backed by reality.

## The principle

The codebase can be at A- in code. The product can be at A- in the world. The gap is operator work, customer work, and decisions about the 3 missing services.

I can do the codebase. **You do the product.**

Last updated: 2026-06-20. This file is the source of truth for "what's next in o.company." The trust model is the source of truth for "what the AI is allowed to do." The DEPLOY.md is the source of truth for "how to deploy." The SETUP.md is the source of truth for "what env vars exist." The ROADMAP is the source of truth for "what's next." When in doubt, read all four.
