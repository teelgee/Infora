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
| **The ingest entry points** *(internal, `@infora/data`)* | `ingestVersion(db, router, versionId)` on every product path — an unknown id throws rather than indexing nothing quietly; the full-table sweep survives only as `ingestAllVersions`, reachable from the dev CLI and e2e substrate and from nothing on a request path, and its one option **narrows** — a project scope, never a corpus, store or organisation parameter. | [ingest.ts](../../packages/data/src/ingest.ts) |
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
  ([personal-data.md](../architecture/personal-data.md) — its author/reviewer
  columns carry named people), so
  no persisted contract type may carry its contents.
- **2026-08-09 (T-360) — the plan read carries the organisation's column
  standard, not the user's.** `GetPlanResponse.planColumns` rides the plan
  read rather than a preferences read because the ruling is *org-standard,
  locked, no personal overrides* (S3): the value is a fact about the
  requester's membership — the (organisation, project) grain, stored beside
  `ack_mode` — and putting it anywhere near `users.preferences` would invite
  the per-user override the owner explicitly refused. Null means the default
  set, so a project that never configures columns pays nothing.
- **2026-08-09 (T-364) — the agent's answer is a proposal, and its failure is
  a question.** `ProposeFolderStructureResult` carries `nodes` *and* a nullable
  `followUp` rather than either a bare tree or an error envelope, because an
  assistive agent has three honest outcomes and only two of them are success:
  it proposes, it asks, or it cannot help — and asking must not read as
  failure to the surface. Unparseable model output is therefore mapped to a
  question rather than a 500: the builder stays usable by hand either way,
  which is what makes this shippable while `Q-020` (sandbox content in agent
  context) is still open. There is deliberately no "apply" endpoint — the
  existing deterministic `folder-structure` POST is still the only thing that
  writes, so ADR-0027's propose-confirm split is structural, not a convention.
- **2026-08-09 (T-355) — promotion says which legal source it took, and the
  internal QA series became addressable.** `PromotionResult.source` exists
  because the gate's whole point is that what promotes is the QA-accepted
  frozen version, never the drifted head — and a surface cannot state that
  honestly if the API only implies it. `SandboxDocument.freezeContainerId`
  exists because `POST /freeze` was the only place the freeze container's id
  ever surfaced, which is precisely why the org-private QA cycle was
  API-complete yet unreachable from any screen. `PlanRow.documentReference`
  widened to `string | null` rather than minting a parallel QA-row type: a
  sandbox-scope container genuinely has no coded reference (ADR-0032), and
  the qa-row read serves it through the same shape so the cycle and status
  screens need one renderer, not two. `Sandbox.promotionRequiresQa` rides the
  ADR-0040 settings substrate — default on for project sandboxes, off for
  personal ones, and every e2e spec that promotes bare-headed now performs
  the deliberate gate-off act the ruling models instead of inheriting silence.
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
- **2026-08-22 (T-371) — the review period's default got a home, and it is not
  the schema.** `ReviewPeriodSettings` is its own read/write pair on the project
  rather than a `NamingSchemeField`, and the reason is downstream: the schema's
  fields are the header row of the fillable deliverables template (T-337/T-359),
  so a review period modelled as a schema attribute would have shipped as a
  spreadsheet column nobody should be filling in. The type carries a count of
  working days and no dates at all — the *target* stays on `Round`, computed at
  round creation — because a project row that held dates would have to be
  rewritten every time a round opened, and changing the default would silently
  move a round already under way.
