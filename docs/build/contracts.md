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
- **2026-08-31 (T-406) — a new `creator.ts` module carries the launcher's four
  answers, `documentCreationBody` takes them, and `ToolPlan` gained `notes`.**
  *Plainly: the creator's first screen stopped asking for a "shape" and now
  asks four plain questions, and those answers have to reach the thing that
  writes the draft.* The catalogues live in `contracts` **because the launcher
  renders them** — the same reason `checker.ts`'s families do, and a set of
  answers a surface cannot name is one nobody can give. `STYLE_PRECEDENCE` is
  exported as **one constant** because ADR-0053 addendum A1's ruled resolution
  has to appear in two places at once — the drafting prompt and the plan — and
  a second copy is how two copies start resolving the same conflict
  differently. **`notes` is not `caveats`**, and keeping them apart is the
  point: a caveat is a **degradation** said before the run button, and putting
  a non-degradation in that list would cost the word its meaning. A note is a
  resolution the author is entitled to see coming. `styleGuideIds` is a list
  because more than one guide may apply, which the store has always allowed —
  no migration. The workflow definition went to **v2** rather than being edited
  in place: a plan records the version it ran, and a v1 plan named four fewer
  inputs.
- **2026-08-31 (T-407) — `documentCreationBody` lost `templateId` and gained
  `sections`, and a `GET …/starting-outlines` endpoint took the template's
  place.** *Plainly: the outline stopped arriving ready-made from a template
  and became something the author builds.* The shape of the change is the
  ruling: a starting outline is now **a menu the surface reads and copies
  from**, so by the time a request is made there is no template in it and the
  run draws its shape from the author's own list. That is what "a template
  seeds but never locks" means once it reaches the wire — leaving `templateId`
  beside `sections` would have left two answers to one question and a server
  free to prefer the wrong one. `UnknownDocumentTemplate` is gone with it: it
  named a failure this ticket removed rather than moved. **The workflow
  parameter carries the outline as a JSON string**, which is the shape
  `families` already takes in `qa-check.yaml` — the declared parameter types
  are `string | number | boolean | id | id_list`, none of which is a list of
  objects, and widening that fixed union is an owner decision rather than a
  build one. Reported, with a recommendation, rather than done quietly.
- **2026-08-31 (T-408) — `DocumentSection` gained an optional `brief`, and
  `ToolPlan` a `proposal`.** *Plainly: the plan page now shows the document
  about to be written — an overview, then what will go in each section — and
  the author can correct any of those descriptions before accepting.* The
  shape carries ADR-0053 addendum A2's whole point: **`brief` sits on the
  section, in the request body, beside every other answer**, because what the
  author corrects has to be *a parameter* and nothing else. Had it been a
  field on the plan, correcting it would have meant editing a plan, the run
  would have stopped being `declared`, and §12 would have reopened. It is
  `.optional()` rather than defaulted because absent means *"the planner's own
  description stands"*, which is a different fact from an empty string. On
  `ToolPlan`, `proposal` is optional for the reason `shape` is: only the
  creator proposes a document — the checker reads one.
- **2026-08-31 (T-409) — `reviseSectionBriefBody` and
  `ReviseSectionBriefResult`, and the endpoint returns a proposal rather than
  applying one.** *Plainly: the author tells an agent what is wrong with one
  section's description, and the agent hands back a rewritten description for
  them to keep or not.* The shape is the guarantee: the agent **returns** a
  brief and the surface sets it through the same code path a typed correction
  uses, so there is exactly one door into a parameter and the two cannot
  produce different plans — which is the ticket's own acceptance test. An
  endpoint that applied its own revision would have been a second write path
  into the run's inputs. `followUp` rather than an error where the agent
  cannot act, on the structure agent's pattern (T-364): an assistive agent
  that cannot shape an answer should ask, not fail the surface. Exactly one of
  the two fields is non-null, deliberately — a pane showing both would be
  asking the author which of two answers is the answer.
