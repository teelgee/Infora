# Build plan — the ticket board (Phase 5)

> **Status: drafted 2026-07-04; revised 2026-07-06** against the plan review and the surfaces-alignment rulings (grill tracker session record): M4 restructured to the Ask / Editor / Sandbox surface split, the Work item and wall-test subjects added to the seed, the append-only shape reconciled with Run/Step state transitions, the embeddings adapter corrected, T-021 split, and the build enablers T-083–T-085 added. The implementation plan: the walking skeleton broken into tickets with blocking relationships, plus the phased roadmap for everything after. This is the Phase 5 artefact of the [7-phases method](https://www.aihero.dev/my-7-phases-of-ai-development) — Phases 1–4 are the design layer (idea = overview, research = the Legora reference, PRD = the [walking skeleton](walking-skeleton.md) + [data model](data-model.md) + [contracts](contracts.md)). Phase 6 (execution) works this board; Phase 7 (QA) runs the end-to-end acceptance in the walking skeleton and raises new tickets here.
>
> **Scope discipline:** skeleton tickets are execution-ready; post-skeleton slices are a roadmap only, ticketed when their slice starts (matching the data model's drawer-by-drawer rule). The board lives in this file for now; export to GitHub Issues when we want agents working it in parallel.

## How to read a ticket

`T-###` — title. **Deps:** tickets that must be done first. **Done when:** the acceptance test, drawn from the walking skeleton's milestone acceptance. Package names from [repo-structure.md](repo-structure.md). A ticket is sized for one focused agent run (roughly a PR each).

**Definition of done, every ticket:** typed against `packages/contracts`; unit-tested; no surface reaches below the API; no code path resolves its own permissions (component 2 rule); lints and builds clean in CI.

---

## ⚠ One named build-time decision — skeleton auth

The design layer defers real identity/security to the infra/security session (component 1, open). The skeleton still needs a login. **Decision taken for the skeleton, to be superseded by that session:** email + password session login for the seeded users (`POST /auth/session`, httpOnly cookie), plus Entra ID SSO on the Copilot path (M6, where Microsoft mandates it). No self-serve signup, no password reset, no roles beyond what the data model already carries. This is scaffolding, not the security model; it is listed here so it is a recorded choice, not an accident.

**Production identity is committed as Entra-first (recorded 2026-07-04):** most users will arrive through Microsoft Entra (Azure AD), so production login is Entra ID SSO (OIDC) as the primary path, with the skeleton's password login retained only as a break-glass/dev mechanism to be decided at the infra/security session. The build already enables this: identity is established at one API boundary only (T-021/T-023, contracts principle 3), `User.external_identity` carries the Entra subject from Drawer 1, and T-071 exercises the full Entra → User → Participant mapping. Adding web SSO later is an additive login route, not a rework.

---

## M0 — Foundation: repo, schema, contracts, model, seed

| # | Ticket | Deps |
|---|--------|------|
| T-001 | **Monorepo scaffold** — pnpm + Turborepo + `tsconfig.base.json`; empty packages per repo-structure (`contracts`, `db`, `model`, `data`, `knowledge`, `orchestration`, `capabilities`, `workflows`, `governance`, `ui`) and apps (`api`, `web-consultant`); dependency rules enforced (surfaces → `contracts`/`ui` only). | — |
| T-002 | **CI pipeline** — build, typecheck, lint, test on every PR; a failing dependency-rule check fails the build. | T-001 |
| T-003 | **`packages/db` substrate** — Postgres + pgvector via docker-compose for dev; migration tooling; connection/config plumbing. | T-001 |
| T-004 | **Migration: Drawer 1 (parties & access)** — Organisation, User (`external_identity` nullable), Project, Membership (one owner per project enforced), Participant. | T-003 |
| T-005 | **Migration: Drawer 2 (documents)** — Container, Version (append-only), **Sandbox document** (mutable by design, per the 2026-07-04 decision). | T-004 |
| T-006 | **Migration: Drawer 3 (work & execution)** — Work item, Conversation (`surface`, nullable `work_item_id`), Run (`parent_run_id`), Step (`parent_step_id`, `source_set`, `rail_outcomes`, model/tokens/cost) — all append-only. | T-004 |
| T-007 | **Migration: Drawers 4–5 (AI output & review)** — Suggestion (`sandbox_document_id`, `kind`, nullable `anchor` — the per-item ruling, 2026-07-06), Citation, Signal (append-only); DRR, Comment (thin). | T-005, T-006 |
| T-008 | **Append-only enforcement + tests** — DB-layer triggers: Version, Signal, Comment strictly insert-only; Run and Step immutable **once finished** (ADR-0028 §3) — UPDATE permitted only on `state`/`status`/`ended_at` while the row is `running`, DELETE never; tests prove content columns are immutable always and that any write to a completed/failed Run or Step is rejected. | T-007 |
| T-009 | **`packages/contracts` seed** — the types and endpoint schemas from [contracts.md](contracts.md), exported as the single source of truth; `apps/api` skeleton serving them (empty handlers). | T-001 |
| T-010 | **`packages/model` Router + two adapters** — the Router interface; an Anthropic **chat** adapter and a separate **embeddings** adapter (Voyage AI or equivalent — Anthropic exposes no embeddings API) behind it; model ids/versions surfaced for the Step audit fields. | T-001 |
| T-011 | **Seed script** — two Organisations (owner + member), one Project, Memberships, a consultant Participant (member org) and an owner Participant, **plus the wall-test subjects: one member-org User with no Participant, and a third Organisation with no Membership at all** (T-022/T-073 need them to exist); **one Work item** (`document_production`, titled, assigned to the consultant Participant, status in production — the governed-work anchor for M3–M5); and a small library: ~6 live `Container`/`Version` rows (`in_library`, `state = live`) with realistic content to draft from, plus one superseded version (to prove exclusion). | T-007 |
| T-012 | **Ingestion & embedding pipeline (`packages/data`)** — chunk seed Versions, embed via the Router, store vectors in pgvector beside the relational rows; embedding model id/version pinned per index (ADR-0024). | T-010, T-011 |
| T-083 | **Config, secrets & bootstrap** — typed env schema validated at boot, `.env.example`, model API keys and DB URLs per app; the first-day contributor path documented (clone → docker compose → migrate → seed → run). | T-003 |

## M1 — The access spine

| # | Ticket | Deps |
|---|--------|------|
| T-020 | **Access resolution predicate (`packages/governance`)** — `(organisation, participant, project) → entitled slice`: membership check, per-deliverable visibility (owner / author / shared), the hard subset invariant (ADR-0015). A pure, unit-tested function of the data — the wall. | T-011 |
| T-021 | **Skeleton session auth** — `POST /auth/session` + httpOnly cookie for the seeded users, `GET /me` (see the auth decision above). | T-009 |
| T-023 | **API-boundary enforcement** — requester resolution middleware on every request, deny-as-404 semantics, the error envelope (contracts §4); no endpoint accepts caller-supplied identity. | T-021, T-020 |
| T-022 | **Negative tests: the wall on the native surface** — the seeded no-Participant user and third-org user resolve to nothing on every endpoint; proves there is no code path admitting a scope the predicate did not. | T-023 |

## M2 — The Context gateway

| # | Ticket | Deps |
|---|--------|------|
| T-030 | **Assembly gateway signature (`packages/knowledge`)** — `assemble(request, environment, requester)` exactly as contracts.md §1; access resolution (T-020) runs inside the call; guiding/informing pipelines present but returning empty. | T-020, T-009 |
| T-031 | **Grounded pipeline: hybrid library retrieval** — vector similarity + lexical code/metadata match over the requester's entitled slice only; live-state filter (superseded/withdrawn excluded, one live version per container) as SQL pre-filters, not post-filters (ADR-0022/0024). | T-012, T-030 |
| T-032 | **v1 merge + channel annotation** — grounded-first concatenation within a fixed token budget, drop lowest-priority channel first; every returned item carries channel + source identity (ADR-0029 §5). | T-031 |
| T-033 | **Gateway wall tests** — same query, entitled vs unentitled requester: content vs nothing; the superseded Version never returned; no parameter exists to widen scope (signature-level test); the response is annotated by channel. | T-032 |

## M3 — The orchestrated run (the heart)

| # | Ticket | Deps |
|---|--------|------|
| T-040 | **Run/Step writer (`packages/orchestration`)** — Conversation/Run/Step lifecycle against the append-only tables; the run tree (`parent_run_id`/`parent_step_id`); state transitions running → completed/failed. | T-008, T-009 |
| T-041 | **The coded chain** — `retrieve → draft → ground-check → cite` as a fixed code spine (ADR-0027 §6, ADR-0028 §5); each step writes its Step row with full audit fields as it runs. | T-040 |
| T-042 | **`retrieve` leaf + the retrieval sub-agent** — baseline assembly via the gateway; one child Run doing targeted retrieval mid-chain (exercises `parent_run_id`/`child_run_id`); no store access except through `assemble()`. | T-041, T-032 |
| T-043 | **`draft` leaf (grounded generation, `packages/capabilities`)** — the one thinking leaf: prompt assembled from the working input, model called via the Router, draft produced with claim→source markers for the verifier. | T-041, T-010 |
| T-044 | **`ground-check` verifier** — deterministic doing leaf: every claim resolves to a source in the step's `source_set` or is withheld; withholding recorded in `rail_outcomes`. | T-043 |
| T-045 | **`cite` resolution + Suggestion write** — citations attached to grounded sources only; Suggestion(s) written with `kind`, content, rationale, citations, `sandbox_document_id` (the skeleton emits one unanchored `insert` per run — the per-item/anchor model is in the schema, ruled 2026-07-06). | T-044 |
| T-046 | **Run endpoints live (`apps/api`)** — `POST /conversations`, `POST /conversations/:id/runs`, `GET /runs/:id`, work-item endpoints; the full chain callable over HTTP; run reads scoped per the 2026-07-06 visibility ruling (work-item-bound → owner-readable; ad-hoc → requester's organisation only, deny-as-404 otherwise). | T-042, T-045, T-023 |
| T-047 | **M3 acceptance test** — the chain runs the same order every time; unsupported claims withheld; every surviving claim cites a live Version; the Run/Step tree is complete, immutable, with both defensibility fields populated; the sub-agent appears as a real child Run. | T-046 |

## M4 — The consultant surface + Signal loop

*Restructured 2026-07-06 to the surfaces-alignment rulings: Ask and Editor are two surfaces bridged by the output-target chip; Sandbox and Editor each hold their own rail slot; Knowledge is staged out of the skeleton nav (component 8 §6).*

| # | Ticket | Deps |
|---|--------|------|
| T-049 | **UI mockups → `packages/ui` tokens** — the approved mockups ([docs/design/mockups/](../design/mockups/index.html), **third cut 2026-07-06 — authoritative**) translated into design tokens and base components (rail, command bar, cards, badges, citation chips, suggestion cards, run-trace checklist) in `packages/ui`. The mockups are the visual spec for T-050–T-053, T-082 and T-060. | T-001 |
| T-050 | **`apps/web-consultant` scaffold** — React app on `contracts` + `ui`; login, workspace landing (project list, per [workspace-landing](../design/mockups/workspace-landing.html)), project home shell per [project-home](../design/mockups/project-home.html) with the seven-item rail (Home · Ask · Editor · Documents · Review · Sandbox · Workflows); Review and Workflows ship as empty states (ruled 2026-07-06). | T-009, T-021, T-049 |
| T-051 | **Sandbox surface** — the project-sandbox rail section per [sandbox](../design/mockups/sandbox.html): list, create, open sandbox documents ("Open in Editor"); folders, the shared-sandbox switcher and attach-to-generation are post-skeleton. | T-050 |
| T-052 | **Ask surface** — chat per [ask](../design/mockups/ask.html): the run trace as a progressive checklist (chain steps, the sub-agent, withheld count from `rail_outcomes.detail`), the cited answer (library citations only — the authority corpus is post-skeleton), the output-target chip selecting a sandbox document (`sandboxDocumentId` on the run request), and the "draft created" card linking into the Editor. | T-050, T-046 |
| T-082 | **Editor surface** — its own rail slot per [editor](../design/mockups/editor.html): document canvas, manual editing via `PATCH` (no Suggestion, no Signal, no ceremony), and the right panel's **Suggestions** tab rendering pending Suggestions with citations and the withheld notice. Skeleton granularity: one unanchored `insert` Suggestion (the per-item/anchor model waits in the schema); the panel's Chat tab reuses the Ask composer bound to this document; the Insert tab is post-skeleton. | T-051, T-046, T-049 |
| T-053 | **Resolution → Signal → apply** — accept/edit/reject controls on the Editor's suggestion cards; `POST /suggestions/:id/resolution`; exactly one Signal per Suggestion; accept/edit applies content to the sandbox document; reject leaves it untouched. | T-082 |
| T-054 | **M4 acceptance test** — each of the three resolutions writes exactly one Signal per Suggestion, sunk nowhere; accept/edit lands the content in the sandbox document, reject leaves it untouched; a re-draft opens a new Run on the same Work item leaving the first Run intact; a manual edit produces no Suggestion/Signal. | T-053, T-084 |

## M5 — The owner's cross-role read

| # | Ticket | Deps |
|---|--------|------|
| T-060 | **Owner view** — the owner Participant via a **role switch in `web-consultant`** (decided for the skeleton; `web-owner` splits out post-skeleton) reads the Work item's live status and the full audited Run/Step tree per [owner-audit](../design/mockups/owner-audit.html) (chain, sub-agent, sources, rail outcomes, prompt text — work-item-bound runs are project record, ruled 2026-07-06; ad-hoc runs never appear here). | T-050, T-047 |
| T-061 | **M5 acceptance test** — the owner sees exactly what the owner role admits: the work-item-bound runs in full, and **no ad-hoc run** (the visibility ruling's negative case); the trail read is byte-identical to what M3 wrote (nothing mutated between production and review). | T-060 |

## M6 — The Copilot Ask surface

> **Deferred (owner-ruled 2026-07-08):** the M365 integration (T-085 and everything downstream of it) is postponed — no dev tenant / Entra registration for now, so sign-in stays the skeleton's email+password path. The Entra-first production-identity commitment above stands unchanged; this defers the build, not the decision. T-080 drops T-073 from its dependencies and closes the skeleton over the web surface alone; M6 re-enters the board when the M365 enablers are available.

| # | Ticket | Deps |
|---|--------|------|
| T-085 | **M365 dev enablers** — Entra app registration, dev tenant, tunnel + sideload workflow for the declarative agent; documented so M6 is testable by any contributor. | — |
| T-070 | **`apps/copilot-agent`** — declarative-agent manifest + API plugin (OpenAPI) against the same endpoints; no intelligence in the client (ADR-0031 §1). | T-046, T-085 |
| T-071 | **Entra SSO → Participant mapping** — Entra identity resolved via `User.external_identity` to an Infora User and Participant on the bound project; no Copilot-specific access path. | T-070, T-023 |
| T-072 | **Project binding flow** — first-turn project pick; the Copilot Conversation (`surface = copilot`, no Work item) binds to that one project for its life; read-only answers with citations rendered back. | T-071 |
| T-073 | **M6 acceptance test** — same grounded, cited answer through the same Ask path; a Copilot user with no Participant gets nothing; the Run is distinguishable as Copilot-originated in the audit trail. | T-072 |

## Skeleton close-out

| # | Ticket | Deps |
|---|--------|------|
| T-084 | **E2E harness** — Playwright + API-level suite scaffolding wired into CI; the substrate for T-054, T-061 and T-080. | T-002, T-050 |
| T-080 | **End-to-end acceptance run** — the whole walking-skeleton journey (its "the skeleton is done" list, steps 1–6) against seed data, plus the two negative wall tests, as one automated e2e suite. *(T-073 dropped from deps with the M6 deferral, 2026-07-08.)* | T-047, T-054, T-061, T-084 |
| T-086 | **Library list endpoint** — `GET /projects/:id/library` per contracts §Library (the one remaining 501; the Documents tab renders an empty state today). One row per container, access-resolved, live only. Mechanical contract completion. *(Added 2026-07-08.)* | T-030 |
| T-081 | **QA pass (Phase 7)** — human review against the journey; bugs and gaps raised as new tickets on this board. | T-080 |
| T-087 | **Draft reassembly keeps sentence punctuation** — the claim parser strips the full stop that follows a claim's marker ("claim [S1]. Next…"), so the cite leaf's rejoined content runs sentences together; restore terminal punctuation at the parse boundary, keeping claim text, spans and content consistent. *(Phase 7 pre-sweep finding on the real substrate, 2026-07-09.)* | T-080 |

### Parallel tracks

Sequential spine: **T-001 → T-003/T-009 → migrations → T-020 → T-030 → T-041 → T-046 → T-082 → T-053 → T-080.** Off the spine, these run concurrently: T-010 (model), T-002 (CI), T-083 (config/bootstrap) and T-049 (UI tokens from the mockups) from day one; T-050/T-051 (scaffold + sandbox surface) once contracts and the skeleton auth exist (T-009/T-021 — shell work can begin earlier against a stubbed session), well before M3 completes; T-084 (e2e harness) beside M4; T-085 then T-070 (Copilot enablers + manifest) once T-046 is stable; T-012 (ingestion) beside M1.

**UI track:** the visual spec lives in [docs/design/mockups/](../design/mockups/index.html) — eight Legora-clean screens (third cut, 2026-07-06: workspace landing, project home, Ask chat, Editor with chat + suggestion panel, foldered library, sandbox, review, owner run-audit), restructured to the owner's wireframes and the surfaces-alignment rulings (grill tracker session record), benchmarked on the observed Legora UI review ([docs/reference/legora-ui-review.md](../reference/legora-ui-review.md)). The project nav is Home · Ask · Editor · Documents · Review · Sandbox · Workflows; Knowledge is staged with the moat slices (component 8 §6). The alignment session is closed (all items ruled 2026-07-06 — grill tracker session record). Post-skeleton screens (DRR/PDF review, plan builder, portfolio, add-in pane) are mocked when their slice starts.

---

## The roadmap after the skeleton (coarse — ticketed when its slice starts)

Ordered by the wedge-first logic of the overview; each slice names its design gate from the [grill tracker](../grill-sessions/grill-questions.md). Nothing here is execution-ready by design.

**Slice A — Document management: the controlled lifecycle** *(design locked, ADRs 0001–0014 — no gate).* The wedge's engine room and the largest slice. Entered in this order when ticketed:
1. **The review drawer** — before any migration, draw the missing tables into the data model (the drawer-by-drawer rule): Transmittal, review rounds + frozen snapshots, review-group and authoring-team grants on the deliverable plan (ADR-0008/0017), and the per-project acceptance-code scheme (ADR-0003).
2. **The trigger path** — Promote from the Editor/Sandbox (the button already mocked, disabled, in the editor) into a waiting planned container: the near-empty hand-off (ADR-0008), snapshotting the sandbox head into an immutable Version + PDF rendition (ADR-0002/0004), opening round 1 and handing the DRR edit lock to the review group (ADR-0014).
3. **The round loop** — the user steps, each a surface action: reviewers comment on the frozen PDF with anchors and per-comment codes (PDF viewer — the biggest unmocked design job, with the DRR table); the lead reviewer **issues** the round (transmittal: audit facts recorded, internal snapshot frozen, closed round revealed to the consultant, lock flipped to the authoring team — ADR-0009/0010/0014); authors respond in the live DRR; the lead author promotes the next version, flipping the lock back. Rounds close by explicit human action, never the clock (ADR-0005).
4. **Close-out** — deliverable-level acceptance closes the Work item and auto-admits to the library (ADR-0011/0013); supersede/withdraw; owner sharing/curation; the deliverable plan as live MIDP view.

The review-cycle **entry surface** is already mocked ([review.html](../design/mockups/review.html), 2026-07-06 — round state, the edit lock made visible, due dates that guide) and the skeleton ships its rail slot as an empty state (T-050); the DRR table, PDF viewer and plan builder get their mockups when this slice starts.

**Slice B — The Word add-in** *(design settled, component 8).* The consultant authoring surface: tracked-changes suggestions with citation + rationale, accept/edit/reject as Signals, central M365 deployment. Needs Slice A's promotion path to be fully useful, but drafting on sandbox documents can land earlier.

**Slice C — Governance depth** *(part open: threshold tuning, retention/export — bucket A).* Rails as scoped records with the ADR-0030 intersection engine, grounding-threshold calibration, withheld-output UX, audit retention/export, user-UI-action audit sense.

**Slice D — Retrieval maturity** *(gate: Session 6 finish).* Contextual retrieval ("x in the context of y"), real channel ranking and budget, org-vs-programme precedence, per-viewer citation rendering — behind the unchanged ADR-0029 signature.

**Slice E — The moat loop** *(gate: Sessions 4, 5, 7 — must-grill, the cross-org confidentiality forks).* Org/programme context stores and drawers, the distillation engine with the ADR-0026 destination rule, precedent selection, the Signal sink, guidance notes (ADR pending), and the ADR-0026 within-tenant/cross-tenant training reconciliation flagged in the tracker.

**Slice F — Build-your-own** *(gate: Engine §5 opens — builder interface, tightening validation, sharing).* Custom workflows and org-built agents: authoring, org-context storage, deploy-time rails inheritance, pre-deploy validation.

**Slice G — Breadth surfaces** *(bucket A, reference-decidable).* Workspace home vs project home layout, the owner/client portfolio "control tower", programme views, mobile scope.

**Slice H — Connectors** *(deferred until the wedge is proven).* Integrate-configuration handover to an incumbent DMS; spatial/CAD/BIM by reference.

**Gate before any external pilot — the infra/security decision session** *(bucket C, component 1).* Cloud provider, blob/object storage for renditions, hosting and deployment, encryption and key management, tenant isolation, residency, production identity (replacing the skeleton auth above). The skeleton deliberately runs on the dev substrate until this is held.
