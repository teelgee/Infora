# 02 — The worker registry

Seven typed workers. Each declares a name, purpose, model tier, input schema,
output schema, permitted tools, scope expression, whether it writes, and
cacheability. **Workers return structured objects, never prose.** The chat agent
sees a worker's output object; it never sees the worker's reasoning trace.

**Workers are leaves.** Only the chat agent orchestrates. The single exception
is `workflow_runner`, which executes a pre-declared DAG and may call leaf
workers within it.

**There is no eighth worker, and no generic one.** No `research_agent`, no
`code_execution`, no `do_the_thing`. If a capability seems to want an eighth
worker, it is almost certainly a workflow that has not been declared yet — which
is the good outcome, because a declared workflow is evaluable end to end and an
improvised worker is not.

---

## 0. Naming reconciliation

Two names from the source brief change to match CONTEXT.md, which is the
vocabulary authority (CLAUDE.md working rule):

| Brief | Infora | Why |
| --- | --- | --- |
| `canon_lookup` | **`authority_lookup`** | "The canon" is already the **authority corpus** (ADR-0023, extended 2026-07-29): legislation, policy and standards, versioned by in-force date, across a standard tier Infora ships and an organisation tier its owner adds. Do not mint a second name for one thing |
| `matter` | **project** | "Matter" is legal-sector vocabulary. Infora's unit is the project (or scheme) |

The reasoning for keeping `authority_lookup` separate from `corpus_retrieval`
stands exactly as the brief argues it: the authority corpus is global, cacheable
across every organisation, versioned by in-force date rather than document
revision, and carries a different security posture. Different index, different
freshness logic, different scope expression. **Do not merge them.**

---

## 1. `corpus_retrieval`

```yaml
name: corpus_retrieval
purpose: >
  Find passages in the current project's documents that bear on a specific
  question. Does not interpret, summarise or conclude.
model_tier: triage
inputs:
  query:                string
  classification_terms: string[]?    # ontology pre-filter (ADR-0045, T-242)
  doc_types:            enum[]?
  include_superseded:   bool = false
  max_passages:         int = 20
outputs:
  passages:
    - chunk_id, version_id, document_reference, document_title,
      version_reference, superseded: bool,
      locator: { page?, para?, section? },
      text, relevance
  coverage_note:        string       # what was searched, what was NOT found
tools:  [vector_index.query, keyword_index.query, doc_store.read]
scope:  user ∩ project ∩ deliverable-visibility        # EntitledSlice
writes: none
cacheable: true                       # key = query + corpus_version + scope_hash
```