- **2026-08-31 (T-399) — the two QA-check endpoints accept `multipart/form-data`
  as well as JSON, and the checker's workflow gains an `attached_uploads`
  parameter carrying a fingerprint.** *Plainly: you can now hand the checker a
  file directly instead of filing it in your working area first.* The
  request-body **type** did not change — `qaCheckBody` is the same schema, sent
  as a form field when a file rides along — because an upload is an addition to
  a check request and a second body shape would have been a second answer to
  what a check request is. **The reason the new workflow parameter carries a
  fingerprint and not the file's text** is the whole ticket: a declared
  workflow's bound parameters are persisted to `plan_steps.inputs`, so a
  parameter holding the text would have written the user's file into the run
  record — the exact storage T-337's transient-input rule and this ticket's own
  "stored nowhere" clause forbid, and it would have happened invisibly, with
  every other acceptance test still passing. The text rides the run's in-memory
  context instead (`RunAttachment`, the door T-299's Lens already uses); the
  record keeps name, byte size and content hash, which is what an audit of an
  unstored input can honestly offer. **The consequence is the design, not a
  gap:** a run with an upload cannot be re-executed from its record alone.
  **The plan endpoint takes the file too**, because a preflight that could not
  see the attachment would understate the coverage of the very run it previews.

- **2026-09-01 (T-412) — `DocumentSection` gains `subSections`, and
  `ProposedDocument`'s entries gain a `depth`.** *Plainly: an outline can now
  nest one level, and the plan page has to be able to show that nesting.* The
  **reason the nesting is a separate type** (`DocumentSubSection`, carrying no
  `subSections` of its own) rather than the section type recursing into itself
  is that V1 allows exactly one level: a recursive type would make "one level"
  a rule every reader of an outline has to remember, and the first reader to
  forget would produce a document with a depth the splitter, the manifest and
  the coverage count were never written for. The type is what enforces it, so
  no site in the codebase *can* read a second level. **The reason `depth`
  travels on the plan** rather than being re-derived at the surface is that the
  plan is a prospectus of the document about to be written — the surface did
  not build that list and would be guessing at its shape, and a plan that read
  flat while the document came out nested would be describing a different
  document. **What deliberately did NOT change:** the outline still crosses to
  the run as T-407's serialized JSON string, because a workflow parameter's
  declared type set carries no list-of-objects and widening that fixed set is
  an owner decision rather than a build one.

- **2026-09-01 (T-414) — `StartingOutline` gains `origin`, `savedBy`, `savedAt`
  and `mayRetire`, and there is a body schema for saving one.** *Plainly: the
  list of outlines you can start from now has two kinds in it — the ones Infora
  ships and the ones your firm saved — and the type has to say which.* The
  **reason `origin` is required on both kinds** rather than optional on the new
  one is that an absent field would be read as "shipped", and A5's whole point
  is that the difference is visible: an outline a colleague saved last Tuesday
  and one Infora ships carry different authority. The **reason `mayRetire` is
  optional and set by the server** is the assembled-not-filtered rule applied
  to a button — an action nobody may take is absent from the response rather
  than present and false, so a surface has nothing to render disabled. And the
  **reason the save body carries neither an organisation nor a person** is
  contracts principle 3: identity comes off the resolved session, and a
  "who saved it" field would be a way to write somebody else's name onto a
  record.

- **2026-09-01 (T-418) — `qaCheckBody` gains an optional `conversationId`.**
  *Plainly: the browser can now open the conversation a check will hang off
  before starting the check, so it can watch the run's steps tick off while the
  request is still in flight.* The **reason** is that the run endpoint is one
  blocking request that returns when the whole check is done — so the browser
  could not learn the run's id from it until far too late to show progress, and
  matching on the request text or on "the newest run" would be a guess that is
  wrong exactly when two checks are started at once. A conversation the caller
  owns is the honest handle. **What this does not do** is add engine state or a
  second run shape: a tool run has always opened a Conversation like every
  other run (ADR-0028 §1), and this moves *when* that row is created, not
  *what* is created — a caller passing none gets the previous behaviour
  unchanged. The id is checked against the requester's own project before use,
  so it is not a way to attach a run to somebody else's thread.

- **2026-09-01 (review, on T-412 and T-415) — two contract changes the slice's
  notes missed, covered here so the file's own charter holds.** (1) The
  corpus family's catalogue label changed from *"Accuracy against the
  record"* to **"Accuracy"** (`checker.ts`) — the owner's naming, session
  Cr2; the reason is that the on-screen name is the contract's business,
  since every surface reads the catalogue rather than inventing its own
  words, which is exactly why the change lands in `contracts` and not in a
  screen. (2) `creator.ts` gained **executable helpers**
  (`flattenOutline`, `outlineEntryName`, `withBriefAt`) beside its types —
  the reason is that the outline's flattening rule (which entries exist, in
  what order, named how) must have **one answer** across the planner, the
  splitter, the manifest and the web surface, and four copies of a
  flattening loop is how a sub-section gets counted by three of them.

- **2026-09-02 (T-423) — `contracts` gains `rule-set.ts`: a style guide's rules
  as a type.** *Plainly: a style guide used to be a document. It is now also a
  list of rules, and this is that list's shape on the wire.* The **reason it is
  its own file rather than a section of `checker.ts`** is that both consumers
  read it and neither owns it — the checker runs rules and the creator drafts
  against them, and putting the shape inside either would make the other's
  dependency an accident. The **reason `ProposedRule` is a separate type from
  `StyleRule`, rather than `StyleRule` with optional ids**, is that a proposed
  rule cannot be quoted and cannot be run against anything: a type that let one
  be mistaken for the other is how something nobody accepted ends up binding
  somebody. And the **reason the register vocabulary is `DocumentLanguage |
  'all'` rather than a list of its own** is ADR-0054 decision 5 — a rule tagged
  with a word the creator's launcher does not use can never match a document,
  so a second vocabulary would make the gap-filling fail silently, which is the
  failure mode that ADR refuses everywhere else.

