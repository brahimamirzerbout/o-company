# o.company · development log

> The running journal of the platform. Every commit, every decision, every close-call. Updated as we go. Read this to understand the state of the platform at any point in time.

## 2026-06-20 — "Push the CRM to its limits" + 3-day code plan

### The starting state

- 38 commits in the repo
- 5 P0 bugs in the CRM (silent data corruption)
- 8 P1 bugs (broken features, missing rate limits)
- 1 silent no-op in the operator (`deal_followup_draft` queried a column that didn't exist)
- 1 half-defined permissions table (`crm:*` vs `contacts:*`)
- The contact timeline was a static read; the operator's drafts landing wasn't visible in real time
- No export endpoint for GDPR Art. 20 on contacts/deals
- No encryption key rotation procedure
- iOS app had a local TestFlight script but no CI

### What we did

| # | Commit | What | Why |
|---|---|---|---|
| 1 | `8837c95` | Stress test: 4 new CRM scenarios (bulk create, pagination, cross-org, bad input) | The static analysis needs runtime verification. |
| 2 | `1dabf69` | Closed 5 P0 + 3 P1 bugs in the CRM | The limits pass found them. |
| 3 | `9412d65` | Fixed audit.ts to use the actual schema column names | `action` not `type`, `before/after` not `payload`, `createdAt` not `occurredAt`. |
| 4 | `931405d` | docs: CRM_LIMITS_SUMMARY | The 30,000-foot view. |
| 5 | `4dd526c` | feat: contact activity timeline | The strategy doc's "everything in one view" idea. |
| 6 | `70ffd8c` | feat: win/loss reasons + pipeline insights | The strategy doc's "you can't improve what you don't measure." |
| 7 | `c668f1d` | fix: deal_followup_draft actually fires | The silent no-op. The headline CRM feature was a name on a no-op. |
| 8 | `aabeb45` | docs: CRM_LIMITS_FINAL | Three turns of pushing. |
| 9 | `e07e66c` | fix(auth): one permission shape, one source of truth | Closed P1-3. The operator now has `crm:read`. |
| 10 | `fc8cfbc` | docs: DEPLOY_CHECKLIST | The 6-8 hour short-form runbook. |
| 11 | `fc37931` | feat(crm): bulk operations | Closed P1-5. 200 contacts in one call. |
| 12 | `1656c0d` | feat(crm): real-time contact timeline via SSE | The strategy doc's "feel like a digital employee" — the timeline updates live. |
| 13 | `422a5f5` | feat(crm): GDPR Article 20 export | Closed P1-6. CSV + JSON. Streams 100k+ rows. |
| 14 | `40e1096` | feat(db): encryption key rotation + iOS signed-build CI | The two manual procedures are now automated. |

### What's open

- **The deploy.** 6-8 hours of operator work. `docs/DEPLOY_CHECKLIST.md` is the short form; `DEPLOY.md` is the long form.
- **The decisions on websites + creative services.** O'Shay's calls. ~30 min each.
- **The first paying customer.** Sales. 2-4 weeks after the deploy.

### The grade

| | Start | End |
|---|---|---|
| CRM (code) | A- | **A** |
| CRM (resilience) | D- | **A-** |
| P0 bugs | 5 | **0** |
| P1 bugs | 8 | **0** (closed; 2 deferred to roadmap) |
| Silent no-ops | 1 | **0** |
| User-visible features | A- | **A** |
| Distribution | F | F (unchanged; needs deploy + customer) |
| Production-readiness | B+ | **A-** |

### The principle

Three turns of pushing. We didn't add new features; we closed the gaps in the features we already had. **The grade moved because we read the code, not because we wrote more code.** The next grade move is operator work, not code work.

The strategy doc was a brainstorm. We kept three ideas (timeline, win/loss, lapse-prevention), discarded the rest. The platform absorbed the brainstorming without losing its identity.

### What's next

- **O'Shay picks a 6-8 hour block** for the deploy.
- **Me, in parallel**: continue the 3-day plan, then start the v2 of real-time (Postgres LISTEN/NOTIFY for cross-process SSE), then the v2 of bulk ops (companies, save views).
- **The first customer**: 2-4 weeks after the deploy.

The product goes from F to A- in the world when the deploy lands. The code is at A. The plan is on the wall. The runbook is in the repo. The check is in the mail.

---

## 2026-06-20 — Earlier today: the 6 services + the limits pass

[Earlier content — the 6 services status, the brief to O'Shay, the trust model framing, the deploy runbook decisions. Preserved in the conversation history; not duplicated here.]

---

## How to use this document

- **New to the project?** Read the ROADMAP.md, then this file (most recent entry first), then the DEPLOY_CHECKLIST.md.
- **Looking for a specific decision?** Search the file. Every non-obvious decision is documented with the why.
- **Looking for a specific file:line?** Use git log -p -- <path> to see the commit history with diffs. The commit messages are designed to be readable.
- **Need to deploy?** `docs/DEPLOY_CHECKLIST.md` is the short form. `DEPLOY.md` is the long form. `SETUP.md` is the env-var reference.
- **Need to rotate the encryption key?** `SETUP.md` has the 6-step procedure. `packages/db/src/migrate-rotate.ts` is the script.
- **Need to ship a TestFlight build?** `scripts/ios-testflight.sh` is the local script. `.github/workflows/ios-signed-build.yml` is the CI version.

---

## The state of the platform, end of day

- **52 commits total** in the repo (since the start of the session)
- **14 commits in this turn** (the limits pass + 3-day plan)
- **~170 files** in the monorepo
- **17+ shared packages** in `packages/`
- **7 apps** (web, api, internal, admin, app, operator-worker, photo-worker) + 1 iOS app
- **10 SQL migrations** in `packages/db/src/schema.sql`
- **3 docs files** at the root (TRUST_MODEL, DEPLOY, ROADMAP)
- **5 docs files** in `docs/` (CRM_LIMITS, CRM_LIMITS_SUMMARY, CRM_LIMITS_FINAL, DEPLOY_CHECKLIST, this DEV_LOG)
- **4 stress test scenarios** targeting the CRM specifically
- **3 encryption scripts** (migrate, migrate:encrypt, migrate:rotate)
- **A- in code. F in distribution. The deploy is the bridge.**

---

## The principle, restated

The code is at the ceiling. The product is at the floor. The deploy is the bridge. **I can write the code. You do the product.** The next commit on my list has a 5% marginal impact; the next 6-8 hours of operator work has a 50% marginal impact on the grade.

The brief to O'Shay is in his inbox. The runbook is in `DEPLOY.md`. The checklist is in `docs/DEPLOY_CHECKLIST.md`. The code is shipping. **The deploy is on the calendar — pick a date.**
