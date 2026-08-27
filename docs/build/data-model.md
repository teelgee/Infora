# Data model — the drawers, their reasoning, and the drawing board

> **Visual companion:** [data-model.html](data-model.html) — the stored schema
> **as built** (every table, column, FK, and trigger-derived integrity badge),
> **generated from `packages/db/src/schema` and regenerated under CI**:
> `pnpm run check` fails when it is stale (`check:data-model`), so it can no
> longer sit nine migrations behind the schema the way the hand-generated
> version did. Regenerate with `pnpm --filter @infora/db run datamodel`.

> **Status: living reference, re-cut 2026-08-04.** This is the `CONTEXT.md`
> glossary drawn as **stored tables**, drawer by drawer, in step with what is
> being built. **What a drawer carries depends on its state:**
>
> - **While a drawer is unbuilt, it carries field lists.** That is the drawing
>   board — migrations are *drawn here before being written* (the standing
>   rule), exactly as Drawer 6 was drawn on 2026-07-26 and built the same day.
> - **Once a drawer is built, the schema file in
>   [`packages/db/src/schema`](../../packages/db/src/schema) is the authority
>   on its shape**, the generated atlas is its view, and the drawer here keeps
>   only its **narrative** — what it is for, and the design decisions it
>   embodies, which no schema file can state — plus the pointer.
>
> All seven drawers are currently built, so no field list appears below; the
> next drawer drawn (notifications, T-329, is the first candidate) carries its
> field lists here until its migration lands, then reduces to narrative like
> the rest. **Drawer 7 was added 2026-08-27 (T-308)** and is the first store
> behind [component 4](../architecture/components/component-4-context.md)'s
> three scoped context stores, which until then had no tables at all. This split preserves "migrations are drawn before being written"
> while removing the permanent sync obligation the old always-carry-fields
> form imposed — a drawing that has done its job stops being a second copy.

## How to read this

A **table** stores one kind of thing, one **row** per instance; **fields** are
the stored facts and **relationships** are stored links (foreign keys). Two
recurring disciplines, used throughout and worth naming once:

- **Append-only**: rows are only ever added — `UPDATE`/`DELETE` are rejected
  by trigger (the T-008 pattern) — used for everything that must be auditable
  (ADR-0002, ADR-0028).
- **Currency by state**: a thing ends by closing an interval
  (`revoked_at`, `withdrawn_at`, `retired_at`), never by deleting the row, so
  attribution survives departures and past events stay explicable.

