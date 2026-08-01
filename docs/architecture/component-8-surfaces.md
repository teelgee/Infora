# Surfaces (component 8)

Surfaces are the interfaces where people and agents meet: the workspace home, the project home (with the left project nav rail), the document-management interface, the consultant workspace (chat plus editor), the owner/client portfolio view (the generalised "control tower"), the Word add-in, and the Microsoft 365 Copilot integration. The principle is to meet users where they already work. The project is the context everything sits inside; the command bar is the agent entry; each **tool** is its own launchable surface (Workflows renamed Tools, owner-ruled 2026-07-13/T-109: a tool is the packaged capability a user launches — the minimal tool is one workflow with a name — while *workflow* stays the engine's term for the codified sequence it runs).

The left rail carries the project switcher, the sections (Home, Ask, Editor, Documents, Review, Sandbox, Tools, History — as built at T-109; Knowledge is staged with the moat slices), and the firm-scoped user. The owner sees the same home with a portfolio switcher above the project. All surfaces reuse one typed API (`contracts`) so new surfaces add without divergence and inherit orchestration, context, capabilities, governance, audit and access scoping rather than re-implementing any of it.

The **Word add-in** is cross-cutting and recorded explicitly here and in document management (component 5), because it is both a surface and the consultant authoring surface. It is a **thin client**: a task-pane web app (Office.js plus a manifest) with no intelligence locally, calling the same API as every other surface. On open it resolves which project the document belongs to. Its job is **governed editing**: agent changes land as native Word tracked changes carrying a citation and rationale, never silent rewrites; the user accepts, edits or rejects using Word's own review controls, and that resolution is the **Signal**. It is a consultant authoring surface, not a reviewer capture path — reviewers comment on the PDF in Infora's own viewer (ADR-0004), so the add-in does not capture review comments in build 1. Deployment is a GTM lever: Office add-ins push centrally through the M365 admin centre, so an owner can roll Infora out to every appointed consultant at once.

The component is **partly grilled**. Settled: the **Word add-in** (the drafting/Signal surface) and the **Microsoft 365 Copilot integration → ADR-0031** (the external read-only Ask surface, one project bound per conversation). Open: workspace home versus project home (layout and what lives where), the owner portfolio view design, mobile scope, and the boundary between the document-management interface (component 5) and the generic project surfaces. Open questions are tracked in the grill doc.

---

## Sub-component register

The structural breakdown of the surfaces component into its build-able parts. Five artefacts divide the labour and this register is one of them: `CONTEXT.md` is the **language** (the glossary); the [overview](infora-overview.md) is the **vision** and whole-system map; this component doc is the **structure** (the prose above and the register here); `docs/adr/` holds the **decisions** (why each fork went the way it did); and the [grill tracker](../grill-sessions/grill-questions.md) is the **process log and open-questions backlog**. The register references the others rather than restating them.

The cut is by **surface**: the distinct places a user meets the system. All share one typed API.

**Cross-cutting, true of every surface below.** Every surface is a thin client over one typed API (`contracts`) and resolves nothing locally — orchestration, context, capabilities, governance, audit and access scoping all live behind the API. Access is resolved by the access model (component 2) before any data is shown.

---

## 1. Workspace and project home

**Responsibility.** Provide the org's workspace home and each project's home with the left nav rail (Home, Ask, Editor, Documents, Review, Sandbox, Tools, History — T-109; Knowledge staged) and project switcher; decide the layout and what lives at workspace versus project scope.
**Governing ADRs.** **Open.**
**Terms owned.** None uniquely; surfaces Workspace, Project (access model, component 2).
**Depends on.** Access model (component 2); all components below the surface.

## 2. Consultant workspace (chat + editor)

**Responsibility.** Provide the command-bar agent entry, the chat (Ask), the editor where drafts appear with citations, and each workflow as its own launchable surface.
**Governing ADRs.** **Open.**
**Terms owned.** None uniquely.
**Depends on.** The Engine (component 6) for workflows and the chat/QA path; Context (component 4); governance (component 3) for citation rendering.

## 3. Owner / client portfolio view

**Responsibility.** Provide the owner/client home with a portfolio switcher above the project — the generalised "control tower" across a programme or owned set.
**Governing ADRs.** **Open.**
**Terms owned.** None uniquely.
**Depends on.** Access model (component 2) for ownership and programme grouping; document management (component 5) for work-item status.

## 4. Word add-in

**Responsibility.** Be the thin-client consultant authoring surface: resolve the document's project on open; land agent changes as native tracked changes with citation and rationale; capture accept/edit/reject as the Signal; not capture review comments in build 1.
**Governing ADRs.** 0004 (PDF review is the reviewer path, not the add-in).
**Terms owned.** None uniquely; produces the Signal (document management, component 5).
**Surfaces.** Office.js task pane plus manifest; centrally deployable via M365 admin.
**Depends on.** The same API as every surface; document management (component 5) for the document; Context and governance for the assisted edit.

## 5. Microsoft 365 Copilot integration

**Responsibility.** Be the external thin-client Ask surface: a declarative agent published to M365 Copilot (tagged `@Infora`) plus an API plugin (OpenAPI/REST or MCP) calling the same API; map the Entra ID SSO identity to an Infora Participant; bind the Copilot conversation to exactly one project environment; return grounded, cited answers. Read-only in v1 — no drafting, no Signal capture (the Word add-in keeps that role).
**Governing ADRs.** **0031** (Copilot as an Ask surface; one project bound per conversation; wall holds via the ADR-0029 gateway). Reuses 0028 (Ask = Run in a Conversation, no Work item), 0029 (assembly gateway), 0025 (one environment per request).
**Terms owned.** None uniquely; surfaces the Ask path (the Engine, component 6).
**Surfaces.** M365 declarative-agent manifest + API-plugin definition; centrally deployable via M365 admin (the same GTM lever as the add-in).
**Depends on.** The same API as every surface; the Engine (component 6) for the chat/QA path; Context (component 4) for the assembly gateway; access model (component 2) for the Entra-mapped Participant; governance (component 3) for citations and audit.

## 6. Knowledge (the context layer's surface)

**Responsibility.** Be the rail section for everything that shapes work but is not the controlled record (definition agreed 2026-07-06, recorded in the [overview](infora-overview.md)). In a project: **sources outside the library** (ingested; channel retrieval never pulls them automatically, though a user may pin one to a single generation as an **attached source** with a user-supplied marker, ADR-0022 — owner admission to the library is the only route to standing groundability); **guiding material** (templates, style guides, guardrails — the guiding channel); **distilled Knowledge** with its Signals and derived improvements (Sessions 4/7, post-MVP); and the **authority shelf** — the universal authority corpus, browsable and citable, licence-gated, Infora-maintained. In the workspace: the org's precedents, know-how, and the ADR-0026 curation queue. Surface placement does not set channel role: the authority shelf is a **grounded corpus** (cited as external authority, ADR-0021); the grounded channel's two corpora live on two surfaces — the library under Documents, the authority shelf here.
**Governing ADRs.** 0021 (channel roles), 0022 (attached source), 0023 (authority register, dual-purpose), 0026 (curation queue). Distillation/Signal surfaces gated on Sessions 4/7.
**Terms owned.** None uniquely; surfaces Knowledge, Source, Precedent (Context, component 4), the Authority corpus (component 4 §8) and Attached source (component 4 §3). Note the deliberate word overload: the *section* named Knowledge shows more than the *term* Knowledge (the curated store) — revisit the label if it confuses.
**Depends on.** Context (component 4) for all content; access model (component 2); document management (component 5) for the add-to-library promotion action.
**Staging.** Not in the walking-skeleton nav; the section arrives with the moat slices (plan.md Slice E), except the owner's "add reference material" action, which lives on the library (ADR-0011) and needs no Knowledge section.

## 7. Notifications

**Responsibility.** Tell a user that something happened which they need to know about. A **notification** is a persisted, event-shaped record — recipient, event type, a reference to its subject, a read state — surfaced in-app as an unread indicator and a recency-ordered list. **The in-app list is the surface of record; email is only a nudge toward it.**

Three properties are load-bearing and belong to this component to enforce, because the leak they prevent arrives through a surface nobody thinks of as a data surface:

- **Visibility follows the subject.** A notification is resolved through the same access path as the thing it points at, and is never a channel by which a fact reaches someone who could not otherwise reach it (ADR-0018).
- **Email carries a pointer and a bare fact, never content** — not the comment text, not a finding's text, and never a quoted rulebook clause, which ADR-0048 §6 made org-private. An email leaves the platform into a mailbox where access resolution no longer applies, survives revocation, and can be forwarded outside the organisation.
- **Access resolves at send time, not enqueue**, or ADR-0024's revoke-in-the-same-transaction guarantee reopens in the one medium that cannot be recalled.

**Governing ADRs.** **0049**; 0018 (the wall), 0024 (revoke), 0047 §16 (Amazon SES as the transport), 0048 §6 (org-private quoted rules).
**Terms owned.** Notification.
**Depends on.** Access model (component 2) for the visibility resolution; document management (component 5) for the round and comment subjects; foundation (component 1) for the transport.
**Staging.** The pilot set is **`round-issued` + `@-mention`**; lock-flipped and any later event type join without a schema change (ADR-0049 §2's explicit guard). Per-event preferences, digests and batching are deliberately unbuilt at pilot scale.

---

## Deferred or handed to other components

- **The document-management interface internals** (plan builder, PDF viewer, DRR table). Owned by document management (component 5); surfaces hosts them but the boundary is open.
- **Mobile.** Scope open.
- **Signal capture semantics.** The add-in produces the Signal; its sink is Context (component 4) / document management (component 5).
- **Open questions** — workspace-vs-project layout, portfolio view design, mobile, the component-5 boundary — are tracked in the grill doc.

## Repository mapping

Surfaces are the apps: `web` (the one web app, role-scoped views — workspace + project home, editor, chat, review, and the owner's review-cycle read; renamed from `web-consultant` and superseding the planned `web-owner` split, T-110, 2026-07-14 — the owner sees the same app, the portfolio is a view within it, not a second app), `word-addin` (Office.js task pane, later) and `copilot-agent` (the M365 declarative-agent manifest + API-plugin definition). They depend only on `contracts` and `ui` and never reach below the API. See the build layer's repo-structure, the app-architecture diagram, and the Word add-in data-flow diagram.
