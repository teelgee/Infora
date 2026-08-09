# Directed grill session — the DMS walkthrough, 2026-08-09

Comment-directed review of the document-management user story and its built
surfaces. NOTHING in the repo is edited during the session. Each entry below is
provisional until the reconciliation pass; a later entry may reverse an earlier
one, and the reversal is recorded on both (never deleted).

Shared map: docs/architecture/user-stories-walkthrough.html (acts I–V).
Known gap register going in: T-355 (internal QA surface), T-356 (moderation UI),
T-354 residual (response→P02 jump), Q-038 (reviewer approval of responses),
review-period clock/notifications (unticketed, rides V1 Waypoint C).

Entry format:
- **S# — short name.** *Status: open | settled | reversed by S#.*
  - The comment (gist, user's words)
  - Questions put + answers
  - Provisional ruling
  - Touches: ADR-#### (amend/new) · CONTEXT.md · component-N doc · user-stories.md · walkthrough recapture?
  - Ticket candidates + deps

---

## Entries

- **S1 — Schema definition is step 1 of the story.** *Status: settled.*
  - Comment: the story should OPEN with Rachel (owner) defining the project schema; the build is there (schema.tsx, owner super-user, T-156/T-188). Story addition, not build work.
  - Provisional ruling: user-stories.md gains the owner's schema-definition step before the consultant journey ("the plan decides first" gets a prequel beat: the owner decided what the plan records"). Walkthrough gains an Act 0/I beat (Rachel on /plan/scheme) at recapture.
  - Touches: user-stories.md (amend) · walkthrough recapture. No ADR change — ADR-0008/T-188 already rule it.

- **S2 — Schema exports as an Excel table.** *Status: settled.*
  - Comment: export the schema so each field is a column — teams draft the deliverables plan in Excel before the super user updates the plan.
  - Ruling (with S3's answer): the export is a fillable TEMPLATE — an .xlsx whose header row is the schema's attribute fields (title, discipline, …). No reference/numbering column: numbering is never drafted in Excel (S3). T-337's import, reversed.
  - Touches: component-5 doc (plan section, small) · ticket candidate (pairs with T-337; V1-S adjacency).

- **S3 — The plan uploads from Excel; plan shows configurable schema columns.** *Status: open on Q(a)/Q(b).*
  - Comment: Eleanor (producing super user) gets an upload-from-Excel on the plan to mirror S2; the plan table should show more schema data, configurable by the super user, standard for all members in that organisation.
  - Notes: row import is T-337's sibling (fields vs rows — same file, two halves). T-337's three hard constraints carry over verbatim (never corpus; no file echo into runs.request — author/reviewer columns carry named people, personal-data.md; unparseable rows fail loudly and name the row).
  - RULED (owner, in session): the upload is a BATCH-CREATE act — once at project start, or mid-project for a new batch of documents. The file carries schema attributes only (title, discipline, …), NEVER numbering: references are generated sequentially by the naming scheme as each row is created at import. Upload never amends and never deletes an existing row — it only adds. A reference-like column in the file is ignored. Per-row parse failures fail loudly and name the row (T-337 constraint 3). Column config: org standard, LOCKED — no personal overrides; set by the producing org's super user for that organisation.
  - Status: settled.
  - Touches: component-5 doc · personal-data.md (row import carries named people in author columns) · ticket candidates (template export S2 + batch import + column config).

- **S4 — Row detail becomes a card, not a side drawer.** *Status: settled (ruled on my judgement — low-stakes UI).*
  - Comment: the plan row's detail is a right-hand drawer today; should be a card per the design style.
  - Ruling: the detail presentation moves to the design system's modal-card treatment (the kit's Modal, as the plan's metadata view already uses); drawers stay for genuinely lateral context elsewhere. Build-time judgement on exact composition.
  - Touches: ticket candidate (UI). No ADR.

- **S5 — The lead author edits their deliverable's row; other members don't.** *Status: open on Q(c).*
  - Comment: Eleanor (super user) defines the lead author; that grant lets the lead author edit the row's other metadata — other authors, reviewers, classification, title. Another Calder & Hale member cannot; Eleanor still can.
  - Notes: today canEdit = producing super-user only. Delegation model: row-scoped edit rights = producing org's super users + that row's lead author. Lead authorship itself stays super-user-assigned (the comment implies it; reassignment is the super user's act). Reviewer changes stay PROPOSAL only — confirmation remains the owner's act (ADR-0033 unchanged). Reference is NOT title: reference changes are a naming-scheme act, excluded from the delegation.
  - RULED (owner, in session): withdraw is EXCLUDED — "Remove from plan" stays on the elevated tier. The lead author edits title, classification, other authors; proposes reviewers (confirmation stays the owner's act, ADR-0033 unchanged); cannot reassign lead authorship (super user's act); cannot change the reference (a naming-scheme act, not metadata).
  - Status: settled.
  - Touches: ADR-0033 addendum (row-edit delegation follows lead authorship) · component-5 doc · ticket candidate.

- **S6 — The sandbox structure builder gains its agent (and a plan seed).** *Status: settled.*
  - Comment: first sandbox step is structuring it (ProjectWise Location→Discipline→doc-type tree as the benchmark). Super user configures the sandbox they hold rights over: manual folders, or ask an agent for "a structure based on these disciplines, with these sub-areas"; agent may ask follow-ups, then writes the structure.
  - Already built (no work): manual add; the super-user "Create folder structure" interactive tree-builder modal; POST /sandboxes/:id/folder-structure (≤200 nodes, additive, ADR-0040/T-182); allowMemberFolderCreate toggle (T-181) holding members within the structure.
  - RULED: the missing piece is the agent path, built as the second embedded assistive agent (T-337 sibling, ADR-0027 propose-confirm): it fills the EXISTING tree builder with a candidate tree; the super user edits/confirms; the existing deterministic endpoint executes. Agent reads NO sandbox content (Q-020 untouched); agent writes nothing (Q-031 dodged as T-337 dodges it). Embedded in the Create-folder-structure modal, not Tools (my ruling).
  - RULED (owner): plus a no-model seed — "propose a structure from the plan's disciplines" derives a first tree from the plan rows' discipline metadata, no model call; agent reserved for free-form shaping. Deterministic half useful alone.
  - RULED (owner): the organisation-level structure TEMPLATE (save confirmed tree, reuse next project — the PW standard) is DEFERRED to the register: it is org-context knowledge and deserves its own pass on where templates live and who edits them.
  - Touches: component-5 doc (sandbox section, small) · deferred register entry (org structure template) · ticket candidate (the builder agent + plan seed). No new ADR: ADR-0027 pattern + ADR-0040 cover it; the ticket cites both.

- **S7 — Plan-locked sandboxes: a third folder-creation mode.** *Status: settled.*
  - Comment: beyond "anyone creates folders" and "members work within the structure", some project teams work with the sandbox locked to the deliverables plan.
  - RULED (owner + session): a per-sandbox mode where the tree is DERIVED from the organisation's own plan rows — discipline folder (schema field) → working folder per deliverable (reference + title). Folders appear as rows are created (S3 batch import ⇒ folders appear in batch); names follow the row (rename tracks title changes); withdrawn rows keep their folder, badged off-plan — content is never orphaned, nothing is deleted. Top/discipline levels are system-owned in this mode; INSIDE a deliverable's folder the existing allowMemberFolderCreate toggle governs member freedom (the two settings compose). My rulings: rename-follows-row; withdrawn-badging; toggle composition.
  - RULED (owner): a draft created in or moved into a deliverable's folder PRE-SELECTS that container as the bind target wherever binding is offered — never silently binds. The plan-locked mode's workflow win: file it in the right place and it is already pointed at the right container.
  - Interaction with S6: the agent/seed builder applies to the free modes; plan-locked mode needs no builder (the plan is the structure). The settings SelectInput gains the third option.
  - Touches: ADR-0040 addendum (third mode + derivation rules + bind pre-select) · component-5 doc · CONTEXT.md check (no new term — "plan-locked" is a setting label, not vocabulary) · ticket candidate. Sync mechanics (row→folder lifecycle) are mine to specify in the ticket.

- **S8 — Binding gets a confirmation card; bound documents read the row through.** *Status: settled (user invited my judgement on the sync half).*
  - Comment: bind pops a card confirming the act, showing the plan row's relevant metadata; at bind the sandbox document's title aligns to the plan row's, and other metadata syncs too.
  - RULED: sync is READ-THROUGH, not copy — a bound document displays its row's title and schema metadata by reference over the container_id link. ADR-0038's "container_id is the only link" is preserved (no second store, drift impossible); consistent with Q-037's seed-read-only-facts recommendation and S7's rename-tracks-row. The bind card (S4 card treatment) shows reference, title, schema metadata, appointments, and states the consequence; confirm stays explicit (S7: pre-select, never silent).
  - Consequences: a bound draft cannot be retitled from the sandbox — title changes happen on the plan row (S5 authorisation) and flow through. Unbind reveals the document's own working title again (my ruling). Sandbox lists and S7 folders derive from the same source.
  - Touches: ADR-0038 addendum (read-through display over the single link) · component-5 doc · ticket candidate (bind card + read-through rendering). Flagged to user: the retitle lock is the visible behaviour change.

- **S9 — Internal QA refined against the ISO 19650 CDE; the QA gate becomes policy.** *Status: settled.*
  - Comment: Infora splits the PW/ISO 19650 CDE — WIP→Shared inside the sandbox, publishing in the project library (client review cycle if required). Doc added to sandbox, team-worked; once bound it can be frozen and internally assured; once completed, promoted. Source read: Bentley G-Cloud 14 PW ISO 19650 service definition (WIP S0/P01.0x → Content Check → Approve for Sharing → Shared → Approve for Publication → Published C01 → Archive; edits WIP-only; reject reverts to WIP with version bumps).
  - Mapping confirmed (mostly already built): v0.x ambient series = WIP minors · freeze + internal QA cycle = Content Check/Approve for Sharing · QA-accepted frozen version = Shared (fixed, org-visible) · promote → P01 + client rounds = Approve for Publication · acceptance issues C01 into the library = Published (ADR-0041 already follows the National Annex lettering) · Archive = history + supersede (Q-036).
  - RULED (owner): promotion-requires-QA becomes a PER-SANDBOX SETTING, DEFAULT ON for project sandboxes — "promotion requires QA acceptance"; a team turns it off deliberately (visible governance). This amends ADR-0032's two-legal-sources rule with a policy gate: when on, the live-head source is disabled.
  - Spec details (mine, into T-355): the surface states that promotion issues the QA-ACCEPTED FROZEN version, never the post-QA drifted head (ADR-0032); the CDE mapping table goes into component-5 doc so the ISO 19650 anchoring is on the record; story keeps its QA beat, now backed by the default-on gate.
  - Touches: ADR-0032 addendum (QA gate setting + restating the mapping) · component-5 doc (CDE table) · T-355 spec grows (settings toggle + gate errors + drift-notice) · sandbox settings UI gains the toggle (with S7's third folder mode, settings now: folder mode ×3, QA gate).

---

## Reconciliation pass (done 2026-08-09, end of session)

Sweep result: **S1–S9 all settled, no reversals, no conflicts.** Two entries
compound rather than conflict: S3's never-amend principle recurs in S7
(withdrawn rows badge, never delete) and S6/S7 share the discipline-derived
tree (S6 seeds it once, S7 derives it live — different modes, same source).
No unresolved forks remain → nothing new for the grill tracker beyond Q-038
(already minted). The paused walkthrough items (T-356 moderation, T-354
residual jump, Q-038 approval, notifications clock) were NOT reached this
session — they stand as recorded on the board.

### Execution order (for the enacting session)

**Pass 1 — the design record (one commit):**
1. ADR-0032 addendum: the QA gate — "promotion requires QA acceptance" as a
   per-sandbox setting, default ON for project sandboxes; when on, the
   live-head promotion source is disabled (S9). Restate the ISO 19650 CDE
   mapping briefly; the full table goes in the component doc.
2. ADR-0033 addendum: row-edit delegation follows lead authorship (S5) —
   title, classification, authors, reviewer *proposals*; excludes withdraw
   (elevated), lead-author reassignment (super), reference (naming-scheme act).
3. ADR-0038 addendum: bound documents read the row through (S8) — title +
   schema metadata displayed by reference over container_id; no copy; retitle
   of a bound draft happens on the plan row only; unbind reveals the working
   title again.
4. ADR-0040 addendum: the third folder mode — plan-locked (S7): discipline →
   deliverable tree derived from the org's own rows; renames track the row;
   withdrawn rows badge off-plan; system-owned upper levels;
   allowMemberFolderCreate governs INSIDE deliverable folders; bind target
   pre-selected, never silently bound. Also names the S6 builder agent as
   ADR-0027 propose-confirm filling the existing tree builder.
5. component-5-document-management.md: CDE mapping table (S9), plan
   export/import (S2/S3), column config, delegation, plan-locked mode,
   builder agent. user-stories.md: add the owner's schema-definition opening
   beat (S1), the super-user sandbox structuring beat (S6/S7), and align the
   QA beat with the default-on gate (S9).
6. Deferred register: org-level structure template (S6) — org-context
   knowledge, own design pass pending.
7. personal-data.md: the plan-row import file carries named people in
   author/reviewer columns (S3; T-337's constraints verbatim).

**Pass 2 — mint tickets (same commit as pass 1 or its own; counter via
`pnpm run check:tickets -- --next`, bump the board line):**
- S2 schema→xlsx template export (pairs with T-337)
- S3 plan batch-import from xlsx (create-only, sequential references, file
  order = numbering order, loud per-row failures) + org-standard plan columns
- S4 plan row detail drawer → modal card
- S5 lead-author row editing (ADR-0033 addendum)
- S6 structure-builder agent + plan-discipline seed (deterministic half first)
- S7 plan-locked sandbox mode
- S8 bind confirmation card + read-through title/metadata
- S9 extends T-355 in place (gate setting + drift notice + staffing surface) —
  edit the existing T-355 entry, do not renumber.

**Pass 3 — build,** one commit per ticket, `pnpm run check` green each, e2e
suite after cycle-touching tickets (fresh seed + restarted e2e API — its
boot-time index goes stale after reseed). Deterministic tickets before
agent-dependent ones (the S6 agent may sequence behind T-337's extractor
pattern if convenient).

**Pass 4 — the walkthrough:** recapture per scripts/user-story-walkthrough/
(new beats: schema definition, sandbox structuring + settings, bind card,
QA cycle + gate, plan-locked tree), rebuild via build.mjs, republish the
artifact to the SAME URL (it is in auto-memory: user-story-walkthrough-artifact).
