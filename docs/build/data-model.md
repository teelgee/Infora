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
> All eight drawers are currently built, so no field list appears below.
> **Drawer 8 was added 2026-08-28 (T-329)** — notifications, and the first
> drawer this rule was applied to end to end: its field list was drawn here,
> the migration was written from the drawing, and the block reduced to
> narrative and a pointer in the same commit, which is what the state rule
> asks for once a drawer is built. **Drawer 7 was added 2026-08-27 (T-308)**
> and is the first store
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

**`containers.description`** (T-405, migration 0062) is *what the document is*,
in a sentence or two, **typed by whoever files or edits it and never
generated** — a model-written description would be an uncited claim about a
document, sitting on screen beside that same document's grounded content. It
lives on the **container** and not the version because it describes the series
rather than one revision, which is the same reason `document_reference` lives
there. Nullable, because most of a real corpus predates it and an absent
description is honest: the source picker says nothing rather than inventing
something. Not personal data — it describes a document.

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
[personal-data.md](../architecture/personal-data.md).

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

**The step and run vocabularies** (T-263, migration 0055) carry two widenings
that are one decision each. `step_type` gains the **seven worker types** — a
worker invocation is a Step in this same append-only tree and, where it
delegates, a child Run, which `parent_run_id` / `parent_step_id` /
`child_run_id` already express and the retrieval leaf already does; model,
usage, cost, egress, source set and rail outcomes are already columns here. So
this is **the only migration the whole worker wave needs**. All seven land at
once including the three whose workers are beyond V1, because an append-only
audit store cannot be restructured later — ADR-0028 §3's reason for fixing the
recursive shape from the first migration, applied to the type. `run_state`
gains **`completed_with_failures`**, the outcome a multi-worker plan has and a
four-step chain never did: an answer exists and some of what was asked for did
not run, which is neither `completed` nor `failed`, and reporting it as either
hides work or throws it away. The semantics are T-268; the value is the
vocabulary they are written in.

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

> ✏️ **Drawn 2026-09-01 (in review of Session K), unbuilt — T-431 (migration
> 0065).** External issue (ADR-0055). *Plainly: a finished document can be
> sent to a person with no Infora account — a landowner, a consultee — as an
> expiring link; the record keeps who sent what to whom and why.* Drawer 5
> and not drawer 1, because the recipient is **not a party**: never an
> Organisation, Participant or Membership — the record belongs to the issue
> event, exactly as the transmittal does. Two changes:
> **`transmittals.kind`** gains `external` as a third value; the existing
> CHECK keeping `round_id`/`direction` null off the review kind extends to
> it (no round, no lock, no snapshot).
> **`external_recipients`** — `id` uuid PK; `transmittal_id` FK; `name`
> text; `email` text; `reason` text; `message` text; `link_token` (opaque,
> the access — there is no grant to resolve); `expires_at`;
> `issued_by_participant_id` FK. **`name`, `email`, `reason` and `message`
> are the platform's first stored data about a person with no account** —
> already registered in personal-data.md at ruling (ADR-0055 decision 9);
> owner's material, deleted on request and at exit per ADR-0050 §6, the
> transmittal event itself retained like every issue record. Two
> whole-project settings (the standard message; who may issue) join the
> Project row's owner-super-user set, the ADR-0046/T-371 pattern. When
> built, this block reduces to narrative per the state rule.

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
([personal-data.md](../architecture/personal-data.md)) and is owner-organisation-private — the
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
(T-308, ADR-0048, migration 0051), **and widened to project context 2026-08-30**
(T-397, ADR-0053 §3, migration 0060). **Two of the three scoped stores now have
tables:** org context (the firm's rulebook) and project context (the project
style guide). Programme context still has none and is not implied by these
four.*
**Shape:** [drawer7-context.ts](../../packages/db/src/schema/drawer7-context.ts)