- **2026-09-02 (T-424) — `POST /projects/:id/style-guides` accepts a request
  with a name and no file.** *Plainly: you can start a writing standard from
  nothing, instead of having to upload a document you do not have.* The
  **reason** is ADR-0054 decision 2: a client with no written standard starts
  from Infora's baseline for the registers they picked, which is the common case
  at the start of a scheme and would otherwise have no door at all — the rules
  workbench hangs off a guide, so a guide with no document behind it has to be a
  real thing rather than a special case. It is the same endpoint rather than a
  second one because it produces the same object; a request naming *nothing* is
  still refused, so the empty start is deliberate rather than a slip.

- **2026-09-02 (T-425) — `saveRuleSetBody` carries the whole reviewed list and
  no per-rule acceptance flag.** *Plainly: saving a set of writing rules sends
  all of them, and there is no tick beside each one.* Two reasons, and both are
  rulings rather than convenience. The list rather than a **diff**, because a
  version is the set as it stands: a diff would need a base version to apply
  against, and that base is stale the moment two people are reviewing — sending
  the list is what makes *an amendment is a new version* true at the wire as
  well as in the store. And **no acceptance flag**, because bulk acceptance is
  permitted (ADR-0054 decision 2, owner-ruled 2026-09-01 against the session's
  own stress test), so a flag would put a gate in the type that the design
  deliberately does not have.

- **2026-09-02 (T-426) — `ListRuleProposalsResponse.mayDecide` is optional and
  set by the server.** *Plainly: the accept and decline buttons only exist for
  the person who is allowed to press them.* The **reason** is the
  assembled-not-filtered rule at a button (T-269), which the starting outlines'
  `mayRetire` already follows: an action nobody may take is **absent** from the
  response rather than present and false, so a surface has nothing to render
  disabled. It matters more here than there, because the list itself is walled —
  another firm's proposal never reaches the response at all — and a `false` flag
  would be the one thing on the page hinting that a decision exists somewhere.

- **2026-09-02 (T-428) — `qa-check` v2 and `document-creation` v3, and
  `DraftEvidence` gains a third use with no change to its type.** *Plainly: the
  writing check now runs most rules as ordinary code, and a finding from a rule
  your guide never carried says where it came from instead of quoting one.* Two
  reasons worth the entry. The **version bumps** rather than edits: a plan
  records the version of the workflow it ran, so a parameter added in place
  would make an old plan describe a shape it never had. And **`FindingInput` was
  deliberately not widened** for rules that have no client wording — a fourth
  input would be a fourth citation treatment, and this case needs none: it is
  *measured against something stated, with nothing to cite*, which is exactly
  what `DraftEvidence` already means. The alternative — `RulebookEvidence` with
  an invented clause and quote — is the render lie ADR-0048 §5 exists to
  forbid, and on screen an invented quotation is indistinguishable from a real
  one.
- **2026-09-02 (T-431) — external issue: a token where every other read has a
  session.** *Plainly: one new call in the API is answered for somebody with no
  Infora account, using only the link they were sent.* The **reason it is a
  separate response type** (`ExternalDocumentResponse`) rather than the existing
  version read is that the two answer different questions to different people.
  The version read hands back ids a logged-in caller can spend on further reads;
  this one carries **no container id, no version id and no project id at all**,
  because the holder must have no second question to ask — the link is the whole
  of their access. The **reason `linkToken` is returned to the project side and
  the API composes no URL** is that the deployment's public origin is not the
  API's to know; the surface builds the link, and the token stays what it is —
  the access itself, shown only to a viewer already entitled to the row. The
  **reason `TransmittalHistoryRow.kind` was widened rather than a second log
  added** is ADR-0055 §1: the value of the transmittal record is that *"who has
  this been issued to?"* has one answer, and the recipient cut rides the same
  row (`externalRecipient`, emptied server-side for the producing organisation)
  so no client can render what it was not sent. And the **reason `reason` and
  `message` are both required** is that a send with neither is the emailed
  attachment this replaces, which is the practice the ADR exists to end.

- **2026-09-02 (T-432) — one endpoint, two acts, and the response says which
  happened.** *Plainly: the same call either sends a document outside the
  project or asks for permission to, depending on what the project has decided
  about the caller.* The **reason there is no separate "request" body or
  endpoint** is that a request must carry every fact the issue needs — the
  deliverable, the revision, the recipient, the reason and the message — so a
  second shape would be the same shape with a different name, and approving one
  would mean copying fields between two types. `ExternalIssue.state` is the
  discriminator, and a caller cannot choose which act it gets: the project's
  setting decides, server-side. The **reason `mayIssue` and `mayApprove` are
  fields on the settings response** rather than something a surface derives from
  the level and its own role is T-269's assembled-not-filtered rule — a surface
  that computed the line would be a second copy of the rule, and the first
  disagreement between them would be a button offered to somebody the API then
  refuses.

