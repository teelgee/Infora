# Document management (component 5)

The engine room of Infora's wedge: the controlled-document lifecycle that makes the AI trustworthy. The component stores, versions, reviews, approves and publishes a project's written deliverables, and holds the project library the AI grounds on. The unglamorous CDE basics live here on purpose, because they are what let the rest of the platform be trusted.

The component separates the working copy from the controlled record. Teams draft freely in the sandbox; promotion snapshots the sandbox head into an immutable controlled revision, with only one revision in flight per deliverable at a time, and the sandbox head stays live as the draft of the next version (ADR-0002). Each deliverable lives in a container: a persistent home identified by a document reference that never changes across versions, holding the version history and both renditions, the native source the client owns and the PDF that is the authoritative review-and-record rendition (ADR-0004).

Every deliverable to be produced is planned up front. The deliverable plan is a schedule of empty containers created at planning time, each carrying its coded reference, its named review group and authoring team, its planned metadata, and a status (ADR-0008). Promotion is then a near-empty hand-off into a waiting container, not a metadata gate: metadata and naming come from the plan. The plan and the live status tracker are the same object, giving the owner an MIDP-style view of every deliverable that should exist and its real state.

Review happens on the PDF, not in the native file. Reviewers comment by highlighting text or dropping a point; each comment's anchor is stored as structured fields on the review record, bound to the immutable version, never in a sidecar file that could orphan or silently lose markup (ADR-0004, ADR-0006). Because the version is frozen, anchors never drift. All review lives in one live, append-only Deliverable Review Record per deliverable, spanning every version: comments, consultant responses, and acceptance codes, with no separate review notice ever issued (ADR-0009). Acceptance codes sit at two levels, per comment and per deliverable, on a per-project configurable scheme, with the lead reviewer authoritative (ADR-0003). The assurance cycle runs each version through review rounds to acceptance; a round closes only by explicit human action, never by the clock, and the review period only guides (ADR-0005).

Transmittal is the event that issues a version for review and returns it. On platform it moves no file: it records the audit facts (sender, recipients, version, purpose code, dates), flips the DRR edit lock, freezes an internal snapshot as the formal record, reveals the closed round to the consultant, and notifies recipients (ADR-0009, ADR-0010, ADR-0014). The component runs in one of two record configurations per project: record, where Infora holds the controlled record end to end, and integrate, where Infora owns sandbox, review and assurance, then transmits the approved deliverable to an incumbent system (via a connector, component 7). The two share one pipeline up to transmittal and diverge only in post-publication custody (ADR-0001).

The project library is the curated, owner-controlled corpus and the only project-side corpus the AI grounds on, for both chat and drafting (ADR-0011, refined by ADR-0021). Accepted deliverables enter automatically; the owner may add other reference material. It is a collection of coded deliverables, presented flat or foldered per project configuration (refined 2026-07-06) — folders organise the view but are never access objects. A document's currency is expressed by state, not deletion: superseded and withdrawn documents stay in the library and remain auditable, but leave the grounded corpus (ADR-0013).

The component owns one workflow, the review cycle, and no other; how workflows are defined, composed and launched belongs to the Engine (component 6) (ADR-0012). All access is resolved by the access model (component 2) before any data is touched; this component consumes those decisions, including DRR visibility and the edit lock, and never resolves its own permissions.

---

## Sub-component register

The structural breakdown of the document-management component into its build-able parts. Five artefacts divide the labour and this register is one of them: `CONTEXT.md` is the **language** (the glossary); the [overview](infora-overview.md) is the **vision** and whole-system map; this component doc is the **structure** (the prose above and the register here); `docs/adr/` holds the **decisions** (why each fork went the way it did); and the [grill tracker](../grill-sessions/grill-questions.md) is the **process log and open-questions backlog**. The register references the others rather than restating them.

The cut is by **domain capability**, the parts as concepts, because that is how the decisions and the glossary are already organised and it stays stable as the interface changes. Surfaces (the things a user touches) are noted under each capability so they are not lost, but they are not the primary axis.

**Cross-cutting, true of every capability below.** All access passes through the access-model component (component 2) before any data is touched; nothing here resolves its own permissions. Every action is written to the audit trail under the governance envelope (component 3). Record configuration versus integrate configuration (ADR-0001) is a per-project setting that affects transmittal and where the published record lives. The Word add-in is a consultant authoring surface, not a reviewer capture path in build 1 (ADR-0004).

---

## 1. Deliverable plan

**Responsibility.** Hold the project's schedule of deliverable containers; generate each reference from the project's naming rules; appoint the review group and authoring team per deliverable, at planning time, both amendable thereafter.
**Governing ADRs.** 0008, 0017.
**Terms owned.** Deliverable plan, Document reference, Version reference (shared with §2). References Review group and the authoring team, owned by the access model (component 2), both named on the plan.
**Surfaces.** Plan builder (owner); the plan doubles as the live MIDP-style status tracker.
**Depends on.** Access model (who may edit the plan and appoint reviewers and authors); the per-project naming scheme, which is deferred.

## 2. Container and versioning

