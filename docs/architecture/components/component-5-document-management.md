# Document management (component 5)

The engine room of Infora's wedge: the controlled-document lifecycle that makes the AI trustworthy. The component stores, versions, reviews, approves and publishes a project's written deliverables, and holds the project library the AI grounds on. The unglamorous CDE basics live here on purpose, because they are what let the rest of the platform be trusted.

The component separates the working copy from the controlled record. Teams draft freely in the sandbox; promotion snapshots the sandbox head into an immutable controlled revision, with only one revision in flight per deliverable at a time, and the sandbox head stays live as the draft of the next version (ADR-0002). Each deliverable lives in a container: a persistent home identified by a document reference that never changes across versions, holding the version history and both renditions, the native source the client owns and the PDF that is the authoritative review-and-record rendition (ADR-0004).

Every deliverable to be produced is planned up front. The deliverable plan is a schedule of empty containers created at planning time, each carrying its coded reference, its named review group and authoring team, its planned metadata, and a status (ADR-0008). Promotion is then a near-empty hand-off into a waiting container, not a metadata gate: metadata and naming come from the plan. The plan and the live status tracker are the same object, giving the owner an MIDP-style view of every deliverable that should exist and its real state.

Review happens on the PDF, not in the native file. Reviewers comment by highlighting text or dropping a point; each comment's anchor is stored as structured fields on the review record, bound to the immutable version, never in a sidecar file that could orphan or silently lose markup (ADR-0004, ADR-0006). Because the version is frozen, anchors never drift. All review lives in one live, append-only Deliverable Review Record per deliverable, spanning every version: comments, consultant responses, and acceptance codes, with no separate review notice ever issued (ADR-0009). Acceptance codes sit at two levels, per comment and per deliverable, on a per-project configurable scheme, with the lead reviewer authoritative (ADR-0003). The assurance cycle runs each version through review rounds to acceptance; a round closes only by explicit human action, never by the clock, and the review period only guides (ADR-0005).

Transmittal is the audited issue-event, in two kinds sharing the same facts and differing only in consequence (ADR-0035). A **review transmittal** issues a version for review and returns it: on platform it moves no file, recording the audit facts (sender, recipients, version, purpose code, dates), flipping the DRR edit lock, freezing an internal snapshot as the formal record, revealing the closed round to the consultant, and notifying recipients (ADR-0009, ADR-0010, ADR-0014). A **non-review transmittal** issues a promoted library deliverable to an organisation outside any cycle — the owner's cross-organisation share made a first-class event — carrying no round, edit lock or snapshot, and instead an organisation-level acknowledgement gate and optional intra-organisation narrowing that the access model enforces (component 2, §3). The component runs in one of two record configurations per project: record, where Infora holds the controlled record end to end, and integrate, where Infora owns sandbox, review and assurance, then transmits the approved deliverable to an incumbent system (via a connector, component 7). The two share one pipeline up to transmittal and diverge only in post-publication custody (ADR-0001).

The project library is the curated, owner-controlled corpus and the only project-side corpus the AI grounds on, for both chat and drafting (ADR-0011, refined by ADR-0021). Accepted deliverables enter automatically; the owner may add other reference material. It is a collection of coded deliverables, presented flat or foldered per project configuration (refined 2026-07-06) — folders organise the view but are never access objects. A document's currency is expressed by state, not deletion: superseded and withdrawn documents stay in the library and remain auditable, but leave the grounded corpus (ADR-0013).