- **2026-09-02 (T-436) — the first-open receipt sits beside the send, not
  inside the recipient.** *Plainly: the record now says when the person the
  document was sent to first opened it, and everyone who can see the send can
  see that too.* `ExternalIssue.openedAt` and
  `TransmittalHistoryRow.externalOpenedAt` are both **outside the
  recipient-withheld cut**, and that placement is the ruling rather than a
  layout choice. The **reason it is not a field of `externalRecipient`** is
  that the receipt says *the document was read* and never *who read it* — there
  is no identity behind the name, because whoever holds the link is the
  recipient (ADR-0055 §5). Folding it into the recipient object would withhold
  a fact of the issue record from the producing organisation, whose document
  left the project, on the strength of a privacy claim the fact does not make.
  The **reason it is a single nullable timestamp and not a count or a list** is
  that the receipt is that it was read, not how often: a shape that could grow
  would be an attendance log on somebody who never signed up for one, and the
  store refuses a second write rather than trusting the route.

- **2026-09-06 (T-439) — the app's definition is typed, and the tables it
  declares are deliberately not in it.** *Plainly: an app's steps — its screens,
  its schedule, what its agent is told to write — are one stored document, but
  the list of tables it holds is stored separately, because the rules about who
  may read a row must never depend on reading that document.* `AppDefinition`
  types the stepped flow; `AppColumn` and `AppTableRecord` type a declared
  table. The **reason the declarations live in `app_tables` rather than inside
  `AppDefinition`** is drawer 9's ruling: the read predicate for an app row runs
  on every read of every row, and a predicate that first has to parse a JSON
  document a builder wrote is a predicate a builder can influence. The **reason
  `AppConnectionRequirement` has no field for a key, a token or an endpoint** is
  that ADR-0057's build waits for the deployment's secrets store — a shape that
  *could* hold a credential on a machine with nowhere safe to put one is the
  leak that record exists to prevent, so the type makes it unrepresentable.

- **2026-09-06 (T-440) — the row's permissions come back on the row, and the
  tool list stays assembled rather than filtered.** *Plainly: the API says what
  this person may do to this row, instead of the screen working it out.* Every
  `AppRowRecord` carries `mayEdit`, `maySubmit`, `mayDecide`, `mayCorrect` and
  `mayRetire`, and `ListAppsResponse` carries `mayCreate`. The **reason these
  are server-side answers** is T-269's rule applied one level down: a surface
  that derived them would be a second copy of the access rule, and the first
  disagreement between the two copies is a button offered to somebody the API
  then refuses. The **reason `AppState` carries `defunct` as a value rather than
  the API simply omitting a broken app** is the owner's 2026-09-06 ruling: an
  ownerless app is *visibly not working*, with no notification — hiding it would
  make it vanish silently, which is the failure the ruling replaced.

- **2026-09-06 (T-441) — `supersededByRowId` is derived, and it exists so a
  rejected row can keep its reason.** *Plainly: when a contractor corrects a
  return, the old row still shows on screen as superseded — and if it was
  rejected, the reason it was rejected is still on it.* The **reason the field
  is computed rather than stored** is the database rule beneath it: a rejection
  carries a required reason and only a rejection may carry one, so flipping a
  rejected row's state to `superseded` would force the reason to be erased. The
  correcting row's `supersedesRowId` is therefore the record, and this field is
  the same fact read from the other end.

- **2026-09-07 (review of T-440) — `STEP_TYPES` gains `app_step`.** *Plainly:
  an app run is recorded in the same run ledger as every agent run, so the
  ledger's list of step kinds had to admit one for an app.* The **reason it is
  a new step type rather than a reuse of an existing one** is ADR-0028's shape:
  a step's type says what kind of work happened, and an app acting on its
  tables is not a tool call or a drafting pass; naming it keeps the ledger
  honest when the two are read side by side. The database CHECK on
  `steps.type` was widened in the same drawing (drawer 9, migration 0067), so
  the contract and the store moved together.

- **2026-09-07 (T-442) — a generated screen is a closed grammar, not code.**
  *Plainly: when the builder's agent writes an app's screen, what it writes is
  a short list of parts from a fixed menu — a heading, a form over these
  columns, a table of these columns, a total. Infora draws the parts.* The
  **reason it is a grammar** is ADR-0056 §11 plus T-430's posture: the record
  rules that generated screens hold no secret and reach no outside system, *and
  that the generator has no code path that emits one, rather than being
  filtered afterwards.* A grammar makes that true by construction —
  `AppScreenBlock` is six shapes with no field capable of holding a URL, an
  endpoint or a key, so there is no output the generator could produce that
  names one. Freeform code inspected after generation would make the guarantee
  only as good as the inspector. `parseAppScreen` **refuses rather than
  sanitises** for the same reason: keeping the good blocks and dropping a bad
  one *is* filtering. The cost is expressiveness — no chart, no map, no file
  input — and the closed block list is pinned by a test so that widening it is
  a deliberate reopening of §11 rather than a side-effect.

