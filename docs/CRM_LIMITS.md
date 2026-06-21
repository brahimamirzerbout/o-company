# CRM limits pass — bugs, gaps, and race conditions

> Generated 2026-06-20. A static read of `apps/api/src/routes/crm.ts` and adjacent files, plus a stress test that probes the surface. Each issue has a severity, a file:line, a description, and a proposed fix.

## Severity legend

- **P0** — data corruption, security boundary breach, or service unavailability under realistic load.
- **P1** — wrong behavior, broken feature, or significant perf cost.
- **P2** — code smell, missing edge case, or inconsistency.
- **P3** — polish, naming, documentation.

---

## P0 issues (must fix before production)

### P0-1: Company cursor pagination filters out companies with logos

**File:** `apps/api/src/routes/crm.ts:34`
**Bug:** The cursor branch of `GET_companies` reads:

```ts
const where = cursor
  ? and(eq(companies.orgId, ctx.org.id), isNull(companies.logo as never), lt(companies.id, cursor))
  : eq(companies.orgId, ctx.org.id);
```

The `isNull(companies.logo as never)` is a copy-paste bug. The `as never` is a TypeScript escape hatch that bypasses the type checker. The filter says "return only companies with null logos." On the first page (no cursor), all companies are returned. On every subsequent page, only companies with null logos are returned. **A user paging through companies will see companies on page 1, lose most of them on page 2, and not know why.**

**Fix:** Delete the `isNull(companies.logo as never)` clause. The cursor branch should be `and(eq(companies.orgId, ctx.org.id), lt(companies.id, cursor))` — same as the contacts cursor pattern.

**Reproduction:**
1. Create 5 companies. 4 with a logo URL, 1 without.
2. GET `/api/crm/companies?limit=2` — returns 2 (any 2).
3. GET `/api/crm/companies?limit=2&cursor=<id from step 2>` — returns 0 or 1 (only the one without a logo).

**Time to fix:** 30 seconds.

### P0-2: Deal deletion is hard-delete with no audit trail

**File:** `apps/api/src/routes/crm.ts:227` (`DELETE_deal`)
**Bug:** `DELETE_deal` does `db.delete(deals).where(...)` — a hard delete. The contact delete (`DELETE_contact`) sets `deletedAt` — a soft delete. The two are inconsistent, and the deal delete has no `audit_events` entry.

If a deal is referenced by an invoice, an event log, or the operator's memory, the foreign key either errors or cascades. Either way, **the data is gone and there's no record that it was deleted or why.**

**Fix:** Add a soft-delete to deals (mirroring contacts). Add an audit_event entry on every delete. Either route needs a `?hard=true` flag for true deletion, with owner-only permission.

**Reproduction:**
1. Create a deal. Note the id.
2. Create an invoice that references the deal.
3. DELETE the deal. The invoice is now orphaned or the delete errors.
4. There's no audit log entry for the deletion. The user has no record of when, why, or by whom.

**Time to fix:** 15 minutes (audit hook) + 30 minutes (soft-delete column migration).

### P0-3: Cross-org data corruption on deal create

**File:** `apps/api/src/routes/crm.ts:198` (`POST_deals`)
**Bug:** The `contactId` is validated as a uuid, but **is not checked to belong to the same org as the requester.** A user in org A can create a deal in org A that points at a contact in org B. The deal is in org A's data, but the contactId references data in org B. **This is a data integrity violation and a privacy issue.**

**Fix:** Add a check: `const [c] = await db.select().from(contacts).where(and(eq(contacts.id, parsed.data.contactId), eq(contacts.orgId, ctx.org.id))); if (!c) throw errors.notFound("Contact");`

Same check on `companyId` if present.

**Reproduction:**
1. Log in as a user in org A.
2. Manually craft a POST `/api/crm/deals` with `contactId` of a known contact in org B.
3. The deal is created. The contact detail is not exposed via the API (org_id filter works on GET), but the deal has a dangling reference to another org's contact.

**Time to fix:** 5 minutes.

### P0-4: Contact search is broken past page 1

**File:** `apps/api/src/routes/crm.ts:117` (`GET_contacts` search filter)
**Bug:** The `?q=...` search is done in memory AFTER the SQL query, on the page slice:

```ts
const list = await db.select().from(contacts).where(where).orderBy(...).limit(limit + 1);
const filtered = search
  ? list.filter(c => `${c.firstName} ${c.lastName} ${c.email ?? ""}`.toLowerCase().includes(search.toLowerCase()))
  : list;
```