**The project ontology (2026-07-26, ADR-0045).** Over the flat library sits a legible model of *how documents relate*, so the library and sandboxes are more than a list of coded containers. Two layers: a **classification vocabulary** deliverables classify against — discipline, system / asset breakdown, work package, document type, phase — seeded by copy from a Uniclass 2015 / ISO 19650 default (ADR-0041) and owned by the library owner, extended the way the naming scheme is; and **first-class typed relationship edges** between containers (`supersedes`, `references`, `responds-to`, `is-part-of`, `derived-from`), replacing the old free-text "relationships to other documents". This finally gives ADR-0008's deferred per-project metadata *schema* its shape. Both are colocated in Postgres and **derived from the record, never a parallel store** (Claude-owned mechanics), so the access + state pre-filter stays one query (ADR-0022/0024) and the ontology only adds *semantic* pre-filters — the retrieval lever that scopes a 100k-document corpus before a single embedding is compared, and answers purely structural questions (currency, coverage, dependency) with no retrieval at all. The structure is agent-facing first: classification is an agent-proposed, human-editable field; edges are agent-proposed on promotion and human-confirmed. It is metadata and structure, **never a grounded corpus** — though ⚠ **amended 2026-08-27**: one edge type now has a lifecycle consequence, since confirming a `supersedes` edge sets the target's **record state** and therefore stops it grounding (ADR-0045). The ontology still grounds nothing itself; what changed is that one edge acts rather than only describing. It exists to let an agent run the structural checks RAG cannot: collision detection across producers, coverage / lost-work gaps against the MIDP, and supersede-impact analysis.

