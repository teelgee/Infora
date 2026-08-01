# Infora — the open-questions index

The whole-system grill tracker and the **sole source for open questions** across
every component. Grilling walks the design tree one branch at a time (see the
`grill-with-docs` method), turning open questions into decisions captured as
ADRs. The agent running a session **edits this file afterwards**: ticking off
what it answered and re-prioritising what is left.

**This file is an index, not a store.** The *agreed position* for each decision
lives in its component doc or its ADR; the *record of how it got there* — every
completed session, every closed ruling, the Path-to-MVP analysis — lives in
**[grill-history.md](grill-history.md)**. Split 2026-07-31, mirroring the build
board's own `plan.md` / `plan-history.md` convention, because this file had
become 350 lines of mostly-settled material and the open backlog was no longer
readable inside it.

> **Standing convention: when a question is ruled, its record moves to
> [grill-history.md](grill-history.md) in the same commit**, leaving a one-line
> pointer here. A ruling written out in full in this file is a bug.

The five artefacts divide the labour: `CONTEXT.md` is the **language**, the
[overview](../architecture/infora-overview.md) is the **vision**, the component
docs are the **structure**, `docs/adr/` holds the **decisions** — and this doc
is the **process log**.

## How to read an entry

`Q-###` — title. **Next free number: Q-030.** Each entry carries:

- **Method tag** — the triage that decides *how* it gets answered, not just when:
  - **[A] reference-decidable** — a precedent exists (Legora and adjacent
    products). Decide in fast-mode, Claude-drafts-you-intervene. Do **not** grill.
  - **[B] must-still-grill** — a genuine Infora-specific fork with no precedent,
    which is where Infora diverges from single-firm Legora. Keep the slow
    adversarial method. These are the moat.
  - **[C] not a grill** — a build doc or a decision session.
- **Blocks** — what cannot proceed until it is answered. Empty means nothing is
  waiting, which is a legitimate and common state.

The current destination is **[v1.md](../build/v1.md)** (the first pilot); the
board is **[plan.md](../build/plan.md)**.

---

## At a glance

| # | Session | ADRs produced | Status |
|---|---------|---------------|--------|
| 1 | Grounded corpus vs working input (ground-vs-inform) | 0011 (refined), **0021** | ✅ Done |
| 2 | Org / project context split (+ programme) | **0020** | ✅ Done |
| 3 | Org context confidentiality & portability across clients | **0025**, **0026** | ✅ Done |
| 4 | Knowledge distillation, provenance & staleness | — | ⬜ Not started |
| 5 | Precedent selection & application | — | ⬜ Not started |
| 6 | Retrieval, ranking, merging & store choice | **0022**, **0024** | 🟡 Partial |
| 7 | Signal capture into Knowledge (the moat loop) | — | ⬜ Not started |
| — | *Offshoot:* Authority register placement | **0023** | ✅ Done (unplanned) |
| **M1** | Orchestration / run / agent model | **0028** | ✅ Done |
| **M2** | Thinking vs doing — finish | **0027** (accepted) | ✅ Done |
| **M3** | Context-assembly API + v1 channel merge | **0029** | ✅ Done |
| **A** | Slice A — the review drawer / document management (2026-07-18) | **0032**, **0033**, **0034** | ✅ Designed **and built** same day |
| **B** | Producing-side deliverable lifecycle (2026-07-22) | **0036**, **0038**, **0039** | ✅ Done — design only |
| **O** | Document ontology (2026-07-26) | **0045** | ✅ Designed + **Slice O P1 built** |
| **Ask** | Agent-harness gate questions (2026-07-29) | **0046**; 0022/0023/0026/0027/0028 amended | ✅ Ruled — four of six on the spot |
| **I** | **Infra / security decision session (2026-08-01)** — a decision session, not a grill | **0047**; **0037 amended** (a third `pilot` tier) | ✅ Ruled — `Q-027` closed, nfr.md re-cut |
| **2** | **The checker (2026-08-01)** — `Q-007` + `Q-008`, ruled together | **0048** | ✅ Ruled — T-308/T-310/T-311 unblocked |
| **3** | **Notifications + the promotion gate (2026-08-01)** — `Q-012` and its rider | **0049** | ✅ Ruled — T-329–T-332 minted |

Full session records in [grill-history.md](grill-history.md).