- **2026-09-07 (T-442) — `patchAppDefinitionBody.definition` stops being
  `z.unknown()`.** *Plainly: the shape of an app's definition is now checked
  when it is saved, instead of being trusted.* The **reason it moved** is that
  `app-builder.ts`'s own header claimed a definition that does not conform is
  refused at the boundary, and with `z.unknown()` that was aspiration; with a
  generated screen stored inside the definition it also became the only place a
  screen written outside the grammar could be stopped before reaching the
  store.

- **2026-09-07 (T-442) — `AppDefinition` gains `answeredQuestions`.**
  *Plainly: the builder's agent has two questions it must ask, and this is how
  it knows which have been answered.* The **reason a list is needed at all** is
  that neither answer can record that it was asked: `hasAcceptance: false` and
  `openToOrganisationIds: []` are each both a legitimate answer and exactly what
  an untouched field looks like. Without it the agent would either re-ask a
  settled question every time the builder walked back through the steps, or
  count a default as a decision — and ADR-0056 §2b's whole point is that these
  two are walked through rather than found.

- **2026-09-07 (T-444) — `AppExportRecord` has no producer field, and never
  will.** *Plainly: the record of a download says what data it covered and
  when, and who took it — and the file itself says only what data and when.*
  The **reason the two differ** is ADR-0056 §8: an export is a file a person
  issues, and a stamp naming the app's agent as author would drift into the
  agent-drafted label the owner declined. So the audit answer (who took a copy)
  lives on the row, where an auditor can read it, and the file carries
  provenance alone — because the file is the person's to edit and put through
  the normal review cycles, and a claim about authorship travelling with it is
  a claim they did not make.

- **2026-09-07 (T-443) — the screen grammar gains three chart blocks, and the
  pinned list of block kinds moves from six to nine.** *Plainly: a generated
  screen can now show a bar chart, a line chart with a trend line, or a pie
  chart.* The **reason a new block kind is worth the disturbance** is that
  ADR-0056's second addendum (ruling 5) defers the blocks-versus-code question
  to the owner's own acceptance walk at T-446 — *"i'm not sure i agree but
  we'll check"* — and that walk cannot judge whether blocks draw the screens a
  firm actually wants if the only parts on offer are a table and a total. The
  charts are the evidence the deferred ruling needs. The **reason they carry
  `categoryColumn` and `valueColumn` rather than the existing `columnKeys`** is
  that a chart's two columns do different jobs — one groups, one is added up —
  and a pair of positions in a list would have made which was which a
  convention rather than a name. And the **reason `columnsNamedBy` now exists**
  is that the declared-column check used to work by looking for a field called
  `columnKey` or `columnKeys`: a block shaped differently would have slipped
  past it silently, so the walk is one exhaustive switch that fails to compile
  when a block is added without a decision.

- **2026-09-07 (T-443) — `AppRunRecord` gains `insightRowId`, and never gains
  the insight's words.** *Plainly: the record of a run says which row the
  analysis landed in, not what it said.* The **reason the two are separated**
  is that the run list is read by everyone who may open the app, while an
  insight is stamped with the organisation of the person the run acted as and
  is read by that organisation and the project owner alone (ADR-0056 §3).
  Putting the sentence on the run record would hand a peer firm a summary of
  rows it cannot see — the wall breached by a convenience. The identifier is
  safe because reading the row behind it goes through `canReadAppRow` like
  every other row, and it is useful because T-444's Word export takes a row id.
  `outcome` on the same record is a fixed phrase Infora writes, for the same
  reason.

- **2026-09-07 (T-443) — `INSIGHT_TABLE_COLUMNS`: an insight table's columns
  are Infora's, not the builder's.** *Plainly: when a builder says "this table
  is where the run writes what it found", the four columns come with it.* The
  **reason the builder does not name them** is that a run has to know where the
  sentence goes: a builder who called the text column `notes` would get an
  insight table that silently took nothing, and a run that guessed would be
  worse. The API replaces whatever a caller sent for a table of that kind, so
  the guarantee holds for a screen and an export as well as for the run.