**Substrate.** This is `groundedLibrary` ([retrieval.ts:37](../../packages/knowledge/src/retrieval.ts#L37)) reached through the
assembly gateway ([gateway.ts:40](../../packages/knowledge/src/gateway.ts#L40)), which already applies project, in-library,
live-state, current-version, pinned-model and deliverable-visibility as SQL
pre-filters in one query. The worker adds structure around it, not a new path to
the store.

**New work.**

- **Locators, or the verbatim passage.** The chunker records no
  page/para/section today ([chunker.ts](../../packages/data/src/chunker.ts)). Non-negotiable 1 requires that a
  citation be **checkable**, which a locator gives cheaply and a verbatim quote
  gives at the cost of some length. Owner-ruled 2026-07-29: where a format
  yields no reliable locator — PDFs especially — the citation carries the quoted
  passage instead, and the answer never degrades silently to version grain. The
  worker already returns `text` per passage, so the raw material exists; what is
  new is carrying it through the citation record and rendering it. Ticketed as
  T-270 (spike) and T-271.
- **`coverage_note`.** Not a nicety: it is the mechanism behind shared-core rule
  1.5 (absence detection). It states what corpus slice was searched, how many
  candidates the pre-filter admitted, and which requested terms found nothing.
- **`include_superseded`.** No path exists today; retrieval excludes superseded
  unconditionally. When added, a superseded passage is flagged in the output
  object *and* at every point of use in the answer (non-negotiable 10).
- **`chunk_id` in the output.** Feeds finding F5 — recording chunk ids in
  `step.source_set` makes the assembled context reconstructible at passage grain
  for audit, without storing the text twice.

**Cache key.** `corpus_version` must be a value that changes when any admitted
document changes, and `scope_hash` must include the deliverable-visibility
inputs — otherwise the cache becomes a permission bypass. The scope hash is
computed from the resolved `EntitledSlice`, never from the request.

---

## 2. `authority_lookup`

```yaml
name: authority_lookup
purpose: >
  Find provisions, advice notes and precedent decisions in the authority corpus
  that bear on a question. Returns the instrument and its in-force version.
model_tier: triage
inputs:
  query:          string
  instrument_types: enum[]?     # act | regulations | nps | advice_note |
                                # s51_advice | decision_letter | standard |
                                # guidance | policy
  in_force_at:    date?         # default: today; set to the application date
                                # when the question is about a past position
outputs:
  provisions:
    - authority_ref, instrument_title, instrument_version,
      tier: standard | organisation,          # which shelf resolved it
      in_force_from, in_force_to: date | null, superseded_by: ref | null,
      currency: infora_maintained | org_declared,
      last_reviewed: date | null,             # org tier only
      locator: { section?, regulation?, paragraph? },
      text, relevance
  currency_note:  string        # what has been revised since in_force_at,
                                # per tier — the two guarantees are not equal
tools:  [authority_index.query, authority_store.read]
scope:  standard tier (global, read-only) ∪ the requester's OWN organisation
        tier (org-private, portable, never across the wall)
writes: none
cacheable: true                 # key = query + standard_corpus_version +
                                #       org_shelf_version + in_force_at
```

**Status: the store does not exist.** `authorityRef` runs through the whole type
system — `AssembledItem.corpus: 'library' | 'authority'`
([assembly.ts:21-22](../../packages/contracts/src/assembly.ts#L21-L22)), the citation table's `authority_ref` column
([drawer4-output.ts:44](../../packages/db/src/schema/drawer4-output.ts#L44)), the ground-check's `refKey`
([ground-check.ts:64](../../packages/governance/src/ground-check.ts#L64)) — but the pipeline returns nothing
([gateway.ts:35-36](../../packages/knowledge/src/gateway.ts#L35-L36) `guiding`/`informing` are empty stubs and there is no
authority pipeline at all). Building it is a substantial ticket in its own right
and gates the "canon" half of Ask's promise.

**Two tiers, owner-ruled 2026-07-29 (ADR-0023 extended).** The corpus is not
purely Infora's:

- **Standard tier** — Infora-shipped and universal: the Planning Act 2008, the
  EIA and Habitats Regulations, NPSs, PINS Advice Notes, s.51 advice, precedent
  DCOs and Decision Letters. Deliberately confined to material Infora can ship
  freely (Crown copyright, Open Government Licence), which is why **Infora buys
  no per-customer standards subscriptions**.
- **Organisation tier** — added by the organisation's owner: licensed standards
  it already subscribes to (ISO, BSI), sector guidance, its own policy
  instruments. Held in that organisation's **portable org context** (ADR-0020),
  travelling with it to every project it works on, and **never crossing the
  wall**.

**Two organisations on one project can hold different shelves, and therefore
legitimately return different answers to the same question.** That is correct
and is surfaced, not hidden — the `tier` field on every provision says which
shelf resolved it.

**Why an org-tier provision still grounds and cites**, despite living in org
context, which ADR-0020 says informs only: ADR-0021 already fixed that surface
placement does not set channel role. The operative distinction is what the
material *is*, not who loaded it. A firm's **own** material — precedent, method,
know-how — informs and is never cited, because its provenance and
confidentiality are entangled with clients' (ADR-0026 Filters 1 and 2). A
**published external instrument** with an issuing body, a version and an
in-force date grounds and is cited, because none of that is true of it.

**`in_force_at` is the load-bearing input.** Consenting questions are frequently
about the position *at a past date* — which NPS applied at acceptance, which
version of an Advice Note the ES was drafted against. Versioning by in-force
date rather than by document revision is precisely why this worker cannot be
`corpus_retrieval` with a flag.

**`currency_note` reports per tier, because the two guarantees are not equal.**
Infora operates currency for the standard tier. It cannot know that a customer's
uploaded standard has been superseded, so an org-tier entry carries an
org-declared in-force interval and a last-reviewed date, and the note says
"org-declared, last reviewed <date>" rather than implying Infora's guarantee.
This implements shared-core rule 1.4 and is the trigger source ADR-0027 §4 names
for recompiling codified rules when their source moves.

**Access, and therefore the cache key.** The standard tier is outside per-tenant
resolution (the law is the law). The org tier is org-private on the ADR-0018
private floor, so the cache key carries `org_shelf_version` — a cached provision
must never be served to an organisation whose shelf did not contain it.

---

## 3. `web_research`

```yaml
name: web_research
purpose: >
  Search and fetch public web sources bearing on a question. Returns labelled
  external sources. Has no corpus access of any kind.
model_tier: mid
inputs:
  query:        string
  recency:      enum? [any, past_year, past_month]
  max_sources:  int = 8
outputs:
  sources:
    - url, publisher, title, published_date: date | null,
      retrieved_at: timestamp, excerpt, relevance,
      trust: 'external-untrusted'    # constant, not computed
  search_note:  string
tools:  [web.search, web.fetch]
scope:  NO corpus access — structurally, not by configuration
writes: none
cacheable: true                       # key = query + recency + day-bucket
```

**This worker is the reason finding F3 must be closed first.** Its whole safety
case is that a prompt injection in a fetched page cannot reach client data,
because the worker holding the injected text never holds corpus data.

**The isolation, as a type-level property** ([09](09-permissions-remediation.md) R3):

- `web_research`'s output type is `ExternalSource[]`, a **distinct type** from
  `AssembledItem`. There is no conversion function, and writing one is the thing
  code review exists to catch.
- `groundedDraft` accepts `AssembledInput` ([grounded-draft.ts:57](../../packages/capabilities/src/grounded-draft.ts#L57)). It cannot be
  passed an `ExternalSource`, and the compiler enforces that.
- The worker's dependency injection carries no `Db`, no `assemble`, and no
  `EntitledSlice` — it physically cannot query a store. This mirrors the
  existing pattern where the retrieve leaf's *only* store reach is the injected
  gateway ([retrieve-leaf.ts:2-3](../../packages/orchestration/src/retrieve-leaf.ts#L2-L3)).
- The orchestrator receives both, holds them in separate fields, and renders
  them in separate registers. **The orchestrator is the only place they meet**,
  and it meets them as data, not as a shared context window.

**ADR-0022 amendment.** As built, attached sources "never join a corpus, never
ground, never emit a citation", and a `web` attached-source kind is already
reserved under that rule ([drawer3-execution.ts:56-62](../../packages/db/src/schema/drawer3-execution.ts#L56-L62)). Owner-ruled
2026-07-29: web research is carved out — its results **are** citable, in a
visibly separate external register (URL, publisher, date, retrieval timestamp,
badged untrusted-external), never rendered like a library or authority citation.
User-pinned web *attached sources* keep the original rule and remain non-citing.

**Egress.** A `web.fetch` is egress and is recorded on the Step alongside model
egress (ADR-0037 §6). A deployment at the sovereign tier may disable this worker
entirely; the entitlement mechanism in §9 is how.

---

## 4. `extractor`

```yaml
name: extractor
purpose: >
  Return records conforming to a named schema, extracted from documents in
  scope. Structured output only — no narrative.
model_tier: mid, structured output
inputs:
  schema_name:  enum   # commitments | consultee_responses | mitigation_measures |
                       # exa_questions | deadlines | parameters
  scope:        { version_ids: id[] } | { query: string }
  strict:       bool = true    # a record that does not fully conform is
                               # reported as a failure, never coerced
outputs:
  records:      [conforming to the named schema, each with source + locator]
  failures:
    - reason, source, locator, partial_record
  extraction_note: string
tools:  [doc_store.read]
scope:  inherits from caller — never widens
writes: none
cacheable: true               # key = schema_name + scope_hash + corpus_version
```

**Named schemas are versioned domain content**, in the same authoring layer as
Lenses, owned by the same specialists. Adding a schema is a content change; the
extractor's code does not change.

**`strict` defaults true, and `failures` is a first-class output.** A partially
extracted commitment silently coerced into a record is worse than no record: the
whole value of the commitments register is that it is complete and checkable.
Failures feed absence detection (shared-core 1.5).

**Every record carries source and locator.** Non-negotiable 1 applies to
structured output exactly as to prose.

---

## 5. `workflow_runner`

```yaml
name: workflow_runner
purpose: >
  Execute a codified Infora workflow — a pre-declared DAG of steps — and return
  its declared output.
model_tier: per step
inputs:
  workflow_id:  string
  version:      int         # workflows are versioned; a run pins one
  parameters:   object      # validated against the workflow's declared schema
outputs:        the workflow's own declared output schema
  plus:
    steps_run:  [step_id, worker, status]
    parameters_bound: object   # including defaults and clarification answers
tools:  may call leaf workers per its declared DAG — nothing else
scope:  inherits from caller — cannot widen at any step
writes: per the workflow's declaration
cacheable: false
```

**This is the product.** Non-negotiable 7's single exception, and the thing the
chat agent should route into far more often than it improvises.

**`packages/workflows` is currently an empty stub** ([index.ts](../../packages/workflows/src/index.ts) is
`export {}`). The DAG declaration format, the runner, and the first workflows
are all new. The DAG format is specified in [03](03-orchestration-and-plan.md) §4 alongside the plan
artefact, because a declared workflow *is* a plan template.

**Scope cannot widen at any step.** The runner passes its caller's
`EntitledSlice` down unchanged, or narrowed (F8). A workflow declaration that
attempts to name a wider scope fails validation at load, not at run.

---

## 6. `document_builder`

```yaml
name: document_builder
purpose: >
  Produce a draft in the tenant's template, with a manifest of every source used.
model_tier: frontier
inputs:
  template_id:  string
  brief:        string
  sources:      { version_ids: id[] }   # explicit — never "whatever you find"
  destination:  { sandbox_id } | { sandbox_document_id }
outputs:
  document_id:  id
  manifest:
    - version_id, document_reference, version_reference, locator, used_for
  label:        { computed_label, most_restrictive_input, destination_label }
  withheld:     [claims that did not survive ground-check]
tools:  [template_store.read, doc_store.read, doc_store.write]
scope:  user ∩ project ∩ deliverable-visibility, write
writes: yes — a sandbox document
cacheable: false
```

**Partly exists.** The chain's `document` mode already drafts into a sandbox
document via suggestions ([chain.ts:109](../../packages/orchestration/src/chain.ts#L109), [cite-leaf.ts](../../packages/orchestration/src/cite-leaf.ts)), grounded-only, with
unsourced claims withheld. What is new is the template, the manifest, and the
label.

**This worker cannot be built before finding F2 is closed.** It is the write
path, and today writes take the writer's own organisation label
([sandbox.ts:129](../../apps/api/src/sandbox.ts#L129)) rather than the most restrictive label among its
inputs. The `label` output field is not decoration — it is the evidence that
propagation happened, and the surface warns on it ([08](08-interface.md) §3).

**`sources` is explicit.** The builder does not retrieve; it is given version
ids by the orchestrator, which got them from `corpus_retrieval`. This keeps the
label computation tractable and the manifest honest.

---

## 7. `verifier`

```yaml
name: verifier
purpose: >
  Judge each claim against the source it cites: supported, partial, unsupported
  or contradicted, with the locator.
model_tier: frontier, different model family from the producer
inputs:
  claims:       [{ text, source_ref }]
  sources:      [{ version_id, locator, text }]
outputs:
  verdicts:
    - claim_text, verdict: supported | partial | unsupported | contradicted,
      source_ref, locator, rationale: string
  summary:      { supported: int, partial: int, unsupported: int, contradicted: int }
tools:  [doc_store.read]
scope:  inherits from caller
writes: none
cacheable: false
```

**This worker sits ON TOP of the deterministic ground-check, never instead of
it.** The distinction matters and is easy to lose:

| | Deterministic ground-check *(exists)* | `verifier` *(new)* |
| --- | --- | --- |
| Question | Does this claim resolve to a source the run actually saw? | Does that source actually **support** the claim? |
| Mechanism | Pure code, no model call ([ground-check.ts:1-5](../../packages/governance/src/ground-check.ts#L1-L5)) | Frontier model, different family |
| Guarantee | Provable | Probabilistic |
| Runs | Every answer, both modes, always | When the plan declares it |
| On failure | Withholds the claim (document mode) or labels it open-world (chat mode) | Reports a verdict; the orchestrator decides |

Deleting or bypassing the deterministic check to "replace it with the verifier"
would be a straight downgrade of the system's central claim. The deterministic
check is the floor; the verifier catches the class of error the floor cannot
see — a real citation attached to a claim it does not support.

**Different model family is a hard requirement**, not a preference:
same-family verification is largely self-agreement. Enforced in the routing
table ([04](04-model-routing.md) §3), which refuses to dispatch a verification step to the family
that produced the claims.

---

## 8. Summary table

| Worker | Returns | Tools | Scope | Tier | Writes | Cacheable |
| --- | --- | --- | --- | --- | --- | --- |
| `corpus_retrieval` | ranked passages + coverage note | project indexes, doc store read | user ∩ project ∩ visibility | triage | no | yes |
| `authority_lookup` | provisions with version, in-force date + tier | authority index | standard tier (global) ∪ own org tier (org-private) | triage | no | yes |
| `web_research` | external sources, labelled untrusted | web search, fetch | **no corpus access** | mid | no | yes |
| `extractor` | schema-conforming records + failures | doc store read | inherits | mid, structured | no | yes |
| `workflow_runner` | the workflow's declared output | leaf workers per its DAG | inherits, cannot widen | per step | per declaration | no |
| `document_builder` | draft + source manifest + label | template store, doc store write | user ∩ project ∩ visibility, write | frontier | yes | no |
| `verifier` | per-claim verdict with locator | doc store read | inherits | frontier, other family | no | no |

---

## 9. Entitlement — the tool set is assembled, not filtered

**Only workers the user is entitled to are assembled into the orchestrator's
tool set.** Do not present a tool and then refuse it: an unentitled worker is
absent, not disabled, and the model is never told it exists. This is the same
principle as the API's "denial and nonexistence read identically" (contracts
principle 4, [requester.ts:5-7](../../apps/api/src/requester.ts#L5-L7)).

Entitlement is computed per request from three inputs:

1. **The requester's `EntitledSlice`** — no slice, no workers at all.
2. **The deployment's tier** — a sovereign-tier deployment (ADR-0037 §2) has no
   `web_research`, because it admits no third-party egress. This falls out of
   the existing router policy rather than needing a new switch.
3. **The organisation's own authority shelf** — `authority_lookup` resolves
   Infora's standard tier plus whatever that organisation has added (ADR-0023 as
   extended). An organisation that has added nothing gets the standard tier and
   is none the wiser; one that has added its ISO subscription gets both, with
   every provision labelled by tier.

Every user therefore gets a materially different agent — different Lens overlay,
different worker set — assembled per request, not one agent with a filter bolted
on.

---

## 10. Audit shape

A worker invocation is a **Step** in the existing append-only tree, and in most
cases a child **Run** — the schema already supports this via `parent_run_id`,
`parent_step_id` and `child_run_id` ([drawer3-execution.ts:104-130](../../packages/db/src/schema/drawer3-execution.ts#L104-L130)), and the
retrieve leaf already does exactly this today ([retrieve-leaf.ts:36-60](../../packages/orchestration/src/retrieve-leaf.ts#L36-L60)).

Required migration: the `step_type` enum gains the worker step types. Everything
else — model id, usage, cost, egress facts, source set, rail outcomes — is
already on the Step row and needs no change.

**A worker's reasoning trace is never returned to the chat agent and never
stored as prose.** What is stored is the structured output plus the audit
fields. This keeps the chat agent's context unpolluted (the brief's separation
principle) and keeps the audit record checkable rather than narrative.