**Where the method stands.** Sessions 1–3 (the confidentiality spine) and M1–M3
are done, and the walking skeleton they gated is built. What remains splits
cleanly: **Sessions 4, 5 and 7 are the moat** — all bucket (B), no precedent,
deliberately deferred until the product runs — and everything else is either
reference-decidable or a decision session. The heavy grilling powder is reserved
for the moat.

---

## Backlog by component (all eight)

The orientation map: what remains open per component, and where it is detailed
below. A **locked** component carries no open questions — its agreed position
lives in its component doc.

1. **Foundation.** 🔒 Locked (ADRs 0024, 0037, **0047**). [component-1-foundation.md](../architecture/component-1-foundation.md). The infra/security decision session ran **2026-08-01** and closed everything this component carried: cloud provider (AWS London), file/blob storage (S3 behind `file_ref`), hosting, deployment, key management, tenant isolation (logical), residency and production identity (Entra deferred behind password auth, with a named expiry). No open questions remain — what is left is **build**, as Slice V1-I on the board. *(Record in [grill-history.md](grill-history.md).)*
2. **Access.** 🔒 Locked (ADRs 0014–0019, refined by **0033**). [component-2-access.md](../architecture/component-2-access.md). Residual: **Q-024**. *(The admin/super-user tier was ruled 2026-07-31 — `Participant.elevated` extended, not a new tier; record in [grill-history.md](grill-history.md).)*
3. **Governance.** 🟡 In progress. [component-3-governance.md](../architecture/component-3-governance.md). Settled: the rails authority model → **ADR-0030**. Open (tuning, not authority): grounding-threshold tuning and withheld-output handling; audit retention and export format; deploy-time validation of a tightening; residency and sovereignty routing. See **Q-001**, **Q-015**.
4. **Context.** 🟡 In progress (ADRs 0020–0026). [component-4-context.md](../architecture/component-4-context.md). Open: library RAG strategy (Session 6 finish, incl. **Q-028**), knowledge distillation (Session 4), precedent selection (Session 5), the Signal sink (Session 7), and the authority register's operational detail (revised ADR-0023). See also **Q-002**, **Q-003**. *(**Q-007** closed 2026-08-01 → **ADR-0048**: a firm's rulebook is guiding material, quotable but never cited; the org-tier authority shelf stays deferred.)*
5. **Document management.** 🔒 Locked (ADRs 0001–0013, generalised by **0032/0033/0034**; ontology → **0045**). [component-5-document-management.md](../architecture/component-5-document-management.md). Residuals: **Q-025**, **Q-026**.
6. **Engine.** 🟡 In progress. [component-6-engine.md](../architecture/component-6-engine.md). Open: the workflow set (**Q-006**), how a workflow is defined, where human-in-the-loop checkpoints sit, how a workflow drives a work item's status; for custom workflows — **Q-014**. *(Compliance-checking closed 2026-08-01 → **ADR-0048**: findings not prose, checking not generative.)*
7. **Connectors.** ⬜ Deferred. [component-7-connectors.md](../architecture/component-7-connectors.md). Open: the integrate-config handover to an incumbent DMS; for spatial — which products first, read-only reference vs deeper integration; timing relative to the wedge. Deferred until the wedge is proven.
8. **Surfaces.** 🟡 In progress. [component-8-surfaces.md](../architecture/component-8-surfaces.md). Settled: the Copilot integration → **ADR-0031**. Open: workspace home vs project home layout; the owner portfolio view; mobile scope; the boundary between the document-management interface and the generic project surfaces. See **Q-016**, **Q-018**. *(**Q-012** closed 2026-08-01 → **ADR-0049**.)*

### Pre-infra-session rulings (owner, 2026-07-25) — all now discharged

Ruled ahead of the infra/security session and carried into it as pre-reads:
**CSRF posture** → ADR-0043/0044 (T-218), the token upgrade named as an
infra-session item; the **DB-level wall backstop** → Postgres RLS committed and
now partly built (T-247 landed `version_chunks`, the grounding index;
`containers` remains, T-297); **certification targets** named — ISO 27001, Cyber
Essentials Plus, SOC 2 Type II, none a pilot precondition but each constraining
provider choice. The fourth, **Q-027**, was **closed by the session on
2026-08-01**; record in [grill-history.md](grill-history.md).

---

## Open questions

### Foundational and cross-component

