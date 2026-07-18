# Infora — Grill Sessions: Questions & ADR Map

The whole-system grill tracker and the **sole source for open questions** across every component. It records the design-grilling sessions — what each asked, which ADRs it produced, and what remains — and the live backlog the grilling agent crosses off as it goes. Grilling walks the design tree one branch at a time (see the `grill-with-docs` method), turning open questions into decisions captured as ADRs. The agent running a session **edits this file afterwards**: appending the session record, ticking off what it answered, and re-prioritising what is left.

The five artefacts divide the labour: `CONTEXT.md` is the **language**, the [overview](../architecture/infora-overview.md) is the **vision**, the component docs are the **structure**, `docs/adr/` holds the **decisions** — and this doc is the **process log** that moves a question from open to decided. Agreed positions live in the component docs; this doc holds only what is still open and the record of how it got there.

Most grilling so far has been the **Context** component (component 4) and its offshoots, the deepest pre-code branch — its detail is below. The cross-component backlog for the other components (and the MVP-gating M1–M3 grills) is in **Backlog by component**. The session order reorders the original Context design tree to put the contradictions that block everything else first.

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
| **M1** | **Orchestration / run / agent model** (⭐ MVP critical path) | **0028** | ✅ Done |
| **M2** | Thinking vs doing — finish | **0027** (accepted) | ✅ Done |
| **M3** | Context-assembly API + v1 channel merge | **0029** | ✅ Done |
| **A** | Slice A — the review drawer / document management (2026-07-18) | **0032**, **0033**, **0034** | ✅ Designed **and built** same day (T-113–T-129, CI green) |

**Status & approach (updated 2026-07-01).** Sessions 1–3 (the confidentiality spine), **M1 (→ ADR-0028)**, and now **M2 (→ ADR-0027), M3 (→ ADR-0029), the governance-authority ADR (→ ADR-0030), and a first cut of the skeleton data model ([docs/build/data-model.md](../build/data-model.md))** are all done. **The MVP is design-complete and build-ready.** The last build-time item — the draft-location decision — was **closed, owner-confirmed 2026-07-04**: the draft lives in the sandbox as a real working document (a minimal Sandbox document table enters the skeleton; Suggestions arise only from agent prompts; manual editing carries no Signal). Recorded in the [data model](../build/data-model.md) and [walking skeleton](../build/walking-skeleton.md). **Nothing gates the build**; the ticket board is [docs/build/plan.md](../build/plan.md). See **Path to MVP** below.