This means:
1. The search only sees the current page (max 200 items).
2. If the search matches a contact on page 2+, the user never finds them.
3. The search doesn't search company name, tags, or custom fields.
4. The search doesn't tokenize (multi-word search like `"marcus reyes"` searches for the literal string, not for "marcus" OR "reyes").

**Fix:** Push the search into SQL using Postgres `ILIKE` or a real full-text search. Drizzle supports `ilike` and the schema can add a `tsvector` column. For v1, a simple `OR` of `ILIKE` clauses on firstName, lastName, email, and company is good enough. A real full-text index is a v2.

**Reproduction:**
1. Create 250 contacts. 50 of them have "marcus" in the first name.
2. GET `/api/crm/contacts?q=marcus&limit=50` — returns at most 50 of the marcus contacts, only if they're on the first page.
3. The other marcus contacts are not visible.

**Time to fix:** 1 hour (push to SQL, test, write the right clause).

### P0-5: Contact cursor pagination has a sort/cursor mismatch

**File:** `apps/api/src/routes/crm.ts:113` (`GET_contacts`)
**Bug:** The cursor clause uses `lt(contacts.id, cursor)`, but the ORDER BY uses `desc(contacts.createdAt)`. The cursor is on `id`, the sort is on `createdAt`. If two contacts are inserted in the same millisecond, the order is unstable. The cursor then skips rows or duplicates them.

**Fix:** Either sort by `id` (which is monotonic if you use a sortable id like ULID or KSUID — the schema uses `text` for ids, so this needs to be checked), or use a compound cursor `(createdAt, id)` that is unambiguous.

For a v1 quick fix, sort by `id DESC`. The contact id is `ct_<uuid>` per the lead form route, so lexicographic ordering on `id` is random. The right fix is to switch to a ULID/KSUID id pattern, but that's a bigger change. The fast fix is to use `createdAt` and `id` in the cursor and add a uniqueness tie-breaker.

**Reproduction:**
1. Bulk-create 1000 contacts (the `crm-bulk-create` stress test does this).
2. Page through with `?limit=50`.
3. If any two contacts have the same `createdAt`, you'll see either duplicates (same row twice) or skips (a row never appears).

**Time to fix:** 30 minutes.

---

## P1 issues (should fix before scaling)

### P1-1: Deals endpoint has no pagination

**File:** `apps/api/src/routes/crm.ts:184` (`GET_deals`)
**Bug:** The deals list returns **every deal in the org** in one response. No `limit`, no `cursor`, no `offset`. With 10k deals, this is a 10MB JSON payload. The contacts and companies endpoints paginate; deals does not.

**Fix:** Add the same `limit` + `cursor` pattern as `GET_contacts`. Cap at 200 per page.

**Time to fix:** 30 minutes.

### P1-2: CRM endpoints are not rate-limited

**File:** `apps/api/src/routes/crm.ts` (all routes)
**Bug:** The login, register, brief-read, and photo-create endpoints are rate-limited. The CRM endpoints are not. A user with `contacts:write` can hammer the API with no throttle. The stress test `crmBulkCreateScenario` would create 1k contacts in seconds; in production, an attacker with a stolen session token could exfiltrate the entire contact list.

**Fix:** Add a `checkRateLimit` call at the top of each CRM route. Sensible defaults: 60/min/user for reads, 30/min/user for writes, 10/min/user for deletes.

**Time to fix:** 15 minutes (just the imports + calls).

### P1-3: Permissions table is half-defined

**File:** `packages/auth/src/require-role.ts`
**Bug:** The role table has `crm:read`, `crm:write`, `crm:delete` permissions. The CRM routes check `contacts:read`, `contacts:write`, `contacts:delete` — not `crm:*`. The `crm:*` permissions are dead code; they exist in the table but no route uses them. Meanwhile, the deal routes check `deals:read` / `deals:write` / `deals:delete` — also dead, because no role grants them.

The practical effect: today, the `operator` role has `crm:read` but not `contacts:read` (looking at the table, the manager role has `contacts:read` but the operator role doesn't — meaning the operator can't read contacts, which is wrong for a "briefing" tool).

**Fix:** Either:
- (a) Use `crm:*` for the CRM routes and update the role table to grant them, or
- (b) Delete the `crm:*` permissions from the table and add `contacts:read` to the operator role.