- **Q-001 — Audit-of-every-action as a foundational invariant.** **[B]** · *Blocks: nothing; wanted before further audit-adjacent build.* Discharged for the agent-execution sense by ADR-0028 (append-only, immutable Run/Step). Still open for the **user-UI-action** and **system-action** senses owned by component 3. Interacts with **Q-015**.
- **Q-002 — The per-document guidance artefact.** **[B]** · *Blocks: Slice E.* The *guidance note*: signal-derived, steers but never grounds, lives beside the immutable revision (ADR-0002), visibility follows document access. Needs an ADR, and carries **Q-003**.
- **Q-003 — Signal-derived guidance crossing organisations.** **[B]** · *Blocks: Q-002.* A guidance note's visibility follows document access, so once the owner shares a deliverable the note — generated from one organisation's edits and agent interactions — becomes visible to another organisation. A deliberate scope choice, not the org-private informing rule (ADR-0020); the residual is whether signal-derived steer carrying one organisation's private approach should be scrubbed or re-scoped first. Settle with **Q-002**.

### The Ask harness and Lens

- **Q-004 — Lens versus organisation house style.** **[B]** · *Blocks: nothing; belongs with Slice E.* A firm's tone of voice is org context (ADR-0020, informing channel). Does an org override a Lens, compose with it, or is house style a fifth composition layer? Interacts with the ADR-0026 destination rule. Related: **Q-023**.
- **Q-005 — Who owns a Lens file.** **[A]** · *Blocks: nothing.* Infora-wide domain content today. A customer wanting its own Lens crosses into org context and the Slice F builder.
- **Q-006 — The declared-workflow set, beyond the pilot.** **[A/B]** · *Blocks: post-V1 Engine work.* The board ships the existing four-step chain as a DAG, and [v1.md](../build/v1.md) fixes the V1 set at **three** (that chain, document creation, the checker). Which workflows ship *beyond* the pilot is still open, and the choice of *which* is the product. Same item as the Engine's "MVP workflow set".

### V1 — the first pilot *(raised 2026-07-31, [v1.md](../build/v1.md))*

~~`Q-007` and `Q-008` gate the Phase C checker (T-308, T-310, T-311).~~ ✅ **Both
ruled 2026-08-01 → [ADR-0048](../adr/0048-the-checker-findings-not-prose.md)**,
together, because they proved to be one decision seen twice. **T-308, T-310 and
T-311 unblock**, and the finding schema is minted ahead of them as T-328. Two
further V1 questions — how a legacy corpus enters the controlled record, and the
elevated tier — were ruled 2026-07-31; records in
[grill-history.md](grill-history.md). **`Q-029` joined them on 2026-08-01**,
raised by the seed set rather than by a design pass: it is the one question in
this group that a ticket found by trying to build the thing.

- ~~**Q-007 — The rulebook's channel.**~~ ✅ **Ruled 2026-08-01** → [ADR-0048](../adr/0048-the-checker-findings-not-prose.md): the rulebook guides in its entirety, and a finding may quote it **verbatim without citing it**. Record in [grill-history.md](grill-history.md).
- **Q-029 — What an unentitled user is told, and whether it can be anything.** **[B]** · *Blocks: PERM-01's second half; the honesty half of every refusal a user meets.* Raised 2026-08-01 while authoring the eval seed set (T-259). The seed table specifies PERM-01 as *"a user with no Participant gets nothing, **and is told the question cannot be answered from what they can reach**"* — and the second half **cannot be built as written**. Denial and nonexistence read identically (contracts principle 4), so an unentitled requester gets `404`, and telling them "this cannot be answered from what you can reach" distinguishes a project they cannot reach from one that does not exist. That is the leak principle 4 exists to close, and it is not a small one on a platform whose product is a wall between competing consultancies: "which schemes does this firm work on" is commercially valuable and is exactly what the message would leak. **The fork is real in both directions.** A user who asks a reasonable question and gets a bare "not found" experiences a broken system, and the refusal-must-be-actionable principle applies everywhere else in the build (T-249's label refusal names both labels; T-246's grant refusal names the exclusion). **Candidate shapes to weigh:** (a) accept the bare refusal and carry the explanation in the *surface's* empty state, which knows only that this user has no projects and leaks nothing; (b) distinguish "you are a Participant of nothing at all" — which is an account fact the user already knows — from "you cannot reach *this* project", which is not; (c) an owner-configurable disclosure, which is how the underlying question is really "whose secret is it". **Stress test:** if (b) is admitted, a user removed from one project of several still learns the difference between the two cases the moment they compare, so the boundary is between *account-level* and *project-level* facts and not between phrasings. *(PERM-01 ships today asserting the refusal itself, which is the half that is buildable; the case file records why the other half is absent rather than dropping it silently.)*