> ✏️ **Drawn 2026-09-01 (in review of Session K), unbuilt — T-423 (migration
> 0064).** The **rule set**: a project style guide gains a versioned set of
> typed rules beside its clauses (ADR-0054 — the clause store is NOT replaced;
> an extracted rule points at a clause so a quoted finding stays verbatim).
> *Plainly: the writing rules somebody accepted, stored one by one with what
> each applies to and where it does not, so most of them can be checked by
> ordinary code.* Two tables:
> **`rule_set_versions`** — `id` uuid PK; `style_guide_id` FK (the guide the
> set belongs to); `version` integer, unique per guide; `accepted_by_user_id`
> FK — **a named person, already registered in personal-data.md at ruling**;
> `accepted_at`; `drafting_brief` text (the judgement rules compiled once at
> save, ADR-0054 decision 6). Append-only — a new acceptance is a new
> version row, never an edit, which is what makes the run's version stamp
> (decision 7) meaningful.
> **`rules`** — `id` uuid PK; `rule_set_version_id` FK; `kind` (term |
> pattern | structure | measured | judgement); `origin` (extracted | typed |
> infora_proposed); `clause_id` nullable FK into
> `project_style_guide_clauses`, **non-null exactly when origin is
> extracted** (CHECK) — the pointer ADR-0048 §5's quotation resolves
> through; `scope` (document | section | paragraph | sentence | heading |
> list | caption | table — the vocabulary as amended in review, T-430);
> `excepted_contexts` (enumerated: quotations, references, code, headings…)
> and `excepted_terms` (text[], authored tokens) — **two typed halves, split
> in review per T-430's finding**; `register` (the creator's
> DOCUMENT_LANGUAGES + all); `enforcement` (raises_findings | steers_only);
> `severity`; the kind-specific payload as jsonb (a term rule's swap pair, a
> pattern rule's expression, a judgement rule's sentence). Proposals (T-426)
> ride the same shape with a state column and the proposer's id — the
> proposer is the second named person, also registered at ruling. When
> built, this block reduces to narrative per the state rule.

*In plain terms: an outline somebody built in the document creator and kept, so
a colleague can start from it next time. It appears beside the outlines Infora
ships, marked as the firm's own, for that firm only.*

**Org context, and the rulebook's scoping exactly.** `organisation_id` is the
**only** scope key — no project column and no wall predicate — because how a
firm structures its documents is firm know-how that travels to every project it
touches and must never reach another organisation on the same job (ADR-0020).
That is the argument `rulebooks` rests on, applied unchanged.

**`sections` is jsonb rather than rows, and the reason is what the store is
for.** A starting outline is a **seed for a form**, not an audited record:
nothing is ever quoted from it, nothing cites it, and the moment it is chosen
it becomes a copy the author edits freely (addendum A1 — *seeds but never
locks*). That is the opposite of `rulebook_clauses`, which is rows precisely
because a finding quotes a clause verbatim and must resolve to the words it
quoted. Rows here would buy an addressability nobody needs and cost a join on
every read of a menu.

**Currency by state**: a curator retires an outline and it stops being offered.
Documents already made from it are untouched — true by construction rather than
by care, because a chosen outline was copied into the request and no document
has ever held a reference to this row. **`saved_by_user_id` is a named person**,
registered in [personal-data.md](../architecture/personal-data.md); USER grain
like `loaded_by_user_id` one table up, because keeping an outline for the firm
is an account-level act with no project to hold a Participant of.

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

### The project style guide *(drawn 2026-08-30, T-397, migration 0060)*

*In plain terms: a project can have its own writing rules — an owner's house
style for the scheme — and every organisation working on that project is held
to them. It is stored the same way a firm's own manual is, clause by clause, so
a check can quote §4.2 rather than "page 11". The firm's manual still applies
where the project's is silent; where the two disagree, the project's wins.*

**Two tables, deliberately the rulebook's shape one store along.** ADR-0053 §3
makes the project style guide *"project context, owner-curated, binding every
organisation on the project"*, and *"clause-structured like the rulebook so a
finding can quote §4.2"*. So the same two-table shape, the same nullable clause
label with the same honest null, the same verbatim text and span, the same
`retired_at` currency-by-state — and none of it copied for tidiness: every one
of those decisions has the same reason here that it had there, and a store that
diverged would make the checker's two style sources need two readers.

**What differs is the key, and the key is the ruling.** A rulebook's only scope
key is the **organisation**; a style guide's only scope key is the **project**.
That is ADR-0021's classification by ownership applied twice: a firm's drafting
manual is the firm's own IP and leaves when the firm leaves, so it is org
context on the **informing** channel; a project style guide belongs to the
project and binds everyone on it, so it is project context on the **guiding**
channel — *the first material that channel has ever actually carried*
(`CONTEXT.md`: *"the project's templates, style guides and guardrails"*).