> ✅ **`drizzle-kit generate` is safe again — re-synced 2026-08-27 (T-344).**
> From 2026-08-04 (T-301) until then the stored snapshot under
> `migrations/meta/` stopped at `0031` while the migrations ran to `0049`, so
> `generate` re-emitted **everything from 0032 onward** as one file — 193
> lines, ten `CREATE TABLE`s for tables that already existed — and applying it
> unread would have been destructive. `0049_snapshot.json` now records the
> real schema, so `generate` emits nothing against an unchanged schema and
> only the intended change otherwise. Migrations are still **drawn here
> first**, and what `generate` writes is still **read before it is applied**.
>
> ⚠ **`drizzle-kit push` remains forbidden, and the re-sync does not change
> that.** Push introspects the live database and diffs it against the schema
> file, and this database carries objects the drizzle schema does not model.
> Run against a throwaway copy of the migrated database (T-344's verification),
> push offered to drop **fifteen `CHECK` constraints** — the invariants
> `transmittals_kind_shape`, `conflict_exclusions_canonical_pair`,
> `version_chunks_span_ordered` and the rest — and to
> `DISABLE ROW LEVEL SECURITY` on `version_chunks` along with all four of
> migration 0034's policies. Those are the guarantees, not decoration.
>
> That same run is what proves the re-sync honest: **no table, column or index
> differed**. The only other things push reported were two of its own
> introspection artefacts — Postgres truncating drizzle's foreign-key names at
> 63 characters, and `'{}'` reading back as `'{}'::uuid[]` — neither of which
> is a divergence between the schema and what the migrations applied.
>
> **Hand-write the unmodelled half.** A generated migration will never contain
> a policy, a `CHECK`, a trigger or a backfill; add those to the generated file
> by hand, as migrations 0032–0049 did throughout.

---

## Drawer 1 — Parties & access
*Who exists, and who may see what. Every other table is scoped by these.
(ADR-0015–0018, 0033, 0046.)*
**Shape:** [drawer1-parties.ts](../../packages/db/src/schema/drawer1-parties.ts)

The access spine — Organisation, User, Project, Membership, Participant — with
three decisions carried in its shape. The Membership row is also where
per-organisation, project-scoped configuration lives — `ack_mode` (ADR-0035)
and the org-standard plan column set (`plan_columns`, T-360): settings one
organisation's super user fixes for that organisation on that project, which
is exactly the (organisation, project) grain and never a personal preference.
The **Project** row carries the other half of that pattern — configuration the
whole project runs on, fixed by the owner super user: `conflict_attestation_
required` (ADR-0046 §8) and, from T-371, `review_period_default_days`. The
review period was ADR-0005's one unowned attribute — the round stored a target,
the status bar rendered it and its overdue state, and nothing anywhere set the
value. It defaults to **ten working days** and sits on the project rather than
in the deliverable schema deliberately (ADR-0005 addendum, 2026-08-22): the
schema's fields are the header row of the fillable deliverables template
(T-337/T-359), so a review period modelled as one would arrive as a column
nobody should be filling in. The stored *target* stays on the round, computed at
round creation — the project row holds the default, never the dates. **A
Participant is an interval, never a
deleted row**: removal closes `removed_at`, auto-revoking live grants from that
moment while past rounds keep their attribution (ADR-0033). **The roster is
project-visible** — the wall hides work, never presence. And **the user
credential is its own table**, not a column on User, so the skeleton-auth
scaffold drops cleanly when production identity (Entra-first) replaces it.

**The User row gained the same interval** — `removed_at` and
`removed_by_user_id` (T-315, migration 0050) — and the pair is
`CHECK`-enforced, because a removal with nobody's name on it is not an audit
record. **The two intervals are different acts and the asymmetry is the
design.** Removing a **Participant** is a *project* act: it ends one
engagement and touches no session, because signing a consultant out of every
project when one client's work ends is a bug, not a control. Removing a
**User** is an *account* act: it ends every live session, and it closes every
live Participant interval that user holds — a person who is no longer of the
organisation cannot occupy the organisation's seat, since ADR-0033 staffs every
Participant *from* that seat. It reuses the Participant closure rather than
inventing a second one, so grants revoke exactly as they already did.

**Session** (T-251, migration 0037) exists for one sentence: **a signed cookie
cannot be revoked** — it is valid because it verifies. The cookie therefore
carries an opaque random token, not the user id: a pointer to a row the server
controls rather than a bearer assertion of identity. Two clocks, deliberately
distinct — an absolute lifetime never extended by activity (the bound on a
stolen cookie), and a sliding idle window — with both durations deployment
config, because the right numbers are a security-session decision. Endings are
recorded (`revoked_reason`), never deleted: a session that ended is evidence of
a login that happened.

**Conflict exclusion** (ADR-0046, T-245) is an *administrative* guardrail
checked at enrolment, deliberately **not** an input to access resolution — an
administrative record must never silently withdraw access mid-work, and the
leak it might guard against cannot occur anyway, because a request runs in
exactly one assembly environment (ADR-0025). It is org-private on the ADR-0018
floor (a firm's register is close to its engagement list), **symmetric by
construction** (the project pair stored canonically, CHECK-enforced, so X↔Y
and Y↔X are one row), and can only ever **deny** — there is no permit form,
which is what makes "the individual grain narrows within the organisation
ceiling and can never widen it" true structurally rather than by check.
**Conflict attestation** (ADR-0046 §8) is how an owner gains assurance without
gaining the register: it sees *that* an attestation exists, never what it
protects — trust-plus-audit, because a client inspecting a supplier's internal
wall would be theatre.

## Drawer 2 — Documents
*The controlled record, the retrieval index, and the working area.
(ADR-0002, 0011, 0032, 0034, 0036, 0038, 0040, 0041.)*
**Shape:** [drawer2-documents.ts](../../packages/db/src/schema/drawer2-documents.ts)

**Container and Version** carry the record model: a container is the
persistent home of one immutable version series, at two scopes (a **library**
container is a deliverable with a coded reference and a plan row; a
**sandbox** container is a freeze series — org-private, no coded reference,
ADR-0032). Versions are **append-only**, and only versions whose container is
`in_library` and `state = live` ground (ADR-0022). The Documents view's
at-a-glance columns are **derived by query, never duplicated into a metadata
table** — the ProjectWise B4 lesson: no hand-built views, no drift.

**Version chunk** is the retrieval index, co-located with the relational
access data so ADR-0022's access and state rules apply as SQL **pre-filters in
the same query** as vector search (ADR-0024). Derived and rebuildable — every
version is chunked, including superseded ones, because *exclusion is
retrieval's job*, which is what makes it provable (T-033). The embedding model
id and version are pinned beside every vector; each pinned model is its own
complete index, and a model change is a deliberate re-index, never a mix.
**`start_offset`/`end_offset`** (T-271, migration 0039) are stored at chunk
time because they **cannot be recovered later**: the splitter eats whitespace
and the packer rejoins with one space, so a chunk is not a substring of its
own version (T-270 finding 1). The span is the only exact locator — paragraph,
section and page are all views of a position — and a citation renders only
when the stored span still resolves; older chunks carry null and degrade to
version grain. Full reasoning: [spikes/spike-locators.md](spikes/spike-locators.md).
**T-305 added the page locator and no column**, which is the spike's rule
paying off: the PDF extractor terminates every page with a form feed, so page
is *"count the separators before the span, plus one"* — the same derivation as
paragraph, over `chr(12)` instead of `E'\n'`. A version with no form feed
anywhere has no pages and reports none, which is every docx, because a Word
file contains no page boundaries at all.

**Purge** (T-340, migration 0049; ADR-0050 §5–§6) is the **second deletion
act**, beside T-128's bin rather than replacing it — Delete stays restorable
and self-service, because recovery-without-a-helpdesk-ticket is a product
virtue being kept. Two pieces land in the schema and both are small, because
the ticket's weight is in *reach* rather than in structure.

**`purge_events`** records the act: who purged, which document, when, and the
**counts of what it reached**, append-only on the T-008 trigger. The counts are
stored rather than recomputed for the obvious reason — after a purge there is
nothing left to count — and they are what makes the record answer *"was this
actually erased, and how much of it"* rather than merely *"someone pressed the
button"*. A **named person on a destructive act**, so it is registered in
[personal-data.md](personal-data.md).

**`forbid_mutation()` gains one carve-out**, and it is the interesting half.
`versions`, `signals` and `comments` are append-only *by trigger* (T-008), and
purge must genuinely erase — a purge that deletes the row and leaves the
derived copies has erased nothing. So the trigger admits `DELETE` when the
transaction-local setting `infora.purge` is on, exactly as `withProjectScope`
declares `infora.project_id`. **`UPDATE` stays forbidden unconditionally:**
append-only exists to stop the record being *rewritten*, and nothing about
erasure needs the ability to edit. The carve-out is deliberately visible in the
trigger body rather than hidden behind a privileged role, because the place a
reader looks to learn that a table is append-only should be the place they
learn what the exception is.

**`document_format` gained `pdf`** (T-305, migration 0048). An uploaded PDF is
a canonical native file like the other three, with one difference that is a
decision rather than an implementation detail: **its `content` holds the
extracted text**, taken at upload. The other uploaded formats keep `''` — a
docx's text is taken at conversion, and xlsx/pptx have no extraction path yet
(T-306) — but a PDF has no conversion path *by design* (ADR-0004: the PDF is
the record rendition, never an editing surface), so text at upload or never is
the real choice. `content` is still not a second copy of the document: the file
stays canonical, and this is the grounding text every locator is an offset
into.

**Sandbox document** is the draft's home (owner-confirmed 2026-07-04): a real,
freely-editable working copy with **no document controls** — manual editing
produces no Suggestion and no Signal, an agent proposes content only when
prompted, and the AI never grounds on it (ADR-0011). It is **deliberately
mutable**, the one non-append-only content table by design. Canonical format
follows origin (ADR-0034): structured text for an authored document, the
native file for an uploaded one, exactly one of the two set. `container_id`
is the sole distinguishing fact of a bound document (ADR-0038 — binding is a
one-way transition, trigger-enforced), and `head_locked` is the freeze's
check-out lock (ADR-0032 addendum: every freeze locks the head; one
mechanism, two triggers). The full sandbox model around it — sandboxes at
four scopes, folders, scope grants, per-sandbox settings, checkout events,
ambient history — landed with Slices A2.x (ADR-0036/0040/0041). The
2026-08-09 walkthrough session grew the settings and the folders (T-365,
migration 0043): `sandboxes.plan_locked` is the third folder mode — the tree
**derived** from the owning org's own plan rows, so folders gained a `kind`
(`manual` / system-owned `discipline` / `deliverable`) and a deliverable
folder carries its `container_id`, unique per (sandbox, container) so the
derivation is idempotent, renames track the row, and a withdrawn row's
folder is kept, never deleted (ADR-0040 addendum).

**Elevated refusal** (T-301, migration 0038) records a destructive lifecycle
action refused for want of the elevated tier — the gate existed (T-174/T-176),
but a refusal left no trace, and a control nobody can see operating is a
control nobody can audit. Participant grain, because the tier is a *project*
capability; **append-only**, because a refusal record a super-user could
quietly delete is worth nothing, and the people who hold the tier are exactly
the people who would want to. `required_tier` is stored although one value is
possible today — a row must still mean what it meant once a second tier
exists. `supersede` is deliberately absent from the action enum: the act does
not exist in code, and whether the owner may perform it at all is `Q-036` — a
value the schema carries and no code can set is a claim the schema makes
falsely.

## Drawer 3 — Work & execution
*Work items, conversations, and the audited record of every run.
(ADR-0025, 0028.)*
**Shape:** [drawer3-execution.ts](../../packages/db/src/schema/drawer3-execution.ts)

**Work item** is the deliverable's *work half* (the container is its record
half; the plan row is their join — owner clarity ruling, 2026-07-18). Its
status is **event-driven, never hand-set**: container created → linked draft
exists → first transmittal → the cycle's terminal. Runs inform but never move
it (ADR-0028 §2). Not every container has a work item — reference material
carries none, and that *absence* is its distinguishing fact (ADR-0032
addendum), the same pattern as ADR-0038's `container_id`.

**Run and Step** are the append-only execution record (ADR-0028 §3): every
step carries the two defensibility fields — the access-resolved `source_set`
and the `rail_outcomes` — plus model, usage, cost and egress facts, and
delegation is a real child run, so the audit is a tree of what actually
happened.

**Plan** (T-260, migration 0035) is **the analysis, persisted** — an
inspectable object rather than conversational preamble. `mode` is a **stored
column, never derived**, because the labelling requirement is hard: a user
must never be unable to tell which kind of answer they hold. Plans are
**versioned by supersession, not mutation** — a plan is evidence, and "what
did your AI do" must survive the user editing it afterwards — and **mutable
only while `draft`**: the transition to `ready` is one-way and freezes the
declarative fields by trigger (the T-008 pattern applied to a two-phase row).
A `model_chosen` plan may never name a workflow (a hand-edited workflow is no
longer the declared workflow), CHECK-enforced. **A plan step's scope is not a
field** — it derives from the run's entitled slice and is deliberately not
expressible, so no plan edit can widen reach. And **the ground-check stays
outside the plan**: if it were a step, a planner could skip it, which would
break the guarantee both orchestration modes rest on (asserted at T-262).

**Label override** (T-249, migration 0036, finding F2) is the record of a
person deciding, by name and with a stated reason, to write material into a
destination broader than its sources' label. There is no `allowBroadening`
config key — the only way past the refusal is a row here, and a row has an
author. **The label itself is never stored**: it is computed from the access
facts on every call, because a stored label is a cache of an access decision,
and a stale cache of an access decision would keep saying "single
organisation" after the share that made it so was revoked.

**Attached source** rides here too: the user-pinned, single-generation input
of ADR-0022 — drawn on, badged user-supplied, never grounding.

## Drawer 4 — AI output & feedback
*What the agent proposes, and the human resolution that is the moat's raw
material. (ADR-0021, 0026, 0028.)*
**Shape:** [drawer4-output.ts](../../packages/db/src/schema/drawer4-output.ts)

A **Suggestion** exists **only when a user prompts an agent** — manual editing
produces none (the draft-location decision, Drawer 2). Suggestions are
per-item and individually resolvable (ruled 2026-07-06), each writing its own
append-only **Signal**; anchors are **advisory**, because the sandbox head is
mutable by design — a drifted anchor degrades, never blocks. **Citations**
attach only to grounded-channel items; steering material is never cited
(ADR-0021). The Signal is *captured but not sunk* — nothing distils it into
Knowledge until Session 7 is grilled; the table exists, the loop off it does
not.

## Drawer 5 — Review
*One review workflow at two scopes: the org-private internal cycle and the
wall-crossing project cycle. (ADR-0002–0017, 0032, 0033, 0035.)*
**Shape:** [drawer5-review.ts](../../packages/db/src/schema/drawer5-review.ts)

The **cycle** is the instance and the DRR is its record — one live,
append-only record per cycle (ADR-0009). The appointed sides are **interval
grant tables** read live at all times — there is no copy at launch, so "who
could act in round N" is reconstructed from intervals against timestamps
(ADR-0033). **Deliverable share** is ADR-0016 made storable: the owner's
organisation-level grant is the only thing that ever opens a deliverable
across the wall, and visibility — producer | owner | live share — is applied
as one SQL predicate in the library reads *and* the grounding query, so what
a surface shows and what the AI grounds on cannot drift. Reviewer
appointments are propose-then-confirm, and confirmation is where ADR-0015
bites: a reviewer whose organisation lacks the share forces share-first or
decline. **T-372 (ADR-0033 addendum, 2026-08-22) adds the third party to that
handshake — the appointee.** Appointment was two organisations acting *about* a
person, with no act anywhere in which the named person said yes; a lead reviewer
holds the deliverable's contractual verdict, and nobody can give that
undertaking on someone else's behalf. The grant therefore carries `accepted_at`,
`declined_at` and `decline_reason`, set only by the appointee and never
overridable. **A declined appointment is not a live lead**: the one-live-lead
partial unique index excludes it, so a replacement can be named without
revoking the refusal, which stays on the record as the interval discipline
requires. The decline reason is a named person's stated refusal
([personal-data.md](personal-data.md)) and is owner-organisation-private — the
producing side learns only that a lead reviewer is awaited. **Migration 0047
deliberately does not backfill `accepted_at`:** a backfill would manufacture an
undertaking nobody gave, so every lead confirmed before the migration blocks
acknowledgement until that named person clicks Accept — and with notifications
deferred (Slice V1-N) nobody is told; an operator upgrading an in-flight
project should expect submitted rounds to wait on that click. ADR-0035 adds the acknowledgement gate and per-participant narrowing
on the same substrate. **ADR-0051 (ruled 2026-08-06, builds with T-346) adds
a second acknowledgement one level up:** a project-scope round is created
`submitted` and opens for review only when a Participant of the owner
organisation acknowledges the submission — two nullable columns **on the
round** (the transmittal is append-only by trigger, ADR-0051 §2), one new
initial `round_state` value; sandbox-scope rounds are exempt and created
`open`. **ADR-0052 (ruled 2026-08-06, built with T-353)** adds the
per-reviewer completion **signal** beside it: one row per (round,
participant), markable and withdrawable only while the round is open — so
the set freezes at issue with no trigger — and walled from the authoring
side until issue exactly like the open round's comments. **At most one open round
per cycle is a partial unique index** — the load-bearing invariant held by
the schema, not by convention.
Comments freeze at issue (trigger), responses must link the addressing change
or state no-change with a reason (ADR-0004), and **acceptance codes are
copied per project and retired, never redefined** — a code ever referenced is
immutable (ADR-0003).

## Drawer 6 — The project ontology
*The classification vocabulary and the typed edges between containers —
drawn 2026-07-26 and built the same day (ADR-0045, migration 0031).*
**Shape:** [drawer6-ontology.ts](../../packages/db/src/schema/drawer6-ontology.ts)

Colocated relational tables, **not a graph store** (ADR-0024/0045): the
ontology adds semantic **pre-filters to the same access+state query** the
retrieval path already runs — the 100k-document scoping lever — and purely
structural questions answer from these tables with no vector search at all.
Metadata and structure only; nothing about what grounds changes
(ADR-0011/0021). Facets and terms are **seeded by copy** at project creation
(the acceptance-code pattern — one project's edits never rewrite another's),
owned by the project-library owner, with terms retired-never-redefined.
Classification is agent-proposed and human-editable; **edges are
agent-proposed and human-confirmed** — a proposed edge has no effect until a
person confirms it, and a retired edge survives as a record. Edge visibility
rides both endpoints' deliverable visibility, so neither a surface nor the
agent can see an edge into a container the wall hides.

## Drawer 7 — Context
*The scoped context stores (ADR-0020, component 4) — drawn and built 2026-08-27
(T-308, ADR-0048, migration 0051). **Org context only so far:** the firm's
rulebook. Programme and project context have no tables here and are not
implied by these two.*
**Shape:** [drawer7-context.ts](../../packages/db/src/schema/drawer7-context.ts)

**A rulebook is a house drafting manual, and it steers rather than grounds**
(ADR-0048 §4). It is **org-private and project-less by construction** — org
context is portable to every project the organisation touches (ADR-0020), so
a project column would be a smaller thing wearing the same name. There is
therefore **no `project_id` and no wall predicate here**: the only key is the
organisation, which is what the spike's Finding 4 argues for the authority
corpus too — a store walled by a *different* rule than `version_chunks`'
must not sit inside the table enforcing that one.

**Two tables, and the second is the whole point of the ticket.**
`rulebook_clauses` is **not the chunker's output**, and that is deliberate:
the sentence-packing chunker rejoins sentences with a single space and packs
across boundaries, so a chunk is not a substring of its own source (T-271's
spike finding). ADR-0048 §5 lets a finding quote a rule **verbatim** while
never citing it, so the stored unit has to be the clause **as the manual
really reads**, addressed by the number the manual gives it — *§4.2*, not
"page 11". A clause therefore carries its **label**, its **heading**, its
**verbatim text** and its **span** into the extracted document, and a rulebook
chunked for steer alone would have satisfied the guiding channel and made the
ruling unimplementable at the surface.

**A label is nullable, and the null is honest.** Text before the first
numbered heading, or a manual with no numbering at all, still steers — it just
cannot be quoted *with a reference*. The same discipline as the locator: never
a guessed address, because an invented one looks checkable.

**Currency by state**: `retired_at` on the rulebook, never a delete, so a
finding written against a rule that has since been withdrawn still resolves to
the words it quoted.

---

## Drawn 2026-08-27 — record state and the grounding rule (migration 0048)

*The document-status session (ADR-0013/0003/0041/0045). Small, and deliberately so: the state machine already existed and what changed is who may write it and what reads it. **`container_state` needs no change** — `live` · `superseded` · `withdrawn` · `rejected` were all present from the start, and nothing ever set `superseded`.*

**Drawer 5 — `acceptance_codes` gains two booleans.** `is_contractual` — an accepting code ends the cycle, but only a *contractual* one issues the `C` revision (ADR-0041), which is ISO's own preliminary/contractual split. `grounds` — whether a deliverable accepted under this code enters the AI's reach. Both default to `false`; the seeded scheme sets them from the **2021** UK National Annex, where `A1, An…` are contractual and ground, and the `S` codes are neither (they never reach the library at all). The scheme is per-project and copied at creation, so this is per-row configuration, not a platform constant.

**Drawer 2 — `containers` gains `withdrawn_by_participant_id`.** Nullable, referencing `participants`. Today only `withdrawn_reason` is stored, so nothing records *which side* withdrew, and restoration cannot tell whether it is undoing its own act or the other party's. This is a **named person on a destructive act** and is registered in [personal-data.md](personal-data.md).

**Nothing is drawn for context state**, deliberately: it is derived from library membership + record state + the code's `grounds` flag, computed in the same SQL pre-filter retrieval already runs, and storing it would create a second state machine that could disagree with the first.

## What is deliberately not drawn yet

Per the drawer-by-drawer discipline, still absent because their slices are
deferred: **programme** and programme context; the **org-context / Knowledge /
precedent** stores and the distillation loop (Sessions 4/7); **custom agents**
and the builder (Slice F); the **authority corpus** internals (ADR-0023 —
referenced by Citation, owned by Context); **rails as scoped records**
(ADR-0030); **notifications** (ruled by ADR-0049, ticketed as T-329 — the
first drawer the drawing-board rule above will apply to); portfolio and
programme views. Each is drawn here, fields first, when its slice starts.

## Open items sent back to the grill tracker

- The sandbox-scope review rendition (PDF vs frozen native text) — parked in
  ADR-0032, carried as `Q-025`.
- The naming scheme — the standing ADR-0008 deferral, carried as `Q-026`
  (the metadata *schema* half closed with ADR-0045).
- Everything else the drawers omit is already tracked in
  [grill-questions.md](../grill-sessions/grill-questions.md).