- **2026-09-07 (T-445) — a playbook's definition is its own type,
  `PlaybookDefinition`, and not an `AppDefinition`.** *Plainly: what a template
  carries is deliberately a different shape from what an app carries, so the two
  project-specific things cannot travel by accident.* The **reason it is not
  simply reused** is that an `AppInterface` holds two facts that belong to one
  project and mean nothing in the next: the id of a table declared in that
  instance, and a list of organisation ids from that project's roster. Carrying
  the type unchanged would have made both travel silently, and the second is a
  wall question — an organisation id from Client A's project resolving to
  nobody in Client B's is the harmless case, and resolving to the wrong firm is
  not. So a `PlaybookInterface` names its table by **name** and has no
  `openToOrganisationIds` field at all: who may open a screen is asked again by
  the deploying firm, in front of somebody who knows who is on that project.

- **2026-09-07 (T-445) — `AppRecord` gains `deployedFrom`.** *Plainly: an app
  deployed from a template says which template and which version of it.* The
  **reason the version is named and not just the template** is ADR-0056 §10's
  no-live-link rule: saving a template again writes a new row, and the deployed
  instance keeps pointing at the row it came from, which is never updated. The
  number on the client's screen is therefore a fact that cannot move under
  them, which is the whole of what the record meant by *a firm must not be able
  to change what runs inside a client's project without anyone there seeing it.*

- **2026-10-18 (T-448) — `GetAppResponse` gains `publishGate`, and a refused
  publish answers `PublishRefusedResponse`.** *Plainly: the platform will not
  open an app while a required question is unanswered, and it says which, in
  words — before the click as well as after it.* The **reason the gate's state
  rides the app record rather than being worked out on the screen** is that
  the screen had been doing exactly that since T-442 (`pendingBuilderQuestions`
  run in the browser), and nothing behind it refused — the review of
  2026-09-07 noted it. Now one server function computes the questions from the
  stored definition and the live tables, and both the refusal and the panel
  read it; a surface computing its own copy could show "ready" for an app the
  server then refuses. The **reason the refusal carries the questions as data
  beside the sentence** is that a building screen wants to mark each question
  where it lives, and parsing a sentence back into ids is how such a screen
  breaks the first time the wording is improved. The **reason an explicit
  acceptance choice at declaration counts as an answer and the body's default
  does not** is the third addendum's "never defaulted": `hasAcceptance`
  defaults to false, and "false because nobody said" must not open the gate as
  if somebody had said "no, it is working data".

- **2026-10-18 (T-449) — the builder's agent answers in `builderAgentAnswerSchema`,
  a closed list of acts (`BUILDER_AGENT_ACT_KINDS`), parsed strictly.**
  *Plainly: what the agent may do to an app is a short fixed menu, and an answer
  that strays off it does nothing at all.* The **reason it is a menu the model
  chooses from rather than tool calls the server filters** is the screen
  grammar's own posture (T-442), applied to acts: a filter is only as good as
  its list of things to catch, while a menu with no entry for publishing,
  granting scope, sharing, reassigning or closing cannot be talked into one.
  The **reason one bad act voids the whole answer** rather than being dropped is
  the same as the grammar's: keeping the good half of an answer that also tried
  to publish is filtering, and the builder would be shown a partial change with
  no sign that the agent had tried something it may not do. The **reason
  `declareTable` has no acceptance field** is the third addendum's "never
  defaulted": the agent cannot answer the contractual-data question by
  declaring the table that way, so a table it declares always arrives asked.
  And the **reason table and screen references are by name as well as id** is
  that the agent declares a table and writes a screen over it in the same turn,
  before either has an id it could have seen.

- **2026-10-18 (T-449) — `AppBuildTurn`, and the two conversation routes.**
  *Plainly: the build conversation is stored and readable again tomorrow, by
  the people who may build the app and nobody else.* The **reason an agent's
  turn carries `asked`, `acts` and `proposals` as data** rather than only prose
  is that the server needs them: an answer to a wall question is accepted only
  for a question an EARLIER turn asked, and a removal is performed only after
  an earlier turn proposed it — both checked against these fields, not against
  what the text says. The **reason the reply carries the whole app back**
  (`SayToBuilderResponse.app`) is that the agent's acts change the working
  copy, and a surface that had to make a second request to see them would show
  the conversation and the state disagreeing for a moment — exactly the moment
  a person is reading both.

- **2026-10-18 (T-450) — `askBuilderAgentBody` and `AskBuilderAgentResponse`
  are removed, with `POST /apps/:appId/builder/ask`.** *Plainly: the old chat
  box beside the steps is gone, because the stored conversation replaced it.*
  The **reason it is removed rather than kept beside the new one** is that two
  ways to talk to the builder's agent — one that remembers and acts, one that
  forgets and only talks — would leave a person unsure which one their words
  went to, and the forgetting one was the exact thing the third addendum's
  ruling 5 reversed. `POST /apps/:appId/builder/screen` stays: it is the
  panel's direct "draw this screen" and still proposes rather than applies.

