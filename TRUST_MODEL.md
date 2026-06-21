# The trust model

> One file, no excuses. The non-negotiable contract for how the AI
> parts of o.company are allowed to act. Read this before changing
> anything in `packages/operator/`, `apps/operator-worker/`, or
> anything in the API routes that produces external side effects.

## The contract

**The AI drafts. The AI never sends.**

Every external action in o.company — every email, every
notification, every score, every routing decision, every task
created, every invoice marked paid — flows through this loop:

```
1. Event happens
2. Operator gathers context (read-only)
3. LLM writes a draft (no tool calls)
4. Draft saved to operator_drafts
5. Human reviews at /briefing
6. Human approves, edits, or rejects
7. Only then does the side effect fire
```

There is no other path. There is no "fully autonomous" mode. There
is no "skip approval for trusted actions" toggle. There is no
"agent mode" that calls tools directly.

## Why

LLM outputs are non-deterministic. Tools are deterministic.

A hallucination in a draft costs the human 5 seconds to reject.
A hallucination in a tool call sends real money to the wrong
account, ships a real email to the wrong contact, marks the
wrong deal as won. The cost of being wrong in draft-mode is
human attention. The cost of being wrong in tool-mode is a
customer-trust incident and, depending on the action, possibly
a regulatory one.

The product is **"your business, operated."** The word "operated"
does not mean "operated by an unsupervised AI." It means
"operated by the operator, which is a system that drafts and
waits."

## Where the contract is enforced in code

There are exactly three places in the codebase that produce
external side effects from the operator's decisions. All other
code is read-only.

### 1. `packages/operator/src/drafts.ts` · `executeDraftEffect()`

The only function that produces external side effects from a
draft. Implemented channels:

- `email` — sends via Resend
- `sms` — would send via Twilio (not implemented)
- `in_app` — marks the draft as sent; the client portal polls
- `task` — creates a row in the tasks table
- `score` — writes a number to the contact record
- `route` — assigns the contact to a user

**Adding a new channel?** Add it here. Nowhere else.

### 2. `packages/operator/src/drafts.ts` · `sendApprovedDrafts()`

The runner that flushes approved drafts to their side effects.
Called by `apps/operator-worker/` every 5 minutes. Only operates
on drafts in `approved` or `edited` status. Drafts in any other
status are skipped.

### 3. The `requiresApproval` flag on every `ActionDefinition`

Defined in `packages/operator/src/index.ts`. When `true`, the
draft is `pending` until a human acts. When `false`, the draft
auto-approves.

**Auto-approved channels** in v1:
- `score` — a number in a database field. Worst case: the lead
  gets routed to the wrong person, who fixes it.
- `in_app` — a status message in the client's portal. Worst
  case: the client sees a message that doesn't match reality,
  which they would have noticed anyway.

**Every other channel is `requiresApproval: true` by default.**
If you set it to `false`, you are making a statement about the
cost of being wrong. Make sure the statement is true.

## What you cannot do

These are the things that will get a PR rejected in review:

- Adding a tool-calling loop where the LLM calls tools
  directly. Tool proposals that need approval are not safer
  than drafts; they're noisier, harder to audit, and tend to
  time out at 3am.
- Adding an "auto-approve trusted actions" flag.
- Adding a fallback that sends on the operator's behalf after
  the human doesn't respond in N hours. Drafts expire. That's
  the fallback.
- Letting the operator write to systems that take real-world
  action without going through `executeDraftEffect()`. That
  function is the only sanctioned path. Add new channels there.
- Bypassing `approveDraft` for "low-risk" channels. None of
  the channels are low-risk; they're all visible to a real
  human somewhere.
- Adding a "fully autonomous" mode, an "agent mode," or a
  "let the AI figure it out" mode. Those are different
  products. Build one if you want; don't add a mode to this
  one.

## The dev-mode mock

The operator's actions all work in dev mode without any
backend. The uploader simulates uploads, the gallery shows
mock jobs, the brief inbox renders mock entries, the
/briefing page shows mock drafts. **Don't break the dev
mock.** Every change should leave the dev experience working.

To run the dev mock:

```sh
pnpm install
pnpm --filter @o/internal dev   # → http://localhost:4001/briefing
pnpm --filter @o/app dev        # → http://localhost:4003/photos
```