Pick one. Pick it once. Update the role grants.

**Time to fix:** 30 minutes (and a migration of the role assignments).

### P1-4: Deal stage progression is unconstrained

**File:** `apps/api/src/routes/crm.ts:218` (`PATCH_deal`)
**Bug:** A deal at stage "won" can be patched back to "lead." A deal at "lost" can be patched to "negotiation." There's no state machine.

Effects:
- The operator's "deal closeout" action fires when a deal moves to "won." If the deal is then moved back to "lead," the operator's "deal_reopen" action does not exist, and the audit trail shows a forward move followed by a backward move with no explanation.
- The pipeline value calculation (sum of `amountCents * probability` for open deals) is unstable.

**Fix:** Add a state-machine guard. Define a transition map (e.g., `lead → qualified → proposal → negotiation → won`, with `lost` reachable from any open state but not from `won` or `lost` themselves). Reject invalid transitions with a 400.

**Time to fix:** 2 hours (the state machine + tests).

### P1-5: No bulk operations

**File:** all CRM routes
**Bug:** The contacts list endpoint paginates 50 at a time. There's no bulk update, no bulk delete, no bulk export. Operations like "reassign 200 contacts to a new owner" require 200 individual PATCH calls. A real CRM user (someone with 10k contacts) cannot operate on more than a page at a time.

**Fix:** Add `POST /api/crm/contacts/bulk-update` (body: `{ ids: [], updates: {} }`) and `POST /api/crm/contacts/bulk-delete` (soft delete). Owner/admin only. Audit each row. Rate-limited to 1/min/user.

**Time to fix:** 4 hours (the endpoint + tests + audit hooks).

### P1-6: No export endpoint

**File:** all CRM routes
**Bug:** There's no way to export a contact list, a deal pipeline, or an invoice history. GDPR Article 20 (data portability) requires "the right to receive personal data in a structured, commonly used and machine-readable format." The `GET /api/people/:id/export` endpoint exists for people; there's no equivalent for contacts, companies, or deals.

**Fix:** Add `GET /api/crm/contacts/export.csv` (or `.json`). Same for deals. Streams from the DB so it works on 100k+ rows.

**Time to fix:** 2 hours (CSV streaming + tests).

### P1-7: The `q` search is case-insensitive but doesn't tokenize

**File:** `apps/api/src/routes/crm.ts:117`
**Bug:** A search for `"Marcus Reyes"` (with a space) does not find a contact named "Marcus" or "Reyes" — it searches for the literal string "marcus reyes" concatenated. Most users expect tokenization: a search for "reyes marcus" should also work, and a search for "reyes" should find "Marcus Reyes."

**Fix:** Split the query on whitespace, AND each token, use `ILIKE %token%` on each searchable column.

**Time to fix:** 30 minutes.

### P1-8: `PATCH_company` accepts `address` as a string but doesn't validate it

**File:** `apps/api/src/routes/crm.ts:19` (companySchema) and `apps/api/src/routes/crm.ts:62` (PATCH_company)
**Bug:** `address` is `z.string().optional()` — any string is accepted. The schema has no length cap, no shape check, no validation that it's actually an address. A user could store a 10MB address string. The contact has a `customFields` JSONB for arbitrary data; the address should probably be a structured object (line1, line2, city, region, postal, country) like Stripe's address format.

**Fix:** Either:
- (a) Cap `address` at 500 chars, or
- (b) Restructure to a typed object with the standard fields.

(a) is a 5-minute fix. (b) is a 1-day fix.

---

## P2 issues (cleanup)

### P2-1: The deals list sorts by `updatedAt` but contacts/companies sort by `createdAt`

**File:** `apps/api/src/routes/crm.ts`
**Bug:** Inconsistent sort order across the CRM. Users see "newest contact" on one page and "most recently updated deal" on another. The pipeline view wants "most recently updated deal" (so active deals bubble up). The contact list wants "newest contact" (so freshly imported contacts show up first). Both are valid, but the inconsistency should be a deliberate choice, not an accident.