- **2026-10-18 (T-451) — the file source: `attachTableSourceBody`,
  `AppTableSourceRecord`, `SourceRegion`, and six routes.** *Plainly: an app
  table can be pointed at a spreadsheet in the project, and the API says what
  the table last took from it — or why it took nothing.* The **reason the
  attach body carries the whole header row but the region is re-found by the
  mapped headings alone** is the Power BI lesson ADR-0059 is built on: a cell
  range breaks the first time someone inserts a row above it, while a block
  found by its headings survives being moved — and a contractor adding a
  "Notes" column must not break the feed, so the unmapped headings are recorded
  for the panel and never searched for. The **reason no body field names who
  entered the imported rows** is decision 2: the enterer is the person whose
  act produced the file version, resolved from the document's own record, and
  a field for it would be a way to put one firm's figures behind another
  firm's name. The **reason the receipt is `{ succeeded, outcome }` and not a
  sentence alone** is that the panel must say "this failed" without parsing
  its own wording, and the **reason `AppTableSourceRecord.document.title` is
  nullable** is decision 4: a builder who can no longer open the document
  still sees that the table is fed, and when, but not the name of a document
  that is no longer theirs to read. The routes are builders-only
  (`canBuildApp`); everyone else gets the 404 an absent app gets, because a
  source's configuration has the working copy's standing, not the published
  app's. And there is **no agent act** among them: attaching is a person's
  panel act this round (decision 4), pinned by `app-builder-agent.test.ts`.
- **2026-10-18 (T-453) — `EditingSession`, `POST /sandbox-documents/:id/editing-session`, and
  the WOPI host's four routes under `/wopi/files/`.** *Plainly: a signed-in
  person's browser asks for a short-lived pass to one file, hands it to the
  editing engine, and the engine then fetches and saves that file through
  Infora — which checks the person is still allowed in on every single call.*
  The **reason the four WOPI routes are not Infora-shaped** (PascalCase fields,
  `X-WOPI-*` headers, 409 with the lock in a header) is that an engine speaks
  them, not Infora's web app: they are the WOPI protocol's own contract, and
  restating it in Infora's conventions would make the host speak a dialect no
  engine understands. The **reason the pass is minted by a separate session
  route** rather than by the WOPI host itself is that only a signed-in browser
  can say who the engine is acting for; the engine has no cookie and never
  will. The **reason a refusal carries the holder's name in `hint`** as well as
  in `X-WOPI-LockFailureReason` is that an HTTP header is Latin-1 and a
  person's name need not be — the header is a safe rendering, the body is the
  exact words. And the **reason `accessTokenTtl` keeps WOPI's name** (an expiry
  in ms since the epoch, not a duration, despite the word) is that the browser
  posts it to the engine verbatim, and a renamed field would have to be
  renamed back at exactly the point where nobody would notice it was wrong.

- **2026-10-18 (T-454) — `EditingSession.editorUrl`.** *Plainly: the pass now
  also says which page to load to edit the file, or says plainly that there is
  no editor on this server.* The **reason the API works it out** rather than
  the browser is that the page comes from the engine's WOPI discovery list,
  which the API can reach and a browser on another network may not — and the
  discovery read is cached on the API so a co-editing session's ten browsers do
  not each ask the engine. The **reason it is nullable rather than an error** is
  that the sandbox does not depend on the engine: a server with none still
  mints a pass, and the pane says, in words, that editing is not set up.

