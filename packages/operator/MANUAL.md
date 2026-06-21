# The operator · manual

> The system that drafts everything your business needs and waits for you to say go.

This is the manual for the operator. Read it before you change it. Read it
again after you've changed it. Read it especially before you "improve" the
AI into something that acts without approval.

## 1. The trust model

**The operator drafts. The operator never sends.** This is the entire
contract. Every external action in this system — every email, every
notification, every score that gets applied, every lead that gets routed —
goes through this loop:

```
1. Event happens (deal goes stale, lead comes in, invoice goes overdue)
2. Operator gathers context
3. LLM writes a draft
4. Draft is saved to operator_drafts
5. Human reviews at /briefing
6. Human approves, edits, rejects, or skips
7. Only then does the side effect fire
```

There is no other path. There will not be a "fully autonomous" mode, an
"agent mode," a "let the AI figure it out" mode, or a "skip approval for
trusted actions" toggle. Those products exist; this is not one of them.

**Why.** LLM outputs are non-deterministic. Tools are deterministic. A
hallucination in a draft costs the human 5 seconds to reject. A
hallucination in a tool call sends real money to the wrong account, ships
a real email to the wrong contact, marks the wrong deal as won. The cost
of being wrong in draft-mode is human attention. The cost of being wrong
in tool-mode is a customer-trust incident and, depending on the action,
possibly a regulatory one. We pick the mode where the cost of being wrong
is bounded.

**Specifically, do not:**

- Add a tool-calling loop where the LLM calls tools directly. Tool
  proposals that need approval are not safer than drafts — they're
  noisier, harder to audit, and tend to time out at 3am when no human
  is watching.
- Add an "auto-approve trusted actions" flag. The classification of
  "trusted" is itself a thing the LLM is bad at.
- Add a fallback that sends on the operator's behalf after the human
  doesn't respond in N hours. Drafts expire. That's the fallback.
- Let the operator write to systems that take real-world action without
  going through `executeDraftEffect()` in `packages/operator/src/drafts.ts`.
  That function is the only sanctioned path. Add new channels there.
- Bypass `approveDraft` for "low-risk" channels. None of the channels
  are low-risk; they're all visible to a real human somewhere.

If you're tempted to do any of these, the answer is: build a different
product, not a different mode of this one. This product is draft-and-approve.

## 2. What the operator is

The operator is a system that watches a business's data and prepares a
small number of high-quality drafts every day. It is modeled on what a
good chief of staff does for the owner of a small business:

- Reads the day's state (pipeline, revenue, recent activity, what's stale)
- Writes a short brief: 1-5 things that need attention today, with the
  reasoning, the suggested action, and the context
- Drafts follow-ups, reminders, and notifications the owner would
  otherwise write by hand
- Surfaces them in a single review queue
- Does not send anything until the owner says so
- Learns from the owner's accept/reject/edit decisions over time

The headline is **drafts**, not **autonomy**. The product is "your
business, operated" — operated by the operator, which is a system that
drafts and waits. The word "operated" does not mean "operated by an
unsupervised AI."

## 3. The current action set

There are 10 actions in v1. Each one produces a draft. None of them
send without approval (except the auto-approved ones listed below).

| Action | Trigger | Channel | Approval | What it does |
|---|---|---|---|---|
| `morning_briefing` | 6am daily, cron | email | required | Reads pipeline, revenue, activity, drafts a 1-5 item brief |
| `deal_followup_draft` | deal idle 4+ days | email | required | Drafts a follow-up; tone scales with staleness |
| `lead_score` | new lead created | score | auto | Scores 0-100, tiers, suggests owner, drafts first reply |
| `invoice_reminder` | invoice past due | email | required | Drafts a reminder; tone scales with days overdue |
| `photo_progress_ping` | photo job ready | in_app | auto | Notifies the client their variations are ready |
| `lead_reengagement` | lead cold 30+ days | email | required | Drafts a "checking back in" message |
| `project_kickoff` | project moved to active | email | required | Drafts the kickoff message to the client |
| `ticket_acknowledgement` | new ticket | in_app | auto | Notifies the client we got their ticket and ETA |
| `project_closeout` | project completed | email | required | Drafts the closeout summary + final invoice nudge |
| `weekly_client_digest` | Friday 4pm, cron | email | required | One email per active client summarizing their week |

**Auto-approved channels** are `score` and `in_app`. The reasoning:
- A score writes a number to a database field. The cost of being wrong
  is the lead gets routed to the wrong person, who then fixes it.
- An in-app notification shows up in the client's portal as a status
  update. The cost of being wrong is the client sees a status message
  that doesn't match reality, which they would have noticed anyway.

If you want to add a new action, follow the template in
`packages/operator/src/actions.ts`. If you want to make an existing
action auto-approved, see section 1.

## 4. The trust model, written in code

The contract is enforced in three places:

