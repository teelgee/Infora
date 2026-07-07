# Data model — the walking skeleton (first cut)

> **Status: first cut, 2026-07-01; draft-location item closed 2026-07-04.** This is the `CONTEXT.md` glossary drawn as **stored tables** — the things the database remembers — scoped to the walking-skeleton journey and nothing wider. It is drawn *drawer by drawer*: only the entities the first build slice touches. Deferred concepts (programme context, the org-context/Knowledge stores, custom agents, spatial) get their tables when they are built. Where drawing this surfaced a genuine design gap, it is flagged **↩ back to grill** and not resolved here (the build-layer gate). Review before the first migration.

## How to read this

A **table** is one kind of thing the system stores, with one **row** per instance — one row per organisation, one row per run, and so on. Each table has **fields** (the facts stored about that thing) and **relationships** (how a row points at rows in other tables — e.g. a Project points at the Organisation that owns it). "Points at" is a stored link (a foreign key): the row keeps the id of the thing it belongs to. Two rules of thumb used throughout:

- **one-to-many** ("─<"): one row here relates to many rows there (one Project has many Work items).
- **append-only**: rows are only ever added, never edited or deleted, so the history is permanent — used for everything that must be auditable (ADR-0002, ADR-0028).

The skeleton journey these tables must support (from the grill tracker): *a consultant opens a project, asks the chat to draft a short governed section from the project's own sources; the orchestrator runs retrieve → draft → ground-check → cite and logs every step; the draft appears with citations; the consultant accepts/edits/rejects and that Signal is captured; the owner logs in on a different role and sees the work item with live status and the full audited run, access correctly scoped.*

---

## Drawer 1 — Parties & access
*Who exists, and who may see what. Every other table is scoped by these. (ADR-0015–0018.)*

**Organisation** — a company with an Infora account; the boundary for all private data.
Fields: `id`, `name`.

**User** — an individual belonging to one organisation.
Fields: `id`, `name`, `email`, `organisation_id` → Organisation, `external_identity` (the Entra ID / M365 subject, nullable — used to map a Microsoft 365 Copilot SSO login to this user, ADR-0031).
Relationship: Organisation ─< User.

**Project** — a construction scheme; the central unit.
Fields: `id`, `name`, `owner_organisation_id` → Organisation.
Relationship: one Organisation owns many Projects (owner is a role, ADR-0015).

**Membership** — the record that an organisation is on a project, with a role.
Fields: `id`, `organisation_id` → Organisation, `project_id` → Project, `role` (`owner` | `member`).
Relationship: Organisation ─< Membership >─ Project (an organisation joins many projects; a project has many member organisations). Exactly one Membership per project has `role = owner`.