- **2026-10-23 (T-455) — the default deliverable schema's `suitability` field is
  labelled "Status code".** *Plainly: the word on the plan and the library now
  matches the word the record ruled.* ADR-0041's 2026-08-27 amendment settled
  that the term is *status code*, not *suitability* (the older BS 1192 word),
  and `CONTEXT.md` carries it; the seeded default still printed the old word on
  every new project. The **reason the key stays `suitability`** is that a
  project copies the default schema at creation (ADR-0003's seed-by-copy), so
  the key is stored on every existing project's own copy and read by the
  promotion window and the library row; a label is display text and a key is
  storage, and renaming storage to fix a label would be a migration to fix a
  word. Projects created before this note keep their copied label until their
  owner changes it on the scheme screen.

- **2026-10-23 (T-456) — `GET /containers/:containerId/participant-grants`, and
  `shareId` on a plan row's `sharedWith`.** *Plainly: a plan row can now say who
  at your firm may see a shared deliverable, and the owner can take a share
  back without a second read.* The narrowing routes (T-137) had a write and a
  revoke and no read, so no screen could show the narrowing it had made; the
  **reason the read is scoped to the requester's own organisation** is the same
  as the write's — a firm's narrowing is its own business — and the **reason an
  organisation with no live share gets absence rather than an empty list** is
  that an empty list would confirm a share that does not exist. The share id
  rides `sharedWith` because the revoke route is keyed on it and a second read
  to find it would be the kind of round trip principle 2 refuses; only an owner
  reader ever receives the list, as before.

- **2026-10-23 (T-457) — `GetVersionResponse.containerId`.** *Plainly: a cited
  version now says which document it belongs to, so the source view can open
  that document's page.* The read already joined the container to report its
  state; the id rode in the join and not on the wire. The **reason it is a
  field rather than a second read** is that the source panel is opened from a
  citation chip, and a chip that needed a round trip to find its own document
  would be the kind of lookup the typed client exists to avoid (principle 2).

- **2026-10-23 (T-459) — `GET /projects/:projectId/library/search`, and the plan
  read paged on request.** *Plainly: one box finds a document by its code, its
  title or what it says, and the lists come back a page at a time.* The
  **reason the search runs on the grounding index rather than a second one** is
  that a person and the agent should disagree about nothing: the vector arm is
  a `min(distance)` over the current version's chunks under the pinned model,
  computed per row inside the same statement as the wall's visibility
  predicate, so a row the wall excludes is never scored (ADR-0022/0024's
  one-query rule). The **reason `state` defaults to `live` but admits `any`** is
  that the library is the live corpus while the register of record includes
  what stands as superseded or withdrawn on the plan, and a document controller
  searches both. The **reason the plan read gained paging as optional** rather
  than a second endpoint is that every screen reading it today expects the
  whole plan, and a read that changes shape under its callers is the drift the
  typed client exists to prevent; `total`, `page` and `pageSize` appear only
  when `page` or `q` was asked for.

- **2026-10-23 (T-463) — the AI transparency table: `GET /projects/:projectId/ai-transparency`,
  `GET /ai-transparency`, `PUT /projects/:projectId/ai-features/:feature`,
  `GET …/ai-transparency/export`.** *Plainly: a page that says what each AI
  feature reads, writes, keeps and never trains on, with a per-project off
  switch the owner's super user throws with a reason.* The **reason the facts
  live in a registry beside the code, not in a table**, is that a row describing
  a feature must change when the feature does, and a diff is the only place
  that is seen. The **reason the posture comes from the router** is that the page
  must say what is enforced, not what was written. The **reason the switch is
  append-only with a required reason** is ADR-0030 §6: it is a rails change,
  and an audit with no name and no why on it is not one. The **reason a refusal
  is a 403 with `ai_feature_off`** rather than 404 is that the feature exists and
  the project chose; the screens still render absence, never grey.

- **2026-10-23 (T-462) — the plan read gains `state`, `kind`, `producerId` and a
  `relevance` sort; `PlanRow` gains a coalesced `title`.** *Plainly: the plan
  can be filtered and searched on the server, and reference material has a
  name.* The **reason the filters are server-side** is that a page is a page of
  the filtered list — a chip applied on the client to a page of fifty would
  narrow the page, not the plan. The **reason `relevance` is the default** is
  that a searched read ranks and an unsearched one lists; the server reads
  `relevance` without a query as reference order, so one default serves both.
  The **reason `title` is coalesced on the wire and never stored twice** is the
  2026-07-18 ruling: a deliverable's title is its work item's, reference
  material's is its container's (migration 0072), and a screen should not have
  to know which.

- **2026-10-23 (T-461) — bulk acts: `POST /projects/:projectId/bulk/transmittals`,
  `/bulk/external-issues`, `/bulk/supersessions`, `/bulk/classifications`; and
  `POST /projects/:projectId/plan/export`.** *Plainly: tick several documents
  and act on them once.* The **reason these are routes and not a loop in the
  screen** is that a loop over single-row calls that dies on the eleventh leaves
  ten transmittals issued and nothing in the record saying the act was meant to
  be twenty: a bulk route checks every row first, refuses the lot with a 409
  carrying `failures` (so the screen can name the rows), and writes in one
  transaction. The **reason each reuses the single route's own helpers** rather
  than restating them is that there must never be a second definition of what a
  transmittal, an external issue or a superseding edge is. The **reason classify
  carries an explicit `mode`** is that "set this term on these rows" has two
  honest meanings — fill the gaps, or overwrite — and a default would silently
  pick one. The **reason the export's first sheet is exactly the plan template's
  shape** is that a file that re-imports is worth more than a file that reads
  well: the record facts live on a second sheet the import ignores.

- **2026-10-23 (T-460) — saved views: `GET`/`POST /projects/:projectId/saved-views`,
  `DELETE /saved-views/:id`.** *Plainly: a person saves the way a list is set
  up under a name, for themselves or for their firm.* The **reason the filter
  is stored as the screen sent it and never interpreted** is that a view is a
  convenience over a list the screen already knows how to read, and a server
  that parsed it would be a second definition of the list's query; a stale key
  renders nothing rather than breaking a read. The **reason the read's ceiling
  is the organisation, in its own WHERE**, is the wall's floor (ADR-0018): a
  shared view travels within the firm that made it and never beyond, by
  construction rather than by a check a later route could forget. The
  **reason a shared view may be deleted by an org admin** is that a firm's
  shared way of looking is the firm's, and its maker may have left.
