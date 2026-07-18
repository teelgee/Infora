# Build plan — the ticket board (Phase 5)

> **Status: drafted 2026-07-04; revised 2026-07-06; Phase 7 QA batch and rulings 2026-07-09–12 recorded in the rows and dated notes below (labelled channels T-089; the record turns inward T-104)** against the plan review and the surfaces-alignment rulings (grill tracker session record): M4 restructured to the Ask / Editor / Sandbox surface split, the Work item and wall-test subjects added to the seed, the append-only shape reconciled with Run/Step state transitions, the embeddings adapter corrected, T-021 split, and the build enablers T-083–T-085 added. The implementation plan: the walking skeleton broken into tickets with blocking relationships, plus the phased roadmap for everything after. This is the Phase 5 artefact of the [7-phases method](https://www.aihero.dev/my-7-phases-of-ai-development) — Phases 1–4 are the design layer (idea = overview, research = the Legora reference, PRD = the [walking skeleton](walking-skeleton.md) + [data model](data-model.md) + [contracts](contracts.md)). Phase 6 (execution) works this board; Phase 7 (QA) runs the end-to-end acceptance in the walking skeleton and raises new tickets here.
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

## Phase 7 QA batch (owner review, 2026-07-09)

Raised from the owner's T-081 review of the workspace, Ask and Editor surfaces. Design themes from the same review live on the grill tracker; these rows are the actionable cut. Chat = the untargeted Ask path; drafting = document-targeted Suggestions, which stay grounded-only (the 2026-07-09 labelled-channels ruling).

| # | Ticket | Deps |
|---|--------|------|
| T-088 | **Ask reads like a chat** — markdown-formatted answers (paragraph-preserving reassembly + rendered markdown), citations shown per answer (the Run read exposes cite-step citations — the old step-citation residual, now needed by the web surface), the run trace collapsed to an expandable detail line, and the output-target chip removed (drafting belongs to the Editor). | T-080 |
| T-089 | **Labelled open-world channel in chat** — untargeted runs may keep model-knowledge claims, labelled (`open_world` rail outcome) instead of withheld; grounded claims keep citations; document-targeted drafting unchanged (grounded-only). Web search waits on a provider (infra session). | T-088 |
| T-090 | **Editor entry screen** — no document open: browse the org's project-sandbox documents and create new (flat; folders arrive with the sandbox drawer). | — |
| T-091 | **In-callout suggestion controls with refine stack** — accept / edit / reprompt-to-refine inside the document callout; pending suggestions stack newest-first (new green, older red); unaccepted ones disappear from the surface once one is accepted (rows retained — append-only; retention ruling parked on the tracker). | T-090 |
| T-092 | **Personal settings** — the user chip opens a settings page: profile, editable display name, password change, saved theme (light/dark scheme in the UI tokens); `users.preferences` migration; self-scoped PATCH `/me` + password endpoint. | — |
| T-093 | **Workspace nav functions** — every rail item routes to a real page: honest empty states for workspace Ask / Editor / personal sandbox / workflows naming their slice, and a new "Your knowledge" item for the organisation-knowledge page (placeholder until the org-context store lands). | — |
| T-094 | **Citation chips open the source** — click a citation to read the cited version's content (self-scoped version read endpoint); hover-render of the exact chunk waits on the chunk-provenance data-model theme (tracker). | T-088 |
| T-095 | **Citations ride their claims inline** — each chip renders at the end of the claim it backs (the `claimSpan` already marks it), in Ask answers and Editor callouts alike; uncited chat claims stay plain with the summary badge. *(Owner follow-up to the QA batch, 2026-07-10.)* | T-094 |
| T-096 | **Editor polish** — refine opens an inline dialog in the suggestion callout (no browser prompt); the document chat shows only the user's request and the agent's reply (no chain trace); a formatting toolbar (bold/italic/headings/lists/quote + preview) over the canvas, markdown-honest — true WYSIWYG waits on the canonical document-format theme (tracker). *(Owner follow-up, 2026-07-10.)* | T-091 |
| T-097 | **The chat composer, everywhere** — one shared composer for Ask and the Editor chat: multiline (Shift+⏎ newline, ⏎ sends), list auto-continuation for hyphen/numbered bullets, markdown-rendered user messages, auto-growing input, and cancel-the-wait (Esc or the stop button) — client-side abort; a true server-side run stop needs a state ruling (tracker). *(Owner follow-up, 2026-07-10.)* | T-096 |
| T-098 | **Editor close-out** — the topbar carries a clickable location chip (project sandbox → the Sandbox screen); the right panel drops the Suggestions tab (proposals live inline in the document) and becomes the chat. Word/PowerPoint output confirmed as a rendition concern on the canonical-format theme (tracker) — the build's plain-text source forecloses neither. *(Owner close-out, 2026-07-10.)* | T-097 |
| T-099 | **Navigation depth** — the workspace/project chip is a real switcher everywhere (this workspace + every member project); rail items drill down a layer (Sandbox → its documents into the Editor, Documents → the library, opening the version in place) — the Harvey pattern. *(Owner close-out, 2026-07-10.)* | T-093 |
| T-100 | **Composer sources** — the Harvey-style source row on both chats: a working from-the-library picker (inserts the document code retrieval already honours), and honest placeholders for attach-a-file (attached sources, post-skeleton), standard prompts (to be developed), web search (provider — infra session), sandbox search (needs an ADR-0011 ruling — tracker) and model choice (multi-model routing behind the Router seam, ADR-0028 §9). *(Owner close-out, 2026-07-10.)* | T-097 |
| T-101 | **Editor landing per the owner's wireframe (2026-07-12)** — before the canvas: a "Create from new" card row (Word document works today; Templates and PowerPoint as placeholders naming the org-knowledge store and the format theme) over the sandbox tree (the org's private project sandbox and its documents; shared/personal sandboxes and folders arrive with the sandbox drawer). | T-090 |
| T-102 | **Dark scheme completed** — the hard-coded light values (topbar veil, table-header tints, insert highlight, chip borders, the inverted number badge, the selected-row literal) become theme variables remapped by the dark block. *(T-081 finding, 2026-07-12.)* | T-092 |
| T-103 | **Review pulls the cycle's subjects through** — the Review page lists the project's work items with live status (they are the review cycle's deliverables); rounds/transmittals/DRR columns arrive with Slice A, and the page says so. The work-item page's identity (audit read vs review cycle) is flagged on the tracker for the audit-record session. *(T-081 finding, 2026-07-12.)* | T-050 |
| T-104 | **The record turns inward (owner-ruled 2026-07-12)** — every Run is producing-organisation-private background data (supersedes the 2026-07-06 project-record read; the consultant carries the professional liability, the client reviews the document through the review cycle); the M5 owner audit screen retires as proven scaffolding; the work-item page becomes the review-cycle reflection; the record itself is retained in full, immutable. Contracts, walking-skeleton M5 and the acceptance suites re-dated. | T-103 |
| T-105 | **Sources & the source panel (owner, 2026-07-13)** — the inline citation chip is named the **source** (`CitationChip` → `SourceChip`; vocabulary updated); in Ask a clicked source opens the **source panel** — a right-hand column rendering the named version as a document, state badged — replacing the modal there (the modal stays on the rail drill-down and in the Editor, whose right panel is the chat). | T-095 |
| T-106 | **Open in editor** — each Ask answer carries an "Open in editor" chip: the response lands in a fresh sandbox document (titled from the request) and opens on the Editor canvas — the existing create + patch endpoints, no new contract. *(Owner, 2026-07-13.)* | T-105 |
| T-107 | **Style chip (placeholder)** — a Style chip on the composer source row: ask the agent to respond in a predetermined style set by the project/organisation. Ships honest per the T-100 pattern; the styles model itself (who defines them, org vs project scope, where they live — the org-knowledge adjacency) is a design session with the owner on the tracker. *(Owner, 2026-07-13.)* | T-100 |
| T-108 | **History** — a History rail item: the log of the requester's own prompted turns on the project (Ask chats and agent use in a document alike), newest first, self-scoped by construction (the T-104 producer-private read is not widened). New `GET /projects/:id/history`; an Ask entry reopens its conversation in place (`?conversation=`, over the existing conversation read); a document entry opens the document in the Editor. The run row names no document — a turn's document is read off its suggestions (residual, tracker). *(Owner, 2026-07-13.)* | T-104 |
| T-109 | **Workflows → Tools (owner-ruled 2026-07-13)** — the surface renames: a **tool** is the packaged, launchable capability (the minimal tool is one workflow with a name); a **workflow** stays the engine's term for the codified sequence a tool runs (`packages/workflows`, ADR-0026/0027 unchanged). Nav item, routes, empty states and workspace section renamed; the tool-scoping ruling (Infora-standard / org-built travelling with the org across the wall / individual org-visible in MVP — tiers 2–3 collapse to provenance + owning org + creator) recorded on the tracker, folded into the Slice F builder theme. | T-093 |
| T-110 | **One web app (owner-ruled 2026-07-14)** — `apps/web-consultant` renames to `apps/web` (`@infora/web`): it was always one app with role-scoped views (the owner logs into the same rail and screens; T-060 built the owner read as a role switch here, and T-104 retired the only owner-specific screen), so the name's implied per-persona app boundary was a fossil of the Phase 5 framing. The formerly planned `web-owner` portfolio split is **superseded** — the owner portfolio ("control tower") is a view within `web`, per component 8's own "same home with a portfolio switcher" line; its design stays an open component-8 question. Docs, dep matrix and e2e config aligned; the client-owner login already exists in the seed (Rachel Bowen, Trentmoor Energy). | T-050 |
| T-111 | **Sign out** — the skeleton auth (T-021) had a login and no exit. `DELETE /auth/session` clears the cookie (idempotent, unauthenticated by design — the cookie *is* the session, stateless, so there is nothing server-side to invalidate; real session revocation arrives with production identity, the Entra-first infra session); a Sign out action lands in personal settings, returning to the login screen. *(Owner-noticed gap, 2026-07-14.)* | T-092 |
| T-112 | **Editor comments (owner-ruled 2026-07-18)** — Word-style comment threads on the sandbox document: select text (or none) → comment; threaded replies; `@`-mention of project participants; any entitled participant closes/reopens a thread. A "suggested edit" is prose in a comment, resolved by a colleague editing the canvas manually and closing the thread — Suggestion/Signal stay agent-only (Drawer 4 untouched, moat data clean). New **Sandbox comment** entity (data-model Drawer 2): mutable like the sandbox, advisory quoted-span anchor per the Suggestion pattern, distinct from the DRR Comment (Drawer 5, Slice A). Mention *delivery* (notifications) parked on the tracker; mentions render as highlights only. | T-098 |

### Parallel tracks

Sequential spine: **T-001 → T-003/T-009 → migrations → T-020 → T-030 → T-041 → T-046 → T-082 → T-053 → T-080.** Off the spine, these run concurrently: T-010 (model), T-002 (CI), T-083 (config/bootstrap) and T-049 (UI tokens from the mockups) from day one; T-050/T-051 (scaffold + sandbox surface) once contracts and the skeleton auth exist (T-009/T-021 — shell work can begin earlier against a stubbed session), well before M3 completes; T-084 (e2e harness) beside M4; T-085 then T-070 (Copilot enablers + manifest) once T-046 is stable; T-012 (ingestion) beside M1.

**UI track:** the visual spec lives in [docs/design/mockups/](../design/mockups/index.html) — eight Legora-clean screens (third cut, 2026-07-06: workspace landing, project home, Ask chat, Editor with chat + suggestion panel, foldered library, sandbox, review, owner run-audit), restructured to the owner's wireframes and the surfaces-alignment rulings (grill tracker session record), benchmarked on the observed Legora UI review ([docs/reference/legora-ui-review.md](../reference/legora-ui-review.md)). The project nav is Home · Ask · Editor · Documents · Review · Sandbox · Tools · History (Workflows renamed Tools, T-109; History added, T-108); Knowledge is staged with the moat slices (component 8 §6). The alignment session is closed (all items ruled 2026-07-06 — grill tracker session record). Post-skeleton screens (DRR/PDF review, plan builder, portfolio, add-in pane) are mocked when their slice starts.

---

## Slice A — Document management: the controlled lifecycle *(ticketed 2026-07-18)*

> **Status: ✅ built, T-113–T-129 all landed 2026-07-18** (one autonomous session; every ticket its own verified commit, CI green throughout). The T-129 acceptance suite drives the whole journey: plan → consolidate/confirm → draft → freeze → org-private internal QA → promote the QA-accepted frozen version → rounds/comments/codes → issue → respond → v2 → accept → library + grounding; plus the rejected pathway and the wall negatives. **Honest deviations & follow-ups:** review reads happen against the frozen version's text with the PDF rendition downloadable — the in-PDF anchored viewer (pdf.js) is the noted follow-up; the internal cycle launches when the freeze container carries a confirmed lead reviewer (no separate launch endpoint); drawer-5 comments landed as the `review_comments` table (clearer beside `sandbox_comments`); T-123/T-124/T-126's API halves shipped in one commit and their surfaces in T-127's cycle page; transmittal "notifies recipients" is a recorded fact, not delivery (the parked notification model); post-acceptance promotion opens a new revision cycle (pinned in tests); office→PDF conversion for uploads waits on the infra converter.

*Design session closed 2026-07-18 → ADRs 0032 (two-scope role-agnostic cycle), 0033 (per-org plans, appointment grants, administration), 0034 (canonical format, renditions); the data model's Drawers 1/2/3/5 are the table spec. Mockups for the new surfaces (plan builder, DRR table, PDF review) are drawn per-ticket as each surface starts, benchmarked on the ProjectWise friction map (docs/reference) — "no wizard" is the standing acceptance test for promote and freeze. The T-112 participants endpoint widens to the project roster per ADR-0033 (in T-117).*

**Migrations & contracts (the drawer made real):**

| # | Ticket | Deps |
|---|--------|------|
| T-113 | **Migration: access administration (Drawer 1, ADR-0033)** — `users.org_role`; Membership `state`/`added_by`/`created_at`; Participant `added_by`/`created_at`/`removed_at`; seed names an org admin per organisation; tests: closing a Participant interval revokes nothing retroactively. | — |
| T-114 | **Migration: the documents drawer rebuilt (Drawer 2, ADR-0032/0034)** — Container `scope`/`producing_organisation_id`/nullable `document_reference`/`sandbox_document_id`/`state += rejected`/`metadata`; **Rendition**; Sandbox document `origin`/`kind`/`format`/`file_ref`/`container_id`/`head_locked`; **Sandbox document version** (ambient); seed containers backfilled (library scope, producing org). | T-113 |
| T-115 | **Migration: the review drawer (Drawer 5, ADR-0032/0033/0003)** — Review cycle, Round (**one open per cycle as a partial unique index**), Transmittal, Review snapshot, Comment, Response, **Acceptance code** (default scheme copied per project at creation; retire-never-redefine), Deliverable author/reviewer (interval grants, reviewer `confirmed_*`); `work_items.container_id`; append-only triggers on the new record tables; seed: scheme + both sides granted on a seed container. | T-114 |
| T-116 | **Contracts: Slice A** — contracts.md sections + `packages/contracts` schemas: plan/containers, roster + appointments (propose/confirm), administration (enrol/remove, membership propose/confirm), promote/freeze, cycle/round/transmittal/comment/response/codes, renditions, history-safe reads. | T-115 |

**Administration & the plan (TIDP → MIDP):**

| # | Ticket | Deps |
|---|--------|------|
| T-117 | **Access administration + the roster** — org-admin enrol/remove of own users on member projects (interval close auto-revokes live grants); owner membership propose→confirm; the roster read project-visible per ADR-0033 (widens T-112's org-scoped picker); admin surface in settings. | T-116 |
| T-118 | **The deliverable plan (producing-org TIDP)** — plan view per org: create planned rows (empty Containers: coded reference, `metadata`, authoring team, reviewers *proposed* from the roster); a `document_production` Work item auto-created per row (status `planned` — event-driven from here on); plan-builder mockup drawn first. | T-117 |
| T-119 | **The MIDP consolidation (owner)** — the consolidated schedule across all orgs' plans; reviewer confirmation (share-first enforcement, ADR-0015); per-deliverable sharing entry points; the Documents view gains the derived metadata columns (reference/revision/state/originator/verdict — query, not duplication). | T-118 |

**The trigger path:**

| # | Ticket | Deps |
|---|--------|------|
| T-120 | **Promote** — from the Editor/Sandbox into the linked waiting container (the button finally enables): near-empty hand-off, head snapshot → immutable Version, cycle launched (sides read from the grant tables), round 1 opened by the transmittal, lock to the reviewers, work item → `in_review`. "No wizard" is the acceptance test. | T-116, T-118 |
| T-121 | **Renditions** — the generation pipeline per Version: PDF from authored structured text, docx export (house-style config later), uploaded natives passed through as their own native rendition; stored on the dev substrate (blob dir; the infra session owns real storage); pptx as an honest placeholder until the slides editor exists. | T-120 |
| T-122 | **Upload to the sandbox** — drag-and-drop native files (docx/xlsx/pptx): `origin = uploaded`, file stored, PDF render for viewing; "Open in editor" converts to authored (text import, original preserved in ambient history, fidelity honest — ADR-0034). | T-114, T-121 |

**The round loop:**

| # | Ticket | Deps |
|---|--------|------|
| T-123 | **The review surface: round, DRR, anchored comments** — the reviewer reads the frozen version's PDF (viewer with text-highlight/point anchors — the big screen; mockup first), writes anchored comments with per-comment codes; live cross-org visibility within the group; the open round hidden from the authoring side (ADR-0014); the DRR table beneath. | T-120, T-121 |
| T-124 | **Issue & respond** — the lead reviewer closes and issues (transmittal: audit facts, snapshot frozen, closed round revealed, lock flipped); authors write Responses (mandatory next-version link or no-change-with-reason); the lead author promotes vN+1 (transmittal back, round N+1 opens, lock returns). | T-123 |
| T-125 | **Freeze & the internal cycle** — check-out freeze (sandbox-scope container auto-created, head locked while a round is open, audited early release); the org-private internal cycle on the same machinery and PDF path; a QA-accepted frozen version becomes promotion's second legal source (ADR-0032). *The parked sandbox-scope surface question (frozen native text vs PDF) stays open as a later refinement — this ships on the PDF path unchanged.* | T-124 |
| T-126 | **Acceptance & close-out** — an `is_accepting` deliverable code closes the cycle and work item, auto-admits to the library (`in_library`, chunk + embed the accepted version — it starts grounding), supersedes the prior; the rejected path (explicit audited close by lead author or owner → container `rejected`, never grounds); owner supersede/withdraw actions. | T-124 |
| T-127 | **The work-item page & Review view rebuilt** — the review-cycle reflection at last: event-driven status per phase, per-role click-throughs (consultant → the linked draft; reviewer → the open round; owner → the MIDP row); the Review page's promised rounds/lock/due-date columns (T-103) go live. | T-126 |
| T-128 | **Ambient history & safe lifecycle** — auto-snapshots at save boundaries, browse + restore in the Editor; soft-delete with self-service restore for sandbox documents (the ProjectWise A1/A3 fold-in — recovery is never a helpdesk ticket). | T-114 |
| T-129 | **Slice A acceptance e2e** — the full journey as one suite: plan (TIDP) → consolidate + confirm reviewers (MIDP) → draft → freeze → internal round → QA-accept → promote → round 1 comments + codes → issue → respond → promote v2 → accept → library + grounding; negatives: the internal cycle invisible across the wall, the open round hidden from authors, a rejected deliverable never grounds, a removed participant's grants close but their comments stand. | T-125, T-126, T-127, T-128 |
| T-130 | **The in-PDF anchored review viewer** — the noted T-129 follow-up made real (ADR-0004/0006): the cycle page renders the frozen version's PDF rendition per round with pdf.js (worker bundled local, no CDN), not text-first. While the round is open a reviewer anchors a comment by selecting text on the PDF (page + quoted text + normalised quads) or dropping a point (page + x/y); comments paint as highlight overlays from the STORED anchor — never a sidecar — with list↔region hover; issued rounds paint the same overlays read-only, permanently; each round paints only its own version's PDF (`round.versionId`); the text fallback stands for versions with no PDF rendition (uploaded natives pre-converter), noted honestly. | T-123, T-127 |

---

## The roadmap after the skeleton (coarse — ticketed when its slice starts)

Ordered by the wedge-first logic of the overview; each slice names its design gate from the [grill tracker](../grill-sessions/grill-questions.md). Nothing here is execution-ready by design.

**Slice A — Document management: the controlled lifecycle** — ✅ **designed (ADRs 0032/0033/0034, 2026-07-18) and ticketed: T-113–T-129 above.** The review-cycle entry surface was already mocked ([review.html](../design/mockups/review.html)); the DRR table, PDF viewer and plan-builder mockups are drawn per-ticket as each surface starts.

**Slice B — The Word add-in** *(design settled, component 8).* The consultant authoring surface: tracked-changes suggestions with citation + rationale, accept/edit/reject as Signals, central M365 deployment. Needs Slice A's promotion path to be fully useful, but drafting on sandbox documents can land earlier.

**Slice C — Governance depth** *(part open: threshold tuning, retention/export — bucket A).* Rails as scoped records with the ADR-0030 intersection engine, grounding-threshold calibration, withheld-output UX, audit retention/export, user-UI-action audit sense.

**Slice D — Retrieval maturity** *(gate: Session 6 finish).* Contextual retrieval ("x in the context of y"), real channel ranking and budget, org-vs-programme precedence, per-viewer citation rendering — behind the unchanged ADR-0029 signature.

**Slice E — The moat loop** *(gate: Sessions 4, 5, 7 — must-grill, the cross-org confidentiality forks).* Org/programme context stores and drawers, the distillation engine with the ADR-0026 destination rule, precedent selection, the Signal sink, guidance notes (ADR pending), and the ADR-0026 within-tenant/cross-tenant training reconciliation flagged in the tracker.

**Slice F — Build-your-own** *(gate: Engine §5 opens — builder interface, tightening validation, sharing).* Custom tools (the Tools surface, T-109) and org-built agents: authoring through the builder in Tools, org-context storage, deploy-time rails inheritance, pre-deploy validation. The tool-scoping ruling (2026-07-13) and the wall-clean-definition stress test are on the tracker's builder theme.

**Slice G — Breadth surfaces** *(bucket A, reference-decidable).* Workspace home vs project home layout, the owner/client portfolio "control tower", programme views, mobile scope.

**Slice H — Connectors** *(deferred until the wedge is proven).* Integrate-configuration handover to an incumbent DMS; spatial/CAD/BIM by reference.

**Gate before any external pilot — the infra/security decision session** *(bucket C, component 1).* Cloud provider, blob/object storage for renditions, hosting and deployment, encryption and key management, tenant isolation, residency, production identity (replacing the skeleton auth above). The skeleton deliberately runs on the dev substrate until this is held.
