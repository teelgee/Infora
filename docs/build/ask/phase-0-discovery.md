# Ask — Phase 0 discovery report

**Status:** drafted 2026-07-29. Discovery only — no application code written.
**Scope:** map the existing system, interrogate the permission model with
evidence, and set out the gap between what exists and the Ask agent-harness
target architecture.

> **Headline.** The repository is materially further along than the Ask brief
> assumes. A grounded, cited, audited chat path already exists end to end
> (Ask surface → API → coded chain → assembly gateway → pgvector retrieval →
> deterministic ground-check → citations), and the permission model is the
> strongest part of the codebase: enforced as SQL pre-filters, never in a
> prompt. The work ahead is **not** building Ask from nothing. It is
> (a) closing four real permission findings, (b) adding the worker/plan/routing
> machinery the current fixed chain has no room for, and (c) reconciling three
> places where the brief contradicts an accepted ADR.

---

## 1. The current system

### 1.1 Stack and topology

| Aspect | Finding | Evidence |
| --- | --- | --- |
| Language / runtime | TypeScript ESM, Node ≥ 24 | [package.json](../../../package.json) |
| Monorepo | pnpm workspaces + turbo | [pnpm-workspace.yaml](../../../pnpm-workspace.yaml), [turbo.json](../../../turbo.json) |
| API | Hono, single app assembled from route modules | [apps/api/src/app.ts:44](../../../apps/api/src/app.ts#L44) |
| Web | React + Vite + react-router, thin client over the typed API | [apps/web/src/main.tsx](../../../apps/web/src/main.tsx) |
| DB | Postgres 17 + pgvector, Drizzle ORM, 31 migrations | [docker-compose.yml](../../../docker-compose.yml), [packages/db/migrations/](../../../packages/db/migrations/) |
| Models | Anthropic (chat) + Voyage (embeddings) behind one Router | [packages/model/src/router.ts:51](../../../packages/model/src/router.ts#L51) |
| Tests | vitest per package + Playwright e2e; `pnpm run check` mirrors CI | [.github/workflows/](../../../.github/workflows/) |
| Deploy | **None yet.** Local docker-compose only; cloud/hosting is an open decision | [plan.md — infra/security gate](../plan.md) |

### 1.2 Package boundaries

Enforced by [scripts/dep-rules.mjs](../../../scripts/dep-rules.mjs); a violation fails CI.

```
contracts ──────────────────────────────► (everything)
db ──────► knowledge, orchestration, api
model ───► knowledge, capabilities, orchestration, api
governance ─► knowledge, api          (access predicate, ground-check)
knowledge ──► api                     (assembly gateway, retrieval, visibility SQL)
capabilities ► orchestration          (grounded-draft)
orchestration ► api                   (chain, run writer/reader, leaves)
workflows ──► (EMPTY STUB — export {} only)
ui ─────────► web
web ────────► contracts + ui ONLY
```

Two observations that matter for Ask:

- **`packages/workflows` is an empty stub** ([src/index.ts](../../../packages/workflows/src/index.ts)). The brief's "codified workflows are the product" has no home yet. This is the single biggest greenfield surface.
- **Surfaces may not reach below `contracts` + `ui`.** Any Ask UI state (role chip, plan artefact, progress rail) must come across the typed API, not from a package import.

### 1.3 The current chat path

```mermaid
sequenceDiagram
    autonumber
    participant U as User (Ask screen)
    participant API as Hono API
    participant MW as sessionMiddleware / resourceScope
    participant CH as runChain (coded spine)
    participant GW as assemble() gateway
    participant PG as Postgres + pgvector
    participant R as Router
    participant P as Anthropic / Voyage

    U->>API: POST /conversations/:id/runs { request }
    API->>MW: signed cookie → user row
    MW->>PG: project + membership + live participant
    MW->>MW: resolveAccess() → EntitledSlice | null
    Note over MW: null ⇒ 404, identical to nonexistence
    MW->>CH: slice.projectId, slice.participantId
    CH->>PG: INSERT run (state=running)

    rect rgb(240,244,250)
    Note over CH,PG: STEP 1 — retrieve
    CH->>GW: assemble(baseline) — identity read from the RUN row
    GW->>PG: resolveAccess AGAIN, inside the call
    GW->>R: embed(query)
    R->>P: Voyage
    GW->>PG: ONE query — project + inLibrary + state=live +<br/>isCurrent + pinned model + deliverableVisibleSql
    CH->>PG: INSERT delegate step + CHILD run (same participant)
    CH->>GW: assemble(targeted) → fold into baseline
    end

    rect rgb(240,244,250)
    Note over CH,P: STEP 2 — draft (the ONE thinking leaf)
    CH->>R: chat('draft', system + numbered sources)
    R->>R: selectRoute(tier policy) — fails closed
    R->>P: Anthropic messages.create (single shot, NO tools)
    CH->>PG: finishStep + model, usage, egress facts
    end

    rect rgb(240,244,250)
    Note over CH,PG: STEP 3 — ground_check (PURE CODE, no model)
    CH->>CH: every claim resolves to an admitted source, or is withheld
    CH->>PG: finishStep + railOutcomes per claim
    end

    rect rgb(240,244,250)
    Note over CH,PG: STEP 4 — cite
    CH->>PG: INSERT citations + suggestions; finishRun(response)
    end

    API-->>U: 201 Run { response, citations, steps }
    Note over U: NO streaming — returns on completion
```

Key characteristics of the path as built:

- **No streaming.** The run returns on completion ([ask.tsx:6](../../../apps/web/src/screens/ask.tsx#L6)). Cancel aborts the HTTP request; the run still completes server-side.
- **No tool calling.** The Anthropic adapter's request shape has no `tools` field ([anthropic-chat.ts:18-29](../../../packages/model/src/anthropic-chat.ts#L18-L29)). The model produces text; everything else is code.
- **The plan is not an artefact — it is source.** `runChain` is a fixed four-step spine ([chain.ts:103-127](../../../packages/orchestration/src/chain.ts#L103-L127)).
- **Two modes exist already:** `document` (grounded-only, unsourced claims withheld) and `chat` (unsourced claims survive, labelled open-world) ([chain.ts:24](../../../packages/orchestration/src/chain.ts#L24), [ground-check.ts:27-47](../../../packages/governance/src/ground-check.ts#L27-L47)).

### 1.4 RAG layer

| Aspect | Finding |
| --- | --- |
| Embeddings | Voyage, 1024-dim, `input_type` query/document split |
| Store | `version_chunks` colocated with relational data (ADR-0024) — one table, one HNSW index |
| Index topology | **Single index, metadata-filtered.** Unique on `(version_id, embedding_model_id, chunk_index)`; the model id is part of the filter so multiple models coexist without mixing ([drawer2-documents.ts:137-148](../../../packages/db/src/schema/drawer2-documents.ts#L137-L148)) |
| Retrieval | Hybrid: exact deliverable-code lexical arm + cosine vector arm, deduped, capped at 8 chunks ([retrieval.ts:46-67](../../../packages/knowledge/src/retrieval.ts#L46-L67)) |
| Re-ranking | **None.** Order is code-arm-first, then cosine distance |
| Versions | `containers.state` (live/superseded/withdrawn) + `versions.is_current`, both in the pre-filter |
| Semantic pre-filter | Ontology classification terms as a correlated `EXISTS`, in the same statement (T-242) |
| Channels | grounded (real), guiding (empty stub), informing (empty stub) ([gateway.ts:35-36](../../../packages/knowledge/src/gateway.ts#L35-L36)) |
| Budget | Fixed 12k tokens, naive char/4 estimate ([gateway.ts:20](../../../packages/knowledge/src/gateway.ts#L20)) |
| Authority corpus | **Declared, not built.** `authorityRef` exists throughout the type system and the citation table; no store, no pipeline |

### 1.5 Model invocation

- Single `Router` class; `chat(task, request)` — **the `task` parameter is accepted and ignored** ([router.ts:77](../../../packages/model/src/router.ts#L77)). The seam for task-class routing exists; the routing does not.
- Model choice is env config, not hard-coded: `DEPLOYMENT_TIER`, `MODEL_REGION/RETENTION/JURISDICTION/ELIGIBILITY`, endpoints ([env.ts](../../../apps/api/src/env.ts)).
- The router's real job today is **security-tier enforcement**, not cost/capability routing: a route must declare four egress attributes, the tier policy filters on them, and an undeclared route conforms to nothing and is refused ([tiers.ts:156-175](../../../packages/model/src/tiers.ts#L156-L175)). This is genuinely good and should be the substrate the Ask routing table sits *inside*, not beside.
- One route per capability in v1; the fallback chain the brief requires does not exist.

### 1.6 Identity, tenancy, data model

- **Auth:** email + password against seeded credentials, httpOnly signed cookie carrying the user id ([auth.ts:41-47](../../../apps/api/src/auth.ts#L41-L47)). Explicitly labelled skeleton scaffolding; production identity is committed as Entra-first but not built.
- **There is no `tenant` table.** The boundary is `organisation` × `project`. One deployment hosts many organisations, which is the whole point of the cross-organisation model — so "tenant" in the Ask brief maps to **organisation**, and the Teach de-identification rule must be written against `organisation_id`, not a tenancy concept that does not exist.
- **Six schema drawers:** 1 parties (orgs/users/projects/memberships/participants), 2 documents (containers/versions/chunks/sandboxes), 3 execution (conversations/runs/steps/attached_sources/work_items), 4 output (citations/suggestions), 5 review (DRR/shares/acknowledgements/grants), 6 ontology (classification/relationships).

### 1.7 Front-end

React screens under [apps/web/src/screens/](../../../apps/web/src/screens/); `ask.tsx` is 237 lines. Current Ask composer affordances: a source-insert popover, send/cancel. **None** of the brief's chips exist (role, model, data sources, skills, context, teach), there is no progress rail, no output-destination selector, and no completion footer beyond a `<details>` expander wrapping `RunTrace`.

---

## 2. Permission model interrogation

Verdicts are evidence-led. "Present" means I traced the enforcement to a line;
"absent" means I looked and it is not there.

| # | Question | Evidence (file:line) | Verdict | Risk | Remediation |
| --- | --- | --- | --- | --- | --- |
| 1 | Where is the tenant boundary enforced on the vector query? | Pre-filter, in the WHERE of both retrieval arms: [retrieval.ts:74](../../../packages/knowledge/src/retrieval.ts#L74) `eq(containers.projectId, slice.projectId)` inside `liveLibraryFilter`, applied at [retrieval.ts:117](../../../packages/knowledge/src/retrieval.ts#L117) and [:137](../../../packages/knowledge/src/retrieval.ts#L137). Slice originates at [requester.ts:53-80](../../../apps/api/src/requester.ts#L53-L80) → [access.ts:44](../../../packages/governance/src/access.ts#L44) | **Present** | — | None. This is a pre-filter, not a post-filter, and the organisation boundary rides the same WHERE via `deliverableVisibleSql` |
| 2 | Does a scheme-level boundary exist independently of the org? | `participants` is per (user, project); [access.ts:56-59](../../../packages/governance/src/access.ts#L56-L59) denies unless a live Participant on *this* project. Proven: [access.test.ts:49](../../../packages/governance/src/access.test.ts#L49) | **Present** | — | None. User A in org T can hold project X and be denied Y |
| 3 | Is there an **ethical wall as mutually exclusive grants** — holding X positively excludes Y? | **No such construct.** Nothing prevents one person being made Participant on two projects whose engagements conflict, and nothing flags it. Grep for exclusion constructs: no hits | **Absent** | **Low** *(corrected 2026-07-30 — originally rated High, wrongly)*. The grant is permitted, but it conveys **no cross-project reach**: a request runs in exactly one environment (ADR-0025) and the gateway has no scope-widening parameter, so nothing can be carried from one project into the other. What is missing is the *record* of a firm's own internal wall, not a control that prevents a leak | Optional: a conflict register checked when someone is enrolled — an administrative guardrail against an accidental grant. **Not** an access control, and not an input to `resolveAccess`. Built as T-245/T-246; ADR-0046 |
| 4 | Are role grants enforced at query time or render time? | Query time. `deliverableVisibleSql` is a SQL pre-filter shared by grounding ([retrieval.ts:80](../../../packages/knowledge/src/retrieval.ts#L80)), the library list ([library.ts:10](../../../apps/api/src/library.ts#L10)) and the ontology reads ([ontology.ts:30](../../../apps/api/src/ontology.ts#L30)) — deliberately one function so the three cannot drift | **Present** | — | None |
| 5 | Are permissions ever expressed as prompt instructions? | Grep across all `.ts`/`.tsx` for `do not mention`, `you may only`, `do not reveal`, `is not authorised`, `never mention`, `do not disclose`, `must not reveal`, `not permitted to`: **zero hits**. The two system prompts ([grounded-draft.ts:32-53](../../../packages/capabilities/src/grounded-draft.ts#L32-L53)) contain no access language at all | **Present** | — | None. Add the grep as a CI guard so it stays true |
| 6 | What identity does a downstream call carry? | The run record's, never the caller's: [retrieve-leaf.ts:21](../../../packages/orchestration/src/retrieve-leaf.ts#L21) `requesterOf(ctx.db, ctx.run.requesterParticipantId)`. The leaf's only store reach is the injected `assemble()` ([retrieve-leaf.ts:2-3](../../../packages/orchestration/src/retrieve-leaf.ts#L2-L3)) | **Present** | — | None |
| 7 | Can a downstream call hold wider scope than its caller? | No. The child run is opened with the parent's participant id verbatim ([retrieve-leaf.ts:48](../../../packages/orchestration/src/retrieve-leaf.ts#L48)); the `Assemble` signature carries no scope-widening parameter, and there is a test asserting exactly that ([wall.test.ts:126](../../../packages/knowledge/src/wall.test.ts#L126)) | **Present** | Low | Escalation is structurally impossible, which is the half that matters. Scope is **equal**, not attenuable — there is no way to give a sub-agent *less* than its caller. That is a **hardening, not a gap**: every worker already runs inside the caller's single environment, so equal scope leaks nothing. Optional narrowing on `EntitledSlice` is worth having and blocks nothing |
| 8 | What determines a written-back output's access label? | The writer's own organisation: Ask's "Open in editor" ([ask.tsx:60-65](../../../apps/web/src/screens/ask.tsx#L60-L65)) → `createSandboxDocument` → [sandbox.ts:129](../../../apps/api/src/sandbox.ts#L129) `organisationId: slice.organisationId`. **The sources that grounded the answer are not consulted** | **Absent** | **High.** An answer grounded on a deliverable narrowed to named Participants (ADR-0035 §3) can be carried into a document in a sandbox scoped `multi_org` (ADR-0036) — a real downgrade path from participant-grain to multi-organisation | Implement label propagation: the run's `step.source_set` already records every source seen; compute the most restrictive label across it and refuse (or warn + narrow) when the destination is broader. This is a **security-boundary ticket** and must precede the output-destination selector |
| 9 | Is the assembled context logged and retrievable for audit? | Partially. `steps.source_set` records source *identities* per step ([drawer3-execution.ts:127](../../../packages/db/src/schema/drawer3-execution.ts#L127), written at [run-writer.ts:123](../../../packages/orchestration/src/run-writer.ts#L123)); run request + response are stored. **The assembled passage text is not.** Readable by the producing organisation only ([runs.ts:204-212](../../../apps/api/src/runs.ts#L204-L212)). Retention: unbounded, no policy | **Partial** | Medium. "What did your AI see" answers at document-version grain, not passage grain — thin under a client security review | Record chunk ids (not text) in the source set, so the exact passages are reconstructible from the immutable version. Retention/export is already flagged as Slice C |
| 10 | What happens if a session expires mid-run? | The cookie is set with **no `maxAge` and no `expires`** ([auth.ts:41-46](../../../apps/api/src/auth.ts#L41-L46)) — a browser-session cookie with no server-side expiry and no session table. The run executes synchronously inside the request ([runs.ts:71-78](../../../apps/api/src/runs.ts#L71-L78)); the retrieve leaf re-reads the participant's organisation but **does not re-run `resolveAccess`** ([retrieve-leaf.ts:72-81](../../../packages/orchestration/src/retrieve-leaf.ts#L72-L81)) | **Absent** | Medium now, **high once runs are long-lived.** A Participant revoked mid-run keeps their authority to the end of the chain. Today a chain is seconds; a multi-worker plan is minutes | Absolute session lifetime + server-side session record; re-resolve the slice per plan step, not per request. Both must land before long-running plans |
| 11 | Is the index partitioned per tenant, or filtered? | Single table, single HNSW index, mandatory metadata filter ([drawer2-documents.ts:146](../../../packages/db/src/schema/drawer2-documents.ts#L146)). The filter is unavoidable *by construction* — `groundedLibrary` requires an `EntitledSlice` and both arms build their WHERE from the one `liveLibraryFilter`. But there is **no row-level security**: a new query written elsewhere against `version_chunks` would return everything | **Partial** | Medium. Correct today; one careless future query away from wrong. Fails *open* at the DB, closed only at the code | Postgres RLS on `version_chunks`/`containers` as defence in depth, and/or a dep-rule/lint guard that no package but `knowledge` may import `versionChunks` |
| 12 | Are documents versioned with supersession, and does retrieval respect it? | Yes, in the pre-filter: `state='live'` + `is_current=true` ([retrieval.ts:75-78](../../../packages/knowledge/src/retrieval.ts#L75-L78)). Proven: [wall.test.ts:109](../../../packages/knowledge/src/wall.test.ts#L109) "the superseded Version is never returned, even to the entitled" | **Present** *(exclusion)* / **Absent** *(opt-in)* | Low | Exclusion is right. The brief's worker spec wants `include_superseded: bool` with visible flagging — that path does not exist and is new work |
| 13 | Can web-fetched content reach the same context window as corpus content? | **Not today, and not by enforcement — by omission.** The only outbound HTTP in the codebase is the two model providers ([voyage-embeddings.ts:8](../../../packages/model/src/voyage-embeddings.ts#L8), [anthropic-chat.ts:12](../../../packages/model/src/anthropic-chat.ts#L12)). But the seam is already declared: `attached_sources.kind` includes `'web'` ([drawer3-execution.ts:62](../../../packages/db/src/schema/drawer3-execution.ts#L62)) and is pinnable over HTTP ([attached.ts:78-101](../../../apps/api/src/attached.ts#L78-L101)) — **stored, never read**; grep confirms zero consumers in `knowledge`/`orchestration`. And the prompt is built by concatenating `retrieved.items` ([grounded-draft.ts:60-76](../../../packages/capabilities/src/grounded-draft.ts#L60-L76)), so any pipeline that appends an item reaches the model | **Absent** | **High for Ask specifically.** The brief adds a `web_research` worker. Nothing in the type system currently makes corpus-plus-web a compile error | Make it a typed impossibility before `web_research` exists: a separate `UntrustedItem` type that `groundedDraft` structurally cannot accept, and a worker whose output type cannot be assigned into `AssembledInput`. Security-boundary ticket, sequenced *before* the worker |
| 14 | Rate limiting and cost attribution per tenant? | Rate limit: yes — 10 logins/min/IP, 30 runs/min/user ([app.ts:77-100](../../../apps/api/src/app.ts#L77-L100)), but **in-memory per process** ([rate-limit.ts:3](../../../apps/api/src/rate-limit.ts#L3)), so it does not survive horizontal scaling. Cost: `steps.cost` is written per step ([run-writer.ts:118](../../../packages/orchestration/src/run-writer.ts#L118)) — but the rates default to `0` ([grounded-draft.ts:92-94](../../../packages/capabilities/src/grounded-draft.ts#L92-L94)) and the running app binds the draft leaf **with no options** ([app.ts:118](../../../apps/api/src/app.ts#L118)), so **every step in the live system records a cost of exactly zero**. No per-organisation aggregation exists | **Partial** | Medium. Token counts are real and per-step; money is not. The brief requires per-tenant cost queries | Wire provider rates into config and pass them at leaf construction; add an aggregation read at organisation grain. Move the throttle store to Redis at the infra session (already a noted seam) |

### 2.1 Summary of findings

| Finding | Verdict | Severity | Must precede |
| --- | --- | --- | --- |
| F1 — no conflict register *(an administrative record, not an access gap)* | Absent | **Low** | **Nothing.** The environment already prevents the leak this reached for |
| F2 — write-back takes the writer's label, not the most restrictive input label | Absent | High | The output-destination selector; `document_builder` |
| F3 — no structural barrier between untrusted web content and corpus content | Absent | High | The `web_research` worker |
| F4 — no session expiry; in-flight work keeps stale authority | Absent | Medium→High | Long-running plans |
| F5 — assembled context audited at version grain, not passage grain | Partial | Medium | Client security review |
| F6 — no RLS; the mandatory filter is a code convention | Partial | Medium | Nothing; defence in depth |
| F7 — recorded cost is always zero in the running app | Partial | Medium | Per-tenant cost reporting |
| F8 — sub-agent scope is equal, never attenuable | Partial | **Low** | **Nothing** — a hardening, not a gap |

Nothing here contradicts the design layer's own claims. The permission model
does what its ADRs say it does; the findings are all at the *edges* the Ask
work is about to push on.

---

## 3. Gap analysis

### 3.1 Reusable as-is

- The access predicate and the visibility SQL. Do not touch. Every worker's scope expression should be `EntitledSlice`, and every worker's store reach should go through `assemble()`.
- The Run/Step append-only audit tree, including `parent_run_id`/`child_run_id`. A worker invocation is already representable as a child run; the schema needs no change for fan-out.
- The deterministic ground-check. Stronger than the brief's model-based verifier (see §4).
- The router's security-tier enforcement. Model routing goes *inside* it.
- The citation model and `CitedProse` rendering.
- The e2e substrate: a fake router and fake embeddings ([test-router.ts](../../../packages/knowledge/src/test-router.ts)) already give deterministic runs — this is most of a frozen-corpus fixture mechanism.

### 3.2 Exists, needs modification

| Component | Change | Invasiveness |
| --- | --- | --- |
| `runChain` | The fixed four-step spine becomes a plan executor over a declared DAG. The four current steps become the default plan | **High** — this is the core refactor. Keep the current chain as the "grounded answer" workflow so nothing regresses |
| `step_type` enum | Add worker step types (`plan`, `clarify`, `worker`, `verify`, `synthesise`) | Low — one migration, but the enum is referenced in `contracts` |
| `Router.chat` | Honour the `task` argument against a config routing table; add fallback chains | Medium |
| `grounded-draft` prompts | Become role-overlay-composed rather than two hard-coded strings | Medium |
| `EntitledSlice` | Optional narrowing so a worker's scope can attenuate | Medium — touches the predicate everyone depends on |
| Ask surface | Chips, progress rail, plan view, completion footer, destination selector | High but low-risk (surface only) |
| Attached sources | Currently stored and never read; either wire them or remove the `web` kind until F3 is closed | Low |

### 3.3 Must be built new

Worker registry and typed worker contracts · the plan artefact (schema, storage, permissions, edit-and-rerun) · the authority-corpus store and `canon_lookup` pipeline (declared in types, no data) · `web_research` behind an isolation barrier · schema `extractor` · `workflow_runner` and the DAG declaration format (`packages/workflows` is empty) · role overlay files, loader and validator · clarifying-question machinery · Teach capture, triage tiers and reviewer queue · **the entire eval harness** · streaming.

### 3.4 Direct conflicts with the target design

These are the "raise it, don't resolve it silently" items. Each is a decision
for the user, not for me.

**C1 — Model-chosen orchestration contradicts ADR-0027/0028.**
The brief asks for two modes, one of which lets the chat agent select workers on
the fly. The codebase's central claim is the opposite:

> "The ordering and each step's executor are code, run the same way every time —
> no LLM decides the plan, which is what makes 'every grounded answer is
> ground-checked and cited' provable."
> — [chain.ts:1-7](../../../packages/orchestration/src/chain.ts#L1-L7)

ADR-0027 (thinking vs doing) draws the same line. Model-chosen orchestration is
not a new feature on top of this; it is a reversal of an accepted decision.
**My recommendation:** keep the invariant rather than the mode. Let the chat
agent choose *which declared workflow* and *what parameters* — never an
arbitrary worker sequence. That preserves "the plan is inspectable and
repeatable" and still gives exploration, and it is closer to the brief's own
"route into codified workflows far more often than it improvises". If the user
wants genuine free-form orchestration, it needs an ADR amendment, not a ticket.

**C2 — A frontier-model verifier is weaker than what exists.**
The brief's `verifier` is a frontier model of a different family. The current
ground-check is pure code with no model call ([ground-check.ts:1-5](../../../packages/governance/src/ground-check.ts#L1-L5)) — "every surviving claim is grounded" is *provable*, not probable.
**Recommendation:** the deterministic check stays as the floor and runs on
every answer; the model verifier is an additional layer for the claims the
deterministic check cannot judge (does the cited passage actually *support* the
claim, as against merely being cited). Never a replacement.

**C3 — `web_research` conflicts with ADR-0022's attached-source ruling.**
ADR-0022 as built: attached sources "never join a corpus, never ground, never
emit a citation" ([drawer3-execution.ts:56-62](../../../packages/db/src/schema/drawer3-execution.ts#L56-L62)), and a `web` kind is already reserved
under that rule. The brief's `web_research` returns *sources with citations*.
Those cannot both be true. **Recommendation:** web results are labelled
untrusted, presented as a distinct register (never as grounded project fact),
and cited to URL + retrieval timestamp under a visibly different badge — which
is compatible with ADR-0022 if written down. It needs a ruling either way.

### 3.5 Vocabulary conflicts (CLAUDE.md: CONTEXT.md is the authority)

- **"Role"** already means a Membership role (`owner`/`member`) throughout the codebase and ADR-0015/0016. The brief's role personas are a *register*, explicitly orthogonal to permissions. Using "role" for both will corrupt the vocabulary and, worse, invite exactly the confusion the brief warns against. **Recommend a different term** — "lens" or "persona" — decided by the user and added to CONTEXT.md.
- **"Tenant"** does not exist. Map to organisation everywhere.
- **"The canon"** already exists as the **authority corpus** (ADR-0023). Use the existing name; `canon_lookup` becomes `authority_lookup`.
- **"Matter"** is Legora/legal vocabulary; Infora's equivalent is **project** (or scheme). Do not introduce it.
- **NSIP/DCO/PINS/ExA/PEIR** vocabulary is genuinely absent from CONTEXT.md — the existing domain layer is ISO 19650 / CDE / TIDP / MIDP / DRR, i.e. document control, not consenting. Adding the consenting vocabulary is a real and probably correct extension, but it is a CONTEXT.md change and should be deliberate.

### 3.6 Recommended sequencing (shippable throughout)

1. **Permission remediation first** — F2 (label propagation) and F3 (web/corpus type barrier) are the two that describe real leaks, both *within* a single environment, which is exactly what the environment does not protect against. F6 (RLS) is cheap defence in depth. F4 (session lifetime) matters once plans run for minutes. F1 and F8 gate nothing.
2. **Eval harness second**, before any behavioural change. The fake router already makes runs deterministic; the frozen-fixture mechanism is a small addition. Seed with the permission cases, which are the ones that must run on every build.
3. **Plan artefact third** — persist the *existing* four-step chain as a plan, changing no behaviour. This is the vertical slice that makes everything after it inspectable.
4. **Worker registry fourth**, migrating the four current leaves into it one at a time.
5. **Role overlays fifth** — surface-and-prompt only, no data-access change, so it is independently shippable.
6. **New workers, clarifying questions, Teach, interface** — in whatever order the product wants, each behind the eval harness.

---

## 4. Gate decisions (owner-ruled 2026-07-29)

| # | Question | Ruling | Consequence |
| --- | --- | --- | --- |
| 1 | C1 — model-chosen orchestration | **Both modes, honestly labelled** *(against my recommendation of declared-only)* | ADR-0027/0028 need an **amendment**, not a ticket: the coded-chain invariant becomes "declared orchestration is the product and carries the provable guarantee; model-chosen orchestration is a named, weaker-guarantee mode." Both the plan artefact and the UI must state which mode produced an answer, and the eval harness must report the two separately. Written in Phase 1, §1.3 |
| 2 | C3 — web sources | **Citable, in a separate register** | ADR-0022 amended: web research is carved out from the attached-source "never cites" rule. Web citations carry URL, publisher, date and retrieval timestamp, are badged external/untrusted, and are never rendered like a library or authority citation. The worker still holds no corpus access (F3 stands) |
| 3 | F1 — conflict register | **In scope for this Ask build** | Built as T-245/T-246 with ADR-0046. **Sequencing corrected 2026-07-30:** it was placed first among the permission tickets on the strength of a High rating that did not survive scrutiny — it widens no data access and gates nothing, so it should have gone last or been deferred. Kept as a useful administrative tool; see the correction in ADR-0046 |
| 4 | Vocabulary — the persona | **"Lens"** | Added to CONTEXT.md. "Role" stays reserved for Membership role (owner/member, ADR-0015/0016). A Lens changes register, depth and answer shape — never data access, and the picker must say so |
| 5 | Consenting vocabulary | **Admit to CONTEXT.md** *(Claude's call, flagged)* | NSIP, DCO, PINS, ExA, PEIR, ES, HRA, NPS, s.51, Rule 6/8, ISH/OFH, RIES, DL, CoCP, REAC, Rochdale Envelope, Advice Note 7 enter CONTEXT.md as a consenting-domain section in Phase 1 |
| 6 | Teach vs Signals | **Teach is a capture path into the ADR-0026 Signal/distillation loop**, not a parallel system *(Claude's call, flagged)* | The brief's "tenant signal never reaches the shared layer without de-identification and human approval" is already ADR-0026's destination rule. Teach reuses it; the triage tiers and reviewer queue are the new parts |
| 6b | Teach's destination | **No aggregation across customers — Teach improves the individual organisation's own signals** *(owner-ruled, on the Phase 1 draft)* | Removes the third destination entirely: no shared-domain layer, no de-identified egress to Infora, no cross-customer aggregation. ADR-0026 applies unchanged rather than being extended; the Steer tier becomes exactly its curation act, approved by the firm's own curator. Two eval libraries that never merge ([07 §3.1](07-eval-harness.md)). Cost, accepted: Infora's own suite grows only by Infora's own work |
| 7 | Ticket numbering | **T-245 onward**, counter bumped in the same commit, on a branch *(Claude's call, flagged)* | Worktree not requested; the board notes two prior numbering collisions, so the counter check runs before minting |

### 4.1 What decision 1 costs, and how Phase 1 contains it

Model-chosen orchestration is a genuine reversal of an accepted invariant, so it
is written down as one rather than absorbed quietly:

- **The ADR amendment is a Phase 1 deliverable**, not a Phase 3 afterthought.
  ADR-0027 §6 and ADR-0028 §5 currently assert that no LLM decides the plan.
  They will assert instead that no LLM decides the plan *of a declared
  workflow*, and that model-chosen runs are a separately labelled class.
- **The guarantee that must survive both modes:** ground-check runs on every
  answer regardless of mode, because it is code and sits outside the plan. What
  a model-chosen run loses is *repeatability of the step sequence* — not
  grounding, not citation, not audit.
- **Honest labelling is a hard requirement, not a UI nicety.** The plan artefact
  records its mode; the completion footer states it; the run record stores it.
  A user must never be unable to tell which kind of answer they are holding.
- **The eval harness reports the two modes as separate categories** from the
  first seed case, so a regression in declared orchestration can never be masked
  by an improvement in model-chosen, or the reverse.

### 4.2 Still open — raised in Phase 1, not blocking

**Slice placement.** This work spans Slice C (governance depth), D (retrieval
maturity), E (the moat loop) and F (build-your-own). Phase 1 will propose Ask as
its own slice that *borrows* from those rather than absorbing them, and name the
overlaps explicitly so nothing is built twice.

---

*Written for Phase 0 of the Ask agent-harness build. No application code was
written in this phase.*