⚠ **`project_style_guides` has no `organisation_id`, and the absence is the
point.** It is not org material scoped to a project; it is the project's. Adding
an owning-organisation column would make it a firm's manual wearing a project's
name, and the wall would then have two answers to *"who may read this clause"* —
which is what makes a quoted style-guide clause **not** org-private, where a
quoted rulebook clause is (ADR-0053 §9).

**Fields drawn before the migration was written:**

`project_style_guides` — `id`; `project_id` (the only scope key, FK to
`projects`); `title`; `source_format`; `loaded_by_user_id` (**a named person**,
registered in [personal-data.md](../architecture/personal-data.md) in the same
commit, on the rulebook row's precedent); `loaded_at`; `retired_at` (nullable —
currency by state, never a delete, so a finding still resolves to the words it
quoted).

`project_style_guide_clauses` — `id`; `style_guide_id` (FK, cascade);
`ordinal` (reading order, unique per guide); `clause` (**nullable** — the
manual's own number, digits and dots, and the null is honest); `heading`
(nullable); `content` (verbatim); `span_start` / `span_end` into the extracted
text, so a quote is checkable rather than merely precise.

**One migration for both halves of T-397**, because the relabel half changes no
schema at all: the rulebook moving from the *guiding* channel to the *informing*
one is a code label and its tests, and the query is untouched — same table, same
`organisation_id` key, **no wall predicate added and none removed**.

## Drawer 8 — Notifications
*The telling: one persisted, event-shaped record per thing a person needs to
know, and the pointer back to where it can be read — drawn and built 2026-08-28
(T-329, ADR-0049, migration 0056).*
**Shape:** [drawer8-notifications.ts](../../packages/db/src/schema/drawer8-notifications.ts)

**Why a drawer rather than a shelf in an existing one.** A notification points
**at** things in four tables across three other drawers and belongs to none of
them. Drawer 5 is the near-miss worth naming: `round-issued` is a review event,
but `@-mention` hangs off a sandbox comment (Drawer 2's working area) and
`record-state-changed-by-another-organisation` off a container — so the table
would have sat in a drawer two of its three pilot events have nothing to do
with. **The telling is its own subject area.**

**The row stores no content, and that is the whole design** (ADR-0049 §3).
Visibility follows the thing the notification points at, resolved through the
same path as the subject itself, so a notification is never a channel by which
a fact reaches someone who could not otherwise reach it. A stored title or
summary would defeat that at a stroke — it would be a copy of the subject's
content sitting *outside* the subject's access path, still readable after the
share that permitted it was revoked. Every word on screen is resolved live.

**Two columns are unconstrained text, and the guard is what makes them so.**
ADR-0049 §2 requires that **adding a third event type not require a schema
change**. A Postgres enum breaks that by construction — `ALTER TYPE … ADD VALUE`
is a migration. Seeding the deferred `lock-flipped` value now would break the
other rule instead, the one T-301 wrote down when it left `supersede` out of
`elevated_action`: *a value the schema carries and no code can set is a claim
the schema makes falsely.* So the vocabulary lives in `packages/contracts` as a
union every surface is typed against, and the store holds the text. The same
argument makes `subject_id` **not a foreign key**: a per-kind FK column is
exactly the schema change the guard rules out. The integrity that gives up is
bought back on the read path rather than lost — a subject that no longer
resolves is a notification visible to nobody, which is what a cascade would
have produced and what the visibility rule demands regardless.

**`subject_kind` is separate from `event_type` on purpose.** The resolver that
decides visibility keys on the *kind*, so a new event type over an existing
kind — lock-flipped, over a sandbox document — reuses a resolution path that
already exists and is already tested.

**Participant grain, not User.** Every event in the set is about a project
subject, and a Participant is the person-on-a-project the access predicate
already resolves (ADR-0033). It also makes the wall rule hold with no second
mechanism: a Participant interval closing on removal stops resolving to a
slice, so the notifications go dark in the same act that ends the access. The
project is **derived** through that column, never duplicated beside it.

**Immutable event, mutable read state.** The T-008 pattern applied to a
two-phase row, as `plans` does: a trigger rejects any `UPDATE` that changes
anything but `read_at`. A notification is evidence that somebody was told.

---

## Built 2026-08-28 — record state and the grounding rule (migration 0052)

*Drawn 2026-08-27 by the document-status session (ADR-0013/0003/0041/0045); built the next day as T-383, so per the state rule at the head of this file the field lists are gone and the schema files are the authority. ⚠ **The drawing said "migration 0048" and that number was already T-305's** (`0048_pdf-document-format`) — corrected here to the number actually used. Small, and deliberately so: the state machine already existed and what changed is who may write it and what reads it. **`container_state` needed no change** — `live` · `superseded` · `withdrawn` · `rejected` were all present from the start, and nothing ever set `superseded`.*

**Drawer 5 — `acceptance_codes` carries two more booleans** ([drawer5-review.ts](../../packages/db/src/schema/drawer5-review.ts)). `is_contractual` — an accepting code ends the cycle, but only a *contractual* one issues the `C` revision (ADR-0041), which is ISO's own preliminary/contractual split. `grounds` — whether a deliverable accepted under this code enters the AI's reach. Both default to `false`; the seeded scheme sets them from the **2021** UK National Annex ([acceptance-code-seed.ts](../../packages/db/src/acceptance-code-seed.ts)), where `A1, An…` are contractual and ground and the `S` codes are neither. The scheme is per-project and copied at creation, so this is per-row configuration, not a platform constant. **The migration backfills existing rows from `is_accepting`** rather than from the default, because before it acceptance *was* admission *was* grounding — leaving them `false` would have silently stopped every already-accepted deliverable grounding.

**Drawer 2 — `containers` carries `withdrawn_by_participant_id`** ([drawer2-documents.ts](../../packages/db/src/schema/drawer2-documents.ts)). Nullable, referencing `participants`. Only `withdrawn_reason` was stored, so nothing recorded *which side* withdrew, and restoration could not tell whether it was undoing its own act or the other party's. This is a **named person on a destructive act** and is registered in [personal-data.md](../architecture/personal-data.md).

**Nothing is stored for context state**, deliberately: it is derived from library membership + record state + the code's `grounds` flag, computed in the same SQL pre-filter retrieval already runs, and storing it would create a second state machine that could disagree with the first.

## Drawn 2026-08-28 — the acceptance-code change record (T-390)

*Drawn and built the same day, so the field list below is already gone and
[drawer5-review.ts](../../packages/db/src/schema/drawer5-review.ts) is the
authority on its shape; migration 0053. Not part of the document-status
session's own drawing, and worth saying why it appeared: T-390 has to be
"audited like a rails change" (ADR-0003 as amended, ADR-0030), and **there is
no rails-change machinery to imitate** — rails as scoped records is still in
the not-drawn list below. Every audit in this repo is instead a purpose-built
append-only table, so this is one more of those.*

**Drawer 5 — `acceptance_code_changes`.** Append-only by trigger (the T-008
pattern), holding who changed which code, what the change was, and **why in
free text** — the user story asks for *"who, when and why"* and the why is the
half a diff cannot reconstruct. It exists because the edit it records is not a
preference: turning `grounds` off changes what the AI may rely on across a
whole project, **silently**, since every citation that already exists still
resolves. A row here is the only thing that can answer *"when did this project
stop relying on `A3`, and who decided"*.

**Not a diff of the row, and not a version of it.** The stored change is the
one property that moved plus its old and new value, because a code's history is
read as a sequence of decisions rather than as a sequence of states — and a
whole-row snapshot would invite the reader to reconstruct a decision from a
diff, which is exactly what the free-text why exists to avoid.

**The changer is a named person** (`changed_by_participant_id`) and is
registered in [personal-data.md](../architecture/personal-data.md).

## Drawn 2026-08-28 — the library pin (T-391)

*Drawn and built the same day; migration 0054, and it is one enum value.*

**Drawer 3 — `attached_source_kind` gains `library`.** The kinds were
`sandbox | upload | web`, so a **library deliverable could not be pinned at
all** — and ADR-0013's own consequences say a superseded or withdrawn document
*"may still be pinned as an attached source (ADR-0022) to ask about it
deliberately"*. The rule was written and the mechanism was missing, which is
why T-391's badge had no subject until this. `ref` stays the free
reference-by-kind it already is and carries the container id.

**Nothing else changes, and that is the point.** An attached source still never
joins a corpus, never grounds and never emits a citation (ADR-0022); what the
new kind admits is a deliberate, named, user-supplied use of a document the AI
has stopped reaching for on its own.

## Drawn 2026-08-28 — the promotion override record (T-332)

*Drawn and built the same day; migrations 0057 and 0058 — the second is one
enum value, drawn here per the T-391 precedent: **Drawer 1 —
`elevated_action` gains `promote_over_open_items`**, so an unelevated force
refuses through the one elevated-gate path and the refusal is recorded
(T-301's rule applied). Added in review; the block below covered the table
only.*

*ADR-0049 §8 requires that
**every use of the override be audited** and that the record say **who did it
and what was open at the time** — and, as with T-390 above, there is nothing to
imitate: every audit in this repo is a purpose-built append-only table, so this
is one more of those. `elevated_refusals` is its near-twin and deliberately not
reused: that table records an act **refused** for want of the tier, and this one
records an act **performed** with it. Merging them would need a column meaning
"did this happen", which is two records wearing one shape.*

**Drawer 5 — `promotion_overrides`.** Append-only by trigger (the T-008
pattern), holding the container, the version the promotion issued, the elevated
participant who forced it, and **the counts of what was open at the time** —
open comment threads and open findings, stored separately because they are two
lists even though the gate treats them identically.

**The counts are stored rather than recomputed, for `purge_events`' reason one
store along:** afterwards there is nothing to count. Threads get closed and
findings get cleared in the ordinary course of the work, so a record that
recomputed them would report zero and answer *"somebody pressed the button"*
instead of *"somebody pressed the button past four open threads"* — which is the
only version of this record worth keeping.

**No reason field, deliberately.** §8 names exactly two things the record must
say, and T-390's free-text why exists because a code's history reads as a
sequence of decisions a diff cannot reconstruct. Here the decision is fully
described by who, what and when: the person held the tier, the items were open,
and they went ahead. A mandatory reason would be inventing an obligation the
ruling did not impose, on the one path a person reaches under deadline.

**The overrider is a named person** (`overridden_by_participant_id`) and is
registered in [personal-data.md](../architecture/personal-data.md).

## Drawn 2026-08-28 — the agent act, and its receipt (T-370)

*Drawn and built the same day; migration 0059. ADR-0027's S10 amendment
(owner-ruled 2026-08-09) licenses an embedded agent to execute **administrative**
work directly — folder structures, schema setup, plan housekeeping — within the
invoker's own permissions, on two conditions: the act is **audited as
agent-performed**, and there is a **visible "what the agent did" receipt with
undo**. Nothing may adopt that lane until both exist. This is both.*

**Drawer 3 — `agent_acts`.** Append-only by trigger (the T-008 pattern), one row
per act an agent run performed: the **run** that performed it, a **polymorphic
subject**, the **summary** a receipt reads, and an `undone_at` interval.

**A side table rather than an `acting_run_id` column on each audited act**, and
the reason is not economy. The subject row's existing attribution stays
**correct**: the amendment says the agent acts *within the invoker's own
permissions*, so the participant who invoked it really is the person the act is
attributable to. Agent performance is an **additional** fact about the same act,
and a column would read as replacing the attribution rather than adding to it.
The shape also carries the receipt's own state (`undone_at`), which is not a
fact about the folder or the plan row at all, and it admits a new act kind
without DDL — Drawer 8's guard, applied for the same reason and with the same
consequence: `subject_id` is deliberately **not** a foreign key.

**The `act` column is `text` and its vocabulary is empty on purpose.** Nothing
performs an administrative act yet — T-337 and T-364 stay preview-confirm, which
the amendment reads as interaction design rather than doctrine — so declaring a
closed set of act kinds here would be T-301's rule broken twice over: values the
schema carries that no code can set. The first adopting ticket adds one act kind
and one undo handler.

**No `undoable` flag.** Whether an act can still be undone is a **runtime**
question — an added folder that now holds documents is additive and no longer
safely removable — so it is the undo handler's answer at the moment of asking,
not a boolean frozen at insert.

**No `undone_by_participant_id`, and that is a rule rather than an omission.**
The receipt belongs to the run, the run already names its requester, and **only
that requester may undo** — so the actor is fixed by construction and there is
no second person to record. That is why this table introduces no new
named-person data, which is what T-370's ticket predicted and what the register
records.

**`summary` is stored, not derived** — `purge_events`' rule one drawer along.
After an undo the subject is gone, and a receipt naming only a uuid answers
*"something happened"* and nothing else.

## Drawn 2026-08-31 — the checker's findings (T-310, migration 0061)

*Plainly: when someone runs the QA checker over a draft, what it produces has
to be kept somewhere. This is that store — one row per problem found, saying
what is wrong, where in the draft it is, what evidence it rests on, and whether
anybody has dealt with it yet. Until now the promotion gate counted findings
through a function that always answered nought, because there was nothing to
count.*

*Drawn here first and built the same day, so per the state rule at the head of
this file the field list below is gone again and
[drawer4-output.ts](../../packages/db/src/schema/drawer4-output.ts) is the
authority on its shape; migration 0061. ADR-0048 settled what a finding IS —
structured, anchored, never auto-applied — and T-328 built that as a type a year
of surfaces can be written against. What was missing was the table.*

**Drawer 4 — `findings`.** AI output and the human resolution of it, which is
what drawer 4 is for: a finding is `suggestions`' sibling rather than
`sandbox_comments`' — it is produced by a run, it may carry a Suggestion as its
proposed fix, and its resolution is a human act on an agent's output. It is
**mutable, like the sandbox it annotates**, and for the sandbox comment's reason
exactly: the thing being annotated is itself mutable by design, so an
append-only finding would need a second table to say it had been cleared.

**One row is one finding, and every column is T-328's type made storable** —
`run_id`, `sandbox_document_id`, the check family that raised it, the input it
arose from, its evidence, its anchor, the defect in words, its severity, the
Suggestion it proposes (nullable), the fix classification that rides with that
Suggestion (nullable), and the open/closed pair with the person and the time.
Nothing here is invented beside the type; where the two could disagree the
database is made to refuse.

**Three CHECK constraints, each closing a way the row could lie:**

- `evidence->>'input'` must equal the `input` column. The column exists so the
  wall predicate and the grouping query are ordinary SQL rather than jsonb
  digging; the copy is safe only because the database refuses the version where
  they differ.
- the fix classification is present **exactly when** the proposed revision is —
  T-328's own words about `Finding.fix`, and the reason it matters is T-311's
  accept-all: a fix with no classification would have to be treated as one kind
  or the other, and either default is wrong.
- a closed finding **names who closed it and when**; an open one names neither.
  The `users.removed_by_user_id` pattern: a resolution with nobody's name on it
  is not an audit record.

**No `organisation_id`, deliberately, and T-328 says why in the type**: findings
inherit the producing-organisation-private posture of the sandbox document they
hang off, which already knows whose it is, and a wall with two answers is a wall
with one bug. The one privacy fact that is **not** derivable that way is which
of the two style sources a quoted rule came from — a firm's rulebook is
org-private and a project's style guide is not (ADR-0053 §9) — and that is
carried in the evidence's own `scope`, resolved through `rulebooks` /
`project_style_guides` at read time rather than copied onto the finding.

**Per run of one document, and nothing across runs.** A finding names the run
that produced it and the draft it is against, and there is no column, index or
key that relates one run's findings to the previous run's. That is not an
omission: **whether findings persist across runs of the same document** — so
that a dismissal is remembered and a re-raised finding is recognised — is
ADR-0048's own open lifecycle question, given a driver by ADR-0053 §13 and
deliberately not ruled. Building a carry-over now would be answering it in
schema.

**Drawer 3 — `step_type` gains three values**, per the T-391/T-332 precedent of
drawing an enum widening rather than slipping it in: `qa_section_check`,
`qa_contradiction_check` and `qa_document_check`. Three and not one, because
**the grain is the capability boundary** (ADR-0053 §2): the per-section families
take one section, self-contradiction is one call over the section summaries, and
readability and completeness are **code** over the whole document. ADR-0027
fixes code-or-model **per capability at design time**, so a single capability
mixing an arithmetic family with a model call would have no honest declaration
to make.

## What is deliberately not drawn yet

Per the drawer-by-drawer discipline, still absent because their slices are
deferred: **programme** and programme context; the **org-context / Knowledge /
precedent** stores and the distillation loop (Sessions 4/7); **custom agents**
and the builder (Slice F); the **authority corpus** internals (ADR-0023 —
referenced by Citation, owned by Context); **rails as scoped records**
(ADR-0030); portfolio and programme views. Each is drawn here, fields first, when its slice starts.

## Open items sent back to the grill tracker

- The sandbox-scope review rendition (PDF vs frozen native text) — parked in
  ADR-0032, carried as `Q-025`.
- The naming scheme — the standing ADR-0008 deferral, carried as `Q-026`
  (the metadata *schema* half closed with ADR-0045).
- Everything else the drawers omit is already tracked in
  [grill-questions.md](../grill-sessions/grill-questions.md).
