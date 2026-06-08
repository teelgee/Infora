# Document management — sub-component register

The structural breakdown of the document management component into its build-able parts. This file is the **structure**; it sits alongside two siblings with different jobs: `CONTEXT.md` is the **language** (the glossary), and `docs/adr/` holds the **decisions** (why each fork went the way it did). This register references both rather than restating them.

The cut is by **domain capability**, the parts as concepts, because that is how the decisions and the glossary are already organised and it stays stable as the interface changes. Surfaces (the things a user touches) are noted under each capability so they are not lost, but they are not the primary axis.

**Cross-cutting, true of every capability below.** All access passes through the access-model component (component 1) before any data is touched; nothing here resolves its own permissions. Every action is written to the audit trail under the governance envelope (component 7). Record configuration versus integrate configuration (ADR-0001) is a per-project setting that affects transmittal and where the published record lives. The Word add-in is a consultant authoring surface, not a reviewer capture path in build 1 (ADR-0004).

---

## 1. Deliverable plan

**Responsibility.** Hold the project's schedule of deliverable containers; generate each reference from the project's naming rules; appoint the review group per deliverable, at planning time.
**Governing ADRs.** 0008.
**Terms owned.** Deliverable plan, Document reference, Version reference (shared with §2), Review group.
**Surfaces.** Plan builder (owner); the plan doubles as the live MIDP-style status tracker.
**Depends on.** Access model (who may edit the plan and appoint reviewers); the per-project naming scheme, which is deferred.

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
**Depends on.** Deliverable plan (container and reviewers already set); the workflows component (the review cycle is the one workflow owned here, per ADR-0012).

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
**Depends on.** PDF review (anchors), acceptance and coding (§6), access phasing (§7 and the access model).

## 6. Acceptance and coding

**Responsibility.** Carry acceptance codes at two levels, per comment and per deliverable, on a per-project configurable scheme; make the lead reviewer authoritative; support reviewer approval of responses; close the work item on client acceptance of a version.
**Governing ADRs.** 0003, 0005.
**Terms owned.** Acceptance code, Reviewer, Lead reviewer, Work item.
**Surfaces.** Coding controls within the DRR; the deliverable-code action; acceptance closes the work item.
**Depends on.** The DRR. Sign-off needs no separate mechanism: acceptance is the sign-off, audited; consultant authorship lives on the document's own cover sheet (ADR-0013).

## 7. Transmittal

**Responsibility.** Record the event of a deliverable version being issued for review (sender, recipients, version, purpose code, dates); drive the DRR access-phase change and notifications; in integrate configuration drive a physical handover to the incumbent (deferred).
**Governing ADRs.** 0010, 0007, 0001, 0014.
**Terms owned.** Transmittal.
**Surfaces.** Transmittal action and event record.
**Depends on.** Access model (DRR access phasing); record configuration. Integrate handover deferred until a target system is known.

## 8. Project library

**Responsibility.** Hold the curated, owner-controlled corpus of trusted project knowledge, and be the only corpus the AI grounds on for chat and drafting; auto-admit accepted deliverables; let the owner add other material and segment parts for IP or ethical-wall reasons.
**Governing ADRs.** 0011, 0013.
**Terms owned.** Project library (relates to Knowledge in the context component).
**Surfaces.** Library view and owner curation.
**Depends on.** Acceptance (auto-admission), records lifecycle (§9 removes superseded and withdrawn from grounding), the knowledge package, the access model (segmentation).

## 9. Records lifecycle

**Responsibility.** Express a document's currency through state rather than deletion: supersede (automatic when a newer version is promoted, or owner-set) and withdraw (owner-set); retention. Nothing is deleted.
**Governing ADRs.** 0013, 0002.
**Terms owned.** Supersede, Withdraw.
**Surfaces.** Owner state actions on a document.
**Depends on.** Project library (library membership and groundability are distinct: superseded and withdrawn documents stay in the library but leave the grounded corpus); governance envelope (audit and retention).

---

## Deferred or handed to other components

- **Per-project reference schema.** The component holds whatever scheme a project defines; no fixed schema is designed (ADR-0008).
- **Integrate-configuration physical handover.** Format and mechanics depend on the target system (ADR-0010, 0001).
- **General workflows and the document-or-query-to-workflow bridge.** Owned by the workflows component; the review cycle is the only workflow here (ADR-0012).
- **Work-in-progress storage (native Infora sandbox versus SharePoint mirror).** An adoption choice, not a knowledge decision, because the AI never grounds on the sandbox (ADR-0011).
- **Who on the consultant side may respond, and whether responder is a named role.** An access-model question (component 1).
- **Spatial, CAD and BIM beyond a PDF view.** Owned by the spatial connectors component (component 8).

## Repository mapping

These capabilities land mainly in the `data`, `knowledge`, `workflows` (review cycle) and `governance` packages, with surfaces in `web-consultant` (PDF review, DRR table, plan), `web-owner` (plan and library curation, portfolio) and `word-addin` (consultant authoring). See the architecture doc's monorepo layout.
