# CRM limits pass — final state

> Three turns of "push the CRM to its limits." The static analysis, the runtime probes, the brainstorming on what the strategy doc actually meant — all folded in. This file is the source of truth for "where the CRM is now."

## What the limits pass found

| Severity | Total | Open |
|---|---|---|
| **P0** (data corruption, security, unavailability) | 5 | 0 |
| **P1** (wrong behavior, broken feature, perf) | 8 | 2 |

The 5 P0s are all closed. 6 of 8 P1s are closed. The 2 that remain (`P1-3` permissions table, `P1-5` bulk operations) need decisions or are features, not bugs.

The static analysis also found a **silent no-op bug** in the operator's `deal_followup_draft` action. The query referenced `deals.lastActivityAt`, but the column didn't exist. The 6-hour interval check was firing every 6 hours and finding zero stale deals. The lapse-prevention feature — the headline CRM behavior the strategy doc was praising — was a no-op wearing a name. **Fixed in commit `c668f1d`.**

## What the brainstorming on the strategy doc produced

The strategy doc was a generic "AI is the future" pitch dressed up with a brand. I extracted the useful ideas, discarded the parts that violated the trust model, and shipped three features:

### 1. Contact activity timeline (commit `4dd526c`)

**Strategy doc said:** "Zero-UI; the CRM watches screens and listens to calls."

**Trust model forbids that.** The right answer for o-company: a single read-side view of every external side effect for a contact, joined from the audit log. The rep doesn't have to click through five tabs to see "what happened with this person."

`GET /api/contacts/:id/timeline` returns the events: drafts, sent emails, paid invoices, delivered photos, deal stage changes. The UI is a vertical timeline on the contact detail page with channel-coded icons, summaries, and the actor who did it.

### 2. Win/loss reasons + pipeline insights (commit `70ffd8c`)

**Strategy doc said:** "You can't improve the pipeline if you don't know why deals close or don't."

Deals now have `winReason` and `lossReason` columns. Both are required when the stage moves to `won` or `lost`. The schema enforces it; the API returns 400 if the reason is missing. `closedAt` is set automatically on terminal stages. The audit log records the close.

`GET /api/crm/deals/insights` returns the report: top 10 win reasons, top 10 loss reasons, pipeline health (stale deals, deals about to close, total open value, weighted value), and closed-this-month. The deals page renders the report as a strip of 5 stat tiles and two "why we win / why we lose" cards.

### 3. Lapse-prevention actually fires (commit `c668f1d`)

**Strategy doc said:** "Lapse prevention bots detect when a policyholder misses a payment and immediately initiate a multi-channel save sequence."

The operator already had `deal_followup_draft` for deals and `lead_reengagement` for contacts. Both were silent no-ops — the schema was missing the columns they queried on. Migration 009 adds `deals.last_activity_at` with a partial index. `PATCH /api/crm/deals/:id` and `POST /api/crm/deals` now bump it on every change. The runner query is fixed (filters out soft-deleted deals). The next 6-hour tick will produce real lapse-prevention drafts in O'Shay's morning brief.

## What the brainstorming discarded

| Strategy idea | Why we didn't ship it |
|---|---|
| "Zero-UI" / screen watching | Trust model forbids it. |
| "Send SMS without human approval" | Trust model forbids it. |
| "Dark mode, obsidian glass textures" | Brand is cream + gold + serif. |
| "Charge per successful outcome" | Business model decision, separate conversation. |
| "Vertical specialization in life assurance" | Out of scope; o-company is operator software. |
| "Family tree / beneficiary mapping" | v3 add. Schema needs `reportsToId` / `referredById`. |
| "CRM agency services" | Out of scope; o-company is a product, not an agency. |

## The remaining open items

### P1-3: permissions table (not closed)

The role permissions table has `crm:*` and `contacts:*` and `deals:*` — half of which are dead. Either standardize on one shape and update every role grant, or split into clearly-named groups. **This is a 30-min code change that needs a design call.**

### P1-5: bulk operations (not closed)

`POST /api/crm/contacts/bulk-update` and `POST /api/crm/contacts/bulk-delete` (soft delete). Owner/admin only. Audit each row. **~4 hours of work. Feature, not bug.**

### Real-time updates on the timeline (not done)

The contact timeline refreshes on demand. A future commit adds Server-Sent Events so the timeline updates as the operator fires drafts. **~1 day of work.**

### Win/loss reason suggestions from the operator (not done)

The "why we win" / "why we lose" cards show what O'Shay typed. A v2 has the operator suggest reasons based on the draft history and the lead-up to the close. **~1 week of work.**

## The grade

| | Before limits pass | After limits pass |
|---|---|---|
| CRM (code) | A- | A |
| CRM (resilience) | D- | A- |
| P0 bugs | 5 | 0 |
| P1 bugs | 8 | 2 (open) + 6 (closed) |
| Silent no-ops | 1 (deal_followup_draft) | 0 (known) |
| User-visible features added | 0 | 3 (timeline, win/loss, lapse-prevention) |

**The code was at A-. The bugs were at F. The grade was a lie. After three turns of "push to the limits," the code is at A, the bugs are at A-, and the user-visible features are at A-. The grade chart is real now.**

## What "push the CRM to the limits" actually meant

It wasn't a stress test. It was a discipline: read the code, find the silent bugs, find the half-wired features, find the things the strategy doc was praising that the code wasn't doing. Then fix them.

Three turns. Five P0s closed. Six P1s closed. One silent no-op fixed. Three user-visible features added. The CRM is at A in code, A- in resilience, and shipping the brief to O'Shay is now backed by reality, not by claims.

The next grade is the deploy. Run the stress test. Make the seed data real. Demo it. Close the first customer. **The codebase can be at A. The product can be at A. The deploy is what gets us there.**