**The review cycle generalised (2026-07-18, ADR-0032; drawn in [diagrams/slice-a-review-model.tldr](../diagrams/slice-a-review-model.tldr)).** The cycle is role-agnostic — an authoring side and a reviewing side per instance, not consultant-vs-client — and runs at two scopes on one Version substrate: a **sandbox-scope** instance is the org-private internal formal review (its DRR is the firm's QA evidence, retained permanently, never crossing the wall), a **project-scope** instance is the client review described above. The sandbox itself gains SharePoint-style ambient version history (a tool, not a record) and a **freeze** ("check out") — promotion's twin at sandbox scope — with the head locked while an internal round is open. The internal cycle is optional ceremony, never a system gate: promotion takes the live head snapshot or a QA-accepted frozen version, never a drifted head. The cycle is the instance unit with the DRR as its record, and carries two terminals — accepted, and closed-rejected by explicit audited action of the lead author or project owner; a rejected deliverable stays in the library, badged (state `rejected`, ADR-0013), and never grounds. Sandbox-scope review's rendition (PDF vs frozen native text) is deliberately parked.

**The DMS walkthrough rulings (2026-08-09, S1–S9; ADR-0032/0033/0038/0040 addenda).** A comment-directed review of the built journey settled nine refinements across the plan, the sandbox and the QA path. **The plan meets Excel both ways:** the schema exports as a **fillable .xlsx template** whose header row is the schema's attribute fields — teams draft their deliverables list in Excel before the super user updates the plan — and the plan gains a **batch import** from the same shape: a **create-only** act (once at project start, or mid-project for a new batch) that carries schema attributes only, **never numbering** — references are generated sequentially by the naming scheme as each row is created, a reference-like column is ignored, upload never amends or deletes an existing row, and per-row parse failures fail loudly and name the row (T-337's constraints verbatim; the file's author/reviewer columns carry named people — [personal-data.md](../personal-data.md)). The plan table's visible columns are **org-standard and locked** — set by the producing organisation's super user for that organisation, no personal overrides. **Row editing follows lead authorship** (ADR-0033 addendum): the lead author edits title, classification and authors, proposes reviewers; withdraw, lead-author reassignment and the reference stay elevated or super-user acts. **The sandbox is structured before it is worked:** the tree builder gains its ADR-0027 propose-confirm agent and a no-model plan-discipline seed, and a third per-sandbox folder mode — **plan-locked**, the tree derived live from the org's own plan rows — joins open and structured (ADR-0040 addendum). **Binding confirms on a card and reads the row through** (ADR-0038 addendum): the bind card states what the draft is about to wear; a bound document displays its row's title and schema metadata by reference, so a bound draft is retitled on the plan row only. **And internal QA is anchored to the ISO 19650 CDE** (ADR-0032 addendum): *promotion requires QA acceptance* is a per-sandbox setting, default on for project sandboxes — when on, the live-head promotion source is disabled and what promotes is the QA-accepted frozen version. The CDE mapping, on the record:

| ISO 19650 CDE (the ProjectWise service-definition states) | Infora |
|---|---|
| **WIP** (S0; P01.0x minor versions; edits WIP-only) | The sandbox's ambient v0.x working series — head edits happen only here (ADR-0032/0041) |
| **Content Check → Approve for Sharing** | Freeze ("check out") + the org-private internal QA cycle |
| **Shared** (fixed, team-visible) | The QA-accepted frozen version — immutable, org-visible at sandbox scope |
| **Approve for Publication** | Promotion → the P-revision and the client review rounds |
| **Published** (C01) | Acceptance issues the C-revision into the project library (ADR-0041's National Annex lettering) |
| **Archive** — *not a destination:* a continuous journal running alongside the other three | The append-only version history and audit trail. ⚠ **Corrected 2026-08-27:** a superseded or withdrawn document does **not** move here; **record state** carries that instead (`Q-036` closed the same day) |
| **Reject reverts to WIP with a version bump** | A rejecting code returns the pen to the sandbox head; respond → revise → re-promote (ADR-0032) |

**The four axes, and the fifth thing derived from them** *(2026-08-27, the document-status session — the digest is [iso-19650.md](../../reference/iso-19650.md), the rulings are ADR-0013/0003/0041/0045)*. Four separate things were all being called "status", so each now has one word. **CDE state** (the table above) is where a container sits, and is derived — ISO's own point is that the status code tells you the state, *"avoiding physical segregations… using folders"*: state is metadata, not location. **Status code** is what an issue may be used for, adopted whole from the **2021** National Annex — `S0`–`S5`, `A1, An…`, with `S4` authorization by the lead appointed party and `S5` acceptance by the appointing party, the two-gate split that anchors this component's two review scopes. **Revision code** is which issue it is (ADR-0041). **Record state** — `live` · `superseded` · `withdrawn` · `rejected` — is whether it may still be relied on, and is **Infora's own axis**, because ISO never needed one: a human reads the current revision from a register, whereas an un-withdrawn container grounds silently. **Context state** is the derived answer to *may an agent use this*, computed from library membership + record state + the acceptance code's grounding rule, and never set directly.

**Authority over record state follows the publication boundary** (ADR-0013, closing `Q-036`): pre-publication the record is the producing organisation's, so removing a row from its own plan stays its act; once published into the owner's library the record is the owner's, and the producer proposes. **Supersession by a *different* document is a confirmed `supersedes` edge**, not a bare state-set — an edge records both ends — while **withdrawal is a state**, because nothing replaces it and there is no second endpoint to point at.

The component owns one workflow, the review cycle, and no other; how workflows are defined, composed and launched belongs to the Engine (component 6) (ADR-0012). All access is resolved by the access model (component 2) before any data is touched; this component consumes those decisions, including DRR visibility and the edit lock, and never resolves its own permissions.

---

## Sub-component register

The structural breakdown of the document-management component into its build-able parts. Five artefacts divide the labour and this register is one of them: `CONTEXT.md` is the **language** (the glossary); the [overview](../infora-overview.md) is the **vision** and whole-system map; this component doc is the **structure** (the prose above and the register here); `docs/adr/` holds the **decisions** (why each fork went the way it did); and the [grill tracker](../../grill-sessions/grill-questions.md) is the **process log and open-questions backlog**. The register references the others rather than restating them.

The cut is by **domain capability**, the parts as concepts, because that is how the decisions and the glossary are already organised and it stays stable as the interface changes. Surfaces (the things a user touches) are noted under each capability so they are not lost, but they are not the primary axis.

**Cross-cutting, true of every capability below.** All access passes through the access-model component (component 2) before any data is touched; nothing here resolves its own permissions. Every action is written to the audit trail under the governance envelope (component 3). Record configuration versus integrate configuration (ADR-0001) is a per-project setting that affects transmittal and where the published record lives. The Word add-in is a consultant authoring surface, not a reviewer capture path in build 1 (ADR-0004).

---

## 1. Deliverable plan

**Responsibility.** Hold each producing organisation's schedule of deliverable containers (the TIDP — the organisation creates its containers, sets metadata, names its authoring team, proposes reviewers where known) and the owner's consolidation of all plans into the single project schedule (the MIDP view, with access curation and reviewer confirmation); generate each reference from the project's naming rules. Meet Excel both ways — the schema's fillable template export and the create-only batch import (2026-08-09, above); carry the org-standard column configuration; delegate row editing to the lead author (ADR-0033 addendum).
**Governing ADRs.** 0008, 0017, 0033.
**Terms owned.** Deliverable plan, Document reference, Version reference (shared with §2). References Review group and the authoring team, owned by the access model (component 2), both named on the plan.
**Surfaces.** Plan builder (owner); the plan doubles as the live MIDP-style status tracker.
**Depends on.** Access model (who may edit the plan and appoint reviewers and authors); the per-project naming scheme, which is deferred.

## 2. Container and versioning

**Responsibility.** Be the persistent home of one deliverable; hold its immutable versions and their stored renditions (native — docx/xlsx/pptx, generated for authored documents, the file itself for uploaded ones; and the review-and-record PDF); enforce one in-flight controlled revision at a time; carry canonical content by document origin (authored = Infora structured text, uploaded = the native file, ADR-0034).
**Governing ADRs.** 0002, 0004, 0034.
**Terms owned.** Container, Rendition, Formal deliverable, Document origin.
**Surfaces.** Container / document view.
**Depends on.** Deliverable plan (a container is a planned row); data and db packages.

## 3. Promotion and the assurance cycle

**Responsibility.** Cross a version of sandbox work into the controlled zone (promotion — the head snapshot or a QA-accepted frozen version; with the per-sandbox *promotion requires QA acceptance* gate on — the default for project sandboxes — the frozen accepted version is the only legal source, ADR-0032 addendum 2026-08-09); run the version lifecycle through review rounds to a terminal — acceptance, or an explicit audited close-rejected; close rounds by explicit human action; carry a configurable gate sequence and a review period that only guides. Own the sandbox-scope instance: ambient version history, the freeze/check-out, and the org-private internal cycle. *(Built 2026-10-18, T-453.)* The check-out is also the **editing engine's lock**: Infora serves an uploaded Word, Excel or PowerPoint file to a browser editor through its own WOPI host (`apps/api/src/wopi.ts`), re-checking the person's entitlement on every call the engine makes, and each save the engine makes lands as an ambient working revision that keeps its file — the same act as replacing the file by hand (`apps/api/src/file-revision.ts`). *(T-454.)* The surface is the sandbox's **editing pane** (`apps/web/src/screens/editing-pane.tsx`, reached from a file's *Edit in browser*): the engine's page in a frame beside the file's working versions, which refresh so every co-editor sees each save land. The engine is Collabora Online in `docker compose` (profile `editing`) until Microsoft Office for the web swaps in behind the same host.
**Governing ADRs.** 0005, 0008, 0002, 0032, 0040, 0043.
**Terms owned.** Promote, Assurance cycle, Review cycle, Review round, Freeze (check out), Ambient version history.
**Surfaces.** Promotion action; round and status lifecycle view.
**Depends on.** Deliverable plan (container and reviewers already set); the Engine (component 6) — the review cycle is the one workflow owned here, per ADR-0012.

## 4. PDF review and annotation

**Responsibility.** Render the PDF rendition in a native viewer; capture comments by text highlight or dropped point; store each comment's anchor as structured fields, never a sidecar.
**Governing ADRs.** 0004, 0006.
**Terms owned.** Anchor.
**Surfaces.** The PDF review web interface.
**Depends on.** The DRR (comments are DRR records); XFDF only ever as an edge import/export format, not a store.

## 5. The DRR

**Responsibility.** Hold one live, append-only review record per cycle (per deliverable at project scope) spanning every version it reviews: comments, authoring-side responses, acceptance codes; freeze an internal snapshot at each transmittal in either direction; never materialise an issued notice; keep a sandbox-scope cycle's record org-private, permanently.
**Governing ADRs.** 0003, 0006, 0009, 0014, 0032.
**Terms owned.** Deliverable Review Record (DRR), Comment, Response, Suggestion, Signal.
**Surfaces.** The DRR table interface, with hover-to-anchor and click-through response links.
**Depends on.** PDF review (anchors), acceptance and coding (§6), the access model (DRR visibility and the edit lock, ADR-0014).

## 6. Acceptance and coding

**Responsibility.** Carry acceptance codes at two levels, per comment and per deliverable, on a per-project configurable scheme (copied from Infora's default at project creation; used codes retire, never redefine); make the lead reviewer authoritative; support reviewer approval of responses; close the work item on the cycle's terminal — acceptance, or the explicit audited close-rejected (ADR-0032).
**Governing ADRs.** 0003, 0005, 0032.
**Terms owned.** Acceptance code, Work item. References Reviewer and Lead reviewer, owned by the access model (component 2).
**Surfaces.** Coding controls within the DRR; the deliverable-code action; acceptance closes the work item.
**Depends on.** The DRR. Sign-off needs no separate mechanism: acceptance is the sign-off, audited; consultant authorship lives on the document's own cover sheet (ADR-0013).

## 7. Transmittal

**Responsibility.** Record the audited issue-event in two kinds (ADR-0035). Review kind: a deliverable version issued for review (sender, recipients, version, purpose code, dates), driving the DRR access-phase change and notifications. Non-review kind: a promoted library deliverable issued to organisations outside any cycle (the owner's cross-organisation share as a first-class event), carrying no round, edit lock or snapshot; the acknowledgement gate and intra-organisation narrowing it opens are resolved by the access model (component 2, §3). In integrate configuration drive a physical handover to the incumbent (deferred, via a connector — component 7).
**Governing ADRs.** 0010, 0007, 0001, 0014, 0035.
**Terms owned.** Transmittal (review and non-review kinds).
**Surfaces.** Transmittal action and event record.
**Depends on.** Access model (DRR access phasing for the review kind; the deliverable-visibility gate for the non-review kind); record configuration. Integrate handover deferred until a target system is known.

## 8. Project library

**Responsibility.** Hold the curated, owner-controlled corpus of trusted project knowledge, and be the project-side corpus the AI grounds on for chat and drafting; auto-admit accepted deliverables; let the owner add other material and segment parts for IP or ethical-wall reasons.
**Governing ADRs.** 0011, 0013.
**Terms owned.** Project library (relates to Knowledge in the context component); Project ontology, Classification, Relationship edge (ADR-0045).
**Surfaces.** Library view and owner curation.
**Depends on.** Acceptance (auto-admission), records lifecycle (§9 removes superseded and withdrawn from grounding), the knowledge package, the access model (per-deliverable visibility).

## 9. Records lifecycle

**Responsibility.** Express a document's currency through state rather than deletion: supersede (automatic when a newer version is promoted, or owner-set), withdraw (owner-set), and rejected (set when a cycle is closed-rejected, ADR-0032); retention. Nothing is deleted.
**Governing ADRs.** 0013, 0002, 0032.
**Terms owned.** Supersede, Withdraw, Rejected (state).
**Surfaces.** Owner state actions on a document.
**Depends on.** Project library (library membership and groundability are distinct: superseded and withdrawn documents stay in the library but leave the grounded corpus); governance envelope (audit and retention).

---

## Deferred or handed to other components

- **Per-project reference schema.** The component holds whatever *naming* scheme a project defines; no fixed naming scheme is designed (ADR-0008). The per-project metadata *schema* half of this deferral is now closed — it is the classification vocabulary (ADR-0045). A dedicated graph-explorer / ontology-management UI is deferred to a later slice; build-1 is agent-facing with a thin confirmation surface.
- **Integrate-configuration physical handover.** Format and mechanics depend on the target system, and the handover runs through a connector (component 7) (ADR-0010, 0001).
- **General workflows and the document-or-query-to-workflow bridge.** Owned by the Engine (component 6); the review cycle is the only workflow here (ADR-0012).
- **Work-in-progress storage (native Infora sandbox versus SharePoint mirror).** An adoption choice, not a knowledge decision, because the AI never grounds on the sandbox (ADR-0011).
- **Spatial, CAD and BIM beyond a PDF view.** Owned by the connectors component (component 7).

## Repository mapping

These capabilities land mainly in the `data`, `knowledge`, `workflows` (review cycle) and `governance` packages, with surfaces in `web` (PDF review, DRR table, plan for the consultant; plan and library curation, portfolio for the owner — one app, role-scoped views, T-110 2026-07-14) and `word-addin` (consultant authoring). See the build layer's repo-structure.
