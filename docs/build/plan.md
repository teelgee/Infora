# Build plan — the ticket board (Phase 5)

**Contents:** [How to read a ticket](#how-to-read-a-ticket) · [Skeleton auth](#-one-named-build-time-decision--skeleton-auth) · [Slice S — Enterprise hardening & docs hygiene](#slice-s--enterprise-hardening--docs-hygiene-ticketed-2026-07-25) · [The roadmap after the skeleton](#the-roadmap-after-the-skeleton-coarse--ticketed-when-its-slice-starts)

> **Closed slices live in [plan-history.md](plan-history.md)** — the full verbatim record of every ✅ slice (the walking-skeleton milestones M0–M6, the Phase 7 QA batch, Slices A–A2.6). This board carries only what is open or ahead. **Standing convention: when a slice closes (✅), its block moves to plan-history.md in the same commit.**

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

## Slice S — Enterprise hardening & docs hygiene *(ticketed 2026-07-25)*

> **Status: 🔨 T-206–T-214 and T-216–T-219 ✅ built 2026-07-25** (three parallel agent runs, one verified commit per ticket; `pnpm audit --prod` now clean and gating CI; e2e 43/43 green). Open: **T-215** (doc reconciliations — needs the owner read-through). **Deviations:** T-207 — `react-router-dom` v8 doesn't exist, the package consolidated into `react-router@8`; imports rewritten, React bumped to 19.2.8 for the peer range. T-217 — the e2e substrate raises the rate limits (the harness logs in ~40× from one IP); production defaults unchanged. T-218 — filed as **ADR-0044**: 0043 was taken the same day by the WOPI-host ADR (Slice A3). The design-gated rulings (CSRF, RLS backstop, cert targets, NFR strawman → [nfr.md](nfr.md)) are recorded in the grill tracker's pre-infra-session block.

The first hardening pass and the docs catch-up, batched: small, mostly independent tickets closing known gaps before any external eye lands on the repo.

| # | Ticket | Deps |
|---|--------|------|
| T-206 | **`SESSION_SECRET` required, no default** — the API refuses to boot without an explicit secret; the baked-in dev fallback goes. | — |
| T-207 | **Dependency upgrades** — `react-router` ≥ 8.3.0, `@hono/node-server` ≥ 2.0.5. | — |
| T-208 | **`pnpm audit` in CI** — the audit runs on every PR; a failing audit fails the build. | — |
| T-209 | **Untrack `.DS_Store`** — remove the tracked files, ignore the pattern. | — |
| T-210 | **plan.md catch-up + board/history split** — T-191–T-205 recorded; every closed slice moves to [plan-history.md](plan-history.md); this slice ticketed. | — |
| T-211 | **TOCs for the three big docs** — a linked table of contents under the H1 of `CONTEXT.md`, `contracts.md` and this board. | — |
| T-212 | **CLAUDE.md orientation rewrite** — a real ~40-line orientation file: what Infora is, the reading path, the working rules; the `.tldr` diagrams rule carried over verbatim. | — |
| T-213 | **Status-marker legend** — the ✅ / 🔨 / 🟢🟡🔴 legend in [docs/build/README.md](README.md); inconsistent marker usage aligned. | — |
| T-214 | **`.tldr` → PNG converter** — the planned local renderer (parse the JSON, rasterise with the Chromium already under `e2e/`; no tldraw, no network) so a diagram is readable on demand. | — |
| T-215 | **Doc reconciliations** — `repo-structure.md` out of provisional; the ADR-0023 / component-doc reconciliation. *Needs an owner read-through.* | — |
| T-216 | **CORS + security headers** — an explicit origin allowlist and the standard security-header set on the API. | — |
| T-217 | **Rate limiting** — the auth and model endpoints throttled. | — |
| T-218 | **CSRF ruling + enforcement (ADR-0044)** — ruled 2026-07-25: SameSite=Lax + a JSON content-type gate on bodied writes, an Origin/Sec-Fetch-Site check on the multipart upload path; token upgrade named for the infra session. | — |
| T-219 | **Minimal observability** — request IDs, structured logs, `/health`. | — |

*The design-gated items from the same review (the NFR one-pager, certification targets, the DB-level wall backstop) go to the grill tracker and the infra/security session, not this board.*

---

## The roadmap after the skeleton (coarse — ticketed when its slice starts)

Ordered by the wedge-first logic of the overview; each slice names its design gate from the [grill tracker](../grill-sessions/grill-questions.md). Nothing here is execution-ready by design.

**Slice A3 — Co-authoring & the editing substrate: Infora as a WOPI host, native Office files co-authored in real Microsoft Office** — 🎯 **designed 2026-07-25 (ADR-0043 + amendments to 0034 / 0036 / 0039 / 0041); P1 ticketed (T-220–T-222 — renumbered 2026-07-25: the drafted T-208–T-210 were already taken by Slice S), P2–P4 coarse until the CSPP / engine track is live.** The sandbox becomes a true SharePoint / iManage-style working area: drop a draft, open it in Word / Excel / PowerPoint, co-author, and have edits sync straight back — files never leaving Infora. The incumbent-validated posture (iManage Work co-authoring; NetDocuments CollabSpaces — both keep files in their own DMS and become WOPI hosts, renting Office co-authoring via Microsoft's CSPP). Infora stays the system of record and the ethical-wall authority; the SharePoint-as-substrate route was considered and rejected (per-org tenancy collides with the cross-org wall — ADR-0043). Grounding is untouched (library-only; the sandbox never grounds).

**External dependency (owner-driven, gates go-live not the build):** the **Microsoft CSPP application** — real-Office co-authoring cannot ship until Microsoft approves. The WOPI host (P2) is built and validated against a self-hosted dev-harness engine (Collabora / OnlyOffice) meanwhile, then pointed at Microsoft Office at approval (P3). P1 has no Microsoft dependency and ships regardless.

*P1 — DMS parity (no Microsoft dependency, ship now):* **✅ T-220–T-222 built 2026-07-26** (one verified commit per ticket; api 175/175, e2e 44/44 green). Deviations: rename is **allowed while checked out** (owner-confirmed — a title is author-owned metadata, not canonical content; the T-166 precedent), so only Replace surfaces the head-lock refusal; upload now seeds a genesis ambient revision so a fresh upload reads `v0.1` and the first replace increments to `v0.2`; the `/file` path joins `sandbox-uploads` on the CSRF multipart allowlist (ADR-0044).
- **T-220 — Contracts + API: sandbox document rename + replace-native-file.** Close the two gaps found this session: a sandbox document has no rename path (the PATCH bodies only carry `content` / `authoringMetadata`), and an uploaded file cannot be replaced. Add rename (`title`) — allowed on an unbound document; a bound document's display name stays the container's (ADR-0038). Add `POST /sandbox-documents/:id/file` (multipart) replacing the canonical native file with a new upload of the same format family — writes a new blob + `file_ref`, bumps the working revision; **refused while `head_locked`** (it rewrites canonical content, like the T-122 conversion) and only for `origin='uploaded'`. Durable prior-blob retention is P2 (noted). | *(Deps: T-122, T-166)*
- **T-221 — Surface: rename & replace-file actions in the sandbox drawer.** Per-document row/context actions in the folder view (reusing the T-163 `Modal`): **Rename** (text field) and **Replace file…** (file picker, `origin='uploaded'` only), each surfacing the head-lock refusal cleanly; the row shows format + last-updated. No `window.prompt`, semantic tokens only (the standing A2.1 acceptance tests). | *(Deps: T-220, T-163)*
- **T-222 — P1 acceptance e2e.** Upload a docx → rename it → replace it with a new docx (working revision increments, history shows it) → check out (freeze) → replace is refused while locked → release → replace succeeds. | *(Deps: T-220, T-221)*

*P2 — the WOPI host + embedded co-authoring* **(coarse — ticketed when the engine track starts).** Migration for the WOPI item/lock refs (reusing `head_locked` / `sandbox_checkout_events`) and the `file_ref` pointer extension; the WOPI host endpoints (`CheckFileInfo` / `GetFile` / `PutFile` / lock) with access gated by `sandbox_scope_grants`; `PutFile` → a `v0.x` ambient working revision (ADR-0041); the embedded editor pane in the sandbox drawer; the dev-harness engine (Collabora / OnlyOffice) provisioned as the first real infra dependency (ADR-0037 / the infra session). Acceptance: open → co-edit → save-back → new working version, plus the wall negative (revoke drops editor access in-transaction).

*P3 — CSPP → real Microsoft Office* **(coarse; gated on the CSPP approval).** Swap the P2 dev-harness engine for genuine Microsoft Office for the web behind the same WOPI host; desktop co-authoring is a later CSPP milestone.

*P4 — the Infora agent as an Office Add-in* **(coarse; converges with Slice B below).** The task-pane Add-in that grounds against the **library** from inside Office via `groundedLibrary(slice)` — the draft (read from Office.js) fused with the grounded record, in one surface. Shares its surface with Slice B's Word add-in; design not settled (ADR-0043 open item).

**Slice B — The Word add-in** *(design settled, component 8; converges with Slice A3 P4).* The consultant authoring surface: tracked-changes suggestions with citation + rationale, accept/edit/reject as Signals, central M365 deployment. Needs Slice A's promotion path to be fully useful, but drafting on sandbox documents can land earlier.

**Slice C — Governance depth** *(part open: threshold tuning, retention/export — bucket A).* Rails as scoped records with the ADR-0030 intersection engine, grounding-threshold calibration, withheld-output UX, audit retention/export, user-UI-action audit sense.

**Slice D — Retrieval maturity** *(gate: Session 6 finish).* Contextual retrieval ("x in the context of y"), real channel ranking and budget, org-vs-programme precedence, per-viewer citation rendering — behind the unchanged ADR-0029 signature.

**Slice E — The moat loop** *(gate: Sessions 4, 5, 7 — must-grill, the cross-org confidentiality forks).* Org/programme context stores and drawers, the distillation engine with the ADR-0026 destination rule, precedent selection, the Signal sink, guidance notes (ADR pending), and the ADR-0026 within-tenant/cross-tenant training reconciliation flagged in the tracker.

**Slice F — Build-your-own** *(gate: Engine §5 opens — builder interface, tightening validation, sharing).* Custom tools (the Tools surface, T-109) and org-built agents: authoring through the builder in Tools, org-context storage, deploy-time rails inheritance, pre-deploy validation. The tool-scoping ruling (2026-07-13) and the wall-clean-definition stress test are on the tracker's builder theme.

**Slice G — Breadth surfaces** *(bucket A, reference-decidable).* Workspace home vs project home layout, the owner/client portfolio "control tower", programme views, mobile scope.

**Slice H — Connectors** *(deferred until the wedge is proven).* Integrate-configuration handover to an incumbent DMS; spatial/CAD/BIM by reference.

**Gate before any external pilot — the infra/security decision session** *(bucket C, component 1).* Cloud provider, blob/object storage for renditions, hosting and deployment, encryption and key management, tenant isolation, residency, production identity (replacing the skeleton auth above). The skeleton deliberately runs on the dev substrate until this is held.