- ~~**Q-008 — The checker's output shape.**~~ ✅ **Ruled 2026-08-01** → [ADR-0048](../adr/0048-the-checker-findings-not-prose.md): **checking, not generative** — structured anchored findings, with an optional fix that rides the existing Suggestion mechanism and is never auto-applied. Record in [grill-history.md](grill-history.md).

### Retrieval

- **Q-028 — Who selects the retrieval scope.** **[B]** · *Blocks: wiring T-242; belongs to Session 6.* Slice O P1 built the ontology's semantic pre-filter but **nothing populates it**: `AssemblyRequest.request` is `{ text, mode }`, so `classificationTermIds` is structurally unreachable from the agent path and every run scans the whole library. ADR-0045 settles how the agent classifies *documents*; it does not settle how a *question* becomes a scope. **Recommendation:** the scope filter is a declared, auditable part of the plan artefact — selected pre-retrieval, recorded on the run, visible to the user — never an implicit narrowing inside the retrieve leaf. **Stress test:** a wrongly-scoped question grounds a confident, fully-cited answer on a partial library; every citation resolves, so neither ground-check nor the user can see what was excluded. What makes a wrong scope *visible*, and is the fallback widen-and-retry or refuse? Until answered, leaving the lever unwired is the safe state, not a bug. *(Measured 2026-07-31: scoping one term cut a 20k-chunk project query from ~133 ms to ~6 ms — the stakes are real on both sides.)*

### Surfaces and workflow

- **Q-009 — Starting governed work from the web UI.** **[A]** · *Blocks: a fully browser-drivable consultant journey.* No surface affordance binds a Conversation to a Work item; Ask's output-target chip targets sandbox documents only, so every UI-originated run is ad-hoc. The fork: a "draft" action on the work item vs a work-item chip on Ask. *(T-080, 2026-07-08.)*
- ~~**Q-012 — Mention delivery, and the missing notification model.**~~ ✅ **Ruled 2026-08-01** → [ADR-0049](../adr/0049-notifications-and-the-promotion-gate.md): a persisted notification record whose visibility follows its subject, email carrying a pointer but never content, the pilot set fixed at **round-issued + @-mention**, and promotion **blocked** by open threads or findings with an audited `elevated` override. Record in [grill-history.md](grill-history.md).
- **Q-016 — Workspace-scoped surfaces as a slice.** **[A]** · *Blocks: nothing.* Workspace Ask (org knowledge, no project context — the ADR-0031 §3 deferral), workspace Editor, and a "Your knowledge" page. All depend on the org-context store design, so a Slice E adjacency; candidate for a coherent workspace slice.
- **Q-017 — The personal sandbox.** **[A]** · *Blocks: nothing.* A foldered, user-private drive, never visible as a context channel. Extends ADR-0018/0019 with a *user*-scoped sandbox; its own drawer when sliced.
- **Q-018 — The work-item page: audit read vs review cycle.** **[A]** · *Blocks: nothing.* The page's affirmative content is fully specified (the ADR-0032 addendum's event-driven lifecycle and per-role click-throughs). What remains is only where the **run-audit trail** relocates to — a tab, a linked view, or the owner portfolio. Decide with **Q-015**.
- **Q-019 — The sandbox drawer, and the personal→project push.** **[A/B]** · *Blocks: nothing.* SharePoint-shaped folder capability is largely built (Slice A2.4). What is unruled is the **cross-scope move**: pushing a personal-sandbox document into the project's own-org sandbox — one-way push? copy or move? does anything come back? No ADR covers it. *(Owner's access-model sketch, 2026-07-14, drawn red in [access-model.tldr](../architecture/diagrams/access-model.tldr).)*
- **Q-020 — Sandbox content in chat context.** **[B]** · *Blocks: T-100's placeholder chip.* ADR-0011 rules the AI never *grounds* on sandbox content. The fork is whether sandbox material may enter chat context **at all** — as a labelled, uncitable channel like open-world? as find-my-file navigation only? — and how that squares with the sandbox being the uncontrolled working area.
- **Q-021 — A user-facing model picker.** **[A]** · *Blocks: T-100's placeholder chip.* Model-agnosticism is already guaranteed at the seams (Router, per-index pinned embeddings, model id audited per step). A *user-facing* picker is per-request routing policy — ADR-0028 §9's stubbed multi-model routing — to design when a second adapter lands. Related: T-284.
- **Q-023 — Predetermined response styles.** **[A]** · *Blocks: T-107's placeholder chip.* A Style chip drawing on styles set by the project or organisation. To settle: what a style *is*, who defines and edits one, where styles live (the org-context store is the natural adjacency), how it enters the chain (steer into the draft leaf — thinking, never doing, ADR-0027), and whether it applies per-turn or per-conversation. Closely related to **Q-004**.