**Responsibility.** Be the persistent home of one deliverable; hold its immutable versions and both renditions (native source and PDF); enforce one in-flight controlled revision at a time.
**Governing ADRs.** 0002, 0004.
**Terms owned.** Container, Rendition, Formal deliverable.
**Surfaces.** Container / document view.
**Depends on.** Deliverable plan (a container is a planned row); data and db packages.

## 3. Promotion and the assurance cycle

**Responsibility.** Cross a sandbox working copy into the controlled zone (promotion); run the version lifecycle through review rounds to acceptance; close rounds by explicit human action; carry a configurable gate sequence and a review period that only guides.
**Governing ADRs.** 0005, 0008, 0002.
**Terms owned.** Promote, Assurance cycle, Review round.
**Surfaces.** Promotion action; round and status lifecycle view.
**Depends on.** Deliverable plan (container and reviewers already set); the Engine (component 6) — the review cycle is the one workflow owned here, per ADR-0012.

## 4. PDF review and annotation

**Responsibility.** Render the PDF rendition in a native viewer; capture comments by text highlight or dropped point; store each comment's anchor as structured fields, never a sidecar.
**Governing ADRs.** 0004, 0006.
**Terms owned.** Anchor.
**Surfaces.** The PDF review web interface.
**Depends on.** The DRR (comments are DRR records); XFDF only ever as an edge import/export format, not a store.

## 5. The DRR

**Responsibility.** Hold one live, append-only review record per deliverable spanning every version: comments, consultant responses, acceptance codes; freeze an internal snapshot at each transmittal in either direction; never materialise an issued notice.
**Governing ADRs.** 0003, 0006, 0009, 0014.
**Terms owned.** Deliverable Review Record (DRR), Comment, Suggestion, Signal.
**Surfaces.** The DRR table interface, with hover-to-anchor and click-through response links.
**Depends on.** PDF review (anchors), acceptance and coding (§6), the access model (DRR visibility and the edit lock, ADR-0014).

## 6. Acceptance and coding

**Responsibility.** Carry acceptance codes at two levels, per comment and per deliverable, on a per-project configurable scheme; make the lead reviewer authoritative; support reviewer approval of responses; close the work item on client acceptance of a version.
**Governing ADRs.** 0003, 0005.
**Terms owned.** Acceptance code, Work item. References Reviewer and Lead reviewer, owned by the access model (component 2).
**Surfaces.** Coding controls within the DRR; the deliverable-code action; acceptance closes the work item.
**Depends on.** The DRR. Sign-off needs no separate mechanism: acceptance is the sign-off, audited; consultant authorship lives on the document's own cover sheet (ADR-0013).

## 7. Transmittal

**Responsibility.** Record the event of a deliverable version being issued for review (sender, recipients, version, purpose code, dates); drive the DRR access-phase change and notifications; in integrate configuration drive a physical handover to the incumbent (deferred, via a connector — component 7).
**Governing ADRs.** 0010, 0007, 0001, 0014.
**Terms owned.** Transmittal.
**Surfaces.** Transmittal action and event record.
**Depends on.** Access model (DRR access phasing); record configuration. Integrate handover deferred until a target system is known.

## 8. Project library

**Responsibility.** Hold the curated, owner-controlled corpus of trusted project knowledge, and be the project-side corpus the AI grounds on for chat and drafting; auto-admit accepted deliverables; let the owner add other material and segment parts for IP or ethical-wall reasons.
**Governing ADRs.** 0011, 0013.
**Terms owned.** Project library (relates to Knowledge in the context component).
**Surfaces.** Library view and owner curation.
**Depends on.** Acceptance (auto-admission), records lifecycle (§9 removes superseded and withdrawn from grounding), the knowledge package, the access model (per-deliverable visibility).

## 9. Records lifecycle

**Responsibility.** Express a document's currency through state rather than deletion: supersede (automatic when a newer version is promoted, or owner-set) and withdraw (owner-set); retention. Nothing is deleted.
**Governing ADRs.** 0013, 0002.
**Terms owned.** Supersede, Withdraw.
**Surfaces.** Owner state actions on a document.
**Depends on.** Project library (library membership and groundability are distinct: superseded and withdrawn documents stay in the library but leave the grounded corpus); governance envelope (audit and retention).

---

## Deferred or handed to other components

- **Per-project reference schema.** The component holds whatever scheme a project defines; no fixed schema is designed (ADR-0008).
- **Integrate-configuration physical handover.** Format and mechanics depend on the target system, and the handover runs through a connector (component 7) (ADR-0010, 0001).
- **General workflows and the document-or-query-to-workflow bridge.** Owned by the Engine (component 6); the review cycle is the only workflow here (ADR-0012).
- **Work-in-progress storage (native Infora sandbox versus SharePoint mirror).** An adoption choice, not a knowledge decision, because the AI never grounds on the sandbox (ADR-0011).
- **Spatial, CAD and BIM beyond a PDF view.** Owned by the connectors component (component 7).

## Repository mapping

These capabilities land mainly in the `data`, `knowledge`, `workflows` (review cycle) and `governance` packages, with surfaces in `web-consultant` (PDF review, DRR table, plan), `web-owner` (plan and library curation, portfolio) and `word-addin` (consultant authoring). See the build layer's repo-structure.
