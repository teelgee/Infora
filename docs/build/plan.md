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
| T-218 | **CSRF ruling + enforcement (ADR-0043)** — *awaiting the owner ruling*; enforcement lands with it. | — |
| T-219 | **Minimal observability** — request IDs, structured logs, `/health`. | — |

*The design-gated items from the same review (the NFR one-pager, certification targets, the DB-level wall backstop) go to the grill tracker and the infra/security session, not this board.*

---

## The roadmap after the skeleton (coarse — ticketed when its slice starts)

Ordered by the wedge-first logic of the overview; each slice names its design gate from the [grill tracker](../grill-sessions/grill-questions.md). Nothing here is execution-ready by design.

**Slice B — The Word add-in** *(design settled, component 8).* The consultant authoring surface: tracked-changes suggestions with citation + rationale, accept/edit/reject as Signals, central M365 deployment. Needs Slice A's promotion path to be fully useful, but drafting on sandbox documents can land earlier.

**Slice C — Governance depth** *(part open: threshold tuning, retention/export — bucket A).* Rails as scoped records with the ADR-0030 intersection engine, grounding-threshold calibration, withheld-output UX, audit retention/export, user-UI-action audit sense.

**Slice D — Retrieval maturity** *(gate: Session 6 finish).* Contextual retrieval ("x in the context of y"), real channel ranking and budget, org-vs-programme precedence, per-viewer citation rendering — behind the unchanged ADR-0029 signature.

**Slice E — The moat loop** *(gate: Sessions 4, 5, 7 — must-grill, the cross-org confidentiality forks).* Org/programme context stores and drawers, the distillation engine with the ADR-0026 destination rule, precedent selection, the Signal sink, guidance notes (ADR pending), and the ADR-0026 within-tenant/cross-tenant training reconciliation flagged in the tracker.

**Slice F — Build-your-own** *(gate: Engine §5 opens — builder interface, tightening validation, sharing).* Custom tools (the Tools surface, T-109) and org-built agents: authoring through the builder in Tools, org-context storage, deploy-time rails inheritance, pre-deploy validation. The tool-scoping ruling (2026-07-13) and the wall-clean-definition stress test are on the tracker's builder theme.

**Slice G — Breadth surfaces** *(bucket A, reference-decidable).* Workspace home vs project home layout, the owner/client portfolio "control tower", programme views, mobile scope.

**Slice H — Connectors** *(deferred until the wedge is proven).* Integrate-configuration handover to an incumbent DMS; spatial/CAD/BIM by reference.

**Gate before any external pilot — the infra/security decision session** *(bucket C, component 1).* Cloud provider, blob/object storage for renditions, hosting and deployment, encryption and key management, tenant isolation, residency, production identity (replacing the skeleton auth above). The skeleton deliberately runs on the dev substrate until this is held.