### The record

- **Q-015 — The audit record: retention, cancellation, and granularity.** **[B]** · *Blocks: Q-001, Q-018.* Substantially ruled 2026-07-12 (T-104): the record is retained background data anchored to the work, producing-organisation-private, never a review surface — the consultant carries the professional liability. **Still open:** retention and expiry (may unaccepted refine-chain suggestions or old chat runs ever be deleted?), the cancellation state (**Q-010**), whether ad-hoc chat deserves a lighter record than governed work, and whether provenance ever re-surfaces document-anchored on an insurer or regulator demand.
- **Q-010 — Cancelling a run server-side.** **[A]** · *Blocks: nothing; decide with streaming.* T-097's cancel aborts the client's wait; the run completes and stands in the record. A real Stop needs a Run state-machine ruling — a `cancelled` terminal state vs `failed` with a cancellation rail outcome — and an abort path through the chain. Streaming changes the same seam, so decide them together.
- **Q-022 — Citation → chunk provenance.** **[C]** · *Blocks: nothing.* Sources hoverable to render the exact retrieved chunk. **Probably discharged by T-253** (passage-grain audit records `chunk_id` alongside `version_id`); verify what remains is only the hover surface, and close this if so.

### The builder

- **Q-014 — The tool builder.** **[B]** · *Blocks: Slice F.* Partially ruled 2026-07-13 (T-109): the user-facing surface is **Tools**, not Workflows; a *tool* is the packaged launchable capability, a *workflow* the codified sequence underneath. Scoping ruled — Infora-standard tools for all users; org-built tools for that organisation only, travelling with its users but never across the wall; individually-built tools org-visible in the MVP (deliberately: codified workflows are the moat). **Still open:** who may edit or retire another's org-visible tool (curation roles); whether an "endorsed" tier is wanted; where the builder sits in the roadmap; and the **wall-through-the-definition stress test** — a tool authored while serving client A must be org-authored moat, never a carrier of client A's material onto client B's project.

### Mechanical residuals *(no design fork — close when convenient)*

- **Q-011 — The run row names no document.** **[C]** A document-targeted run records its document only through the Suggestions it produces, so a run that withheld everything logs as a chat turn. Fix if it misreads in practice: a nullable `sandbox_document_id` on `runs`. *(T-108, 2026-07-13.)*
- **Q-013 — Chat-run citations in the Run read.** **[C]** An untargeted chat run's citations are written against the `cite` Step but the contracts `Run` read doesn't surface them. ADR-0031 §6 needs them for Copilot to render, so this rides with M6. *(T-052, 2026-07-08.)*
- **Q-024 — Org admin reach into a personal sandbox.** **[A]** Whether an org admin can reach a user's workspace sandbox (refined ADR-0018). Decide with the sandbox drawer.
- **Q-025 — The sandbox-scope review rendition.** **[A]** PDF rendition vs frozen native text for internal QA review. Parked in ADR-0032; V1 ships the text-first read with the PDF downloadable as a named deviation.
- **Q-026 — The naming scheme.** **[A]** The standing ADR-0008 deferral. The per-project metadata *schema* was closed by ADR-0045; only the naming scheme remains.
- ~~**Q-027 — The NFR numbers.**~~ ✅ **Closed 2026-08-01** by the infra/security session: [nfr.md](../build/nfr.md) re-cut for V1 and its figures agreed. Record in [grill-history.md](grill-history.md).

---

## Remaining sessions — in priority order

The four remaining full sessions, as distinct from the individual questions
above. All are **bucket (B), must-still-grill** — Infora diverges from
single-firm Legora here and has no precedent to copy, which is exactly why the
slow adversarial method is reserved for them. *(Tier 1 — the MVP-gating M1–M3
sessions — is done; its record is in [grill-history.md](grill-history.md).)*
Each entry is written to be started directly: copy *The question* into a new
grilling session.

---

