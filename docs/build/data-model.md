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
> **All nine drawers are now built and carry narrative only** — Drawer 9 (apps)
> was drawn 2026-09-06 and built the same day by T-439 (migration **0067**),
> which is the state rule running end to end for the third time: the field list
> was drawn here, the migration was written from the drawing, and the block was
> reduced in the commit that built it — and again for its build-conversation
> table (T-449, migration **0068**, 2026-10-18) and its file source (T-451,
> migration **0069**, 2026-10-18). **The three connection tables at the foot
> of Drawer 9 are the one thing still on the drawing board** — ADR-0057's build
> waits for the pilot deployment's secrets store, so they keep their field list.
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

**Drawn 2026-10-24 — the authorship appendix option (T-475).** *Plainly: a
project may choose that every exported document ends with a list of the
passages the AI drafted and who accepted each.* `projects` gains
`export_authorship_appendix` (boolean, not null, default false) — a typed
column with its own PATCH, like the review period and the external-issue
settings, because the project has no options bag and should not grow one for
a single flag. Off by default; nothing changes until the owner's super user
turns it on.

*Built the same day (migration 0081); per the state rule the drawing above stands only as the drawing it was, and [drawer1-parties.ts](../../packages/db/src/schema/drawer1-parties.ts) is the authority on its shape. Its own pair of endpoints, `GET`/`PATCH /projects/:projectId/export-authorship-appendix`, sit beside the review period's; the owner's super user may set it, every participant may read it.*

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

### The editing engine's refs *(drawn 2026-10-18, T-453, migration 0070)*

*In plain terms: when someone opens an uploaded Word or Excel file to edit it
in the browser, an editing engine fetches the file from Infora and saves it
back. Three small things have to be written down for that to be safe: which
engine is holding the file right now (so nobody else can overwrite it), the
file each saved version actually had (so the history is real files, not just
dates), and the short-lived pass the engine carries for one person and one
file (so Infora can check, on every call, that the person is still allowed in).*

**The lock is not a second lock** ([ADR-0043](../architecture/adr/0043-editing-and-coauthoring-substrate-wopi-host.md)
§2). WOPI — the protocol an editing engine speaks to a file store — has its own
lock, an opaque string the engine chooses. It rides the check-out that already
exists: while an engine holds a file, `head_locked` is true, a `checked_out`
row is in `sandbox_checkout_events`, and every path that already refuses a
checked-out document (edit, replace, convert, delete, freeze) refuses this one
for the same reason. What is added is only **which engine lock** holds the
head, because WOPI requires the host to compare the string on every save and
answer a mismatch with the current holder.

**A version keeps its file.** T-220's replace-file swapped the canonical blob
and orphaned the old one ("durable prior-blob retention is deferred to P2").
This is P2: each working revision now carries the `file_ref` it had, so the
version history of an uploaded document is a list of real files. Nullable,
because every revision written before this — and every authored document's
revisions — has no file of its own.

