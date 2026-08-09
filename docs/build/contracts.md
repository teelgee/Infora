# Contracts — the API's law, its catalogue, and the record of why

> **Status: living reference, re-cut 2026-08-04.** This document held the
> walking skeleton's first-cut type listings (2026-07-04) and grew a dated note
> per slice until the copies drifted from the code — `AssembledItem` here
> lacked the `chunkId` the real type has carried since T-253. The re-cut ends
> the copy: **`packages/contracts` is the spec**, and nothing in this file
> restates a type. What lives here is the three things the code cannot say
> about itself — the **principles** the whole API is held to, a **catalogue**
> of what each contract guarantees and where it lives, and the **dated log of
> why** contracts took the shape they did. Contract completions still get
> dated notes here (the standing rule), filtered: an entry earns its place by
> recording *why*, never *what* — "what" is `git log`'s job.

## Principles — API law, and what enforces each

Five principles from the design layer, restated as law. They are authority the
code is held to, not description of it — which is why three of them are
**tests** and the other two are **structural guards**, so breaking one is a
red build rather than a drift.

1. **One typed API, thin surfaces.** Every surface — `web`, `word-addin`,
   `copilot-agent` — calls these contracts and resolves nothing locally
   (component 8). `packages/contracts` is the single source of truth;
   `apps/api` implements it. *Enforced structurally:* `scripts/dep-rules.mjs`
   fails the build if a surface depends on anything but `contracts` + `ui`.

2. **No scope-widening parameter exists.** No call takes a corpus, store,
   organisation or visibility argument that could widen what the requester
   reaches; scope is derived server-side from `(environment, requester)` —
   the ADR-0029 shape, applied to the whole API. *The test:*
   [wall.test.ts](../../packages/knowledge/src/wall.test.ts) pins the exact
   key set of `AssemblyRequest` and `AssembledItem` at compile time, so adding
   any parameter is a reviewable event. Output-side fields (`chunkId`,
   `locator`) are admitted there by name, with the argument recorded beside
   the pin.

3. **The requester is resolved, never supplied.** Identity comes from the
   session (or Entra SSO for Copilot, ADR-0031), resolved server-side to
   `(user, organisation, participant)`. A request body may name a *subject* —
   the colleague being enrolled, the organisation being shared with — but
   never the requester. *The tests:*
   [principles.test.ts](../../packages/contracts/src/principles.test.ts) walks
   every body schema and pins the reviewed subject-field list, so a new
   identity-shaped key fails until argued in; and
   [requester.test.ts](../../apps/api/src/requester.test.ts) (T-023) proves
   resolution sits in front of every endpoint at the HTTP boundary.

4. **Deny is silent.** An unentitled request returns the same `404 not_found`
   as a nonexistent resource — existence is never leaked across the wall.
   `forbidden` exists only *within* an entitled scope, where existence is
   already visible. *The tests:*
   [principles.test.ts](../../packages/contracts/src/principles.test.ts) pins
   the error vocabulary so a new error word is a reviewable event, and
   [requester.test.ts](../../apps/api/src/requester.test.ts) drives every
   scoped route with an unentitled requester and asserts the identical 404.

5. **Append-only reads are reconstructions.** `Run`/`Step`/`Signal` reads
   return the immutable record; there is no mutating verb on any append-only
   table (ADR-0028 §3). *Enforced at the database:* the T-008 append-only
   trigger rejects `UPDATE`/`DELETE` on the record tables, tested in
   `packages/db`.

## The catalogue — what each contract guarantees

Pointers, never copies. Each entry names the guarantee; the file is the shape.