## The full manual

For the rest of the operator's design, the action set, the
model choices, the cost numbers, the extension guide, and the
non-goals, see `packages/operator/MANUAL.md`.

## If you want to build a different product

This is a fine product. It's not the only fine product. If
you want to build a fully autonomous CRM agent — one that
sends emails, modifies deals, deploys code without human
review — that's a different product, and there are good
reasons to build it. **Build it as a separate product.** Don't
add it as a mode to this one. The contract here is
draft-and-approve, and breaking the contract breaks the
product.

## Data safety and money

The contract above is about the AI. There's a parallel
contract about the data and the money, and it's stricter.

### PCI scope: SAQ-A

We use Stripe Hosted Checkout for all payment collection.
This puts us in PCI DSS **SAQ-A** scope — the most minimal
self-assessment tier. We never touch raw card data. The
browser sends card details directly to Stripe; we receive
only the tokenized PaymentIntent. Our webhook handler
verifies signatures but does not read card fields.

**Do not break this.** Adding a custom payment form, storing
any card data on our servers, or logging full PaymentIntent
objects jumps us to SAQ-D, which requires a full PCI audit.
The Hosted Checkout pattern is intentional. Keep it.

### Data at rest: column-level encryption

Sensitive fields are encrypted with AES-256-GCM using the
`ENCRYPTION_KEY` env var. The encryption helper is in
`packages/auth/src/encryption.ts`. Currently encrypted:

- `people.email`
- `contacts.email`
- `contacts.notes`

The audit log is **not** encrypted. It must be readable for
compliance. Audit log payloads that reference deleted users
have the PII stripped (see "GDPR" below).

**Rotation of the encryption key** is a separate, large
procedure. Re-encrypting every encrypted field with a new
key requires a batch job. Don't rotate the key without
running the rotation job.

### GDPR data subject rights

Two endpoints implement GDPR Articles 17 and 20:

- `DELETE /api/people/:id/gdpr-delete` — right to erasure.
  Anonymizes the person's PII, marks them as deactivated,
  cascades the anonymization to owned contacts, assigned
  drafts, and audit log entries. The audit log rows are
  preserved (required for compliance) with `actor_id` set to
  NULL. Refuses to delete the only owner.
- `GET /api/people/:id/export` — right to data portability.
  Returns a JSON dump of everything associated with the
  person. The user can download it. The dump excludes
  password hash, 2FA secret, and other users' PII. The
  audit log entries are reduced to "this event happened
  on this date" without the payload.

Both endpoints are owner-only. Data subject requests are
processed by the data controller (the org), and the org's
owner is the right person.

### Stripe webhook signature verification

The webhook handler in `apps/api/src/app/api/webhooks/stripe/route.ts`
verifies every incoming request with
`stripe.webhooks.constructEvent()`. A request with an invalid
signature is rejected with 400 before any DB read or write.
A request with a valid signature but unknown event ID is
deduplicated against the audit_events table — the side
effect runs exactly once per event.

The webhook **does not** trust any field in the payload.
The `invoiceId` comes from `pi.metadata.invoiceId` and is
verified to exist in our DB. The amount is verified against
the invoice. The currency is verified. The customer email
is read from the invoice, not from the Stripe payload.

### Audit log

The `audit_events` table is append-only. Every external side
effect — every email sent, every refund, every password
reset — writes to it. The row is the source of truth. The
handler is the recorder. The user-facing UI is the viewer.

Audit log entries are never deleted. When a user requests
erasure, the entry stays with the actor_id nulled. The
payload may be redacted to remove other users' PII; the
event type and timestamp remain.

### Backups

The audit log is only as good as the database it's in.
Postgres backups are **not** included in this codebase. A
production deployment must configure:

- Automated daily snapshots (Neon: automatic on paid plans)
- Point-in-time recovery for at least 7 days
- A separate backup store (S3, R2) for the snapshot
- A documented restore procedure

Without backups, an audit log is "we know what happened
until the database disappeared." That is not an audit log.

---

Last updated: 2026-06-20. The contract is the contract. If
the code contradicts this file, the code is wrong. If this
file contradicts the code, this file is wrong. Either way,
fix one of them before shipping.