- **2026-08-22 (T-372) — a reviewer grant carries three answers, not one.**
  `ReviewerGrant` gained `acceptedAt` / `declinedAt` / `declineReason` beside
  `confirmedAt` because they are answers to different questions by different
  people: confirmation is the **owner's** act and is where access begins
  (ADR-0015's share-first invariant bites there), while acceptance is the
  **appointee's** and is where the undertaking begins. Collapsing them into one
  field would have made the very thing this ADR exists to end — an appointment
  recorded as agreed when the named person never agreed — unrepresentable to
  read but still true in fact. `declineReason` is the first field in the
  contract that is **nulled by reader rather than by state**: it reaches the
  owner organisation and the person who wrote it, and nobody else, so the
  producing side learns *that* a lead reviewer is awaited and never *why*.
  `AppointmentGrant.grantedBy` came along because the undertaking card asks a
  named person to take on a duty, and a request to do that should say who is
  asking; the fact was already stored and merely unexposed.
- **2026-08-22 (T-374) — the receipt's refusal names a role, not an
  organisation.** `owner_organisation_or_reviewer_only` became
  `lead_reviewer_or_owner_super_user_only`, and the rename is the whole ruling
  in one string: the act is no longer decided by which organisation you belong
  to but by whether you hold the live lead grant, with the elevated tier as the
  away-lead fallback. Keeping the old code would have left every client
  rendering a sentence about the owner organisation for a gate that no longer
  consults it. No new type: the narrowing is entirely a guard, because the facts
  it reads — `ReviewerGrant.isLead`, `acceptedAt`, and the requester's own
  `elevated` — were all already on the wire.
- **2026-08-22 (T-373) — the promotion window reads the act's own decision.**
  `PromotionPreflight` exists because the window has to state what the click
  will do *before* it happens — which version promotes and who accepted it, what
  revision it becomes, and any refusal it would answer with. The type is served
  from `resolvePromotion`, the single function the POST also runs, and that
  sharing is the entire design: a preflight computed separately from the act is
  a preflight that will eventually lie about the act, which is worse than no
  window at all. Its `blocker` is **data, not a status** — the window renders it
  beside a disabled Promote, and a 409 on the read would leave the window with
  nothing to draw. `promoteDocumentBody` takes only `reviewPeriodDays`, and that
  narrowness is the ADR-0008 answer in the contract: the reviewer and metadata
  edits are the *existing* acts on their own audited endpoints, which the window
  fires before it promotes, so the window sequences acts rather than becoming a
  composite write that could smuggle a wall-crossing grant past confirmation.
- **2026-08-22 (T-375) — the wall says it is a wall.** `Round.commentsWithheld`
  exists because `comments: []` cannot tell "none were written" from "these are
  not yours to read yet", and the review record has to say which. That is the
  house rule stated in a field: silence would read as absence, and absence is a
  different and wrong fact. It is computed in the same server-side phasing that
  already drops the comments (ADR-0014), so a surface can never disagree with
  the read that fed it — and the surface's own counts are taken off what
  arrived, never off the whole record, because a header claiming five comments
  beside three visible rows would leak the shape of what the wall withholds.
- **2026-08-22 (T-376) — a nullable type that was never null reopened invented
  references.** `GetNamingSchemeResponse` stopped being `NamingScheme | null`,
  and the reason is what the nullability was costing rather than what it was
  saying. The read has never returned null — `loadSchemeOrDefault` serves the
  Infora default when nothing is saved (T-188) — so on the client `null` meant
  only "not arrived yet" or "the read failed", while the plan screen took it to
  mean *this project has no coding scheme* and offered a hand-typed reference
  field. A slow read therefore flashed a control that vanished under the user,
  and a failed read silently degraded to inventing references, which is the
  exact thing ADR-0008 exists to prevent. The three states are the client's, not
  the wire's, and they are now held there (loading / ready / failed) with
  creation refused rather than degraded. The lesson worth keeping is general:
  an optional type is a claim that the absent case is *reachable and meaningful*
  — where it is neither, some surface will eventually invent a meaning for it.
- **2026-08-22 (T-377) — the lead swap became one act because the invariant
  made two acts inseparable.** `POST /containers/:id/lead-reviewer`
  (`nameLeadReviewerBody` → `LeadReviewerReplacement`) exists because the
  promotion window fired the swap as revoke-then-grant, and the one-live-lead
  invariant means any failure between the two strands the deliverable with no
  lead at all — the audit reproduced exactly that. A composite write is
  normally the thing this contract avoids, but a swap is not a composite: it is
  one decision whose two rows are meaningless apart, which is the test for
  fusing them. Both interval rows still land on the record, and the naming
  follows the ordinary confirmation rules, so nothing about the wall moved.
  The same ticket relaxed the promotion gate to a *named* lead — proposed is
  enough — because ADR-0033 §1 says a replaced lead *stalls* the round, and a
  stall requires the submission to exist.
- **2026-08-22 (T-379) — `Round.completionsWithheld`, for the same reason
  `commentsWithheld` exists.** The completions array was already withheld
  server-side, but an empty array alone cannot tell "nobody has finished" from
  "not yours to know while the round is open" — and a surface duly invented
  the wrong meaning, badging every reviewer "Reviewing" off data it was never
  sent. Same phasing, same field shape, same house rule.
- **2026-08-22 (T-382) — the promotion body carries what the caller was
  shown.** `promoteDocumentBody.expectedSourceVersionReference` exists because
  the preflight and the act share one decision function, which pins the gates
  but not the *statements*: a QA acceptance landing between window and click
  changed which content promoted with no re-confirmation. The field is the
  caller's quoted answer, not a lock — omitted means no check, so callers that
  never stated a source are untouched.
- **2026-08-27 (T-305) — `Locator.page`, and the format enum it needed instead
  of a column.** T-271 recorded that page was *"absent rather than guessed"*
  because a docx has no pages; the PDF input path is what changes the source
  material rather than the rule. Page arrived as an **optional** field on the
  existing type, derived exactly as paragraph is — count the separators before
  the span — because the extractor terminates every page with a form feed and
  `versions.content` therefore carries the boundaries. That is why a locator
  gained a dimension and `version_chunks` gained no column: the spike's rule
  (store the position, compute the view) is what made the second format free.
  Absent still means absent — every docx reports no page, and always will.
  `SandboxDocument.format` gained `'pdf'` on the same ticket, and the shape
  worth noticing is that a PDF is the one uploaded format whose `content`
  is populated at upload: it has no conversion path *by design* (ADR-0004 —
  the PDF is the record rendition, never an editing surface), so its text is
  taken when its bytes arrive or never. The refusals are typed too
  (`pdf_no_text`, `pdf_encrypted`, `pdf_unreadable`, `pdf_unsupported_filter`)
  rather than collapsed into `unreadable_file`, because "this is a scan and
  Infora does not do OCR" and "this file is damaged" are different instructions
  to the person holding the document, and v1.md requires the refusal to be
  loud and per-document.
- **2026-08-27 (T-303) — the bulk load has a report, not a return code, and
  `@infora/data` gained `isVersionIndexed`.** The load's contract with its
  operator is `LoadReport`: four counts and a **per-document outcome** —
  `loaded` / `present` / `reindexed` / `refused`, the last carrying a named
  reason. A boolean or a count would have satisfied "it worked" and failed the
  obligation that actually matters, which is that a 460-of-500 load must not be
  able to read as a success. `reindexed` exists because the resume question is
  not *"does a row exist"* — a document whose container committed and whose
  embedding call then died is in the library, listed, and answering nothing —
  so the resumable unit is **indexed-ness**, and that question had to move into
  the package that owns the index. `isVersionIndexed(db, router, versionId,
  projectId)` takes the project explicitly rather than inferring it, because
  the index is under RLS and the policy **fails closed**: an unscoped read
  reports every version unindexed, which would re-embed the corpus on every
  resume. `extractText` in `apps/api/src/extract.ts` is the other half — one
  vocabulary of refusal shared by the upload door and the load, so a reason a
  person reads is the same string in both places.
- **2026-08-27 (T-337) — `ApiError.hint`, and an import that returns a
  proposal.** `SchemaImportResponse` carries **candidates**, not a saved
  scheme, and the endpoint's own acceptance test is that the project's scheme
  is byte-identical afterwards. An import that wrote by arriving would let a
  mistyped upload rewrite a project's numbering, which every reference in the
  record is built on; the existing `PUT` still commits. It is also **the first
  endpoint with no model call by design** rather than by not needing one — no
  Run, so nothing for `runs.request` to echo, which is how the personal-data
  constraint is met structurally rather than by remembering to strip a field.
  `hint` is new on the envelope and is a genuinely different thing from
  `detail`: `detail` is a machine code the surface maps to a sentence, `hint`
  is request-derived text no map could hold — *which* columns the sheet had,
  *which* row was wrong. A refusal a person can act on usually needs both, and
  folding the second into the first would make `detail` unmappable. It carries
  only what the requester supplied, which is the rule that keeps it from
  becoming a leak wearing an error's clothes.
- **2026-08-27 (T-315) — `RemoveOrgUserResponse`, and an act the API did not
  have.** `DELETE /organisation/users/:userId` is new because the *removal* was
  new: the API could enrol and remove a **Participant** and had no way to say a
  person had left the **organisation** at all, which is why T-251's
  `revokeUserSessions` had nothing to be called from. The response returns
  counts — `sessionsEnded`, `participationsClosed` — rather than `204`, because
  the question an incident asks is "when did they lose access, and how much of
  it", and a bare no-content answers neither. The two endpoints stay separate
  and their asymmetry is the contract: project → account does not follow (one
  client engagement ending must not sign a consultant out of every project),
  account → project does (ADR-0033 staffs a Participant *from* the
  organisation's seat, so the seat cannot outlive the person). Self-removal is
  `conflict`, not `not_found`, per errors.ts — the requester can plainly see
  themselves, so existence is not what is being protected.
- **2026-08-27 (T-328) — the finding schema, and the dishonest object that no
  longer compiles.** `Finding` is minted ahead of the checker DAG and the
  findings surface because neither can be specified without it, and the reason
  it earns a note is *how* ADR-0048 is carried: `evidence` is a **union
  discriminated by the input the finding arose from**, so §7's "three inputs,
  three honest treatments" is a type rather than a rule an implementer must
  remember. A rulebook finding has nowhere to put a `Citation` — the object with
  one in it does not typecheck — which is §5's quotable-but-never-cited ruling
  made structural. The same union is what gives §5's clause quote a home
  (`clause` + `quote`, no citation anywhere near them), and that field is the
  reason T-308's loader must preserve structure: a rulebook chunked for steer
  alone would leave it unfillable and the ruling would die on the screen. A
  proposed revision is a `Suggestion` and not free text (§3), so the checker
  gains no write path the drafting side lacks. **`FindingStatus` is
  `SandboxComment['status']` word for word**, pinned by a test: ADR-0049 §7
  blocks promotion on open findings and open threads identically, and two words
  for one state is how "why does this list stop me and that one not" starts
  needing an answer. **Severity is `required | advisory`** — this ticket's call,
  argued in the type's own comment. Types only, no zod: what the checker's model
  call must return is a parse boundary that belongs to T-310, and inventing it
  here would specify that ticket ahead of itself.
- **2026-08-27 (T-308) — `AssembledItem.source` becomes optional, and that is
  the interesting half.** The rulebook endpoints (`RulebookRecord`,
  `ListRulebooksResponse`) are ordinary; the change worth recording is one
  question mark on the assembly contract. ADR-0048 §5 says a finding may quote
  a house rule **verbatim and never cite it**, and `source` is defined as *what
  a citation resolves to* — so a guiding item must not have one. Absent now
  means **not citable**, which is exactly what the guiding channel has always
  been (ADR-0021) and was previously true only by convention: every guiding
  item was forced to carry a source identity it had no business having.
  `sourcesOf` already skipped non-grounded channels, so nothing a run records
  changes; what changes is that a rule can no longer be *made* into a source by
  a later caller reaching for the field. The clause address a finding needs
  lives in the new `rule` instead — `{ rulebookRef, clause, heading }`, pairing
  with `RulebookEvidence` in finding.ts — deliberately outside `source` so it
  cannot resolve like a source chip. The shape pin in
  `packages/knowledge/src/wall.test.ts` fired on both changes, which is the
  review it exists to force.
- **2026-08-28 (T-384) — `PlanRow` gains `withdrawnBy` and `withdrawalProposal`,
  and the second one exists because the ruling left a proposal nowhere to
  live.** ADR-0013 §2 gives a published deliverable's record to the owner and
  says the producing organisation *proposes* — but the migration drawn for the
  slice ([data-model.md](data-model.md)) drew two columns and no proposal table,
  and it enumerated what it deliberately left undrawn without naming one. So a
  proposal is carried by the **same two columns as a withdrawal**, with record
  state telling them apart: reason + proposer recorded while `state` is still
  `live` is a proposal in flight, and nothing about the deliverable has changed
  — it is in the library and it still grounds until the owner answers. That is
  why `withdrawnReason` is now **suppressed** while a proposal stands rather
  than shown: one column meaning two things is tolerable in the store, and is
  not tolerable in a contract a surface renders. `withdrawnBy` carries a
  derived `side` (`owner | producer`) rather than an organisation id, because
  every consumer — T-385's restore rule, T-389's buttons, T-388's badge — asks
  which *side* acted and none of them asks *which organisation*.
- **2026-08-28 (T-388) — `ContextState` is a read with no writer, and that is
  the point.** `LibraryItem` and `PlanRow` both gain `contextState`
  (`{ grounds, reason }`), answering *may the AI rely on this, and if not why*.
  There is deliberately no endpoint that sets it: ADR-0013 §6 forbids storing
  the composite answer, because a persisted "this grounds" flag is a second
  state machine that can disagree with the first — and the drift would be
  invisible, since every citation would still resolve. So the type is derived
  from the same three conditions retrieval's `WHERE` clause reads, and the two
  agree by being the same three facts rather than by sharing a cache.
  **`reason` carries the project's own words, not a platform enum:** for a
  non-grounding acceptance code it is that code's description, because the 2021
  National Annex requires each Published code's meaning to be written into the
  project's information standard — there is no phrase Infora could ship that
  would be true of every project. It lands on **both** reads because they show
  different halves: the library list carries only the live corpus, so it is
  where a live-but-out-of-reach deliverable is visible at all, and the plan is
  where a `superseded`, `withdrawn` or `rejected` record is actually read.
- **2026-08-28 (T-389) — `LibraryItem` gains `producingOrganisationId` and
  `withdrawalProposal`, and the first one is the interesting half.** The list
  has carried `producerName` since T-086 and that was enough while the screen
  only ever *read*. The lifecycle acts are the first writes on it, and which
  side you are on decides which act you hold — the owner ends a published
  deliverable, the producing organisation asks the owner to (ADR-0013 §2) — so
  a display string cannot answer the question the buttons ask. It is an id
  rather than a boolean `mine` because the same read serves both sides and a
  server-computed "yours" would have to be recomputed for every reader while
  the id already is what it is. `withdrawalProposal` is on **this** list and not
  a queue of its own because a proposal leaves the deliverable **live**: it is
  still listed, still grounding, and the row is where its reason, its producer
  and its state already sit.
- **2026-08-28 (T-390) — the scheme gains a write path, and `AcceptanceCodeRow`
  splits off from `AcceptanceCode` rather than widening it.** The editor's row
  needs two facts the code itself is not: the **blast radius**
  (`liveDeliverables` — *"this will exclude forty-one deliverables from AI
  answers"*) and `everUsed`, which decides whether the redefining edits are
  offered at all. Both are computed, and computing them for
  `Round.deliverableCode` on every cycle read would be work nobody asked for —
  a round's own verdict needs neither. **The blast radius is counted through
  the same `admittingCodes` derivation retrieval's clause and the context-state
  badge read**, deliberately, and not off `rounds`: a code named on a round that
  was later re-accepted under a different one admitted nothing, and the sentence
  the surface prints would then be about a set that is not the one the next
  query returns. **`code` is absent from the update body** — the letter is the
  code's identity, and ADR-0003's retire-and-replace is how a project changes
  it. Every write body carries a **mandatory `reason`**: ADR-0003 requires the
  change audited like a rails change, and "who and when" a timestamp already
  gives.
- **2026-08-28 (T-391) — `AttachedSource` gains a `library` kind and a resolved
  `document` marker, and the kind is the half worth recording.** ADR-0013's
  consequences already said a superseded or withdrawn document *"may still be
  pinned as an attached source (ADR-0022) to ask about it deliberately"* — and
  the three kinds this type carried (`sandbox | upload | web`) could not express
  one, so the rule was written and the mechanism was missing. The badge that
  names *why* a pinned document is out of reach had no subject until the pin
  existed. **`document` is resolved server-side and null for every other kind**,
  through the same `contextStateOf` derivation the plan and library reads use,
  so the badge on a pinned source and the badge on the deliverable itself cannot
  say different things — and behind the same wall predicate, so a pin whose
  container the requester can no longer see resolves to nothing rather than
  leaking a reference through its own marker. Nothing about the channel changes:
  a library pin still never joins a corpus, never grounds and never cites.
- **2026-08-28 (Slice Document Status close-out) — `PlanRow.inLibrary`, added
  because the walkthrough capture photographed the surface telling a lie.** The
  plan row's banner read *"Removed from the plan"* for a deliverable the OWNER
  had withdrawn from the library — which is the other of the two acts that share
  that word, and the one ADR-0013's amendment exists to separate. The screen had
  no way to tell them apart: `state = 'withdrawn'` is the same value either
  side of publication, and `withdrawnBy.side` cannot answer it (an
  owner-produced row withdrawn from its own plan is an owner act too). So the
  contract carries the fact the copy actually turns on. Found by capturing the
  beat rather than by a test, which is the case for photographing a surface
  before calling it finished.
- **2026-08-28 (T-261) — `GET /runs/:runId/plan`, and `canRerun` carried on the
  response rather than derived by the caller.** The plan artefact has been
  written for every run since T-260 and nothing could read one; the eval
  harness recorded that absence in three separate places, and its `mode`,
  `plan` and `lens` fields were all null against a record that existed. **The
  endpoint adds no new read scope, deliberately** — same `resourceScope`, same
  `runVisibleTo`, same 404 as nonexistence — because the plan *is* the run's
  internals and the 2026-07-12 ruling already decided who may read those. The
  field that needed a contract rather than a convention is `canRerun`:
  **reading and re-running are different rights on one record**, a colleague in
  the producing organisation holds the first and not the second, and leaving
  surfaces to compare participant ids themselves is how one of them eventually
  offers a button that files a run under the wrong requester. A run with no
  plan answers 404 rather than a null body — that is a sub-agent's child run,
  which executes inside a step of its parent's plan, and a delegation is not a
  request.
- **2026-08-28 (T-264) — the `Workflow` type, and the two fields that are
  security rather than shape.** The declared-workflow DAG lives in contracts
  for the Lens's reason: three layers need it and none may depend on the
  others. What earns a note is not the field list but the two decisions inside
  it. **A step has no `scope`, and cannot be given one** — no `corpus`, no
  `visibility`, no `as_organisation` — because scope derives from the run's
  entitled slice, and a workflow that could name one would be a widening
  parameter arriving through domain content that a customer may one day author.
  The absence is structural *and* named: the validator rejects those field
  names with the reason, rather than as unknown fields, since "unknown field"
  reads as an invitation to find the right spelling. And **`writes` and
  `labelPropagation` are a required pair in one direction and a forbidden pair
  in the other**: a workflow that writes must say what it does when its
  sources' label is broader than its destination (finding F2), and one that
  writes nothing must not, because behaviour declared for a write that never
  happens goes stale unnoticed and then gets believed.
- **2026-08-28 (T-269) — `WorkerDeclaration`, and the field that is absent on
  purpose.** The typed worker's shape earns a note for one reason: **there is
  no `enabled`, no `disabled` and no `availableTo`.** The tool set is
  *assembled* from entitlements, not filtered — an unentitled worker is absent
  and the model is never told it exists — and the only way to keep that true
  under maintenance pressure is for the type to have nothing to switch. A
  boolean there would be the filtered design wearing the assembled design's
  name, and a surface would eventually render it greyed out with a tooltip
  naming a capability the viewer cannot have, which is the API's
  denial-and-nonexistence rule broken in the one layer that is hardest to
  audit. `externalEgress` is likewise a *declaration*, not a switch: the
  sovereign tier's exclusion of third-party workers is read off ADR-0037's
  existing provider-eligibility policy, so a tier added later cannot acquire a
  web worker by nobody remembering to set a flag.
- **2026-08-28 (T-265) — `WorkflowStep.worker` became optional, and forbidden
  on `verify`.** Both changes came from declaring the *first real* workflow
  rather than from reviewing the format, which is the argument for declaring a
  real one. `worker` was required, and the coded chain has two steps no worker
  runs: `analyse` is the orchestrator's own thinking leaf and `present` is
  citation resolution (ADR-0027 §6). **A worker is a tool the agent may call,
  and the agent does not call its own drafting** — so a step with no worker is
  one the orchestrator runs itself, and rule 1 is unweakened: every worker
  *named* must still be in the registry. The `verify` prohibition is the
  sharper half: the ground-check is code outside the plan, running on every
  answer in both modes, and a `verify` step is its **record**. Naming an
  executor for it would imply something that could be asked not to run, which
  is precisely what ADR-0027's and ADR-0028's amended guarantees rest on being
  impossible.
- **2026-08-28 (T-266) — classification as a union of four outcomes, not a
  mode flag.** The obvious shape was a boolean plus extras — "did it match a
  workflow, and here are the details". It is a discriminated union instead
  because **each outcome carries different evidence**: a bound workflow carries
  parameters, a clarify carries assumptions *and* the unbound names, a
  fall-through carries the stages it chose, and an out-of-scope carries a
  reason a user has to be able to read. A caller holding a flag can ignore the
  difference; a caller holding this union cannot, and the failure it prevents
  is one outcome being labelled as another — which is the labelling
  requirement, which the whole two-mode design rests on. The classifier's
  *input* type earns its own line: it takes workflow **summaries** and the
  **already-assembled** worker set, so there is no shape in which the model is
  handed a worker the requester is not entitled to.
- **2026-08-28 (T-267) — `rerunPlanBody` is `.strict()`, and its refusals are
  named.** An edited plan is user input, and the two things a step may not say
  are the two the type has to make unsayable. A `worker` outside the
  requester's *assembled* set is refused with the available set named — theirs,
  so nothing leaks by saying it. A **scope field is refused by name in every
  spelling**, carrying the workflow validator's own reason: there is no correct
  spelling, because a step's scope derives from the run's entitled slice and is
  not an editable field. That is the difference between "editing cannot widen
  scope" being structural and being checked. The response returns the new run,
  the new plan *and* `supersededPlanId`, because the caller has to be able to
  show that the old plan is still there — supersession is the claim, and a
  response that only returned the new one would leave the surface to assume it.
- **2026-08-28 (T-329) — the notification's event vocabulary lives in the
  contracts, not in the store, and its subject label is never a field the
  server fills from a copy.** ADR-0049 §2 guards the record with a hard test:
  *adding a third event type must not require a schema change*. A Postgres enum
  fails that by construction, and seeding the deferred `lock-flipped` value
  into one fails T-301's rule instead — a value the schema carries and no code
  can set is a claim the schema makes falsely. So `event_type` and
  `subject_kind` are `text` in Drawer 8 and closed unions here, which is the
  only arrangement in which both rules hold. The sharper half is
  `NotificationSubject.label`: it is **resolved on every read** through the same
  access path as the subject itself, and stored nowhere. A stored label would
  be a copy of the subject's content sitting *outside* the subject's access
  path — still readable after the share that permitted it was revoked — which
  is precisely the leak §3 exists to prevent, arriving through a field that
  looks like a display convenience. `ListNotificationsResponse` carries the
  count beside the items for the same reason: the unread count is not
  `SELECT count(*)`, because a row whose subject is out of reach is neither
  listed nor counted, and computing it twice is how a badge starts disclosing
  rows the list will not show.
- **2026-08-28 (T-332) — the promotion override is a flag on the request, and
  the preflight states the counts.** `promoteDocumentBody` gains
  `overrideOpenItems`, and the obvious alternative — inferring the override from
  `Participant.elevated` — is the one that had to be refused. A tier that
  silently waived the block would make ADR-0049 §7 read *"blocked unless you
  happen to be senior"*, which is not what was ruled: the gate has to be real
  for the person holding the tier too, and then they decide. An explicit flag is
  also what makes §8's audit meaningful, because a row written whenever a senior
  person promotes records nothing about intent. `PromotionPreflight` gains
  `openItems` and `canOverrideOpenItems` for the matching reason on the read
  side: *"you cannot promote"* is unactionable, *"four open threads"* is a place
  to go, and a window that offered the override to everyone would be showing
  most people a control they will be refused on. The two lists are reported
  **separately and never ranked** — they are two lists, so one total would leave
  the reader unable to tell which to clear, but §7 treats them identically and
  the surface must never explain why one stops you and the other does not.
  `openItems.findings` is T-328's own `OpenFindingCount`, so the shape does not
  change when the checker lands and starts filling it.
- **2026-08-28 (T-392) — `PlanRow.deliverableCode` carries `isContractual`.**
  The verdict was `{ code, description }`, which is enough to *name* an
  acceptance and not enough to say **which** acceptance happened: an accepting
  code ends the cycle, and only a contractual one issues the `C` revision
  (ADR-0003 as amended, ADR-0041 — the 2021 National Annex's own `S4`/`S5`
  split). Without the flag the accepted-status screen had exactly one way to
  tell: read the current revision's prefix. That is inferring an outcome
  backwards from its side effect, and it fails in the direction that matters —
  a deliverable accepted under a non-contractual code shows a `P` revision, so
  the screen would either render it as *"round 2 issued"* (still under review,
  which it is not) or say nothing and let the reader conclude the `C` is
  missing. The flag rides the same derived verdict lookup the code and
  description already come from, so nothing is stored twice.
- **2026-08-28 (T-338) — the schema import's diff is a contract helper, not
  screen code.** `diffNamingSchemeFields` and `applyNamingSchemeImport` join
  `defaultDeliverableSchema` and `isCodeField` as pure functions over
  `NamingSchemeField`, and the reason is where they *cannot* live: `apps/web`
  has no test runner, and the dependency matrix leaves a surface only
  `contracts` and `ui` to reach for. This is the function that decides whether
  an owner's schema survives an import — the accident T-338 names is *"an import
  that quietly wiped a schema in progress"* — so a home that can be pinned by
  tests is not a nicety. The load-bearing rule they encode: **a matched field
  keeps `inCode`, `required`, `role`, `isOriginator`, `isSerial` and `width`.**
  A spreadsheet of codes can express a field's name and its options and has no
  view on what a reference looks like or which appointments a deliverable needs,
  so flattening those would unmake the coded reference through a merge rather
  than through a replace — the same accident wearing a safer-looking control.
  `drop` is reported and never applied unless the caller asks, because a sheet
  not mentioning a field is weak evidence that the field should go.
- **2026-08-28 (T-370) — `AgentAct.act` is a bare string, and the receipt says
  who may undo rather than leaving a surface to guess.** ADR-0027's S10
  amendment requires two substrates before any build lets an embedded agent act
  directly, and it says plainly that nothing adopts the lane until they exist.
  So these types describe a mechanism with no consumer, and that shapes two
  fields. **`act` carries no union**: a closed set of act kinds would be values
  no code can produce — T-301's rule (*a value the schema carries and no code
  can set is a claim the schema makes falsely*) applied to a type instead of a
  column — and the first adopting ticket names its own. **There is no `undoable`
  field**, because whether an act can *still* be undone is a runtime question
  the handler answers at the moment of asking: an added folder that has since
  filled with documents is additive and no longer safely removable, and a
  boolean frozen at insert would say otherwise. `AgentReceipt.canUndo` is
  resolved server-side and is true only for the run's own requester — the
  receipt belongs to the run, no ruling gives anyone authority over another
  person's agent turn, and a surface computing it locally would offer a control
  it will be refused on.
- **2026-08-28 (T-313) — `AssembledInput.embedding` is optional, and absent
  means *unknown*, never *free*.** The retrieval half of every run was a real
  model call that nothing could price: `EmbedResult` carried no token usage at
  all, so a run's recorded cost silently meant its **drafting** cost. The fact
  had to cross the knowledge → orchestration boundary to reach a Step row, so
  it rides the assembled input rather than a side channel. **Optional is the
  design, not caution:** T-254's rule one layer down — an assembly that made no
  embedding call, or a provider that reported no usage, must not be recorded as
  a model call that cost nothing, because the arithmetic would succeed and the
  number would be plausible. It hangs off the INPUT rather than off any item,
  because the call is a property of the retrieval: a query that matched nothing
  still cost a model call, and a shape that hung the cost off a result would
  price that run at zero. The model identity is spelled out inline because
  `contracts` depends on nothing and this shape is what crosses the boundary.
- **2026-08-28 (T-272) — `AssemblyCoverage` exists so an empty result can be
  told apart from an empty corpus.** They are indistinguishable to a reader and
  mean opposite things: *"we searched four thousand passages and none matched"*
  is a finding; *"your library has nothing in it"* is a configuration problem;
  a bare `[]` is both. So the assembled input carries what was **searched** —
  the candidates the access-and-state pre-filter admitted before ranking, and
  the deliverable references the question named that the corpus does not have.
  **Optional, and absent means "not recorded", never zero** — the same
  distinction `EmbeddingUsage` draws one field along, and the reason a coverage
  note can say *"how much of it was admitted was not recorded"* rather than
  quoting a number nobody counted. **`AssembledItem` gained `descriptor` and
  `relevance` in the same ticket**, and both are output-side annotations on
  rows the pre-filter had already returned: a structured worker output has to
  be able to name the document rather than only its uuid, and neither field
  carries a predicate or an id a caller could pass back in — which is why
  `wall.test.ts`'s pinned key set firing is the review rather than a problem.
  `relevance` is **absent** on a passage matched by document reference: absent
  means *not ranked*, and a zero would read as *ranked, and badly*.
- **2026-08-28 (T-393) — `ingestAllVersions` takes a project scope, and it
  exists so the sweep can be tested at all.** A full-table sweep run against a
  shared, long-lived dev database is a sweep of every fixture every run on that
  machine ever left behind: the T-012 test timed out at ~740 versions and again
  at ~1,170, **on a clean tree**, and `docker compose down -v` was the only
  thing that made `pnpm run check` mean anything again. CI never saw it — the
  database there is empty — so the failure landed precisely where the check is
  meant to be trusted and nowhere it would be caught. **The scope narrows and
  cannot widen**, which is why it is admissible under principle 2 at all:
  ingest excludes nothing by policy (ADR-0022, T-033), so a scope here can only
  leave *less* indexed, never reach further, and the two real callers — the dev
  CLI and the e2e substrate, both indexing a seeded database from nothing —
  pass none, so the default is still the full walk. **The bound is also the
  assertion.** `summary.versions` is now an exact count of the suite's own two
  fixtures, so a sweep that reached past them fails the test rather than merely
  taking longer; raising the timeout would have hidden exactly the property the
  test is for.
- **2026-08-29 (T-292) — `sourceContainerIds` is the one request field that
  names documents, and it is admissible because it can only remove.** Principle
  2 forbids a parameter that could *widen* what a requester reaches; the Data
  sources chip needs the opposite, and the difference is structural rather than
  a matter of care. The ids go to `attenuate` (T-248) and are intersected
  **into** the grounded pre-filter's own `and()` rather than applied around it,
  so a narrowing is never evaluated on rows the wall already excluded — which
  is why **nothing validates them**. Validating would mean answering *"does this
  container exist"*, the question deny-as-404 exists to refuse, and it would buy
  nothing: an id the requester cannot reach narrows the set exactly as a
  reachable one does. **Absent means *not narrowed*; an empty array means
  *narrowed to nothing***, so the schema requires at least one id and the
  surface sends the field only when the user actually narrowed — T-248's
  `absent ≠ empty` reaching the wire, where a UI would otherwise lose it.
  `GET /projects/:id/grounding-scope` arrives in the same ticket and is
  deliberately **not** the library list one filter along: since the ADR-0011
  rider a live deliverable whose acceptance code does not ground is on that list
  and out of the AI's reach, and a document with no chunks under the pinned
  embedding model is indexed for nobody — so it runs the gateway's own
  `liveLibraryFilter`, and the chip and the answer cannot disagree about what
  was reachable.
- **2026-08-29 (T-295) — the destination preflight is the write's own decision,
  not a second opinion about it.** `GET /runs/:runId/destination-check` exists
  because T-249's refusal could previously only be met **at** the click, which
  is the worst moment to learn that where you are writing decides who can read
  it. The endpoint could have recomputed the comparison; instead the handler and
  the write call one `propagationVerdict`, for T-373's reason one slice along —
  *a preflight computed separately from the act it previews is a preflight that
  will eventually lie*, and here the lie is a selector saying "fine" over a
  write that then refuses. It inherits the write's refusals exactly: a colleague
  who may read a run may not preview carrying it, and an unreachable destination
  answers `404` rather than "exists but refused", which would make the preview a
  disclosure channel the write itself closes. `openRunInEditorBody` is unchanged
  — the override and its mandatory reason were already the shape this needed.
- **2026-08-30 (T-396) — `WorkflowStep` gains `fanOut`, and the field exists to
  make a width impossible to fake.** A definition holds a fixed `steps` list and
  cannot express *"check every section"*, which the checker (T-336) and the
  document creator both need. The field could have taken any reference; it takes
  **only `{{parameters.NAME}}` against a declared `id_list`**, and a `fan_out`
  pointing at `{{steps.x.output}}` fails to load. That restriction is the reason
  the field is in the contract rather than in a runner: a step's output can be
  model-written, so a width read from one would make the plan's **shape**
  model-chosen while the plan still called itself `declared` — losing the one
  promise (same inputs, same steps, same order) a declared workflow is sold on.
  `BoundPlan` gains `writes` and `labelPropagation` for the same
  keep-it-checkable reason: the executor is where validator rule 4 finally
  bites, and it cannot bite on a declaration it was never handed.
- **2026-08-30 (T-397) — `StyleGuideRecord` is an alias for `RulebookRecord`,
  and the alias is the decision.** The project style guide is a second style
  source with a different owner and a different channel, and the temptation was
  a second record type. It gets the same one: ADR-0053 §3 has the checker read
  **both** sources through one shape so a finding can quote *§4.2* whichever it
  came from, and two records is where those shapes would drift. What differs is
  the **route**, not the payload — `/projects/:projectId/style-guides` against
  the rulebook's `/organisation/rulebooks` — because context is classified by
  **ownership**, and a project style guide belongs to the project.
- **2026-08-30 (T-398) — `classifyFix` is a FUNCTION in `contracts`, and that is
  the reason it is there.** ADR-0053 §6 permits bulk acceptance for mechanical
  fixes only, and the narrowing is only safe because the test is code rather
  than a field a model fills in. The findings surface has to render an accept-all
  above a group's mechanical fixes and withhold it from its rewrites — and
  `apps/web` depends only on `contracts` and `ui`. So either the test lives here
  and both sides call it, or the surface guesses. One test, one answer.
- **2026-08-30 (T-309) — the document creator's plan is a CONTRACT type whose
  function lives elsewhere, and the split is the reason it exists.** `ToolPlan`
  and `PlannedToolStep` are in `contracts`; `planDocumentCreation` is in
  `capabilities`, because pricing needs the model rates and `contracts` depends
  on nothing. The types are not there for tidiness: the surface that renders a
  plan before the click sees `contracts` and `ui` alone, so a plan it cannot
  type is a plan it cannot show — and ADR-0053 §5 makes showing it, before any
  spend, the point. `estimate.cost` is `number | null` for T-254's reason
  applied one step earlier than usual: an unpriced **estimate** must read as
  unpriced, because a plausible zero in a preview is what a business case gets
  built on.
- **2026-08-30 (T-309) — `runChain` returns `outputs`.** A tool's caller needs
  its worker's own typed return — a manifest, a computed label, a list of
  sources the library did not have — and none of that is on the Run record,
  which stores an answer and an audit. Keyed on the declaring workflow step's
  id, in memory only: a step output is a value in flight, and the durable facts
  (cost, model, source set) are already Step columns.
- **2026-08-30 (T-334/T-335) — `ToolSummary` has no `enabled` flag, and
  `GroundingSource` gained a `versionId`.** The first is the assembled-not-
  filtered rule made unrepresentable: a tool the requester cannot use is absent
  from the response, so there is no field a surface could grey out and no way to
  advertise a capability the viewer cannot reach. `unbuilt` is a separate state
  from unentitled — it carries `waitsOn` and no `href` — because *"we have not
  built it"* and *"it is not yours"* must never be the same sentence on screen.
  The second is smaller and sharper: the creator binds sources **by version**,
  since a container is a series and a draft rests on one revision of it, and the
  manifest recording what the document was built from has to name which.
- **2026-08-31 (T-310) — `Finding` gained `checkFamily`, `RulebookEvidence`
  gained `scope`, and `FindingInput` gained `draft`.** Three additions to a
  schema T-328 wrote before the run semantics existed, and each is forced by a
  ruling rather than convenient. **`checkFamily`** is stored rather than derived
  because the two questions cross: *style* and *corpus accuracy* both arise from
  a section read, so a `rulebook` evidence shape does not say which family
  raised it — and T-311 groups the marked-up edit **by check**, which makes it a
  grouping key rather than a label. **`scope`** is what the wall predicate
  reads: ADR-0053 §9 makes org-privacy a property of the **source's scope**
  rather than of the word "rulebook", and with two style sources the existing
  shape could not say which of them a quote came from — so the server's read had
  nothing to key on and a project style guide, which binds every organisation,
  would have been hidden like a firm's manual. **`draft`** is the one this
  session would have preferred not to make: ADR-0048 §7 named the three inputs
  the checker checks *against*, and ADR-0053 §2 then ruled five families of
  which **three check the draft against nothing external** — self-contradiction
  against its own sections, readability against arithmetic, completeness against
  its template. Forcing one of those into `corpus` with an empty `citations`
  array would store exactly the object the evidence union exists to make
  untypeable, so the honest fourth treatment is *nothing external, nothing
  cited*. Flagged in T-310's record for the owner rather than treated as
  settled.
- **2026-08-31 (T-311) — `resolveFindingBody` says `dismissed` where the
  Suggestion path says `rejected`, and `ResolveFindingsResponse` reports
  `driftedAnchors` as a first-class list.** The first is not a synonym avoided
  for variety: a rejected **Suggestion** is a judgement about a piece of
  proposed prose and writes a Signal (ADR-0026's raw material), while a
  dismissed **finding** is a judgement about the defect itself — and most
  findings carry no proposal at all, so there is nothing to have an opinion
  about. Both close the finding; only one records an opinion. The second exists
  because the sandbox head is mutable by design, so a mark can drift between the
  run and the click: a drifted anchor **degrades and never blocks**, which means
  a bulk acceptance can honestly half-succeed — and a response that reported
  only what it applied would be handing the reviewer a silent partial success on
  the marks that most need looking at.
- **2026-08-31 (T-336) — `ToolPlan` gained an optional `shape` and `caveats`,
  and the checker's own request/response landed beside the creator's.** The two
  new fields are optional because the document creator has one shape and naming
  it would be noise; the checker has three, and ADR-0053 §4 requires the plan to
  **say which it took**. `caveats` is the sharper of the pair: the very-long
  shape compares section summaries in **groups**, so a contradiction between two
  sections in different groups is not looked for — and a plan that did not say
  so would let a run report a clean cross-section result it had not earned. It
  is a list on the plan rather than a sentence in the coverage string because it
  must render **before** the run button, and a caveat discovered after the
  result is the silent degradation §4 exists to forbid. `qaCheckBody` names
  `scopeVersionIds` and `attachedDocumentIds` **separately and never as one
  list**, because they are two guarantees: one cites normally, the other never
  grounds and is never cited (ADR-0022), and a single field would let a user
  take the weak path without knowing.
- **2026-08-31 (T-405) — `GroundingSource` and `PlanRow` gained
  `description`, and `patchContainerBody` gained an optional, nullable one.**
  *Plainly: a document's reference identifies it; it does not say what is in
  it, and someone choosing sources for a draft was choosing off codes alone.*
  It rides `GroundingSource` rather than being fetched per row because the
  picker's whole job is telling one reference from another, and a picker that
  has to make a call per row is one that renders without them. On
  `patchContainerBody` it is **`.nullable().optional()`, and the two mean
  different things on purpose**: absent says *"this request is not about the
  description, leave it alone"*, `null` says *"clear it"*. A field that could
  only carry a string would give a user who wrote a description by mistake no
  way to take it back, and would make every metadata edit silently a
  description edit as well. **Typed, never generated** (session Cr residual,
  Claude-ruled 2026-08-31) — a model-written description would be an uncited
  claim about a document, rendered beside that document's own grounded
  content, which is the one distinction this product exists to hold.