| Contract | Guarantees | Spec |
|---|---|---|
| **The assembly gateway** | One call `(request, environment, requester) → assembled input`; access resolution runs *inside* it, before retrieval, and every retrieval — baseline and sub-agent — goes through it. No widening parameter is expressible (principle 2's pinned shape). A `Locator` is exact-or-absent: a span demonstrated to still resolve, never a guess. | [assembly.ts](../../packages/contracts/src/assembly.ts) |
| **The record types** — `Run`, `Step`, `Citation`, `Suggestion` | Every step carries the two defensibility fields (`sourceSet`, `railOutcomes`, ADR-0028 §7) plus model, usage and egress facts; a citation resolves to a version or an authority ref; a suggestion is resolved exactly once and its resolution is the Signal. | [shared.ts](../../packages/contracts/src/shared.ts) |
| **The plan artefact** — `Plan`, `PlanStep`, `PlanStage` | The persisted analysis behind a run: mode stored, never derived; versioned by supersession, immutable from `ready`; a step declares no scope, so no plan edit can widen reach. | [shared.ts](../../packages/contracts/src/shared.ts) |
| **HTTP bodies and responses** | Request bodies are zod schemas, so `apps/api` validates against the same source the surfaces type against; responses are plain types. Scope-relevant reads are pre-filtered server-side with no parameter. | [endpoints.ts](../../packages/contracts/src/endpoints.ts) |
| **The Lens** | A register control, never a reach one: the shape has no field a Lens could use to narrow or widen retrieval, and `governance`/`knowledge`/`data` may not mention a Lens at all (source-rule 3). | [lens.ts](../../packages/contracts/src/lens.ts) |
| **The untrusted-content barrier** | `ExternalSource` is a *different type* from `AssembledItem` with no conversion function anywhere in the repository; the mistake is not expressible, checked by must-not-compile fixtures on every build (T-250). | [external.ts](../../packages/contracts/src/external.ts) |
| **The error envelope** | One envelope; `not_found` covers nonexistence and denial alike (principle 4); the vocabulary is pinned. | [errors.ts](../../packages/contracts/src/errors.ts) |
| **The ingest entry points** *(internal, `@infora/data`)* | `ingestVersion(db, router, versionId)` on every product path — an unknown id throws rather than indexing nothing quietly; the full-table sweep survives only as `ingestAllVersions`, reachable from the dev CLI and e2e substrate and from nothing on a request path. | [ingest.ts](../../packages/data/src/ingest.ts) |
| **The router policy layer** *(internal, `@infora/model`)* | Every `chat`/`embed` call selects a tier-conforming route and **fails closed** when none conforms; an undeclared endpoint conforms to nothing; egress facts ride every result into the Step audit (ADR-0037). Provider SDKs live only in `packages/model`, guard-enforced. | [packages/model/src/](../../packages/model/src/) |

## The completion log — why, not what

Dated entries that record a *reason* the contract took its shape. Endpoint
additions, field additions and mechanical completions are `git log`'s job and
are not recorded here.

- **2026-07-06 — per-item suggestions.** A run produces zero or more
  Suggestions, each individually resolvable, because a single blob resolution
  would make one bad sentence veto a good page.
- **2026-07-09 (T-089) — `open_world` as a rail outcome.** An uncited
  model-knowledge claim is *kept* in chat and labelled, while
  document-targeted drafting stays grounded-only — the register split that
  lets Ask be useful without letting the record absorb unsourced prose.
- **2026-07-12 (owner-ruled, T-104) — the run read turns inward.** Every Run
  is readable by its producing organisation only; the owner reviews the
  *document* through the review cycle, never the agent's internals, because
  the consultant carries the professional liability. Superseded the
  2026-07-06 owner read. Full reasoning: ADR-0028's status block.
- **2026-07-18 (ADR-0033) — the roster read widened.** The project roster is
  visible to every Participant where T-112 had scoped it to the requester's
  organisation: **the wall hides work, never presence.**
- **2026-07-22 (ADR-0037, T-139–T-144) — the router fails closed.** A route
  with no declared attributes reads as `UNATTRIBUTED` and conforms to
  *nothing*, because a policy layer that defaulted open would be a comment,
  not a control. Availability is never traded for conformance.
- **2026-07-26 (ADR-0043 P1, T-220) — rename rides through a checkout,
  replace does not.** A title is author-owned metadata, not canonical content
  (the T-166 precedent), so renaming a checked-out document is allowed;
  replacing its native file rewrites canonical bytes and is refused while
  `head_locked`, exactly like the T-122 conversion.
- **2026-07-31 (T-249, finding F2) — carrying an answer into the editor
  became one server-side act.** The old client-side create-then-PATCH gave
  the server no provenance to enforce labels against; `POST
  /runs/:runId/sandbox-document` exists so the server *knows* the content
  came from this run, can compute its label, and can refuse a destination
  that would widen it, naming both labels. Override is explicit, reasoned,
  attributed, and written in the same transaction as the content — there is
  no config key that does this.
- **2026-07-31 (T-253) — `chunkId` is an audit field, never a scope one.**
  It records what retrieval returned and cannot influence what retrieval
  returns; the pinned key-set test was widened deliberately, with that
  argument recorded beside the pin. `unreconstructable` is a count, not a
  silently empty passage — zero because the chunk is gone must never read as
  zero because nothing was lost.
- **2026-07-30 (T-260) — the plan type shipped before its endpoint.** The
  read carries the run's producer-private scope exactly, and shipping the
  type first keeps the writer and the eventual reader honest about one shape.
- **2026-08-01 (T-281/T-299) — an unknown `lensId` is a 400, refused before
  the run opens.** Never a silent fall-back: a user who asked for the
  Communications register and quietly got the planning one receives an
  answer that reads plausibly and is wrong for them. `400` rather than `404`
  because the Lens set is not access-controlled, so naming the id leaks
  nothing and `not_found` would wrongly imply it might exist for someone
  else.
- **2026-08-01 (T-283) — `GET /lenses` is deliberately not access-resolved.**
  The Lens set is a property of the deployment, identical for every
  requester — a list that differed by who asked would make a Lens a reach
  control. `defaultLensId` is config, not code, and reports `null` on a typo
  rather than preselecting an id the run endpoint would then refuse.
- **2026-08-01 (T-254, finding F7) — null means unpriced, zero means free.**
  `Step.usage.cost` became `number | null` because the reader was coercing a
  null column to `0` — the arithmetic succeeds, the number is plausible, and
  a business case gets built on it. `unpricedSteps`/`unpricedModels` sit
  beside every total because a total read without them is a lower bound. The
  cost report is org-scoped and org-admin only — a project total would sum
  two organisations' private work and hand it to whichever asked.
- **2026-08-04 (T-271) — store the position, compute the view.** A character
  span into `versions.content` is the only *exact* locator; paragraph is
  derived, and page and section are **absent rather than guessed** (a docx
  has no pages). A locator is emitted only when the stored span is
  demonstrated to still resolve — a citation that renders and does not
  resolve is worse than none, because it looks checkable. `verbatim` is what
  the document says at the span, not what the model was shown; they differ
  wherever the chunker rewrote whitespace, and the first is what a reader
  checks.
- **2026-08-04 (T-301) — a refusal from the elevated gate is written down; a
  cross-organisation attempt is not.** The cross-org case is answered `404`
  *above* the tier check (principle 4), and logging it would record an act
  against a container the requester was never shown. The two `detail`
  strings (`elevated_required` / `super_user_required`) stay different —
  unifying them inside an audit ticket would be a contract change in
  disguise.
- **2026-08-04 (T-302) — ingest split in two because the sweep was ~125,000
  re-ingests.** One function was serving two jobs that scale differently:
  bulk-loading [v1.md](v1.md)'s 500-document corpus through the
  walk-every-version path is roughly 125,000 re-ingests, and the failure was
  live — the shared dev database hit ~1,050 versions and the api suite began
  timing out in exactly the cycle tests that admit a version to grounding.
  The split also closed a masked gap: a promotion onto a library container
  previously left the new current version chunkless until the *next*
  acceptance anywhere in the project, silently dropping it out of retrieval.
- **2026-08-06 (T-346) — the submission acknowledgement lives on the round,
  not the transmittal it acknowledges.** The first cut put the who/when pair
  on the review transmittal — the thing being received — and the database
  refused it: transmittals are append-only by trigger (ADR-0009/0010), and
  carving an exception for one column pair would spend a load-bearing
  invariant on a tidy noun. The round is one-to-one with the submission and
  already mutable by design, so `POST /rounds/:id/acknowledge` writes the
  pair in the same statement that moves `submitted → open`, and `Round`
  (not `TransmittalRecord`) carries `acknowledgedBy`/`acknowledgedAt`.
- **2026-08-06 (T-350) — the distribution cut is the endpoint's, never the
  client's.** `GET /containers/:id/transmittals` returns three different
  shapes for the same container by viewer (owner: every recipient
  organisation + acknowledgement state; receiver: its own rows; producer:
  rows with `recipientsWithheld`), because a surface must not *receive* what
  its viewer may not see — a fuller payload filtered client-side would put
  the competitor list one devtools tab away (ADR-0035 addendum). The row
  also carries `roundState` so the surface can tell "awaiting
  acknowledgement" from pre-gate history: rounds that advanced before
  migration 0040 have no receipt, and rendering them "awaiting" would be a
  false fact.
- **2026-08-06 (T-353) — completion is a signal on the read, not a state in
  the machine.** `Round.reviewerCompletions` answers "has each reviewer
  finished?", which was previously not derivable — a reviewer with nothing
  to say is done, not absent. Two deliberate negatives shape the contract:
  the mark/withdraw acts are legal only on an `open` round, so the set
  freezes at issue with no trigger; and the field is phased server-side
  under the same ADR-0014 rule as the comments, because a completion is
  reviewer-side positioning and returning it to the authoring side during
  an open round would leak through a different door what the comment
  phasing walls off.
- **2026-08-09 (T-354) — the change link is declared as an anchor, never
  sent as a version id.** `createReviewResponseBody`'s XOR moved from
  `nextVersionId` to `nextVersionAnchor.quote`, because the id was
  unobtainable by design: the respond phase runs *before* vN+1 exists —
  promotion is gated on the responses — so a contract demanding the next
  version's id at respond time could only ever be satisfied by the
  no-change half, which is exactly what both forms did. The consultant
  declares the revised passage; the promotion that creates vN+1 stamps
  `nextVersionId` on the change-declared responses in the same
  transaction. No-change responses stay unlinked by definition.
- **2026-08-09 (T-359) — the import's verdict is whole-file, and its error
  names the Excel row.** `PlanImportResult` / `PlanImportError` exist because
  a batch-create act needs a batch-shaped answer: one failing row refuses the
  lot (`failures[{row, problem}]`, the 1-based row the user sees on screen),
  because a partial import would silently renumber everything after the bad
  row — file order *is* numbering order (S3). `ignoredColumns` is in the
  success shape so dropped role and reference-like columns are stated, never
  silent — appointments must stay propose/confirm acts (ADR-0033), and saying
  so beats a spreadsheet column quietly doing nothing. There is deliberately
  no import body schema: the input is a file, transient by rule
  (personal-data.md — its author/reviewer columns carry named people), so
  no persisted contract type may carry its contents.
- **2026-08-09 (T-360) — the plan read carries the organisation's column
  standard, not the user's.** `GetPlanResponse.planColumns` rides the plan
  read rather than a preferences read because the ruling is *org-standard,
  locked, no personal overrides* (S3): the value is a fact about the
  requester's membership — the (organisation, project) grain, stored beside
  `ack_mode` — and putting it anywhere near `users.preferences` would invite
  the per-user override the owner explicitly refused. Null means the default
  set, so a project that never configures columns pays nothing.
- **2026-08-09 (T-365) — a folder says what owns it.** `SandboxFolder` gained
  `kind` and `containerId` because the plan-locked mode makes some folders the
  *plan's*, not a person's, and the surface must be able to tell without
  guessing from names: a `discipline`/`deliverable` folder neither drags nor
  moves nor renames by hand — its name comes from its row — and `containerId`
  is what lets a draft filed in a working folder pre-select its bind target
  (ADR-0038 addendum) rather than the surface string-matching folder names to
  references. `Sandbox.planLocked` sits beside `allowMemberFolderCreate`
  rather than replacing it with a three-state enum, because the ruling is that
  the two *compose*: inside a deliverable's folder the member toggle still
  governs, and one enum could not say that.