**a) `executeDraftEffect()` in `packages/operator/src/drafts.ts`.**
This is the only function in the system that produces external side
effects. Every channel (`email`, `sms`, `in_app`, `task`, `score`,
`route`) is implemented here. If you add a new channel, you add it
here, and the side effect runs only after the draft is in `approved`
or `edited` status.

**b) `sendApprovedDrafts()` in the same file.** This is the runner
that flushes approved drafts to their side effects. It is called by
the operator worker every 5 minutes. It only operates on drafts in
`approved` or `edited` status. Drafts in any other status are skipped.

**c) The `requiresApproval` flag on every `ActionDefinition`.** When
`true`, the draft is `pending` until a human acts. When `false`, the
draft is created in `pending` status and immediately transitions to
`approved` by the auto-approval logic in
`packages/operator/src/drafts.ts`. New actions default to `true`. If
you set it to `false`, you are making a statement about the cost of
being wrong. Make sure the statement is true.

## 5. The model

The operator uses OpenAI's `gpt-4o-mini` for cheap drafts (the vast
majority of calls) and `gpt-4o` for the morning briefing and the
weekly client digest, where the model has to reason about the day's
state and write coherent prose.

We considered and rejected:

- **Inflection Pi.** Their API is oriented at conversation, not tool
  use or structured outputs. The integration work would be substantial
  and the product would regress.
- **Phi-3 / Phi-4 from Microsoft.** Competitive on cost, but weaker
  structured-output tooling, harder operational story, no clear win
  for this workload.
- **Self-hosted open-weights models (Llama, Qwen).** Better at scale
  for the morning briefing (long context, low call volume). Not worth
  the operational complexity at v1. Plan the move for when the
  operator is serving 10+ orgs.

The model is swappable behind the `callStructured` and `callText`
functions in `packages/operator/src/llm.ts`. If you swap the provider:

- Update the cost tracking in the `MODELS` constant to match the new
  pricing, or your `operator_drafts.cost_usd` numbers will be wrong
- Re-tune the prompts. Different models have different prompt
  sensitivities. What works on GPT-4o-mini may not work on the
  replacement.
- Re-run the test-fire endpoints and verify the output quality
  before shipping