### Tier 2 — Moat & sophistication (post-MVP) — bucket (B), must-still-grill
*No precedent in Legora (single-firm); these are Infora's cross-org / confidentiality divergences (reference doc §10). Keep the slow adversarial method here. Defer until the skeleton runs.*

#### Session 4 — Knowledge distillation, provenance, and staleness
- **Depends on:** Session 3 ✅. The "knowledge grill" deferred during retrieval; builds the distillation *engine* whose boundary ADR-0026 already fixed.
- **The question:** > Decide how Knowledge is distilled from Sources and Signals: automatic, manual, or both, and who holds curation authority — including whether a consultant's distilled Knowledge can enter owner-controlled project Knowledge. Define the Source→Knowledge flow end to end. Give distilled Knowledge **provenance** back to its source and a **lifecycle**: when a source deliverable is superseded/withdrawn (ADR-0013), what happens to Knowledge distilled from it.
- **Outcome:** distillation + Knowledge-currency ADRs. Must honour ADR-0026's two filters and the manual-curation admission, and the Session-1 ruling that distilled Knowledge cites *through* to a source.

#### Session 5 — Precedent selection and application
- **Depends on:** Session 3 ✅.
- **The question:** > Decide how precedents in a firm's org context are selected and applied to a new project: how a relevant precedent is found, brought into a draft, and constrained by the Session-3 confidentiality boundary. Settle whether precedent application is grounding or informing (currently **informing**), and how a precedent's origin is or isn't surfaced.
- **Outcome:** an ADR if selection/application carries a real trade-off (the open "precedent selection within the informing channel" item).

#### Session 6 — Retrieval, ranking, merging & store choice *(finish)*
- **Depends on:** ADR-0022/0024 ✅; the MVP slice (M3) done first.
- **The question:** > Settle: **Library RAG strategy** — the contextual-retrieval problem ("everything about x *in the context of y*"): query decomposition into semantic intent + scope filter, the ingestion metadata that enables it, and modelling relationships between deliverables. **Full channel ranking & budget** (beyond M3's naive merge), incl. org-vs-programme precedence — note the **guiding-over-informing conflict precedence is already fixed** (2026-07-06, ADR-0029 §5) and constrains this ranking. **Per-viewer citation rendering** for shared deliverables.
- **Outcome:** RAG-strategy and ranking ADRs. pgvector is fixed.
- **⚠ Sharpened 2026-07-31 → carried as [Q-028](#retrieval).** The ontology's semantic pre-filter is built (T-242) but structurally unreachable from the agent path, so *who selects the retrieval scope for a given question* is now the concrete half of this session — with a recommendation and a stress test already recorded. Answer Q-028 and this session gains its scope-filter half; the ranking and per-viewer-citation halves are still open independently.

#### Session 7 — Signal capture into Knowledge (the moat loop)
- **Depends on:** Session 4.
- **The question:** > Decide how accept/edit/reject Signals feed back into the curated store: a live Signal→Knowledge path in v1 or training-data-only for now; who curates; how cross-organisation Signal data respects the walls. Define the Signal sink so the moat compounds, not merely captures.
- **Outcome:** an ADR for the Signal sink — **constrained in advance by ADR-0026:** "training-data-only" must mean de-identified/aggregate, never a shared model on client data.
- **⚠ Revisit ADR-0026 — "zero training on customer data" is too absolute (flagged 2026-06-27).** The view to unpack: a customer living in Infora *wants* its own performance to improve from its own data and Signals — including, potentially, per-tenant model tuning — for its own teams' benefit. The wall to hold is **cross-customer / cross-platform** leakage, **not** within-tenant improvement; the current blanket "zero training on customer data" conflates the two and reads as a promise never to improve for the customer at all. **Action when this session (or Session 4) is grilled:** reconcile ADR-0026 and the moat-improvement principle by distinguishing **within-tenant improvement (desirable, customer's own data for its own benefit)** from **cross-tenant training (forbidden)**, and edit ADR-0026 accordingly. Affects the "Compounding knowledge" feature wording in the overview.

---

## Cross-references
- **Authority register operational detail** (encoding format, currency cadence, jurisdiction) is now a **Context (component 4)** concern (revised ADR-0023, when Compliance dissolved as a component) — see [component-4-context.md](../architecture/component-4-context.md)  and the Context entry in **Backlog by component** above.
- The **agreed position** for each component lives in its component doc under [docs/architecture/](../architecture/); the **whole-system overview** is the [overview](../architecture/infora-overview.md); every **open question** lives here, in this tracker.
