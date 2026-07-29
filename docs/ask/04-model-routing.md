# 04 — Model routing

**Route on task class, not on perceived difficulty.** The routing table is
configuration, not code.

---

## 1. Two axes, in a fixed order

Infora already has one of the two axes built, and it is the more important one.
The router enforces **deployment security tier** as a hard constraint before any
task-based optimisation ([tiers.ts:147-175](../../packages/model/src/tiers.ts#L147-L175)):

```
tier policy filter  →  task-class selection  →  dispatch
   (hard, fails closed)      (this document)
```

The order is not negotiable and is already stated in ADR-0037 §3. A cheaper
model that does not conform to the deployment's tier is not selected — the
router fails closed rather than falling back to a non-conforming region or
provider to preserve availability ([tiers.ts:166-171](../../packages/model/src/tiers.ts#L166-L171)).

**What this document adds is the second axis only.** `Router.chat(task, request)`
already accepts a task argument and **currently ignores it**
([router.ts:77](../../packages/model/src/router.ts#L77) — `_task`). The seam exists; the routing does not.

---

## 2. The routing table

| Task class | Tier | Rationale |
| --- | --- | --- |
| `orchestrate` — classification, intent, workflow selection | Frontier | Judgment-heavy, user-visible, decides everything downstream. Not the place to economise |
| `clarify` — question generation and recommendation | Frontier | The recommendation is doing the teaching; a weak one damages trust more than a slow one |
| `plan` — step selection in model-chosen mode | Frontier | Same reasoning |
| `triage` — retrieval relevance filtering | Small, fine-tuned where available | Highest volume by far. **This is where gross margin lives** |
| `extract` — schema extraction | Mid, structured output | High volume, low judgment, verifiable against the schema |
| `synthesise` — short-context answer composition | Frontier | User-visible prose under a Lens |
| `synthesise_long` — long-document synthesis | Frontier, large context | |
| `draft` — grounded document drafting | Frontier | The existing chain's one thinking leaf |
| `verify` — claim verification | Frontier, **different family from the producer** | Independence. Same-family verification is largely self-agreement |

### 2.1 Configuration shape

```yaml
routing:
  defaults:
    fallback_attempts: 2
    timeout_ms: 60000

  task_classes:
    triage:
      primary:   { family: voyage-rerank, model: <id> }     # or a fine-tune
      fallback:  [{ family: anthropic, model: haiku }]
      max_tokens: 2000
    verify:
      primary:   { family: <not the draft family>, model: <id> }
      fallback:  [{ family: <also not the draft family>, model: <id> }]
      constraint: different_family_from: draft
    # …one entry per task class
```

**Hot-reloadable in non-production**, immutable for the process lifetime in
production — the same rule as Lens and workflow definitions.

---

## 3. The `verify` independence constraint

`different_family_from: draft` is enforced in code at dispatch, not left to
whoever edits the config:

- The router resolves the family that produced the claims from the plan's draft
  step, and refuses to dispatch verification to that family.
- A configuration where every conforming route belongs to one family makes
  verification **unavailable**, and the plan step is `skipped` with a stated
  reason — never silently run same-family.
- Skipped verification is visible in the completion footer and counted in the
  eval report. A run that could not be independently verified says so.

This matters most at the sovereign tier (ADR-0037 §2), where self-hosted
open-weight models may be the only conforming routes. If that leaves one family,
independent verification is honestly unavailable rather than faked.

---

## 4. Fallback chains

Per tier, documented, for provider outage or rate limiting.

- A fallback is attempted only if it **also conforms to the deployment tier**.
  Tier conformance is never traded for availability — this is already the
  router's behaviour and must not be weakened by adding fallbacks.
- Exhausted chain → the step fails with a stated reason; the run continues per
  [03](03-orchestration-and-plan.md) §6.
- Every attempt writes its own Step audit row, including the failed ones, with
  egress facts. A fallback that fired is visible in the record.

---

## 5. Fine-tuned models are pluggable but optional

**The system must run entirely on frontier models with a config change**, so the
absence of a fine-tune is never a blocker. The `triage` class is the one where a
fine-tune pays for itself, and it is configured as a swap, not a code path.

Corollary for the eval harness: every case runs against the *configured* routing
table, and the table used is recorded in the result file. A pass on a fine-tuned
triage model is not evidence about the frontier-only configuration, and the
report says which was used.

---

## 6. Cost and usage

**Per-step model and token cost logged against every plan, queryable per
organisation and per user.**

Most of this exists: `steps` already carries `model_id`, `model_version`,
`tokens_prompt`, `tokens_completion`, `cost` and the four egress columns
([drawer3-execution.ts:114-125](../../packages/db/src/schema/drawer3-execution.ts#L114-L125)), written in the same UPDATE that freezes the
row ([run-writer.ts:103-131](../../packages/orchestration/src/run-writer.ts#L103-L131)).

**Finding F7 must be fixed first.** Provider rates default to `0`
([grounded-draft.ts:92-94](../../packages/capabilities/src/grounded-draft.ts#L92-L94)) and the running app binds the draft leaf with no
options ([app.ts:118](../../apps/api/src/app.ts#L118)) — so **every step in the live system currently
records a cost of exactly zero.** Token counts are real; money is not.

Required:

1. Provider rates in deployment config, per model id, passed at leaf
   construction.
2. An aggregation read at organisation and user grain, over a date range,
   producer-private like the rest of the run record.
3. **A pinned model is logged and attributed.** When a user pins a model via the
   model chip ([08](08-interface.md) §2), the pin is recorded on the plan and shown in cost
   reporting, because a pinned frontier model on a triage step is a real cost
   decision someone should be able to see.

Rate limiting stays where it is — 30 runs/min/user ([app.ts:92-100](../../apps/api/src/app.ts#L92-L100)) — with
one change: the in-memory sliding window ([rate-limit.ts:3](../../apps/api/src/rate-limit.ts#L3)) does not survive
horizontal scaling and must move to a shared store before multi-instance
deployment. Already a named seam; restated here because a multi-worker plan
multiplies the calls behind one run.