Do not swap the model in a way that removes the structured-output
constraint. The LLM is allowed to write prose; it is not allowed to
write a JSON object that doesn't parse. The `response_format:
json_schema` mode in `callStructured` is what enforces this.

## 6. The data gravity (why the model isn't the ceiling)

The ceiling of this product is not the model. It is the data the
model sees.

A GPT-4o-mini call with 2,000 tokens of well-curated context will
outperform a Claude-Opus call with 8,000 tokens of unfiltered noise.
Every minute spent upgrading models, you lose 10x the value of the
minute spent on retrieval.

What the operator does, in priority order:

1. **Action coverage.** Add actions for the things a chief of staff
   would do that we don't yet cover. The 10 actions listed above
   cover 90% of the work. The remaining 10% are niche. Add them as
   they come up.
2. **Context per action.** Every action should have access to the
   full relevant state of its subject. For a deal follow-up, that's
   the deal, the contact, the company, the previous touchpoints, the
   operator's prior drafts on this subject, the assigned operator's
   recent approvals/rejections on similar subjects.
3. **Operator memory.** Every action should see what the operator has
   done before. "I followed up on Tuesday" should be in the prompt
   for Friday's follow-up. "I drafted an invoice reminder 3 days
   ago, the client paid yesterday, so skip the next one" is the
   kind of reasoning a human assistant does without thinking.
4. **Learning loop.** Every approval/rejection/edit decision should
   be stored with the prompt and the decision. The morning briefing
   should include the 5 most similar past decisions as few-shot
   examples. This is the long-term moat. The schema is in
   `operator_feedback`; the prompt-time retrieval is a 1-day add-on.

Do not:

- Add actions the customer didn't ask for. The 10 actions cover
  what people actually need. Resist the urge to add a "creative
  brief generator" or "competitor analysis drafter" because they
  sound cool.
- Optimize the model call before optimizing the context. If the
  drafts are bad, the answer is rarely "bigger model" — it's
  usually "the model didn't know about X."
- Add actions with broad blast radius (e.g. "send a marketing
  email to all contacts"). The chief of staff does not send
  marketing emails; the marketing person does. The operator is
  not a marketing tool.

## 7. The review surface (where humans work)

`/briefing` in the internal console. The human sees:

- KPI strip: pending drafts, sent this week, AI cost, approval rate
- Pending drafts as cards, one per action
- Each card: the kind, the AI's reasoning, the drafted body in a
  scrollable preview, and Reject / Edit / Approve buttons
- A "Sent" tab showing drafts that have executed

The dev-mode mock has 7 realistic drafts (5 pending, 1 sent, 1
rejected) so the operator can be demoed before any infrastructure
is wired. To see it:

```sh
pnpm install
pnpm --filter @o/internal dev
# open http://localhost:4001/briefing
```

## 8. Extending the operator

To add a new action:

1. **Write a tool** in `packages/operator/src/tools.ts`. Tools are
   read-only context gatherers. They never modify state.
2. **Write the action** in `packages/operator/src/actions.ts`. The
   action has:
   - A `ActionDefinition` (kind, label, channel, triggers, scope,
     cooldown, expiry)
   - A `runXxx(orgId, entityId)` function that gathers context,
     calls the LLM with a structured-output schema, and returns a
     draft
3. **Add the channel to `executeDraftEffect()`** if the channel is
   new. Existing channels: `email`, `sms`, `in_app`, `task`,
   `score`, `route`. New channels need a side effect implementation
   here.
4. **Add the email template** to `packages/email/src/templates.tsx`
   if the channel is `email` and the existing template doesn't fit.
5. **Add a status pill to the /briefing page** if the kind is new
   (see `KIND_META` in `apps/internal/src/app/briefing/page.tsx`).
6. **Test in dev mode** with mock data before wiring any real
   infrastructure.

## 9. The dev-mode mock

The operator's actions all work in dev mode without any backend:

- The uploader simulates the upload with a progress bar
- The gallery shows 4 mock jobs with real Unsplash photos
- Submitting a job adds a new mock job that "processes" in 5
  seconds, then fires a `o:brief-photo-ready-dev` event
- The brief inbox listens for that event and prepends a new entry
  to the feed
- The /briefing page shows 5 realistic drafts, all with full
  approve/reject/edit flow

This means a new engineer can clone the repo, `pnpm install`, and
demo the entire operator experience without setting up Postgres,
OpenAI, Replicate, or anything else. **Don't break the dev mock.**
Every change you make should leave the dev experience working.

## 10. Costs

| Action | Model | Cost per call |
|---|---|---|
| morning_briefing | gpt-4o | ~$0.014 |
| weekly_client_digest | gpt-4o | ~$0.012 |
| All other drafts | gpt-4o-mini | ~$0.001-0.003 |
| Score | gpt-4o-mini | ~$0.001 |
| Photo progress ping | none (constructs) | $0.00 |

A single org using the full action set every day: **~$0.05/day** in
model calls, plus Resend for sending approved emails (~$0.0001/email).

If a single customer's operator is costing more than $1/day, something
is wrong. Check the prompt-token counts in the logs; the answer is
almost always that the context bundle is loading too much.

## 11. The non-goals

The operator is not:

- **A chatbot.** There is no "ask the operator anything" surface in
  v1. The operator does specific things, on schedule, and surfaces
  them to the human. Adding a chat surface is a different product.
- **An autonomous agent.** See section 1. The operator never acts
  without approval.
- **A replacement for judgment.** The operator drafts. The human
  decides. There will be cases where the human overrides the
  operator's draft in a way the model would not have predicted.
  That is the system working as designed.
- **A marketing tool.** The operator does not send marketing
  emails, scrape the web, generate ad copy, or anything else that
  has "marketing" in the job description. Marketing is a person,
  not an action.
- **A customer-success tool.** The operator prepares the
  relationship surface (brief inbox, drafts, reminders). The
  customer success work is still human. If a customer is
  churning, the operator may draft a check-in, but a human
  decides what to actually do.

## 12. The future

The honest next 6 months:

1. **More actions** if customers ask. Not before.
2. **The learning loop, made real.** The `operator_feedback` table
   is in place. The prompt-time retrieval is a 1-day add-on: embed
   the prompt, find similar past decisions, include them as
   few-shot examples.
3. **Self-hosted morning briefing** at 10+ orgs. Llama 3.1 405B or
   Qwen 2.5 72B on a single H100, 4-5 briefings in parallel,
   ~$0.02 per briefing vs $0.014 on OpenAI. The win is data
   residency and unit economics at scale, not model quality.
4. **A real approval queue on mobile.** O'Shay reviews drafts on
   his phone at a coffee shop. The iOS port of the operator's
   review surface is the highest-leverage mobile feature.
5. **Distribution.** After v1, the next 90 days should be customers,
   not features. The product is shipped. Now it needs to be used.

Things I will not add, even if asked:

- Fully autonomous tool-calling mode
- "AI agent" marketing language
- An "auto-approve trusted actions" flag
- A chat surface ("ask the operator")
- A marketing email generator
- A web search / scraping tool

These are all real products. None of them are this product.

## 13. The one-paragraph version

The operator watches your business data, drafts the work a chief of
staff would do, and waits for you to approve it. The model is
swappable; the trust model is not. The ceiling of the product is
the data the model sees, not the model itself. Add actions when
customers ask. Don't break the dev mock. Don't add a fully
autonomous mode. Don't replace draft-and-approve with tool-calling.
Build the learning loop. Get customers. Don't add features for 6
months.

---

Last updated: 2026-06-20. If this manual contradicts the code, the
code is wrong. If the code contradicts this manual, this manual is
wrong. Either way, fix one of them before shipping.