The remaining backlog is now triaged **by method, not just priority** (the shift agreed after reviewing Legora as a validated reference — [docs/reference/legora-architecture.md](../reference/legora-architecture.md)):
- **(A) Reference-decidable** — a precedent exists; decide in fast-mode (Legora-benchmarked, Claude-drafts-you-intervene), *not* by slow grilling. Mostly post-MVP.
- **(B) Must-still-grill** — genuine Infora-specific forks with no precedent (the cross-org / confidentiality moat questions Legora can't answer, being single-firm). These are the moat (Sessions 4, 5, 7); **post-MVP** — reserve the heavy grilling method for them.
- **(C) Not a grill** — build docs (the data model) and the infra/security decision session.

The grilling method has done its job for the MVP. Full breakdown in **Path to MVP** and **Remaining sessions** below.

### A note on ADR numbering
The original plan anticipated specific ADR numbers (e.g. "Session 1 → ADR-0020 access-resolved grounding"). In practice, access-resolved grounding was **folded into** ADR-0020 (stores) and ADR-0021 (channels) rather than getting its own number, so actual numbers differ from the plan. The table above and the detail below use the **actual** ADR numbers as the source of truth.

---

## Backlog by component (all eight)

The grilling order and what remains open per component. A **locked** component carries no open questions — its agreed position lives in its component doc. The Context detail (component 4) is expanded in the sessions below; the other components are seeded here from their component docs and grilled later. **Read each open item through the method triage (A / B / C) in Path to MVP:** the Engine's workflow set / compliance presentation / custom-builder interface and the Surfaces layout items are **bucket (A) reference-decidable** (fast-mode against Legora, mostly post-MVP); Context's moat items (Sessions 4/5/7) are **bucket (B) must-still-grill**; Foundation's infra/security is **bucket (C)** a decision session. None but M2/M3 gate the MVP build. *(Renumbered 2026-06-27 to the eight-component model — see the [overview](../architecture/infora-overview.md); the old "Standard workflows", "Custom-workflow builder" and "Compliance capability" components folded into the Engine and Context.)*

1. **Foundation.** ⬜ Open (infra). See [component-1-foundation.md](../architecture/component-1-foundation.md). Settled: the store substrate (pgvector, ADR-0024); the model router and typed contracts also live here. Open — needs a dedicated **infra/security session**: cloud provider (AWS/Azure/GCP), file/blob storage, hosting, deployment, and the in-depth security model (encryption, key management, tenant isolation, residency).
2. **Access.** 🔒 Locked (ADRs 0014–0019, refined by **0033** — 2026-07-18: roster visible to all Participants ("the wall hides work, never presence"), org admin as the intra-org enrolment power, Membership/Participant as auditable interval records, appointment grants propose-then-confirm). See [component-2-access.md](../architecture/component-2-access.md). One small residual (2026-07-06): whether an org admin can reach a user's **personal sandbox** (the per-user workspace sandbox, refined ADR-0018) — decide with the sandbox drawer, post-skeleton.
3. **Governance.** 🟡 In progress. See [component-3-governance.md](../architecture/component-3-governance.md). **Settled: the rails authority model → ADR-0030** (owner-set ceiling, member tighten-only, most-restrictive intersection, every change audited; composition and rail-scoping fixed). Still open (tuning, not authority): grounding-threshold tuning and withheld-output handling; audit retention and export format; deploy-time validation of a tightening; data residency and sovereignty routing. (See the audit-of-every-action candidate ADR below.)
4. **Context.** 🟡 In progress (ADRs 0020–0026). See [component-4-context.md](../architecture/component-4-context.md). Open: library RAG strategy (Session 6 finish), knowledge distillation (Session 4), precedent selection (Session 5), the Signal sink (Session 7), the Context-assembly API + v1 channel merge (M3), and — newly homed here (revised ADR-0023) — the **authority register's operational detail** (encoding format, currency cadence, v1 jurisdiction scope). Detailed in the sessions below.
5. **Document management.** 🔒 Locked (ADRs 0001–0013, generalised by **0032/0033/0034** — the 2026-07-18 Slice A session: role-agnostic two-scope review cycle, per-org plans with owner consolidation, canonical-format-follows-origin). See [component-5-document-management.md](../architecture/component-5-document-management.md). Open residuals (small): the sandbox-scope review surface (PDF vs frozen native text — parked in ADR-0032); the per-project metadata schema + naming scheme (the standing ADR-0008 deferral).
6. **Engine.** 🟡 In progress — the MVP critical path. See [component-6-engine.md](../architecture/component-6-engine.md) (provisional stub absorbing the former standard-workflows, custom-workflow-builder and compliance-checking). **M1 (orchestration/run/agent) is now done → ADR-0028**, firming §1 of the component doc. Still open: the MVP workflow set, how a workflow is defined (config/code/composed steps), where human-in-the-loop checkpoints sit, how a workflow drives a work item's status and ties to the document review/approval lifecycle (component 5); for custom workflows — who can build and through what interface, how a tightening is expressed and validated at deploy time, sharing (org-only now vs cross-org later), pre-deploy testing; for compliance-checking — whether the checking side is checking, generative, or both, and how results are presented and made actionable.
7. **Connectors.** ⬜ Deferred. See [component-7-connectors.md](../architecture/component-7-connectors.md). Open: the integrate-config handover to an incumbent DMS (format, target system); for spatial — which products first (Bentley, Esri, others), read-only reference vs deeper integration, how spatial data enters context and links to documents; timing and priority relative to the wedge.
8. **Surfaces.** 🟡 In progress. See [component-8-surfaces.md](../architecture/component-8-surfaces.md). **Settled: the Microsoft 365 Copilot integration → ADR-0031** (an MVP addition — external read-only Ask surface, `@Infora` reaches the chat agent through the same API, one project bound per conversation, wall held via the ADR-0029 gateway; new `apps/copilot-agent`). Open (bucket A, mostly post-MVP): workspace home vs project home layout; the owner portfolio view design; mobile scope; the boundary between the document-management interface (component 5) and the generic project surfaces.

### Candidate ADRs still to write
- **Audit-of-every-action** as a foundational invariant rather than a later feature (governance, component 3). *Discharged for the agent-execution sense by ADR-0028 (append-only, immutable Run/Step). Still open for the user-UI-action and system-action senses owned by component 3.*
- ~~**Agent as a first-class concept + deployment model**~~ — ✅ **done: folded into ADR-0028** (M1), as planned. The actor/run/orchestration trio is fixed in one ADR.
- ~~**Governance authority**~~ — ✅ **done → ADR-0030** (owner-set rails ceiling, member tighten-only, most-restrictive intersection, every change audited; mirrors the access ceiling ADRs 0015–0018 and completes ADR-0028 §8's custom-agent deployment reference).
- **Per-document guidance artefact** (the *guidance note*: signal-derived, steers never grounds, lives beside the immutable revision per ADR-0002, visibility follows document access — Context, component 4) — carries the residual cross-organisation question below.

### Small build residuals (noted during Phase 6, low-stakes)
- **Starting governed work from the web UI.** No surface affordance binds a Conversation to a Work item yet — Ask's output-target chip targets sandbox documents only, so every UI-originated run is ad-hoc; the skeleton's work-item-bound runs are created at the API level (the contract admits `workItemId`, T-054/T-080 exercise it). The fork to rule: where governed drafting starts — a "draft" action on the work item (project home / work-item screen) vs a work-item chip on Ask. Surfaced 2026-07-08 while building T-080; needs a ruling before the consultant journey is fully browser-drivable.
- **Cancelling a run server-side.** T-097's chat cancel aborts the client's wait; the run itself completes and stands in the record (v1 returns on completion — no streaming). A real Stop needs a ruling on the Run state machine (a `cancelled` terminal state vs `failed` with a cancellation rail outcome) and an abort path through the chain — decide alongside streaming, which changes the same seam. Noted 2026-07-10 while building T-097.
- **The run row names no document.** A document-targeted run records its document only through the Suggestions it produces, so History (T-108) reads a turn's document off its suggestions — a document run that withheld everything (no Suggestion) logs as a chat turn. If that misreads in practice, the fix is a nullable `sandbox_document_id` on `runs` (the chain already receives it) — a small migration, no design fork. Noted 2026-07-13 while building T-108.
- ~~**Component 8's nav list lags the built rail.**~~ ✅ Discharged same day (2026-07-13, T-109): the component doc's two nav sentences now name the built rail — Home · Ask · Editor · Documents · Review · Sandbox · Tools · History, Knowledge staged out of v1 (T-093 ships it at workspace scope).
- **Mention delivery — the missing notification model.** T-112's sandbox comments store `@`-mentions as participant references and render them as highlights, but nothing *tells* the mentioned colleague — no notification system exists anywhere in the build (no in-app badge, no email, no digest). The design to rule when it hurts: what a notification is (per-mention? per-thread? a workspace inbox?), where it surfaces (rail badge, email via an infra-session provider), and whether the review cycle's events (round issued, lock flipped — Slice A) join the same channel, which argues for designing it once rather than per-feature. A second, smaller residual rides along: whether open comment threads should block or warn at **promotion** (Slice A's trigger path) — today they simply stay behind on the sandbox document, which is defensible (working-area chatter never enters the controlled record) but unruled. Noted 2026-07-18 while building T-112.
- **Chat-run citations in the Run read (for M6/T-070).** A document-targeted run's citations ride its Suggestion; an untargeted chat run's citations are written against the `cite` Step but the contracts `Run` read doesn't surface step citations yet. ADR-0031 §6 requires citations returned in the response for Copilot to render, so the Run reconstruction (or a response-level citation list) needs to expose them by T-070. Noted 2026-07-08 while building T-052; mechanical contract completion, no design fork. *(M6 deferred 2026-07-08 — this rides with it; the web Ask surface renders citations off the Suggestion, so nothing in the skeleton is blocked.)*

### Phase 7 QA themes (owner feedback, 2026-07-09 — to delve into, logged for return)
- **The tool builder (was: workflow builder shape).** What the builder should look like; owner proposes promoting it to its own slice. Aligns with Slice F (Engine §5 gate: builder interface, tightening validation, sharing) — the question is whether it advances in the roadmap order and what its v1 surface is.
  **Partially ruled 2026-07-13 (owner, T-109) — the Tools surface and the scoping model.** The user-facing surface is **Tools**, not Workflows: a *tool* is the packaged, launchable capability (the minimal tool is a single workflow with a name and description; a richer tool — e.g. a QA tool — steps through several); a *workflow* stays the engine's term for the codified sequence underneath (`packages/workflows`, ADR-0026/0027 language unchanged — the same deliberate user-vocabulary/internal-record split as T-104). The Tools page lists Infora-standard tools (`agentProvenance: 'infora'`), the organisation's own, and a build-a-tool entry — the Slice F builder lives *in* Tools, and a built workflow surfaces as your own tool. Scoping ruled: **(1)** Infora-standard tools — all users; **(2)** org-built tools — that organisation only, travelling with its users into projects but never visible across the wall (ADR-0020's org-private informing rule applied to tools); **(3)** individually-built tools — org-visible in the MVP (deliberately: codified workflows are the moat, so a consultant's tools feed the firm's toolkit by default), with per-org privacy a *future* choice (an ADR-0030-shaped org policy). Since (3) is org-visible, tiers 2–3 collapse in the MVP data model: provenance + owning organisation + creator, no separate personal scope; "org tool" vs "individual tool" is curation, not scope. **Still open for the session:** who may edit/retire another's org-visible tool (curation roles); whether an "endorsed" tier is wanted; the roadmap-order question above; and the wall-through-the-definition stress test — a tool authored while serving client A must be org-authored moat, not a carrier of client A's material onto client B's project (the builder needs the knowledge store's org-private-client-clean discipline).
- **The audit record: intent vs manifestation.** *(Elevated 2026-07-10, owner flag — review before further audit-adjacent build; absorbs the earlier "Ask audit-trail granularity" flag.)* The intent (ADR-0028 §3/§7): every agent execution is an immutable, append-only Run/Step record with the two defensibility fields — the "defensible by construction" promise the owner reads byte-identically (M5). How it manifests in the build today, to hold against that intent:
  1. *Every chat turn* — including throwaway Ask questions — writes the full Run/Step tree with model, tokens, source set and rail outcomes; nothing distinguishes record-worthy work from conversational noise except the work-item binding (the 2026-07-06 visibility ruling).
  2. *Cancel doesn't cancel* — T-097's stop abandons the wait; the run completes into the record regardless (state-machine ruling parked below).
  3. *Refine chains accumulate* — every reprompted proposal is a permanent Suggestion row; after acceptance the losers are hidden, not deleted (retention ruling parked above).
  4. *Presentation has already diverged from record* — the trace is collapsed in Ask (T-088) and removed from the Editor chat (T-096) at the owner's direction, while the record beneath is unchanged.
  The review: what is the record *for* (client/regulator defensibility, owner oversight, moat signal — each implies different retention and granularity), which executions genuinely need immutable ceremony, what may expire or be deleted, and whether ad-hoc chat deserves a lighter record than governed work. Also completes the "audit-of-every-action" candidate ADR above for the user-action sense.
  **Substantially ruled 2026-07-12 (owner, T-104):** the record is *retained background data anchored to the work* — the liability model is that the consultant owns the work product professionally, even using Infora, so the client owner never sees the agent's internals (run reads are producing-organisation-private; supersedes the 2026-07-06 project-record read). It is not a review surface for anyone; the M5 audit screen is retired; the work-item page reflects the review cycle. Still open for the session: retention/expiry (may unaccepted refine-chain suggestions or old chat runs ever be deleted?), the cancellation state, chat-vs-governed record granularity, and whether provenance ever re-surfaces document-anchored (e.g. insurer/regulator demand) — the record supports it if ruled.
- **Open-world knowledge in chat (internet + model knowledge).** ✅ **Ruled 2026-07-09 (owner):** labelled channels — chat answers may draw on model knowledge (web search when a provider is wired, an infra-session dependency), with grounded claims cited and open-world content clearly labelled; **Suggestions into documents stay grounded-only**. The owner's framing to carry forward: grounding rigor is about *drafting/editing documents*, where provenance must be traceable; chat must be frontier-useful (find across channels, sub-agents, web, judgement). **Standing flag: audit where the grounding strategy applies so it is not enforced onerously in the wrong places.** Chat-mode implementation ticketed (T-089).
- **Refine-chain suggestion retention.** Ruled for the surface (2026-07-09): reprompt stacks the new suggestion above the old in the document callout (new green, older red); once one is accepted the unaccepted ones disappear and per the owner need not be retained. Suggestions/Signals are append-only in the data model, so v1 hides them presentationally; whether unaccepted refine-chain suggestions may be truly deleted (or need a `superseded` resolution) is to be settled with the Ask audit-trail theme above.
- **Workspace-scoped surfaces as a slice.** Workspace Ask (org knowledge only, no project context — the ADR-0031 §3 deferral), workspace Editor, and a "Your knowledge" page (organisation house style, templates — the org-context store made visible). All depend on the org-context/Knowledge store design (Slice E adjacency); candidate for a coherent "workspace slice".
- **The personal sandbox.** A foldered, user-private drive (create folders/documents at will), never visible as a context channel. Extends the deferred full sandbox model (ADR-0018/0019) with a *user*-scoped sandbox and folders — its own drawer when sliced.
- **The work-item page's identity: audit read vs review cycle.** *(Owner flag, 2026-07-12 — review alongside the audit-record session.)* The work-item screen today is M5's owner audit read (the immutable run tree) — built to spec, but presented as *the* work-item page it conflates two different things. The review cycle (ADR-0005–0014) is a human reviewing a human-produced document — rounds, transmittals, frozen snapshots, the DRR; Infora's agent assistance happens *upstream*, in the sandbox, and once the document enters review it is human work under review, full stop. The ruling to make: the work item's primary page should carry its production/review lifecycle (Slice A), with the run-audit trail relocated — a tab, a linked audit view, or the owner-portfolio surface. Decide with the audit-record review; build lands with Slice A. *(2026-07-18: the page's affirmative content is now fully specified — the ADR-0032 addendum's event-driven lifecycle and per-role click-throughs; only the run-audit relocation question remains with the audit session.)*
- ~~**The work item, made super clear.**~~ ✅ **Ruled 2026-07-18 (Slice A session → ADR-0032 addendum).** The work item is the deliverable's *work half*, 1:1 with its Container by type (`container_id`, nullable for future non-document work); status is **event-driven, never hand-set** — planned → drafting → in-review → accepted/rejected, moved by the cycle's events; the missing sandbox-document link is `sandbox_document.container_id`; per-role click-throughs follow the links (consultant → the linked draft, reviewer → the open round's DRR, owner → the MIDP row); reference-material containers have no work item and surfaces never assume the link.
- **The sandbox drawer — SharePoint-shaped.** *(Owner requirement, 2026-07-12, extending the personal-sandbox theme.)* The sandbox must mimic SharePoint-like folder capability: create folders, nest them, drag-and-drop documents and folders. Combined with the earlier requirements: shared/private project sandboxes per ADR-0018, a user-private personal sandbox, never a context channel. This is a data-model drawer (folders, parent refs, sandbox scoping) + endpoints + UI — a coherent mini-slice to design first, drawer-by-drawer rule applies. *(Added 2026-07-14, from the owner's access-model sketch — drawn red/unruled in [diagrams/access-model.tldr](../architecture/diagrams/access-model.tldr):)* **pushing a personal-sandbox document into the project's own-org sandbox** — a cross-scope move (user-private → org-scoped project space) that no ADR covers; settle its direction (one-way push? copy vs move? does anything ever come back?) with this drawer.
- ~~**Library metadata for the project user.**~~ ✅ **Ruled 2026-07-18 (Slice A session).** The at-a-glance set is **derived by query, never duplicated** (reference/state from Container, revision from the current Version, originator from `producing_organisation_id`, verdict from the cycle's rounds); plan-authored extras ride `Container.metadata` (jsonb, schema deferred with the naming scheme); the acceptance-code scheme is the per-project `acceptance_code` table (copied from Infora's default at creation; used codes retire, never redefine — ADR-0003 note). Per-role column *display* config is presentation, deferred to the surface build.
- **Sandbox content in chat context.** The owner wants a "sandbox search" source in chat (2026-07-10, Harvey-pattern source chips). ADR-0011 rules the AI never *grounds* on sandbox content — the fork is whether sandbox material may enter chat context at all (as a labelled, uncitable channel like open-world? as find-my-file navigation only?), and how that squares with the sandbox being the uncontrolled working area. Chip ships as a placeholder pending this ruling (T-100).
- **Model choice & model-agnosticism.** Owner requirement recorded 2026-07-10: models must be easy to swap — the build already guarantees this at the seams (`packages/model` Router: one adapter behind an interface, the chain's one thinking leaf calls it by role; embedding models pinned per index with per-model chunk indexes, so an embedding swap is a re-index, never a mix; model id + version audited on every step). A *user-facing* model picker is per-request routing policy — ADR-0028 §9's deliberately-stubbed multi-model routing — to design when a second adapter lands. Chip ships as a placeholder (T-100).
- ~~**The canonical sandbox-document format — and the output formats it must serve.**~~ ✅ **Ruled 2026-07-18 (Slice A session → ADR-0034).** Canonical format follows origin: **uploaded** files stay native (docx/xlsx/pptx canonical — viewed, promoted, reviewed, never edited by Infora); **authored** documents are Infora structured text (the AI substrate) with Word/PowerPoint as one-way exports at promotion, Legora-benchmarked; "open in editor" converts uploaded→authored deliberately, original preserved. PowerPoint = an authored `kind: slides` document (slide-shaped, same substrate) + pptx rendition. Renditions are stored immutable rows (native + PDF; formats docx/xlsx/pptx/pdf now, dwg-class deferred). The Slice B add-in serves the native-docx population — tracked-change suggestions on the user's own file, no forced conversion.
- **Citation → chunk provenance.** Owner wants sources (the inline citation chips, renamed 2026-07-13, T-105) hoverable to render the exact chunk retrieval identified. Citations record version identity only (`versionId` + span into the *draft*); the retrieved chunk's identity is not kept. Recording chunk ids on citations/source sets is a data-model addition to grill (it also strengthens defensibility).
- **Predetermined response styles.** *(Owner request, 2026-07-13 — to design with the owner before building.)* A Style chip on the composer asks the agent to respond in a specific style, drawing on predetermined styles set by the project or organisation. To settle: what a style *is* (tone/register instructions? a house-style exemplar? a template adjacency?), who defines and edits one (org-level vs project-level, and which roles), where styles live (the org-context/Knowledge store is the natural adjacency — ADR-0020's org-private informing rule would keep one client's styles from leaking to another), how a style enters the chain (steer into the draft leaf's prompt — thinking, never doing, ADR-0027), and whether a style applies per-turn or per-conversation. Chip ships as a placeholder (T-107).

### Open item carried from the glossary
- **Signal-derived guidance crossing organisations.** A guidance note's visibility follows document access (the chosen rule), so once the owner shares a deliverable the note — generated from one organisation's edits and agent interactions (Signals) — becomes visible to another organisation that can now see the document. A deliberate scope choice, not the org-private informing rule (ADR-0020); the residual to settle is whether signal-derived steer carrying one organisation's private approach should be scrubbed or re-scoped before another organisation sees it. To be settled when the guidance-note ADR is grilled.

---

## Path to MVP — what must be resolved before coding

### The walking skeleton (first build slice)

The MVP is a thin slice of the whole shape rather than one layer built deep, so the architecture is proven end to end before anything is built out. The journey: a consultant opens a project, asks the chat to draft a short governed section from the project's own sources; the orchestrator runs a real chain (retrieve → draft → ground-check → cite) and logs every step; the draft appears in the editor with citations; the consultant accepts, edits, or rejects, and that Signal is captured; the owner logs in on a different role and sees the work item with live status and the full audited run, with access correctly scoped.

All of this sits on top of a **skeleton data model** — the stored tables for the entities above — which must be drawn and agreed first; see item 0 on the gating short-list below.

What is real even in the skeleton: the access model, the audit trail, and the accept/edit/reject Signal capture. What is thin: one model adapter, a fixed orchestration chain, grounded generation real with the other capabilities stubbed. Everything below in this section is about getting this skeleton to run.

**The good news: the pre-code design is essentially complete for that skeleton.** Locked and sufficient: the access model (0014–0019), the store/channel/environment model (0020, 0021, 0025), retrieval + store (0022, 0024), grounding/citation (0021), the confidentiality boundary (0025, 0026), and now the **orchestration/run/agent model (0028)**. Everything still open is **moat and sophistication, not skeleton blockers.**

**Defer entirely (post-MVP — they are the moat, not the skeleton):**
- **Session 4 (distillation engine)** — the MVP has no moat-write loop. It *captures* Signals but feeds them nowhere yet ("signal capture real, the loop thin").
- **Session 5 (precedent selection)** — a later informing feature; the MVP omits it or pins one precedent manually as an attached source.
- **Session 7 (Signal sink)** — capture now, sink later.
- **Most of Session 6** — contextual-retrieval RAG ("x in the context of y") is an enhancement; basic hybrid retrieval (0022) is enough for v1. Per-viewer citation rendering is deferrable for a single-consultant slice.
- *(ADR-0027 / thinking vs doing was previously deferred here; it is now promoted to gating **Step 1** below — cheaper to fix the chain's thinking/doing split before the chain is coded than to retrofit it.)*

**The short list that gated the MVP build is now cleared:**

**Step 1 — M2: ADR-0027 (thinking vs doing) ✅ accepted.** The v1 chain classified at the leaf: `retrieve`/`ground-check`/`cite` = doing (code), `draft` = thinking (LLM); the two patterns (code-with-escape-hatch, LLM-with-verifier), design-time classification with deterministic run-time routing, and the currency loop for compiled rules are fixed.

**Step 2 — M3: ADR-0029 (Context-assembly contract) ✅ accepted.** One gateway call — `(request, environment, requester)` → the access-resolved working input across channels; two modes (baseline + agentic sub-agent retrieval) on one signature; v1 merge = grounded-first within a token budget. No scope-widening parameter, so the ethical wall is enforced by the contract's shape.

**Step 3 — the skeleton data model ✅ first cut drafted** ([docs/build/data-model.md](../build/data-model.md)). The CONTEXT.md concepts drawn as tables in five drawers (parties & access, documents, work & execution, AI output & feedback, review), scoped to the skeleton. The one item sent back here — the **draft-location decision** — is ✅ **closed, owner-confirmed 2026-07-04**: the draft lives in the sandbox (a Sandbox document table, Drawer 2); Suggestions arise only from agent prompts; promotion stays stubbed.

**Also cleared alongside:** the **governance-authority ADR (→ ADR-0030)** — owner-set rails ceiling, member tighten-only, most-restrictive intersection, every change audited; discharges ADR-0028 §8's forward reference for custom-agent deployment.

**MVP scope addition — the Microsoft 365 Copilot integration (→ ADR-0031).** `@Infora` in Copilot reaches the Ask chat agent as an external thin-client surface, bound to one project per conversation, over the same API (so the ethical wall holds via the ADR-0029 gateway). Read-only Ask in v1 (no drafting/Signals — the Word add-in keeps those). New build: `apps/copilot-agent` (declarative agent + API plugin), Entra SSO → Participant mapping, a `surface` field on the Conversation. The chat agent, assembly, access and audit are reused untouched.

**Next: build the walking skeleton** on the locked design. Everything else (buckets A-non-MVP and all of B) is deferred until the skeleton runs end to end.

### Approach to the rest — triage by method (A / B / C)

Having reviewed Legora as a validated reference ([docs/reference/legora-architecture.md](../reference/legora-architecture.md)), the remaining backlog is no longer uniform. Sort each open question by the **method** that fits it, not just priority — the grill method (slow, adversarial, one fork at a time) is for genuine forks with real trade-offs and *no precedent*, and most of what's left no longer fits that.

- **(A) Reference-decidable — fast-mode, don't grill.** A precedent exists (Legora + adjacent products). Decide in the Claude-drafts-you-intervene mode used for M1's Q5–Q9. Covers: the MVP workflow set, compliance-checking presentation, the custom-builder interface (Legora's answer: natural-language, not a visual builder), surfaces/home/portfolio layout, M3's contract. Mostly post-MVP; pull one forward only if the skeleton needs it (M3 is the one that does).
- **(B) Must-still-grill — keep the slow method.** No precedent, because these are exactly where Infora diverges from single-firm Legora (reference doc §10): cross-org distillation and signal-derived guidance crossing organisations, the within-tenant vs cross-tenant training reconciliation (ADR-0026), precedent selection under the confidentiality boundary. These are the moat (Sessions 4, 5, 7) and are **post-MVP** — reserve the heavy grilling powder for them.
- **(C) Not a grill.** The data model (Step 3) and a dedicated **infra/security decision session** (cloud provider, file/blob storage, hosting, deployment, key management, tenant isolation, residency) — benchmarkable against Legora's Azure / EU-residency / SOC 2 / ISO 27001 stack, but a decision session, not a Socratic grill. Not on the skeleton's critical path.

**Bottom line:** two small grills (M2, M3) and one build doc (the data model) stand between here and the skeleton build. The deep grilling method is reserved for bucket (B) — the cross-org confidentiality questions — deliberately deferred until the skeleton runs.

---

## Completed sessions

### Session 1 — The grounded corpus vs the working input
*Resolves gaps 1 & 2; finishes parked Q1 (access-resolved grounding).*

**Key questions asked**
- ADR-0011 says the project library is the *sole* grounded corpus; CONTEXT.md says org context and Knowledge feed the working input and are the moat. How do these reconcile?
- Are there distinct input channels — grounded-and-cited project fact vs informing/steering material never cited as project fact? How does generation keep them separate?
- What does the governance rail do differently for each?
- Confirm access-resolved grounding (organisation-scoped, pre-retrieval filter, citations safe by construction).
- Where does distilled Knowledge sit — inside the groundable library, or a separate informing store?

**Answered by**
- **ADR-0021** — the three-channel model (grounded / guiding / informing); the grounding invariant is **privacy** ("only non-private sources may ground"), generalising the corpus rule beyond the library.
- **ADR-0011 (refined)** — "sole grounded corpus" annotated as the project-side case of the privacy rule; the authority corpus added as a second grounded corpus.
- Access-resolved grounding folded into **ADR-0020** and **ADR-0021** (access resolved *before* retrieval).
- Distilled Knowledge settled as a non-citable overlay that cites *through* to a source — but full distillation is Session 4.

### Session 2 — The org and project context split as two stores
*Candidate ADR from the architecture; depends on Session 1.*

**Key questions asked**
- Confirm org and project context as two distinct stores.
- How do they combine into one working input at query time without org context leaking to other members?
- What does each hold; which is access-resolved (project) and which is private-by-construction (org)?
- How does the ground-vs-inform line map onto them?
- Does a third scope — programme context — exist, or is it out of scope?

**Answered by**
- **ADR-0020** — three scoped stores (org, programme, project); org & programme private-by-construction and inform-only, project access-resolved and the grounding store; per-request, per-Participant assembly; no-leak by construction (not a redaction pass). **Programme context was a deliberate third store** (chosen over a two-store recommendation).

### Session 3 — Org context confidentiality and portability across clients ⭐
*Resolved gap 3 (the deepest); the critical pre-code session. Built on Sessions 1 & 2.*

**Key questions asked**
- Org context is portable to every project, but Knowledge is distilled from confidential, client-owned project work. What may and may not be distilled into a firm's portable org context, so a consultant serving competing clients cannot carry one client's confidential positions into another's project?
- Is portability of abstracted know-how only (style, structure, approach) or of concrete project facts — and how is that enforced **at distillation time**, not at query time?
- What happens when private precedent text is baked into a deliverable that is then shared or promoted into the project library?
- How does the moat compound at all without leaking — retrieval vs training vs codified workflows?

**Answered by**
- **ADR-0025 (assembly environment)** — the substrate: every request runs in one environment (a project, or the org's own workspace), and the environment, not the user's identity alone, sets which channels are reachable; the informing channel is portable, everything else fixed; access resolution before retrieval. Defines the "own workspace, no project" case ADR-0020 omitted; separates sandbox-privacy from channel-reachability.
- **ADR-0026 (distillation & egress boundary)** — confidentiality enforced by **two mechanisms**: the environment makes another client's material unreachable elsewhere (structural), and a **destination rule** restricts what may feed portable org context to the firm's own material with client facts stripped (the two filters: ownership of the material, then of the facts within it). Admission is a deliberate, abstracting curation act, never automatic. The moat compounds by **retrieval and codified workflows, never by training on customer data** (per-tenant fine-tune flagged as future-only). The output question resolves by the store being clean-by-construction. Honest limit: defeats automated and accidental leak; deliberate human egress is tracked and audited, not physically prevented.
- **Offshoot — ADR-0027 (thinking vs doing)** — placeholder; the deterministic-by-default principle (LLM compiles a rule into code once, code runs it forever) surfaced as the third, confidentiality-clean improvement path. To be grilled.
- **Refined locked ADRs:** **0018** (private floor splits — org context/workspace sandbox absolute, private *project* sandbox owner-overridable and audited; inbound question added), **0020** & **0021** (programme context may ground/guide its *own* projects, configurably — the rule becomes "a scope may ground its own projects but never outside itself"), **0016** (*visible ≠ distillable*), **0024** (domain-tuned embeddings only on de-identified/non-client data). New glossary terms: **Assembly environment**, **Project artefact**, **workspace sandbox**.

### Session 6 (brought forward — partial) — Retrieval, ranking, merging & store choice
*Design-tree item 5; depends on 1, 2, 4. Done ahead of 3–5.*

**Key questions asked & answered**
- One merged index or per-channel pipelines? → **ADR-0022:** separate pipeline per channel and per grounded corpus.
- Pre-retrieval access filter as a hard predicate, not a post-filter? → **ADR-0022 / ADR-0024:** yes, enforced by co-location.
- Hybrid vs pure-vector for the library; document-state rules? → **ADR-0022:** hybrid (vector + code/metadata); exclude superseded/withdrawn; single live version per container.
- The sandbox/Excel "use this file" workflow vs ADR-0011? → **ADR-0022:** the **attached-source** mode (user-pinned, badged distinctly, never a grounded citation).
- Is pgvector the long-term store? → **ADR-0024:** yes, co-located with relational access data; embeddings pinned/versioned per index.

**Still open in Session 6** (see Remaining)

### Offshoot (unplanned) — Authority register placement
Emerged when the authority corpus (legislation/policy/standards) was added as the grounded channel's second corpus.

- **ADR-0023** — the authority register is universal and Infora-maintained, **and retrievable by users during generation** (first-class), not only a checking input.
- **Revised 2026-06-27:** the features/components reframe dissolved Compliance as a component, so the authority register was **re-homed to Context** (component 4) and compliance-*checking* became a capability run by the Engine (component 6). See revised [ADR-0023](../adr/0023-authority-register-in-context.md). The register's operational detail (encoding, currency cadence, jurisdiction) is now a **Context** open item (above), not a Compliance one.

### Offshoot (unplanned) — Surfaces alignment session *(2026-07-05 → 06 — ✅ closed 2026-07-06)*
Interrogating the UI mockups ([docs/design/mockups/](../design/mockups/index.html)) and the owner's wireframes against the ADRs, grounded in the observed Legora UI review ([docs/reference/legora-ui-review.md](../reference/legora-ui-review.md)). Rulings, edits applied same-day:
- **Knowledge surface defined** → overview + component-8 §6: sources-outside-library (attached-source path preserved, ADR-0022), guiding material, distilled Knowledge + Signals, and the authority shelf — which **grounds** (surface placement ≠ channel role, ADR-0021).
- **Guiding outranks informing on conflict** → ADR-0029 §5 refined; glossary updated; constrains Session 6's ranking.
- **Library may present foldered or flat, per project configuration** → ADR-0016/0011 status notes; folders are never access objects; access stays per deliverable per organisation.
- **Personal sandbox** — the workspace sandbox is per-user → glossary + ADR-0018 note; project sandboxes are shared-across-orgs or single-org, unchanged. Residual: admin visibility (Access backlog above).
- **"Task" stays reserved** — review-surface rows are Work items by their real names.
- **Editor is its own surface** (with Sandbox its own rail slot; Knowledge staged out of the skeleton nav) — Ask and Editor bridged by the output-target chip; the editor carries a Chat · Suggestions · Insert panel. Third-cut mockups (2026-07-06) are the visual spec.
- **Suggestions are per-item and position-anchored** (closing agenda item 2, ruled 2026-07-06): a Run produces zero or more Suggestions; each is individually resolvable and writes its own Signal; a Suggestion carries a `kind` (insert | replace) and a nullable, *advisory* anchor (a quoted span against the mutable sandbox head — a drifted anchor degrades to user-placed insert, never blocks resolution). Matches Word tracked changes (the add-in's native mechanic) and keeps the Signal fine-grained, which is what the moat distils. The **skeleton** ships one unanchored insert Suggestion; the fields exist from the first migration. → data-model Drawer 4, contracts.
- **Owner run-visibility vs the wall** (closing agenda item 6, ruled 2026-07-06): a Run bound to a **Work item** is part of the project record — the owner reads it in full (prompt text, step tree, source set, rail outcomes, suggestions and resolutions), because the defensibility of the owner's record is the product promise (M5). An **ad-hoc** Run (Conversation with no Work item — including every Copilot run in v1, ADR-0031) is working-area material: visible to the requester's own organisation only, metadata included, with the project owner holding the same audited, exceptional override as for a private project sandbox (ADR-0018). → ADR-0028 status note; contracts read-scope notes.
- **The library list unit is the container** (closing agenda item 7, ruled 2026-07-06): one row per deliverable showing the live version; version history expands within the row. Matches the glossary ("a collection of deliverables"), the deliverable plan, one-live-version-per-container grounding, and the contracts library read.
- **Knowledge both-scopes display** — confirmed as recommended 2026-07-06 (project guidance and the org's private group side by side, badged, when Knowledge arrives with the moat slices).
- **Skeleton nav ships Review as an empty state** (not hidden): nav stability over churn; the review cycle itself is Slice A.
Nothing remains open from this session; the residual items already live in their component backlogs (admin visibility of the personal sandbox → Access; withheld-output UX → Governance; Engine HITL/plan-approval gate noted for the Engine grill).

### M1 — Orchestration / run / agent model ⭐ *(done 2026-06-29 → ADR-0028)*
*The one real pre-code gap. Run against Legora's aOS and Anthropic's multi-agent research system as adjacent references.*

**Key questions asked & answered**
- Work item ↔ Run cardinality? → **one Work item, many Runs**; the Run is the immutable per-invocation execution unit, the Work item the persistent unit with its own status state machine. Survives the redraft loop.
- Is a Run the unit for *any* agent execution, including ad-hoc chat? → **yes.** One execution model: every Run has one parent **Conversation** and an **optional Work item** link (chat = no work item; workflow = bound). New term **Conversation**.
- Is the Run/audit record append-only and immutable? → **yes**, mirroring the DRR and ADR-0002; "regulator-defensible" requires it. M1 scoped to the **agent-execution** audit sense only (not document-content tracked-changes, not doc-management versioning, not user-UI actions).
- Run → Step: flat or a sub-agent tree? → **a tree**, and **sub-agents are real from v1** (the main chat agent delegates retrieval to a sub-agent that folds documents into its context). New term **Step**.
- Sub-agent retrieval — through Context or around it? → **through the Context-assembly API (M3) only**, so access-resolution-before-retrieval (ADR-0020/0022) and the ethical wall hold by construction.
- Coded chain or agentic planner? → **coded spine, agentic leaves**: the chain `retrieve → draft → ground-check → cite` is code (guarantees ground-check + cite always run); agentic freedom is confined to retrieval within a step. Legora ships exactly this as its "Workflows" mode (vs the open "Agent" mode) — named as the post-MVP divergence (Work item → Workflow, Conversation → Agent).
- Sequential or parallel sub-agents? → **parallel-capable, isolated** (Anthropic orchestrator-worker; Legora/Tabular-Review fan-out); v1 exercises one. The standalone `cite` step matches Anthropic's separate citation pass.
- What each Step records? → identity/parent, agent + provenance, type, status, timestamps, model+version, token/cost, **plus the access-resolved source set and the rail outcomes** (the two fields that make the trail defensible, not just observable).
- Agent provenance/deployment? → **folded in here** (not a separate ADR): Agent is the first-class actor, Infora-built vs custom(org-built), one environment, rails tighten-only. v1 = Infora-built only.
- Real vs stubbed? → real: the run/step/audit model, the coded chain, retrieve-through-Context, grounded generation (one adapter), ground-check, cite, the retrieval sub-agent, access-resolution, Signal capture. Stubbed: other capabilities, custom agents, fan-out, the Signal sink, multi-model routing.

**Answered by**
- **ADR-0028** — the orchestration/run/agent model. Folds in the first-class Agent concept and discharges the candidate "audit-of-every-action" invariant for the agent-execution case. **New glossary terms: Conversation, Step; Run refined.**

### Slice A — the review drawer / document management design session *(2026-07-18 → ADRs 0032, 0033, 0034)*
*The pre-ticketing design session for Slice A, run drawer-first per the house rule. Alignment drawn live in [diagrams/slice-a-review-model.tldr](../architecture/diagrams/slice-a-review-model.tldr) (agent) and [diagrams/review roles.tldr](../architecture/diagrams/review%20roles.tldr) (owner); benchmarked against the ProjectWise/AssetWise friction map (added to docs/reference this session) and Legora's Editor.*

**Key questions asked & answered**
- Where does internal QA review happen, and is it the same workflow as client review? → **ADR-0032:** one role-agnostic review cycle (authoring side / reviewing side) at two scopes — sandbox (org-private internal formal review; its DRR is the firm's QA evidence, never crossing the wall) and project (the wall-crossing cycle, ADR-0014 unchanged). Internal ceremony is optional, never a system gate.
- What is sandbox versioning? → **ADR-0032:** SharePoint-style *ambient* history (a tool — nothing binds to it) is distinct from the **freeze** ("check out") — promotion's twin at sandbox scope, one Version substrate, head locked while an internal round is open. Promotion takes the head snapshot *or* a QA-accepted frozen version, never a drifted head.
- The cycle's stored shape? → **ADR-0032 + Drawer 5 rebuild:** the cycle is the instance unit (DRR absorbed as its record; terminals accepted / closed-rejected, the latter an explicit audited close by lead author or owner); beneath it Rounds (one open per cycle, schema-enforced), Transmittals, Snapshots, Comments, and the previously unmodelled **Response**. Rejected deliverables stay in the library (`rejected` state), never grounding.
- Who plans, who appoints, who administers? → **ADR-0033:** per-organisation deliverable plans (TIDP) consolidated by the owner (MIDP); appointments as append-only interval grant tables with reviewer propose-then-confirm; the roster visible to all Participants ("the wall hides work, never presence"); org admin + auditable Membership/Participant edges.
- What is a work item? → **ADR-0032 addendum:** the deliverable's work half, 1:1 with its Container by type; status event-driven, never hand-set; per-role click-throughs follow the data links.
- What format is a document? → **ADR-0034:** canonical format follows origin (uploaded = native file; authored = Infora structured text with one-way Word/PowerPoint exports; slides = an authored document kind); renditions stored immutable (docx/xlsx/pptx/pdf; dwg-class deferred); the Slice B add-in serves the native-docx population.
- Acceptance codes + library metadata → per-project `acceptance_code` table (copied at creation, retire-never-redefine, `is_accepting` ends the cycle); Documents-view metadata derived by query, plan extras in `Container.metadata` jsonb.

**Parked from the session:** the sandbox-scope review surface (PDF rendition vs frozen native text — establish the workflow, then the method); mention delivery (T-112 residual); the per-project metadata schema + naming scheme (standing ADR-0008 deferral). **Ticketed and then built the same day: T-113–T-129 all landed 2026-07-18, CI green** — the review cycle is browser-drivable end to end (see the board's Slice A status note for the honest deviations: text-first review reads with the PDF rendition downloadable, the in-PDF anchored viewer as follow-up; ADR-0016 shares landed as data mid-slice at T-119).

---

## Remaining sessions — in priority order

Two tiers, now cross-tagged with the method triage (A / B / C) from **Path to MVP** above. **Tier 1 gates the MVP** — do these at the start of the walking-skeleton build (M2 is a small grill, M3 is fast-mode; the data model is a build doc). **Tier 2 is the moat** — all **bucket (B), must-still-grill**, deferred until the skeleton runs end to end, because Infora diverges from single-firm Legora here and has no precedent to copy. Each entry is written to be started directly: copy *The question* into a new grilling session.

---

### Tier 1 — MVP-gating (do these first)

#### M1 — Orchestration / run / agent model ⭐ ✅ **Done 2026-06-29 → ADR-0028.** Detail in the completed-session record above. Unblocks the skeleton data model (item 0) and gives M2 a concrete chain to classify.

#### M2 — Thinking vs doing (finish ADR-0027) ✅ **Done 2026-07-01 → ADR-0027 accepted.**
- **Why now:** a build *constraint* that shapes the chain — cheaper to apply from the start than to retrofit. Needed once M1 fixes the chain.
- **Depends on:** M1 (the chain to classify); ADR-0023 (authority-register currency, for the compiled-rule change-trigger).
- **The question:** > Promote [ADR-0027](../adr/0027-thinking-vs-doing.md) from placeholder: classify steps at the leaf (thinking → LLM, doing → code); define the two patterns (code-with-LLM-escape-hatch, LLM-with-deterministic-verifier); the currency loop for compiled rules; and how the orchestrator routes between code and LLM at run time.
- **Outcome:** ADR-0027 accepted, with Decision + Consequences written.

#### M3 — Context-assembly API + v1 channel merge (MVP slice of Session 6) ✅ **Done 2026-07-01 → ADR-0029.**
- **Why now:** the orchestrator (M1) needs a contract to get the assembled working input; a thin version unblocks the skeleton. The full ranking/budget is Tier 2.
- **Depends on:** ADR-0012, ADR-0025 (assembly environment), M1.
- **The question:** > Fix the minimal Context→orchestrator contract: what the orchestrator passes (request, environment, requester) and gets back (the assembled input across channels). Decide a v1 channel merge + token budget — a naive grounded-priority concatenation is acceptable for v1; org-vs-programme precedence and real ranking are deferred.
- **Outcome:** a thin ADR (or addendum to 0012/0022) fixing the assembly contract and the v1 merge. Can evolve.

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

#### Session 7 — Signal capture into Knowledge (the moat loop)
- **Depends on:** Session 4.
- **The question:** > Decide how accept/edit/reject Signals feed back into the curated store: a live Signal→Knowledge path in v1 or training-data-only for now; who curates; how cross-organisation Signal data respects the walls. Define the Signal sink so the moat compounds, not merely captures.
- **Outcome:** an ADR for the Signal sink — **constrained in advance by ADR-0026:** "training-data-only" must mean de-identified/aggregate, never a shared model on client data.
- **⚠ Revisit ADR-0026 — "zero training on customer data" is too absolute (flagged 2026-06-27).** The view to unpack: a customer living in Infora *wants* its own performance to improve from its own data and Signals — including, potentially, per-tenant model tuning — for its own teams' benefit. The wall to hold is **cross-customer / cross-platform** leakage, **not** within-tenant improvement; the current blanket "zero training on customer data" conflates the two and reads as a promise never to improve for the customer at all. **Action when this session (or Session 4) is grilled:** reconcile ADR-0026 and the moat-improvement principle by distinguishing **within-tenant improvement (desirable, customer's own data for its own benefit)** from **cross-tenant training (forbidden)**, and edit ADR-0026 accordingly. Affects the "Compounding knowledge" feature wording in the overview.

---

## Cross-references
- **Authority register operational detail** (encoding format, currency cadence, jurisdiction) is now a **Context (component 4)** concern (revised ADR-0023, when Compliance dissolved as a component) — see [component-4-context.md](../architecture/component-4-context.md) (§8) and the Context entry in **Backlog by component** above.
- The **agreed position** for each component lives in its component doc under [docs/architecture/](../architecture/); the **whole-system overview** is the [overview](../architecture/infora-overview.md); every **open question** lives here, in this tracker.