**The engine's pass is stored, hashed, and tied to the session that asked for
it.** A WOPI access token is the credential an engine presents on each call.
It is deliberately **not** a signed self-contained token: that would either
outlive a signed-out session (a bearer capability, which T-317's rule forbids)
or have to carry the session cookie's own secret into a page the engine
renders. Stored, it dies with the session and with the document, and only its
hash is kept, so reading the table cannot mint a working pass. **Possession
proves nothing on its own**: every call re-resolves the person's project slice
and the sandbox's live grants, so a revoked grant refuses the very next call.

**Fields drawn before the migration was written:**

`sandbox_documents` gains `wopi_lock` (text, nullable — the engine's lock
string while an engine holds the head) and `wopi_lock_expires_at` (timestamptz,
nullable — WOPI locks lapse after 30 minutes unless the engine re-asserts
them). Two hand-written `CHECK`s: the pair is both set or both null, and **a
WOPI lock implies `head_locked`** — so an engine lock can never exist beside an
unlocked head, which is the one-mechanism rule stated where the database can
hold it.

`sandbox_checkout_events` gains `wopi_lock` (text, nullable) — set on the
check-out and release rows an engine caused, null on a person's freeze. The
participant on the row is the person whose pass the engine presented, so the
trail still answers "who had it checked out" in a name.

`sandbox_document_versions` gains `file_ref` (text, nullable) — the native file
this working revision had.

`wopi_access_tokens` — `token_hash` (text, primary key: sha-256 of the pass;
the pass itself is never stored); `sandbox_document_id` (FK, cascade — one
pass, one file); `session_id` (FK to `sessions`, cascade — and, because session
rows are REVOKED rather than deleted and the cascade alone would never fire,
ending a session also deletes its passes outright *(made true in review
2026-10-18; the build refused a dead session's pass but kept the row)*);
`expires_at`; `created_at`. **Names a person through the session**, so it is
registered in [personal-data.md](../architecture/personal-data.md): which
sign-in opened which file for editing. Expired rows are swept on the next
mint, dead sessions' rows at sign-out and sweep — the table holds only live
or not-yet-swept passes.

**Drawn 2026-10-23 — the record-state change record (T-465).** *Plainly: every
time a document's record state changes — withdrawn, restored, superseded, back
to live — one line is kept saying what it was, what it became, who did it, when
and why. Nothing is edited or deleted. That is what makes "Undo" safe to offer
on a withdrawal: the accident and its undoing both stay on the record.* Until
now a restoration cleared the withdrawal's reason and author off the container,
so the record could not say a withdrawal had ever happened.

`container_state_changes` — `id`; `container_id` (FK `containers`, cascade);
`project_id` (FK `projects`, cascade); `from_state`, `to_state` (the
`container_state` enum: live · superseded · withdrawn · rejected); `reason`
(text, nullable — withdrawal carries one, restoration does not);
`changed_by_participant_id` (FK `participants` — **a named person**, registered
in [personal-data.md](../architecture/personal-data.md)); `changed_at`.
**Append-only by trigger** (T-008's pattern). Index on (`container_id`,
`changed_at`). Written by every route that changes record state: withdrawal
and the owner's acceptance of a proposed withdrawal, restoration, a confirmed
`supersedes` edge and the retirement that returns a container to live, and the
bulk supersession. Read on the document page's Activity tab through the same
visibility the plan row has.

*Built the same day (migration 0074); per the state rule the field list above
stands only as the drawing it was, and
[drawer2-documents.ts](../../packages/db/src/schema/drawer2-documents.ts) is
the authority on its shape.*

**Drawn 2026-10-23 — a title for reference material (T-462).** *Plainly: a
document the owner loaded as reference material — a consultee letter, a
standard, a survey from a previous job — has had a code and no name, so the
register showed "Reference material" where a deliverable shows its title. It
now has a title of its own.* A deliverable's title lives on its work item,
because the work item is the planned thing; reference material has no work item
**by definition** (ADR-0032's addendum — the distinguishing fact is that
absence), so its title has nowhere to live but the container. One nullable
column, `containers.title` (text): set from the file's name when reference
material is loaded, editable afterwards by the organisation that loaded it
through the same title route a plan row uses, and read by every register as
the title of a row with no work item. Null on every deliverable — a second
copy of the work item's title would be the drift the 2026-07-18 ruling
("at-a-glance columns are derived by query, never duplicated") exists to
prevent, so the reads coalesce and never store. Not personal data: it names a
document.

*Built the same day (migration 0072); per the state rule the field list above
stands only as the drawing it was, and
[drawer2-documents.ts](../../packages/db/src/schema/drawer2-documents.ts) is
the authority on its shape.*

**Drawn 2026-10-23 — the register's saved views (T-460).** *Plainly: a person can
save the way they have set up a list — what they searched, which filters and
sort, which columns are hidden — under a name, keep it to themselves or share
it with their own firm, and come back to it.* A saved view is a **named filter,
never an access object** (`CONTEXT.md`, Saved view): applying one changes what
a list shows a person, never what they may see, because the rows come back
through the same access-resolved reads as before. The table is here in drawer
2 because the thing it describes is a view over the documents.

`saved_views` — `id`; `project_id` (FK `projects`); `organisation_id` (FK
`organisations` — the ceiling a shared view may travel within, and never
beyond: a view is read only by its own organisation's participants on the
project); `participant_id` (FK `participants` — the person who saved it, **a
named person**, registered in [personal-data.md](../architecture/personal-data.md));
`register` (text: `library` · `plan` · `sandbox` · `review` — which list it is a
view over); `name` (text); `filter` (jsonb — the list's query as the screen
sends it: `q`, filters, sort, hidden columns; the server stores it and never
interprets it, so a stale key renders nothing rather than breaking); `shared`
(boolean, default false — readable by the whole organisation on the project
when true, by its maker alone when false); `created_at`. Unique on
(`project_id`, `participant_id`, `register`, `name`) — one person, one name per
list. Deleted by its maker, or by an org admin when shared. Nothing cascades
from it, and it cascades on the project's and the participant's deletion
(ADR-0050 §8's contract end).

*Built the same day (migration 0071); per the state rule the field list above
stands only as the drawing it was, and
[drawer2-documents.ts](../../packages/db/src/schema/drawer2-documents.ts) is
the authority on its shape.*

**Drawn 2026-10-24 — the reference-material intake row, and the not-citable
version (T-472).** *Plainly: a standard or guidance document the owner uploads
does not go straight into the library. It waits in an intake queue — a row
holding the file, its readable text and the AI's proposed title and
classification — until a person confirms it. Only then does a library record
exist, so nothing can be grounded on a file nobody has looked at. A scanned
file whose text cannot be read is accepted too, and marked so the project can
hold it without any run pretending to read it.*

`reference_intake` — `id`; `project_id` (FK `projects`, cascade);
`organisation_id` (the owner's); `uploaded_by_participant_id` (FK
`participants` — **a named person**, registered); `file_ref` (the blob);
`format`; `original_filename`; `extracted_text` (text, nullable); `text_status`
(`extracted`, or the extractor's refusal reason — `pdf_no_text`,
`pdf_encrypted`, `unreadable_file` …); `proposed_title`;
`proposed_classifications` (jsonb, nullable — `[{ facetId, termId, confidence }]`,
confidence a *word*: confident · likely · unsure); `proposed_by_run_id` (FK
`runs`, nullable — the proposal is an agent run on the record); `status`
(`proposed` · `confirmed` · `rejected`); `confirmed_by_participant_id` (FK
`participants`, nullable — **a named person**, registered); `confirmed_at`;
`container_id` (FK `containers`, nullable — set on confirmation);
`created_at`. **Mutable, not append-only**: the row moves from proposed to
confirmed and stays as the audit of who confirmed what; a rejection deletes
the row and its blob. Row-level security as the sandbox tables. Confirmation
admits through the one shared admission path the operator's bulk load also
uses — container, genesis version, rendition, ingest — and writes the
classification rows with `set_by_participant_id` (the confirmer) and
`proposed_by_run_id` (ADR-0045 §17's reservation, used at last).

`versions` gains `not_citable` (boolean, not null, default false, **set at
insert only** — versions are append-only): true for a confirmed file whose
text could not be read. Such a version has `content ''` and no chunks, is
skipped by ingest and by the bulk load's resume, never grounds, and is counted
by the reach statement as "not citable (scan)" — the mark ADR-0022's T-468
note deferred here.

*Document types for reference material*: the seeded `document_type` facet
gains Standard · Guidance · Legislation · Consultee response (source
`infora`), and the migration inserts them into every existing project's scheme
where missing — data, not DDL, but carried by the same file so the two cannot
drift.

*Built the same day (migration 0078); per the state rule the field list above
stands only as the drawing it was, and
[drawer2-documents.ts](../../packages/db/src/schema/drawer2-documents.ts) is the
authority on its shape. Four things the build did that the drawing did not
say. `step_type` gained `intake_proposal` (the proposal is an agent run, and its
step needs a name of its own — migration 0067's `app_step` precedent). The
`versions` trigger now names `not_citable` among its frozen columns, because it
lists them one by one and an unnamed column would have stayed changeable after
insert. The intake row drops its `extracted_text` when it is confirmed (the
version holds the text; the audit keeps names, filename and dates), and it is
deleted with its document when the owner erases one. There is no row-level
security on `reference_intake`, as the sandbox tables have none — the wall is
the route's (owner organisation, super user). The new terms carry no `source`
of their own (terms have no such column; a facet has one) and use the codes
STD, GDN, LEG and CRS.*

**Drawn 2026-10-24 — currency on reference material (T-473).** *Plainly: a
standard the project relies on carries who last confirmed it is still the
right one, when, and when it should be checked again. When that date passes,
the owner's work queue says so. A document nobody has ever confirmed keeps
being read, with that fact shown on every citation of it.*

`containers` gains `confirmed_current_by_participant_id` (FK `participants`,
nullable — **a named person**, registered), `confirmed_current_at`
(timestamptz, nullable) and `recheck_due_at` (timestamptz, nullable).
Meaningful on reference containers (no work item) only; a deliverable's
currency is its acceptance and these stay null on it — enforced in the route,
since a CHECK cannot reach across tables. The record keeps the **latest**
confirmation. "Due" is `recheck_due_at <= now()` evaluated at read time; there
is no clock and no job.

`recheck_defaults` — `project_id` (FK `projects`, cascade); `term_id` (FK
`classification_terms`, **nullable — null is the project-wide fallback**);
`interval_months` (integer, > 0); unique on (`project_id`, `term_id`).
Seeded per project — Standard 12 · Guidance 12 · Legislation 6 · Consultee
response 24 · fallback 12 — and inserted for existing projects by the
migration; the owner's super user may change them. A separate table rather
than a column on `classification_terms`, because a term is immutable once
referenced (retire-and-replace) and an interval is a project's setting, not
the vocabulary's.

*Built the same day (migration 0079); per the state rule the field list above
stands only as the drawing it was, and
[drawer2-documents.ts](../../packages/db/src/schema/drawer2-documents.ts) is the
authority on its shape. Four things the build did that the drawing did not say.
The confirmer's link is `ON DELETE SET NULL`, not a cascade: a cascade would
have deleted the document when its confirmer left, so removing the person
erases the name and keeps the document. The fallback row (`term_id` NULL) needed
a second, partial unique index of its own, because a plain unique index treats
two nulls as different and would have allowed two fallbacks. `recheck_defaults`
has no row-level security (ruled in review — the drawing was silent), as `reference_intake` has none — the wall is the
route's (owner organisation, super user) and the table names no person. A
`PATCH` edits the intervals the project already has and never invents one for a
type that has no row.*

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

**Drawn 2026-10-24 — the run's scope, and its reach (T-469).** *Plainly: when
a person tells a run which part of the library to read, that choice is written
down before the run reads anything; and when the run finishes, the numbers
behind its "read 14 documents, left out 31" sentence are kept with it. So a
later reader can see both what the run was told and what it actually
reached.* Until now Ask's narrowing was recorded nowhere, and the creator and
the checker narrowed *after* retrieval, inside a step's inputs.

`plans` gains `scope` (jsonb, nullable — null means the whole visible
library): the typed scope the person declared — classification term ids,
container ids, and the saved scope it came from, if any. Written once, by
`openPlan`, **before** the first retrieval; never edited. It is not a widening
lever: the gateway intersects it with the requester's entitled, access-resolved
set, so the comment on `plan_steps` ("a plan step declares no scope") keeps
its guarantee — a step still cannot widen anything, and neither can this
column, which only narrows (ADR-0029's addendum of this day).

`runs` gains `reach` (jsonb, nullable): the counts the reach statement is
rendered from — documents visible and live to the requester; of those, in
scope; excluded by record state (superseded, withdrawn, each counted);
left out by the scope; and **read**, the distinct documents in the run's
steps' `source_set`. Written when the run completes, in the same write that
freezes it. Counted under the requester's own visibility, always (ADR-0018's
note of this day).

**Saved scope** reuses `saved_views` (drawer 2) with the register `scope`
and the typed scope as its filter — the one register whose filter the server
validates on save and reads on use. No DDL: `register` is text.

No named person on either column; nothing to register.

*Built the same day (migration 0076); per the state rule the field list above stands only as the drawing it was, and [drawer3-execution.ts](../../packages/db/src/schema/drawer3-execution.ts) is the authority on its shape.*

**Drawn 2026-10-24 — the working set a run was handed (T-471).** *Plainly: when
a person pins a few of their own drafts to a conversation and asks a question,
the run keeps a note of exactly which drafts it was handed — so the record can
say what the person vouched for, and the answer can say "drawing on your
working area".* The pins themselves live on the conversation (`attached_sources`,
T-154) and persist across turns; what a single run actually received is the
run's own fact.

`plans` gains `working_set` (jsonb, nullable — null means none): the list of
`{ sandboxDocumentId, label }` the run was handed, written by `openPlan` with
the scope, before retrieval, never edited. Each id was checked for reach by
the server when the run started (the document's own sandbox grants, ADR-0022's
addendum of this day); an unreachable id refuses the run rather than being
dropped. Never read by the assembler as a corpus: the orchestrator excerpts
these documents into the prompt marked user-supplied, and the cite step skips
them. No named person on the column (the pinner is on `attached_sources`,
already registered).

*Built the same day (migration 0077); per the state rule the field list above stands only as the drawing it was, and [drawer3-execution.ts](../../packages/db/src/schema/drawer3-execution.ts) is the authority on its shape.*

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

**Drawn 2026-10-24 — the passage a citation came from (T-468).** *Plainly: a
citation today says which document and version it came from, but not which
passage — so hovering a citation cannot show the sentence the AI actually
read. The run already knows: the step that chose the passage carries the
passage's id, and the cite step has it in hand and drops it before writing.
This keeps it.* Each citation row gains the id of the stored chunk it was
written from, so a source card can read that passage back — never re-search
for it — and the document page can open scrolled to it.

`citations` gains `chunk_id` (uuid, nullable — null on every row written
before this, and on an authority reference, which has no chunk). **No foreign
key, deliberately:** a re-ingest replaces a version's chunk rows, and the
citation must keep saying which passage it recorded even once that passage is
no longer held; the passage reader (`readRunContext`'s *unreconstructable*
case) already says so in words rather than pretending. Written by the cite
step (`sourceColumns` keeps the chunk id it was dropping) and by the checker's
finding writer (which until now folded the chunk id into the citation's id
string). Read at `GET /versions/:versionId/passages/:chunkId`, through the
version's own visibility: one chunk, by id, the run's own record — nothing is
retrieved again. No named person; nothing to register.

*Built the same day (migration 0075); per the state rule the field list above stands only as the drawing it was, and [drawer4-output.ts](../../packages/db/src/schema/drawer4-output.ts) is the authority on its shape.*

**Drawn 2026-10-24 — the stale-grounding family, and the creator's citation
trail (T-474).** *Plainly: the checker gains a check that needs no AI — "is
any source this draft relies on now out of date?" — and the document creator,
which until now left no note of what it cited, starts leaving one, so that
"what else relied on this?" can be answered for its documents too.*

The `check_family` enum gains `stale_grounding` (one `ALTER TYPE … ADD
VALUE`; code-executed, no model call — ADR-0053 A7). A finding of that family
is a run record like any other (`findings.run_id` stays not-null): the
editor's live view of the same computation is unstored by design. **No new
column** for the creator's trail: its cite step writes ordinary `citations`
rows with `step_id`, and the built document's run id goes in
`sandbox_documents.authoring_metadata` (jsonb). The supersede-impact query
reads what exists — `citations` through `suggestions` and `signals` to a
sandbox document's organisation, and through `steps` to a run's requester —
and is answered **per organisation, never summed** (ADR-0049's amendment of
this day). The fourth notification event needs no DDL: `event_type` is text
(drawer 8).

*Built the same day (migration 0080); per the state rule the drawing above stands only as the drawing it was, and [drawer4-output.ts](../../packages/db/src/schema/drawer4-output.ts) is the authority on its shape. Nothing else was added: the creator's trail rides ordinary `citations` rows and `authoring_metadata`.*

## Drawer 5 — Review
*One review workflow at two scopes: the org-private internal cycle and the
wall-crossing project cycle. (ADR-0002–0017, 0032, 0033, 0035.)*
**Shape:** [drawer5-review.ts](../../packages/db/src/schema/drawer5-review.ts)

**External issue — a deliverable reaches a person with no account** *(drawn
2026-09-01, built 2026-09-02 by T-431/T-432, migration 0065; ADR-0055).*
*Plainly: a finished document can be sent to a landowner or a consultee as a
link that expires, and the record keeps who sent what to whom and why.* The
recipient sits in **drawer 5 and not drawer 1 because they are not a party** —
never an Organisation, Participant or Membership. The record belongs to the
issue event exactly as the transmittal does, and no clause of the wall changes,
because **the link is the access**: there is no grant to resolve.
`transmittals.kind` gains `external`, and the CHECK was **rewritten rather than
extended** — it was a `CASE` over the two known kinds with no `ELSE`, so a row
carrying the new value would have evaluated to NULL, and a NULL check *passes*;
adding the enum value alone would have quietly unbound `round_id` and
`direction` for the one kind that must never touch a review cycle.
**`external_recipients` holds the request and the issue in one table**, as a
state: ADR-0055 §7's request carries the same four fields about the same named
person, and two tables would give the register's deletion promise two paths to
keep true. Its `name`, `email`, `reason` and `message` are the platform's first
stored data about a person with **no account**, registered in
[personal-data.md](../architecture/personal-data.md) at ruling — the build keeps
that row true. Two consequences are structural: there is **no append-only
trigger**, because a trigger forbidding `DELETE` would make the erasure promise
undeliverable; and an update trigger freezes what was asked for, so an approver
cannot redirect somebody else's request to another address or another document.
**The first opening of a link IS recorded** *(T-436, migration 0066, on the
owner's ruling of 2026-09-02 completing ADR-0055 §5)* — `opened_at`, written
once on the first successful open and never moved, because the receipt is that
the document **was read**, not how often it was looked at. It is a fact of the
**issue record** and not a file about the person: no identity is inferred,
since whoever holds the link is the recipient. 0065 deliberately left it out
and said so — an open timestamp is behavioural data about a named person,
outside the four fields then registered — and the register now carries it as
the row's fifth fact. Two consequences are structural. The immutability
trigger was **rewritten rather than replaced**: the frozen identity is
untouched, and one narrow door admits `opened_at` on an issued row that has
none, with nothing else moving in the same statement — so a second receipt, a
cleared one, and one against a request nobody approved are all refused by the
database. And the write sits **only on the success path**, after the token has
already resolved, so an expired link and an invented one still answer
identically (§4): recording an open cannot become the timing or shape
difference that tells a guesser their token once existed. Two whole-project settings (the standard message; who may issue) joined
the Project row's owner-super-user set, the ADR-0046/T-371 pattern, with the
**strictest** level as the default.

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

**Drawn 2026-10-24 — open gaps on the override record (T-475).** *Plainly: a
draft with a marked gap in it cannot be promoted until the gap is cleared,
just as an open comment or finding blocks it; and when an owner overrides that
block, the record says how many gaps were open at the time.*
`promotion_overrides` gains `open_gaps` (integer, not null, default 0) beside
`open_threads` and `open_findings` (ADR-0049 §7, amended this day). A gap is
counted from the text itself — a single-line marker parsed by one shared
function — so there is no gap table: the text is the record.

*Built the same day (migration 0081); per the state rule the drawing above stands only as the drawing it was, and [drawer5-review.ts](../../packages/db/src/schema/drawer5-review.ts) is the authority on its shape. Records made before it read 0 gaps — the column's default, which is also the honest answer: no gap marker existed to be open.*

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

### The AI feature switch *(drawn 2026-10-23, T-463, migration 0073)*

*In plain terms: the owner's super user can turn an AI feature off for one
project — the checker, say, while a client decides whether it may be used on
their work — and must say why. Every throw of the switch is kept with the
person's name, and nothing is edited or deleted; the feature is simply absent
until it is turned back on.*

`ai_feature_switches` — `id`; `project_id` (FK `projects`, cascade); `feature`
(text — one of the registry's keys, `apps/api/src/ai-features.ts`); `enabled`
(boolean); `reason` (text, required — a project decision stated in words);
`changed_by_participant_id` (FK `participants` — **a named person**, registered
in [personal-data.md](../architecture/personal-data.md)); `changed_at`.
**Append-only by trigger** (T-008's pattern): the current state of a feature is
its newest row, and a feature with no row is on. Index on (`project_id`,
`feature`, `changed_at`). It lives in this drawer because it is governance over
what the AI may do on a project — ADR-0030's ceiling applied to features
(ADR-0037 addendum) — and not a record of any document. It only narrows: the
deployment tier and each requester's own entitlement still apply above it.

*Built the same day (migration 0073); per the state rule the field list above
stands only as the drawing it was, and
[drawer7-context.ts](../../packages/db/src/schema/drawer7-context.ts) is the
authority on its shape.*

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

### The rule set *(drawn 2026-09-01, built 2026-09-02, T-423, migration 0064)*

*In plain terms: a project's style guide stops being only a document and gains
a list of rules — the writing rules somebody accepted, stored one by one with
what each applies to and where it does not, so most of them can be checked by
ordinary code rather than by asking the AI.*

**Two tables, `project_style_guide_rule_sets` and `project_style_guide_rules`,
and the names are the register's rather than the drawing's.** The drawing called
them `rule_set_versions` and `rules`; [personal-data.md](../architecture/personal-data.md)
had already registered the second as `project_style_guide_rules` when ADR-0054
landed, and a bare `rules` in a schema this size names nothing. Both now sit
beside `project_style_guides` and `project_style_guide_clauses`, which is where
a reader looks for them.

🔒 **The clause store is not replaced, and that is the design.** An extracted
rule **points at** the clause it came from, because ADR-0048 §5's verbatim
quotation resolves through it: a finding quotes the words the client's guide
really carries, never Infora's restructuring of them. The pointer is non-null
**exactly when** the origin is `extracted`, carried as a CHECK rather than as a
convention. A typed or Infora-proposed rule has no pointer and its findings say
so — the same discipline as the nullable clause label one table up, and as
T-305's rule for `page`: never a guessed address, because an invented one looks
checkable.

**A version is immutable once saved**, on T-397's retire-never-edit precedent.
The stored rule text is what past findings quoted, so an amendment is a **new
version** and never an edit — enforced by two triggers on the T-008 pattern,
because ADR-0054 decision 7's stored version stamp means nothing if the thing it
points at can change underneath it. **The one mutation this store permits** is a
*pending* proposal being decided, and only its two decision columns move.

**Proposals ride the same table** (T-426), carrying a state, the proposer and
the decider. A proposal **is** a rule that has not been accepted; two tables
would be two answers to what binds. Accepting one copies it into a new version
rather than flipping something in place, and a declined one records **no
reason**, on the finding-dismissal precedent. Ordering is a property of the
saved set, so the ordinal's unique index is partial — proposals sit outside it.

**Three named people ride these tables** — who accepted a set, who proposed a
rule, and who decided the proposal — all three registered in
[personal-data.md](../architecture/personal-data.md) when ADR-0054 was ruled;
the build keeps that row true rather than adding one.

**The kind-specific half is `jsonb` and the rest is columns**, and the split is
the same one `starting_outlines.sections` makes for the opposite reason: every
read of a set filters or groups on the scope, the register, the origin and the
enforcement, so those are columns; a term rule's swap pair and a judgement
rule's examples are read by exactly one matcher each, and five sparse column
families would be a schema describing the union badly.


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

## Drawer 9 — Apps
*The app builder's substrate — [ADR-0056](../architecture/adr/0056-the-app-model.md)
and [ADR-0057](../architecture/adr/0057-connections-and-stored-credentials.md).
Drawn 2026-09-06 and **built the same day (T-439, migration 0067)**, so per the
state rule at the head of this file the field lists are gone and the schema file
is the authority on the shape. **The three connection tables below are the
exception**: ADR-0057 waits for deployment, nothing of it is built, and its
drawing therefore stays.*
**Shape:** [drawer9-apps.ts](../../packages/db/src/schema/drawer9-apps.ts)

Eight tables — `apps`, `app_scope_grants`, `app_tables`, `app_rows`,
`app_table_shares`, `app_runs`, `app_exports`, `playbooks` — and, since T-449,
a ninth for the build conversation and, since T-451, a tenth for the file
source (both below), behind ADR-0056's
one sentence: an app is a **project thing with a participant scope**, and its
tables are a **third kind of project record** whose every row carries the
organisation and the person that entered it.

**Why a drawer rather than shelves in Drawers 2 and 3.** An app table's row is
neither a document nor a work item: it carries its own read predicate
(*entering organisation, or the project owner, or an open share — all within
the app's scope, and a `draft` row by its entering organisation alone*) that no
existing table has. Putting rows beside sandbox documents would invite the
sandbox predicate; putting them beside `runs` would suggest an app is a
workflow. A run *is* reused — an app run is an ADR-0028 Run, and `app_runs`
links to one — but the app's own things are their own subject area.

**Every stamp is a Participant, project derived through it** — Drawer 8's rule,
for the same reason: a Participant interval closing on removal stops resolving,
so a departed person's rows go dark in the same act that ends the access, and
ADR-0056 §7's accepted-versus-unaccepted split then reads off `state` alone.

**Two copies of the definition, and the split is the ruling** (ADR-0056's
2026-09-06 addendum, ruling 2). `apps.definition` is the builder's working copy;
`apps.published_definition` is what the app's people open and what a scheduled
run acts against, and its four columns move together or not at all. Publishing
is a recorded act with a person and a time on it; an app with nothing published
is open to its builders alone. `app_runs.definitions_version` records the
**published** version, never the working copy. The **table declarations live in
`app_tables` rather than inside either JSON**, so the read path never parses a
definition to decide access.

**What the migration hand-writes, and why it matters more here than usual.**
Eight `CHECK`s and eight triggers, each argued in
[0067](../../packages/db/migrations/0067_app-substrate.sql): the published
quartet and the closed pair move together; a scope grant names exactly one
grantee; a decided row names its decider and its time; **a rejection carries a
required reason and only a rejection carries one** (ruling 4); `state` is null
exactly when the table has no acceptance step (cross-table, so a trigger);
**an accepted row is never edited or deleted in place**, with the single
permitted transition to `superseded` when its correction arrives; the two grant
tables are append-only intervals and a revocation is never reopened; an app
run's two actor stamps cannot disagree with Drawer 3's; and **a playbook carries
no rows of any kind**, refused by a key scan rather than left to a convention.
These are the guarantees an app's data is worth nothing without, which is why
they are in the database and not only in a route.

**One deliberate widening, drawn before it was written:** `step_type` gained the
single value `app_step` (Drawer 3). An app run's steps are ADR-0028 Steps and
carry the same two defensibility fields as every other; without a name of their
own they would have to borrow a worker's, and the append-only audit store would
then say a thing that is not true.

**One column that is not this drawer's:** `users.may_build_apps`, added by the
same migration. ADR-0056 §12 fixed the policy — each organisation decides who
among its own people may build — and left the control to the build; it is at
user grain because the decision is the organisation's about its own person, and
it rides 0067 because the app-builder slice has exactly one migration.

**The file source, `app_table_sources` — drawn 2026-10-18 (ADR-0059) and built the same day (T-451, migration [0069](../../packages/db/migrations/0069_file-source.sql)).**
*Plainly: an app table can point at a spreadsheet the project already holds —
a sandbox document or a library record — name the block of cells and what each
column means, and every new version of that file refills the table.* Per the
state rule the field list is gone and
[drawer9-apps.ts](../../packages/db/src/schema/drawer9-apps.ts) is the
authority on its shape; registered in
[personal-data.md](../architecture/personal-data.md) ("The file source's
configuration"). What stays here is what the schema cannot say.

- **One source per table, a table per source** — `app_table_id` is unique, so a
  re-attach after a detach reconfigures the same row. **Exactly one of the
  pointer pair** (a sandbox document or a library record) is set, the one
  `CHECK` the drawing named; the pointer follows the DOCUMENT, whose versions
  are the refresh events (the Power BI item-identity lesson).
- **The region is re-found by its headings, never by coordinates.**
  `header_row` keeps the region's header texts as they were at attach and
  `mapping` the heading → declared-column pairs; each import looks for the
  first row carrying every mapped heading, so a block that moved survives and
  one whose heading vanished fails, naming it.
- **The rows' stamp is never the configuration's.** `configured_by_participant_id`
  is the builder who attached, last changed or detached the source; imported
  rows name the person whose act produced the file version (ADR-0059 decision 2).
- **The import discipline is one act function, not a trigger** —
  [`apps/api/src/app-table-source.ts`](../../apps/api/src/app-table-source.ts),
  called by the version-landing hooks (the replace-file route; promotion into
  the library) and by refresh-now, never by a poll. Each import supersedes the
  previous import's rows; on an acceptance table imported rows land `submitted`,
  else stateless; a failure changes no rows and says why in the receipt.

**Built beyond the drawing, and why** (T-451; the drawing's "no trigger or
`CHECK` beyond the exactly-one-pointer pair" still holds):

- **`last_import_succeeded`** — the drawing's receipt was a sentence, and
  whether that sentence reports a success or a failure must not be parsed out
  of its own wording; the panel needs the fact.
- **`last_import_row_ids`** — "each import supersedes the previous import's
  rows" needs to know WHICH rows those were. A person may type rows into a
  sourced table, and superseding by anything looser — a timestamp, the
  enterer — would sweep a typed row up. A detach clears the list, so rows
  released into their ordinary lives are not superseded by a later re-attach.
- **Both pointers `ON DELETE CASCADE`.** The drawing did not say; purge
  (ADR-0050 §6, T-340/T-341) deletes sandbox documents and library records,
  and a plain foreign key would have made a sourced document unpurgeable.
  The configuration quotes the file's header texts, so erasure takes it too;
  the imported rows are the table's and stay, exactly as on a detach.

**The build conversation, `app_build_turns` — drawn 2026-10-18 and built the same day (T-449, migration [0068](../../packages/db/migrations/0068_app-build-conversation.sql)).**
*Plainly: what a builder says to the app builder's agent, and what the agent
says and does in reply, kept against the app so the conversation can be picked
up tomorrow.* ADR-0056's third addendum, ruling 5; registered in
[personal-data.md](../architecture/personal-data.md) at ruling. Per the state
rule its field list is gone again and
[drawer9-apps.ts](../../packages/db/src/schema/drawer9-apps.ts) is the
authority on its shape; what stays here is what the schema cannot say.

- **One turn per row, ordered by an identity rather than a clock**, so two
  turns written in one breath never tie. A turn is a person's or the agent's;
  on an agent turn the participant stamped is the builder whose message it
  answered, because the agent acts as that person and nobody else.
- **The agent's turn carries its receipt** — the required questions it asked,
  the acts it performed on the working copy, the acts it proposed for a person
  — and a `CHECK` refuses any of the three on a person's turn, so a later
  reader can never mistake a receipt for something a person claimed. The
  `asked` list is load-bearing: the agent may record an answer only to a
  question an EARLIER turn asked, and this is where that is checked.
- **Append-only against UPDATE and deliberately not against DELETE.** What was
  said is not rewritten; deleting is the deletion path itself (`ON DELETE
  CASCADE` from `apps`, and an erasure request), and refusing it would make
  the register's "deleted with the app" false. *(No route deletes an app
  today, and an app's scope grants refuse DELETE — so the conversation goes
  exactly when the rest of the app does, once that path exists.)*
- **No organisation column and no read predicate of its own.** It is working
  material with the working copy's standing — readable exactly by the people
  who may build the app (`canBuildApp`), which the route checks before any row
  is read.

**After deployment — `connections`, `connection_loans`, `connection_calls`** *(ADR-0057; not in T-439's migration; drawn so the shape is agreed).*
- `connections`: `id`, `organisation_id` (the owner of the outside system), `system` (e.g. `arcgis`), `mode`: `read` | `write`, `reach` (jsonb — named layers/tables/endpoints), `secret_ref` (**a pointer into the secrets store, never a value**), `created_by_participant_id`, `created_at`, `retired_at`
- `connection_loans`: `connection_id`, `app_id`, `granted_by_participant_id`, `granted_at`, `approved_by_participant_id`, `approved_at` (**required when the connection's mode is `write` — the project owner's person; `CHECK` via trigger**), `revoked_at`
- `connection_calls`: append-only — `connection_id`, `app_run_id`, `as_participant_id`, `destination`, `at`, `outcome` — ADR-0037 §6's egress audit, outbound

---

## What is deliberately not drawn yet

Per the drawer-by-drawer discipline, still absent because their slices are
deferred: **programme** and programme context; the **org-context / Knowledge /
precedent** stores and the distillation loop (Sessions 4/7); **custom agents**
and the custom-workflow builder (the app builder half of Slice F is now Drawer 9,
above); the **authority corpus** internals (ADR-0023 —
referenced by Citation, owned by Context); **rails as scoped records**
(ADR-0030); portfolio and programme views. Each is drawn here, fields first, when its slice starts.

## Open items sent back to the grill tracker

- The sandbox-scope review rendition (PDF vs frozen native text) — parked in
  ADR-0032, carried as `Q-025`.
- The naming scheme — the standing ADR-0008 deferral, carried as `Q-026`
  (the metadata *schema* half closed with ADR-0045).
- Everything else the drawers omit is already tracked in
  [grill-questions.md](../grill-sessions/grill-questions.md).