**Fix:** Document the choice in the API docs (which don't exist yet — see P3-1). Or align to "updatedAt" everywhere.

### P2-2: The `customFields` JSONB column has no schema

**File:** `apps/api/src/routes/crm.ts:101`
**Bug:** `customFields: z.record(z.unknown()).default({})` — any value. A user could store a deeply nested 1MB object. There's no per-org schema for custom fields.

**Fix:** Add a per-org `customFieldDefs` table. The schema for `customFields` is derived from the org's defs. The validator runs at write time.

### P2-3: No version number on the CRM API

**File:** all routes
**Bug:** The routes are at `/api/crm/...` with no version prefix. When the schema changes (e.g., `customFields` becomes typed, `address` becomes structured), there's no way to support both old and new clients during the migration.

**Fix:** Rename to `/api/v1/crm/...` and version the API going forward. (Migration cost: 1 day, including updating the internal app's API client.)

### P2-4: The `pathLast` helper is fragile

**File:** `apps/api/src/routes/crm.ts:240`
**Bug:** `pathLast` does `req.nextUrl.pathname.split("/").pop()` — this assumes the id is always the last path segment and there's no trailing slash. If a future route is `/api/crm/contacts/:id/notes`, this helper will return "notes", not the id.

**Fix:** Use the proper `params.id` that Next.js provides. The catch-all `[...path]/route.ts` should pass the id explicitly.

### P2-5: The contact id is `ct_<uuid>` per the lead form, but `defaultRandom()` per the CRM route

**File:** `apps/api/src/routes/crm.ts:131` vs `apps/api/src/routes/lead-forms.ts:73`
**Bug:** The lead form generates `ct_<uuid>` for new contacts. The CRM `POST /api/crm/contacts` doesn't — it uses the DB default. If the DB default is `defaultRandom()` (a Postgres uuid), the id is a plain uuid, no `ct_` prefix. Now you have two id formats in the same table.

**Fix:** Standardize. Either always use `ct_<uuid>` (set the default in the schema) or always use the raw uuid (drop the prefix in the lead form).

### P2-6: The `default("lead")` on `status` and `lifecycle` is misleading

**File:** `apps/api/src/routes/crm.ts:96, 97`
**Bug:** A new contact's status is "lead" and lifecycle is "lead." But the schema also has `lifecycle: "subscriber"` and `status: "active"`. The defaults may not match the user's intent. A user creating a contact from a "this is a paying customer I just imported" CSV import will end up with status="lead" and have to update it.

**Fix:** Accept `status` and `lifecycle` from the request body, default to "lead" only if not provided. (This is what the code does, actually — `default("lead")` in zod is the fallback if the field is missing. So this is correct. The P2 is that the documentation doesn't say so.)

### P2-7: The schema doesn't have a `notes` field on contacts

**File:** `apps/api/src/routes/crm.ts:89-105`
**Bug:** There's a `customFields: z.record(z.unknown())` for arbitrary data, but no first-class `notes` field. The brief review screen in `apps/app` allows O'Shay to add free-form notes to a contact, and the schema has no place to store them. The notes probably live in `customFields.notes` or in the operator's draft text, but neither is the right answer for a persistent note that's surfaced in the contact detail view.

**Fix:** Add `notes: z.string().max(10_000).optional()` to the contact schema. The brief review screen writes to it. The contact detail view shows it.

---

## P3 issues (polish)

### P3-1: No API documentation
**File:** missing
**Bug:** The API has no OpenAPI spec, no Swagger UI, no README per route. New developers have to read source code to figure out what's possible.

**Fix:** Generate an OpenAPI spec from the zod schemas (zod-to-openapi exists). Host it at `/api/docs`. ~1 day of work.

### P3-2: The error response shape isn't documented
**File:** all routes
**Bug:** Errors come back as `{ error: { code, message, ...details } }` (per the `@o/errors` package). The shape is consistent but undocumented.

**Fix:** Same as P3-1. The OpenAPI spec documents both success and error shapes.

### P3-3: No request-id propagation
**File:** all routes
**Bug:** When something goes wrong, the support engineer has no way to correlate the user's report with the server logs. The middleware could add a request-id header (and a logger field) but doesn't.

**Fix:** Add a `withRequestId` middleware that generates a uuid, sets it on `X-Request-Id`, and includes it in every log line. ~30 min.

### P3-4: The CRM has no "owner" field on the contact
**File:** `apps/api/src/routes/crm.ts:131` (POST_contacts)
**Bug:** `POST_contacts` sets `ownerId: ctx.person.id` — good. But there's no PATCH endpoint to reassign a contact to a different owner. The deal has `ownerId` but no reassignment endpoint either. The "round-robin" assignment that the operator's `deal_followup` action probably wants to do is impossible from the API.

**Fix:** Add `PATCH /api/crm/contacts/:id/owner` and `PATCH /api/crm/deals/:id/owner`. Owner/admin only. ~30 min.

---

## What was checked

| Concern | Status |
|---|---|
| SQL injection | OK — Drizzle uses parameterized queries. |
| Auth boundary (org_id filter) | OK on reads. **BROKEN on deal create** (P0-3). |
| Rate limiting | OK on auth/brief/photo. **MISSING on CRM** (P1-2). |
| Pagination | OK on contacts/companies. **MISSING on deals** (P1-1). **BROKEN cursor on contacts** (P0-5). **BUG on companies** (P0-1). |
| Soft delete | OK on contacts. **MISSING on deals** (P0-2). |
| State machine | **MISSING on deals** (P1-4). |
| Input validation | OK — zod is everywhere. |
| Permissions | **HALF-DEFINED** (P1-3). |
| Bulk operations | **MISSING** (P1-5). |
| Export | **MISSING for GDPR Article 20 on contacts/deals** (P1-6). |
| Search | **BROKEN past page 1** (P0-4). **Doesn't tokenize** (P1-7). |
| Audit trail | **MISSING on deal delete** (P0-2). |
| Concurrency | Last writer wins on contact update. No optimistic locking. Not a P0 today, but a P1 when two O'Shays start using the system. |
| Backups | Operator concern, not a code issue. |
| Disaster recovery | Operator concern, not a code issue. |

---

## What was NOT checked (out of scope for this pass)

- Performance benchmarks against a real database. The `crm-bulk-create` stress test exists; running it requires a deployed environment. Numbers will be added once the dev env is up.
- Real-world auth integration. The test bypass header (`STRESS_TEST_BYPASS`) skips the auth check. A real auth probe would test what happens with an expired session, a revoked session, a session for a deleted user.
- Concurrent updates with optimistic locking. The schema doesn't have a `version` column on contacts/deals. A future test would simulate two clients updating the same contact at the same millisecond and verify which one wins.
- Migration safety. The schema has 6 migrations. The `migrate.ts` runner uses raw SQL files. There's no automatic down-migration. A schema change that needs to be rolled back requires a new migration, not a revert. This is the standard tradeoff but should be documented.

---

## Total work to close all P0 + P1

| Issue | Time | Severity |
|---|---|---|
| P0-1: company cursor filter | 30s | P0 |
| P0-2: deal soft delete + audit | 45m | P0 |
| P0-3: deal create org check | 5m | P0 |
| P0-4: contact search SQL push | 1h | P0 |
| P0-5: contact cursor sort fix | 30m | P0 |
| P1-1: deals pagination | 30m | P1 |
| P1-2: CRM rate limits | 15m | P1 |
| P1-3: permissions cleanup | 30m | P1 |
| P1-4: deal state machine | 2h | P1 |
| P1-5: bulk operations | 4h | P1 |
| P1-6: export endpoint | 2h | P1 |
| P1-7: search tokenization | 30m | P1 |
| P1-8: address validation | 5m (cap) or 1d (struct) | P1 |
| **Total fast fixes (P0 only)** | **~3 hours** | |
| **Total all P0 + P1** | **~12 hours** | |

Three hours of focused work closes all five P0 issues. Twelve hours closes P0 and P1. None of this requires a deploy, a database, or operator work — it's all in the codebase. **The CRM, today, is at A- code with five P0 bugs hidden inside it. The grade is right, the surface is wrong, and "push the CRM to the limits" found the surface.**

---

## What I want to be honest about

I haven't run the stress test against a real API. The static analysis is from reading the source. The bugs are real (I pointed at file:line for each one), but I haven't proven them by reproducing the failures. The next move is:

1. **Start the dev environment** (`docker-compose up -d` for Postgres, `pnpm dev` for the API).
2. **Run the stress test** (`pnpm --filter @o/stress crm-limits`).
3. **Confirm the static analysis findings** with runtime evidence.
4. **Ship the P0 fixes** in 3 hours of focused work.
5. **Re-run the stress test.** If the failures are gone, the P0s are closed.
6. **Ship the P1 fixes** in another 9 hours.

That's the path. The report is the map. The stress test is the verification. The fixes are the work.

Tell me which order to do it in. I'd start with the P0s, because those are the silent data bugs that the user won't report until they've already been hit.