**Participant** — a user's access to a project; the user-level subject of access.
Fields: `id`, `user_id` → User, `project_id` → Project. (Per-deliverable grants — review group, authoring team, assignee — are recorded on the work/review tables in later drawers, not here, per ADR-0016's flat model.)
Relationship: User ─< Participant >─ Project.

---

## Drawer 2 — Documents (the grounding corpus)
*The project's own sources the AI grounds on. In the skeleton these already exist to be drafted *from*; producing a new controlled document is thin (see the ↩ note). (ADR-0002, ADR-0011.)*

**Container** — the persistent home of one deliverable, identified by a document reference, unchanged across versions.
Fields: `id`, `project_id` → Project, `document_reference`, `in_library` (bool — is this a grounded library member), `state` (`live` | `superseded` | `withdrawn`, ADR-0013).
Relationship: Project ─< Container.

**Version** — one immutable revision of a deliverable (ADR-0002). **Append-only.**
Fields: `id`, `container_id` → Container, `version_reference` (v1, v2…), `created_at`, `content_ref` (pointer to the stored file/text), `is_current` (bool).
Relationship: Container ─< Version. Only versions whose Container is `in_library` and `state = live` are retrievable for grounding (ADR-0022).

**Sandbox document** — a working copy in the project sandbox: the home of a draft before promotion (owner-decided 2026-07-04, closing the ↩ item below). Freely editable with **no document controls** — a user creates and edits it manually exactly as they would if AI didn't exist, with no Suggestion and no Signal; an agent proposes content to it only when prompted (via a Suggestion, Drawer 4). The AI never grounds on it (ADR-0011). **Deliberately mutable** — it is the uncontrolled working area, the one non-append-only content table by design.
Fields: `id`, `project_id` → Project, `organisation_id` → Organisation (whose sandbox it sits in — the skeleton models one implicit private project sandbox per organisation; the full sandbox model — shared/private sandboxes, the workspace sandbox, folders, the owner's audited override — is deferred to its own drawer), `title`, `content`, `created_by_participant_id` → Participant, `updated_at`.
Relationship: Project ─< Sandbox document.

> ✅ **Resolved (owner-confirmed 2026-07-04):** the *new* draft the consultant produces lives **in the sandbox** as a Sandbox document (above), not as content dangling off the Run or a controlled Version. The agent's proposed draft is held on the **Suggestion** (Drawer 4, which gains a `sandbox_document_id`); accept/edit applies the content to the Sandbox document; promotion into a controlled `Version` (ADR-0002) remains the document-management bridge, **stubbed** in the first slice. `Container`/`Version` stay read-only in this slice.

---

## Drawer 3 — Work & execution
*The heart of the skeleton: a unit of work, the chat thread it happens in, and the audited runs. (ADR-0028.)*

**Work item** — one unit of governed work on a project; the persistent thing with a status and an assignee.
Fields: `id`, `project_id` → Project, `type` (the workflow behind it, e.g. `document_production`), `title` (the human name, e.g. "Statement of community consultation"), `status`, `assignee_participant_id` → Participant.
Relationship: Project ─< Work item. Its status is its own state machine, *driven by* but *separate from* its runs (ADR-0028 §2).

**Conversation** — the persistent thread an agent interaction happens in.
Fields: `id`, `project_id` → Project (the bound environment, ADR-0025/0029 — for a Copilot thread this is the one project the conversation is bound to, ADR-0031), `work_item_id` → Work item **(nullable)** — set when the thread is doing governed work, null for ad-hoc chat, `surface` (`web` | `word_addin` | `copilot` — where the thread originated; its Runs inherit it for the audit trail, ADR-0031).
Relationship: Conversation ─< Run. (A plain chat = a Conversation with `work_item_id` null; a workflow = one bound to a Work item — ADR-0028 §1. A Copilot conversation is a `surface = copilot`, `work_item_id` null thread bound to one `project_id`.)

**Run** — one agent execution (a chat answer or a workflow step). **Append-only, immutable once finished** (ADR-0028 §3).
Fields: `id`, `conversation_id` → Conversation, `parent_run_id` → Run **(nullable — set when this run is a sub-agent spawned by a step)**, `agent_id`, `agent_provenance` (`infora` | `custom`), `state` (`running` | `completed` | `failed`), `request` (the prompt/task text — part of the record, ruled 2026-07-06), `started_at`, `ended_at`, `environment_key` (the project the request ran in), `requester_participant_id` → Participant.
Relationships: Conversation ─< Run; Run ─< Run (the sub-agent tree, via `parent_run_id`).

**Step** — one atomic action within a run — a retrieve, draft, ground-check, cite, or delegate. **Append-only.**
Fields: `id`, `run_id` → Run, `parent_step_id` → Step (nullable, for nesting), `type` (`retrieve` | `draft` | `ground_check` | `cite` | `delegate`), `status`, `started_at`, `ended_at`, `model` + `model_version` (the Router's choice), `tokens_prompt`, `tokens_completion`, `cost`, `source_set` (the access-resolved sources this step saw — the defensibility field, ADR-0028 §7), `rail_outcomes` (which rails applied, any withheld output), `child_run_id` → Run (nullable, when `type = delegate`).
Relationship: Run ─< Step; Step ─< Step.

---

## Drawer 4 — AI output & feedback (the Signal loop)
*What the agent proposes, the citations it attaches, and the human resolution that becomes the moat's raw material. (ADR-0028, ADR-0021, ADR-0026.)*

**Suggestion** — an agent-produced change offered for accept / edit / reject (distinct from a human Comment). Exists **only when a user prompts an agent** — manual editing of a sandbox document produces no Suggestion (draft-location decision, Drawer 2). **Per-item and position-anchored (ruled 2026-07-06, surfaces alignment):** a Run produces zero or more Suggestions, each individually resolvable and each writing its own Signal.
Fields: `id`, `run_id` → Run (the run that produced it), `work_item_id` → Work item, `sandbox_document_id` → Sandbox document (the document the content is proposed for; applied on accept/edit), `kind` (`insert` | `replace`), `anchor` (nullable — a quoted span locating the change against the sandbox head; **advisory**, because the sandbox document is mutable by design: a drifted anchor degrades to a user-placed insert and never blocks resolution), `content` (the proposed text/change), `rationale`.
Relationship: Run ─< Suggestion; Sandbox document ─< Suggestion. *The skeleton exercises one unanchored `insert` Suggestion per run; the fields exist from the first migration because Drawer 4's neighbours are append-only and the shape must be representable early.*

**Citation** — the link from a grounded claim to its supporting source.
Fields: `id`, `suggestion_id` → Suggestion (or `step_id` → Step), `version_id` → Version **or** `authority_ref` (a grounded library source, or an authority-corpus reference — ADR-0021). Only grounded-channel items get citations; steering items never do.
Relationship: Suggestion ─< Citation.

**Signal** — the captured resolution of a Suggestion (accept / edit / reject); the feedback behind the moat. **Append-only.**
Fields: `id`, `suggestion_id` → Suggestion, `resolution` (`accepted` | `edited` | `rejected`), `edited_content` (nullable, when edited), `resolved_by_participant_id` → Participant, `resolved_at`.
Relationship: Suggestion ─< Signal (one resolution per suggestion in v1).

> In the skeleton the Signal is **captured but not sunk** — it is stored, but nothing distils it into Knowledge yet (Session 7, post-MVP). The table exists; the write-loop off it does not.

---

## Drawer 5 — Review (thin in the skeleton)
*Enough of the review record for the owner to see status; the full cycle is document management (ADR-0005–0014), largely stubbed in the first slice.*

**DRR (Deliverable Review Record)** — the one live, append-only review log per deliverable.
Fields: `id`, `container_id` → Container, `edit_lock_holder` (which side holds the write token, ADR-0014).
Relationship: Container ─ DRR (one live DRR per deliverable).

**Comment** — human review input on a version (distinct from a Suggestion). **Append-only once a round is issued.**
Fields: `id`, `drr_id` → DRR, `version_id` → Version, `author_participant_id` → Participant, `body`, `acceptance_code` (ADR-0003), `anchor` (page + highlight, ADR-0006).
Relationship: DRR ─< Comment.

> The full review cycle (transmittal, round phases, snapshots, two-level coding) is defined in ADRs 0005–0014 and is **not** drawn here — the skeleton needs only enough for the owner to see a work item's status and its audited run. Draw the rest when the review slice is built.

---

## What this first cut deliberately omits
Per drawer-by-drawer discipline, and because these are post-MVP (grill tracker buckets A/B): **programme** and programme context; the **org-context / Knowledge / precedent** stores and the distillation loop (Sessions 4/7); **custom agents** and the builder; the **full sandbox model** (shared/private project sandboxes, the workspace sandbox, folders, the owner's audited override — the skeleton carries only the minimal Sandbox document table in Drawer 2); **attached sources**; the **authority corpus** internals (referenced by Citation, owned by Context); **rails** as scoped records (ADR-0030 — add when governance is built); **programme/portfolio** views. Each returns as its own drawer when its slice is built.

## Open items sent back to the grill tracker
- **Draft location before promotion** — ✅ **closed, owner-confirmed 2026-07-04** (Drawer 2): the draft lives in the sandbox as a Sandbox document; Suggestions arise only from agent prompts; promotion stays stubbed in the skeleton.
- Everything else the skeleton omits is already tracked; this doc adds no new open design questions.
