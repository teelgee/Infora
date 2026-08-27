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
