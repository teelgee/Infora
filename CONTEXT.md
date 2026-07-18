# Infora — Ubiquitous Language

The agreed term set for Infora. One word per concept, one concept per word. Every diagram, document, interface label, and the eventual code should use these terms exactly as defined here. Where a term collides with established industry usage (especially Bentley / ProjectWise), the collision is noted so we use the word deliberately.

Status: agreed. This glossary holds settled language only; open questions live in the [grill tracker](docs/grill-sessions/grill-questions.md), the sole source for open questions across the system.

---

## Parties

**Organisation (Org)**
A company with an Infora account. The boundary for all private data. Examples: a consultant firm, a client body, a contractor.

**Workspace**
An organisation's environment in Infora and its entry point to the platform. One per organisation. It holds the org's private context (knowledge, precedents, custom workflows), its users' personal sandboxes for free-form work (per-user, private — refined 2026-07-06), and surfaces every project and programme the org owns or is a member of. Only the organisation's own users can reach its workspace, and agents working there draw on the org's own channels alone. An organisation acts through its workspace.

**User**
An individual belonging to one organisation.

**Client / Consultant / Contractor**
Roles an organisation plays on a given project, not fixed account types. The same organisation can be a client on one project and a consultant on another.

---

## Project, programme and access

**Project**
A defined construction scheme (for example, build the road from A to B). The central unit of the platform. Has a lifecycle and persists for years.

**Programme**
A set of projects under a single owner organisation, where each project is individual and belongs to at most one programme. Example: National Grid runs an upgrade programme; each upgrade is its own project. The programme owner owns its projects and so has a portfolio view across the set. A programme may also hold overarching grounded and guiding context that its projects inherit — a programme-scoped corpus and, where the owner allows, access for a project's agents to its sibling projects' libraries — with whether a given project draws on it configured per project by the programme owner (ADR-0020).

**Owner**
The single organisation that controls a project: its settings, members, and what is shared. A per-project role that can be held by a client or a consultant. Exactly one owner organisation per project. (Ownership transfer is possible in principle but is not designed for.)

**Member**
An organisation granted access to a project. The owner is also a member.

**Membership**
The record linking an organisation to a project with a role and a scope.

**Project role**
Whether an organisation is the owner or a plain member. Every organisation on a project is a member with one shared baseline: promote deliverables, start review cycles, work in shared sandboxes, and read the deliverables it authored or the owner has shared with it. Exactly one member is also the owner, which adds control of project settings and the library, including sharing deliverables with organisations and granting review access. There is no tier below member; differences between members come only from those per-deliverable grants. "Contributor" and "viewer" are retired.

**Participant**
A user with access to a project. The user-level subject of access, beneath the organisation. A Participant's grants are access-bearing: they gate what the user may see and do. Most access is the member baseline shared by all of an organisation's Participants; specific things are granted to named Participants per deliverable, namely the review group and the authoring team on a deliverable, and a work item's assignee. No Participant grant can reveal a deliverable the owner has not shared with the user's organisation, or cross an ethical wall the organisation is outside. Distinct from Member (an organisation on the project) and from a billing seat.

**Org admin**
A user who administers their own organisation: manages its users and enrols or removes them on projects the organisation is a member of (ADR-0033). The intra-organisation half of ADR-0015's two levels — the project owner opens an organisation's seat; its org admin staffs it. Never a project-level power: an org admin holds no access beyond their organisation's ceiling.

**Ethical wall**
The isolation between organisations on a project, and the standing default rather than a feature switched on. By default an organisation sees only its own work, what the owner has shared with it, and the shared sandboxes it is in. Its org context — including its users' personal sandboxes — is private to the organisation and never shared, not even with a project owner. A private project sandbox is private by default too, but the project owner holds an audited override to reach it when necessary (ADR-0018). The owner opens cross-organisation visibility deliberately, by sharing deliverables and by adding organisations to shared sandboxes; within an open review round, comments are visible across the review group (ADR-0014), the one live cross-organisation window. The wall hides work, never presence: every Participant sees the project roster — name, organisation, project role — which is what lets reviewers, authors and assignees be picked from a list (ADR-0033). See ADR-0018.

---

## Context and knowledge

**Context**
The umbrella for everything that can be assembled into an agent's working input. Has four scopes, ordered by breadth of travel: universal (the public authority corpus), org context, programme context, project context. At query time one working input is assembled per request, within the assembly environment the request runs in, from the requester's own private stores plus the access-resolved slice of project context plus the public authority corpus. Grounding follows one rule, set by confidentiality: a scope may ground its own projects but never grounds outside itself. The universal authority corpus grounds everywhere; a project's library subset grounds its members; a programme owner may additionally let its own projects ground on programme-scoped corpora and sibling-project libraries, configured per project; org context never grounds, because it travels to unrelated clients (ADR-0020).

**Assembly environment**
The single environment a request runs in, which sets the channels reachable to it — not the user's identity alone. Two kinds: a *project environment* (reaches that project's grounded and guiding channels, access-resolved to the requester, plus the requester's own informing channel and the universal authority corpus) and the organisation's *own workspace* (reaches only the organisation's own informing channel and the authority corpus — no project grounding or guiding). The informing channel is portable, travelling with a Participant into every environment; a project's grounded and guiding channels are fixed to that project and never travel. So one consultant in client A's project reaches A's grounded and guiding plus its own informing; the same consultant in client B's project reaches B's plus the same informing; A's context is never reachable from B's environment, by construction. Sandbox privacy is a separate axis: a private project sandbox still reaches its project's channels (privacy controls who sees the work, not which channels are reachable). The substrate for the distillation and egress boundary (ADR-0025, ADR-0026).

**Org context**
Context private to one organisation and portable to every project it touches, owned or joined. Held in the org's workspace. Contains the org's sources, knowledge, precedents, and custom workflows. Private-by-construction and informs only: it steers an organisation's own output but never grounds a claim and never reaches another organisation (ADR-0020).

**Programme context**
Context private to a programme owner organisation and scoped to that programme's projects only. Holds the knowledge, precedents, and standards the owner wants to compound across its portfolio without carrying them into unrelated projects where it is merely a member. Sits between org and project on breadth of travel: narrower than org context (one programme, not everywhere), broader than project context (the programme's projects, not one). Private-by-construction, never reaching an organisation outside the programme. Unlike org context it is not informs-only: a programme owner may let its projects ground on programme-scoped corpora and sibling-project libraries and inherit programme guiding context, configured per project — grounding stays within the owner's own projects, so confidentiality holds (ADR-0020).

**Project context**
Context scoped to one project and shared among its members by access. Contains the project's sources, knowledge, and history. The only access-resolved scope, and — alongside the public authority corpus — one of the two scopes that ground, through its project-library subset (ADR-0011, ADR-0020).

**Source**
A raw ingested document or dataset, held in any context store (org, programme or project).

**Knowledge**
Curated, structured memory distilled from sources and work: decisions, commitments, precedent positions, history. The compounding layer. (Sits inside Context; Context is the umbrella, Knowledge is the curated store within it.)

**Precedent**
A reusable exemplar (document, clause, or approach) held in org context and brought to any project.

**Project library**
The curated, owner-controlled corpus of trusted project knowledge: the project's own grounded corpus for both chat queries and drafting, and one of the two corpora on the grounded channel (the other being the authority corpus — ADR-0021). A collection of deliverables identified by coded references, presented **flat or foldered per project configuration** (refined 2026-07-06): folders organise the view but are never access objects — visibility stays per deliverable, per organisation, default-deny — and sort, search and query by code remain primary. Accepted deliverables enter automatically on acceptance; the owner may also add other material (reference documents, standards, baseline data) and shares each deliverable with named organisations. Library visibility is default-deny: a deliverable is seen only by the owner organisation, its author, and organisations the owner has shared it with. Generalises the real-world MIDP. The sandbox and the DRR are not part of it.

**Project artefact**
An item in the project library that did not pass the assurance review cycle but was added to the library by deliberate owner action — a reference document, baseline data, or an informal output worth keeping as a trusted record. A library member alongside formal deliverables and, like them, groundable (ADR-0011); its trust comes from owner curation rather than from the assurance cycle. Distinct from a Formal deliverable (assured through the review cycle) and from sandbox work in progress (which is not in the library).

**Channel**
One of the roles in which Context feeds a generation; every input plays exactly one. Two families: grounded (cited) and steering (never cited). The dividing invariant is privacy — only non-private sources may ground, because a citation enters the shared project record and must never carry private material across the ethical wall. So grounding draws only from the access-resolved project library and the public authority corpus; every private store can only steer. Steering then splits by scope, giving three live channels in all: grounded, guiding and informing (ADR-0021).

**Grounded channel**
The cited sources; the only channel whose content may back a citation. Two corpora: the **project library** (this project's own knowledge, cited as project fact, access-resolved before retrieval so citations are safe by construction — ADR-0020, ADR-0022) and the **authority corpus** (legislation, policy, standards, regulatory requirements, cited as external authority; public and cross-project, not walled). Distilled Knowledge may power a grounded answer but cites through to one of these sources, never standing as the citation itself. The technical channel — answers and their sources. See Grounding, Citation.

**Authority corpus**
The grounded channel's second corpus: legislation, government policy, published standards and regulatory requirements (ADR-0021). Cited as external authority rather than project fact, and public and cross-project rather than project-private — so, unlike the project library, it is not access-resolved per organisation: the law is the law. Licensed standards carry a licensing gate, which is distinct from the ethical wall; it is searched as a separate grounded pipeline (ADR-0022). Held and kept current by the authority register, owned within Context (revised ADR-0023), and dual-purpose: retrievable by users to cite when drafting, not only a reference the compliance-checking capability tests against. Dividing line from the library: produced by or for this project (→ library) versus external and published (→ authority corpus).

**Guiding channel**
Project-scoped steering: the project's templates, style guides and guardrails, owner-curated into project context the way deliverables are curated into the library. Shared among project members by access and persisting with the project when any member leaves. Never cited as project fact. The one channel that also configures the Rail, since a guardrail can be expressed as a negative constraint. On conflict with an organisation's informing steer, guiding wins: the project's guidance governs its own deliverables, and firm know-how fills in where the project is silent (ADR-0029, refined 2026-07-06).

**Informing channel**
Private steering held in org context and programme context: an organisation's, or a programme owner's, precedents, custom workflows and firm know-how. Classified by ownership, not purpose — material a consultant builds for a project is still informing if it is the consultant's IP, and it leaves when that organisation leaves the project. Private-by-construction: never shared, not even with the owner, never reaching another organisation, and never cited. Improves an organisation's own output without ever entering the shared project record (ADR-0020). Yields to project guiding on conflict (ADR-0029, refined 2026-07-06).

**Attached source**
A document or data the user explicitly selects and pins to a single generation as a direct input, distinct from channel retrieval (where the system chooses what to pull). Lets a user draw on material the channels never reach — most importantly a sandbox file — without making it part of any corpus: the trust is the user's, scoped to that input and ephemeral to the task. Reconciles ADR-0011 (the AI never grounds on the sandbox automatically) with user-directed use of sandbox material (ADR-0022). Shown with a visible user-supplied marker, never as a grounded library citation, so the trust distinction stays honest and the audit records who vouched for it.

**Guidance note**
A per-document guidance artefact: a living `.md` generated and maintained for each document or artefact from the **Signals** gathered as people edit and interact with an agent on it — how to draft it, what to watch for, the producing team's standing instructions. It **steers** any agent working on the document: it guides generation but never grounds a claim and is never cited. It is a living layer that travels with the document and sits beside the immutable controlled revisions, not inside them (ADR-0002). Its visibility follows **document access** — it is seen only by those who can see the document: the sandbox members while it is in a sandbox, and whoever the owner has shared the deliverable with once it is in the project library. So it is document-scoped, not org-private informing (which never leaves its organisation). Not an annotation sidecar: ADR-0006 retired the sidecar for comment anchors, and this is document guidance, not markup. *(Residual cross-organisation confidentiality question tracked in the [grill tracker](docs/grill-sessions/grill-questions.md), to be settled when the guidance-note ADR is grilled.)*

---

## Work, workflows and tools

**Workflow**
A defined, governed, repeatable process that produces an output. Examples: document production, assurance, feedback triage. The engine's term — on the surfaces users meet workflows packaged as **tools** (renamed from the Workflows nav section, 2026-07-13, T-109).

**Tool**
The packaged, launchable capability a user meets on the Tools surface. The minimal tool is a single workflow with a name and description; a richer tool (e.g. a QA tool) steps through several workflows. Users see tools; *workflow* stays the engine's term for the codified sequence underneath. Three provenances (owner-ruled 2026-07-13): **standard** (Infora's, for all users), **org-built** (the organisation's own — travelling with its users into projects, never visible across the wall, per the org-context informing rule ADR-0020), and **individually-built** (org-visible in the MVP; per-org privacy is a future organisation choice). Building your own happens in the Tools surface (the Slice F builder); the built workflow surfaces as your own tool.

**Assurance (workflow)**
The AI workflow that checks a document against predetermined rules and style guides. Distinct from the Assurance cycle: a team typically runs the assurance workflow on a draft, then pushes the document through the assurance cycle to publish it.

**Sandbox**
A working area free of formal document controls where teams produce work-in-progress and informal work, assisted by the AI, organising it in folders as they wish. Not uncontrolled history, though: every sandbox document carries an ambient version history (below), and a team may freeze it for an internal formal review (ADR-0032) — ceremony a team chooses, never a gate. Sandboxes exist at two scopes (refined 2026-07-06). In the workspace: the **personal sandbox**, a per-user private area within the organisation's workspace — private to that user and sitting inside the org's absolute private floor, never reachable by another organisation or any project owner (ADR-0018); this refines the former org-wide "workspace sandbox" (whether an org admin can reach a user's personal sandbox is a small open item, to settle with the sandbox drawer). In a project: **project sandboxes**, created in the project and defined by their sharing scope — shared across a chosen set of organisations, or scoped to a single organisation; sharing is set at creation. A single-organisation project sandbox is not visible to other organisations and, by default, not to the project owner either; the project owner holds an override to gain visibility when necessary, which is exceptional and audited, not the standing state (ADR-0018). Document controls are absent, but access controls always apply, and the AI never grounds on the sandbox (ADR-0011) — though a user may pin a sandbox file to a single generation as an Attached source (ADR-0022). A shared sandbox is where organisations collaborate on work in progress, including co-authoring one deliverable (ADR-0019).

**Promote**
The act of taking a version of sandbox work into the assurance cycle as a candidate controlled revision — either a snapshot of the live head or a QA-accepted frozen version, never a head that has drifted past its QA (ADR-0032). The crossing from sandbox to controlled record. Distinct from approve (passing a gate) and transmit (issuing the approved deliverable).

**Ambient version history**
The automatic, SharePoint-style version history every sandbox document carries: snapshots at save boundaries, browsable and restorable. A working tool, not a record — nothing review-grade binds to it and it never grounds. Distinct from a frozen Version (below) and from the controlled record's immutable versions (ADR-0002).

**Freeze (check out)**
Snapshotting a sandbox document's head into an immutable frozen Version at sandbox scope so a formal review cycle can run on it — the same primitive as promotion with a different target scope. While a sandbox-scope round is open the head is locked, with audited early release by the lead. The freeze series is org-private and never crosses the wall (ADR-0032).

**Review cycle**
One launch of the review workflow on a deliverable: an authoring side and a reviewing side working rounds of frozen versions to a terminal state — accepted, or closed-rejected by explicit audited action. Role-agnostic and scope-parameterised (ADR-0032): a sandbox-scope instance is the org-private internal formal review; a project-scope instance is the wall-crossing client review. The DRR is the cycle's record. The one workflow document management owns (ADR-0012).

**Assurance cycle**
The controlled product-lifecycle process that turns a sandbox document into an assured, published Formal deliverable: metadata, naming convention, document coding, a defined review-and-approval gate sequence, and transmittal. Ships built-in on the Network Rail standard deliverable lifecycle (configurable by users in future). Distinct from the Assurance workflow.

**Formal deliverable**
A document that has been through the assurance cycle and issued as a controlled record. In a record configuration Infora holds that record; in an integrate configuration Infora transmits it to the incumbent.

**Deliverable plan**
Each producing organisation's schedule of the deliverable containers it will produce (the real-world TIDP), evolving over time: per row the coded reference, metadata, authoring team, status, and proposed reviewers where known (ADR-0033). The owner consolidates every organisation's plan into the single project schedule (the MIDP view), curates access, and confirms reviewer appointments. An organisation's plan is its set of planned containers — the two plan surfaces are filtered views of one substrate. Holds the naming rules.

**Supersede**
A document becoming no longer current. Automatic when a newer version is promoted, or set deliberately by the owner. A superseded document stays in the project library but leaves the grounded corpus.

**Withdraw**
An owner-set state marking a document as no longer to be relied on. The document stays in the project library and remains auditable, but leaves the grounded corpus.

**Rejected (state)**
The state of a deliverable whose review cycle was closed-rejected and never resubmitted — an explicit, audited close by the lead author or project owner, never an implication (ADR-0032). The document stays in the library as a record, its DRR attached, and never grounds.

**Record configuration**
A per-project setting that determines where the published controlled record sits. Two values: *record* (Infora holds the controlled record end to end) and *integrate* (Infora transmits the approved deliverable to an incumbent document management system that holds it). The two differ only in post-publication custody.

**Document reference**
The stable identifier for a controlled document, unchanged across every version.

**Container**
The persistent home of a single deliverable, identified by its document reference and unchanged across versions. Holds the version history and both renditions (native source and PDF). A row in the deliverable plan.

**Version reference**
The changing part of the reference, appended to the document reference, that identifies the version (v1, v2 and so on).

**Rendition**
A stored, immutable representation of a version of a deliverable — a snapshot of the record, never an editing surface (ADR-0034). Two kinds: the native file (docx, xlsx, pptx — the asset the client owns and reuses; generated at promotion for authored documents, the file itself for uploaded ones) and the PDF, the authoritative review-and-record rendition (ADR-0004).

**Document origin**
Which route a sandbox document arrived by, which fixes its canonical format (ADR-0034): **uploaded** (dragged in from the Office world — the native file is canonical; Infora views, promotes and reviews it but does not edit it) or **authored** (created in Infora's editor — structured text is canonical, the substrate the AI machinery operates on; Word/PowerPoint are one-way exports). "Open in editor" converts uploaded to authored, deliberately, with the original preserved. An authored document carries a kind — text, or slides (a slide-shaped document, not a rendition trick).

**Standard workflow**
A workflow provided by Infora; surfaces as a **standard tool** on the Tools page, available to all users.

**Custom workflow**
A workflow built by an organisation, held in org context, deployable to any project the organisation works on; surfaces as one of the organisation's own **tools**, visible only to that organisation's users (individually-built tools are org-visible in the MVP — 2026-07-13 scoping ruling, tracker).

**Capability**
A reusable domain skill that workflows compose. Examples: grounded generation, compliance check, tabular review, plain-English, document understanding.

**Agent**
The software actor that performs the work: it carries out the steps of a workflow, drawing on capabilities and the assembled working input, and produces suggestions and outputs. It is the actor, distinct from the *workflow* (the governed process it runs), the *capability* (a reusable skill it draws on), the *run* (the audit record of its execution), and *orchestration* (the layer that plans the work and routes it across specialist sub-agents). Every agent executes inside exactly one assembly environment (ADR-0025), reaching only that environment's channels, and runs within the governance envelope, bound by the project's Rails — it cannot step outside them. An agent has one of two provenances, mirroring workflows: an **Infora-built agent** ships with the platform and runs the standard workflows; a **custom agent** (org-built) is built by an organisation, held in org context, and deployable to any project the org works on — the build-your-own layer of the long-term vision. Both kinds run in the same environment under the same envelope: a custom agent deployed into a project inherits that project owner's Rails and may tighten its own organisation's private work but can never loosen them (governance authority to be recorded in a forthcoming ADR).

**Work item**
One unit of work on a project — for document production, the deliverable's *work half*, linked one-to-one to its Container (ADR-0032 addendum). Carries a type (the workflow behind it), a status, and an assignee. Its status is event-driven, never hand-set: planned → drafting → in review → accepted or rejected, moved by the review cycle's events. The underlying type, not the spoken label: in the interface a work item is titled by its real name (for example, "Statement of community consultation"), the way you would say "the document" or "the review". Reserved alternatives below.

**Conversation**
The persistent thread an agent interaction happens in — the chat-interface "thread" that accumulates messages and the Runs they trigger. Every Run happens in exactly one Conversation; a Conversation may carry many Runs over its life. A Conversation is optionally bound to a Work item when its thread is doing governed project work; an ad-hoc chat question is a Conversation with no Work item. (M1.)

**Run**
The recorded execution of an agent — one agent execution, whether a chat answer or a workflow step. Used in the same sense as the Assistants-API "Run." Has exactly one parent Conversation and an optional Work item link; a Work item accumulates many Runs over its life. The unit of the agent-execution audit trail, append-only and immutable once written (mirroring the DRR and ADR-0002). Decomposes into Steps, and may itself be a child Run spawned by a sub-agent, so the run/step record is a tree.

**Step**
One atomic action within a Run — a retrieval, a capability call, a generation. The granular unit each Run records for the audit trail (the Assistants-API "run step"). A Step may delegate to a sub-agent, spawning a **child Run**, so a Run is a tree of Runs and Steps. Sub-agents are real from v1: the main chat agent delegates retrieval to a sub-agent whose child Run finds relevant documents and folds them into the main agent's context. All retrieval — baseline and agentic — runs **through Context** (the assembly API, M3), never reaching stores directly, so access-resolution-before-retrieval (ADR-0020, ADR-0022) holds by construction. Append-only with its Run. (M1.)

**Comment**
Human review input on a document, raised against a specific version within a round. May be authored in Infora or ingested from a Word document. Carries an acceptance code and, on the next version, an authoring-side Response. Distinct from a Suggestion.

**Response**
The authoring side's reply to a Comment: either a link to the specific section of the next version that addresses it, or an explicit no-change with a reason (ADR-0004). A first-class record in the DRR — and, paired with its comment, the comment-to-resolution data the moat distils (ADR-0032).

**Acceptance code**
A review verdict expressed as a code. Reviewers set one on each comment; the lead reviewer sets the authoritative one for the deliverable. The classification scheme is configurable per project — seeded by copying Infora's default at project creation, so one project's edits never touch another's; whether a code ends the cycle (accepting) is a property of that code in the project's scheme. A code once used is immutable: retired and replaced, never redefined, so history never re-reads.

**Anchor**
The structured location of a comment on a version's PDF: page plus highlight coordinates or a dropped point, with the selected text. Stored on the DRR comment record and bound to the version.

**Suggestion**
An agent-produced change offered for accept, edit, or reject. Distinct from a Comment (a Comment is human; a Suggestion is the agent).

**Signal**
A captured resolution decision on a Comment or a Suggestion. The feedback data behind the moat. It compounds by retrieval and by codified workflows, not by training a shared model on customer data; any future training use is per-tenant on de-identified or aggregate data only (ADR-0026). The Signal sink is grilled in Session 7.

**Deliverable Review Record (DRR)**
The live log of one review cycle: comments, authoring-side responses, and acceptance coding, spanning every version the cycle reviews as one artifact (ADR-0032 refining ADR-0009 — at project scope this preserves "one live DRR per deliverable", since a deliverable has one project cycle; a sandbox-scope cycle's DRR is org-private and never crosses the wall). Its history is append-only: once a round is issued, its comments and responses become permanent and cannot be rewritten. Users only ever interact with the live DRR. At each transmittal in either direction the system freezes an internal snapshot of the comments and responses as the formal record, retrievable if needed but never a document users open. Replaces the Excel Document Review Notice; no separate notice is ever issued.

**Reviewer**
A project member assigned to review a transmitted deliverable. May belong to any organisation on the project, not only the owner. Adds and codes comments in the DRR. Appointed per deliverable at planning: the producing organisation may propose reviewers on its plan — conferring no access — and the owner confirms and maintains them (ADR-0033, refining ADR-0008); never appointed at transmittal.

**Lead reviewer**
A reviewer with authority over a deliverable's review. May edit or amend other reviewers' comments and codes, and sets the authoritative overall acceptance code for the document.

**Review group**
The named reviewers and the lead reviewer appointed to a deliverable's review. Holds the DRR edit lock while a round is open, so only the group may write comments and codes then. It does not hold visibility alone: every party with deliverable access sees each issued round. The consultant never joins the group; it takes the edit lock in its own right when the lead reviewer issues the round. Named on the deliverable plan and amendable by the owner at any time, including mid-cycle.

**Edit lock**
The single write token on a cycle's DRR that decides who may add or change comments, codes and responses. It alternates with the review cycle, driven by transmittal in both directions: the appointed reviewers hold it while a round is open, the authoring team holds it once the lead reviewer issues the round, and it returns to the reviewers when the lead author promotes the next version. Distinct from visibility, which is permanent for every issued round and shared by all parties with deliverable access, with only the open round hidden from the authoring side. At sandbox scope the same mechanic generalises to the freeze's check-out lock on the sandbox head (ADR-0032). See ADR-0014.

**Author**
A Participant on the producing side of a deliverable, who writes the deliverable and its responses to reviewer comments, belonging to an organisation that shares the deliverable's sandbox (normally the producing organisation, possibly several when the sandbox is shared). The producing-side counterpart to a Reviewer. Named on the deliverable plan and amendable by the lead author at any time, including mid-cycle.

**Lead author**
The author with authority over a deliverable's production. Promotes each version, which opens the review round and flips the DRR edit lock, and names or changes the other authors, drawn from the organisations sharing the deliverable's sandbox, at any time. The producing-side counterpart to the Lead reviewer.

**Authoring team**
The lead author and authors appointed to produce and respond on a deliverable. Holds the DRR edit lock once the lead reviewer issues a round. The producing-side counterpart to the Review group.

---

## Governance

**Grounding**
Tying every generated claim to a source, with a check that can withhold unsupported output.

**Citation**
The link from a claim to its supporting source.

**Rail**
A governance rule applied at generation time: register, negative constraints, confidence calibration. Rails carry an authority model that mirrors access (ADR-0015): the project **owner** sets the project's rails — the ceiling every agent and member works within — and members inherit them. A member may **tighten** rails on its own private work but can never loosen the owner's or step outside them, exactly as a Participant grant narrows within Membership and never pierces a wall. Every rail set or change is **audited** — configurable, never silent. Posture: Infora ships rails so output can meet regulation; an organisation that erodes its own rails owns that liability, since it is the firm's name on the submission, not Infora's (governance authority to be recorded in a forthcoming ADR).

**Compliance**
Conformance to policy and legislation (the DCO regime, planning policy, PINS requirements).

**Audit trail**
The complete record of every agent, user, and system action on a run or project.

---

## System description

**Feature**
What Infora does, described in the language a customer would recognise — the product view. Examples: AI document production, controlled document management, project chat. Outward-facing.

**Component**
A buildable, bounded unit the software is structured into — the build view, the way a team would own and reason about a part behind a clear interface. Examples: the Engine, Context, the Access model. Inward-facing. Distinct from a Capability (a reusable skill inside the Engine) and a Workflow (a recipe the Engine runs), neither of which is a component.

Feature and Component are two lenses on the same system, and the mapping between them is many-to-many: one feature spans several components, and one component serves many features. They are therefore kept as two separate lists (see the overview's feature list and component list), never collapsed into one.

---

## Foundation

**Router**
The model-agnostic layer that selects a model per task.

**Connector**
An integration to an external system (a DMS such as ProjectWise, or a GIS / CAD product).

**Ingestion**
Bringing source material into a context.

---

## Reserved terms (defined to avoid collision, used only when earned)

**Task**
A single assigned action with a due date. Not yet built. Reserved for when we build assignment-with-due-dates, so "work item" is not overloaded to mean a to-do. Note: Bentley's Work Exchange already uses "task" this way.

**Deliverable**
A formal contractual output to be issued, with formal transmission behind it. Reserved so that not every work item is wrongly implied to be a formal issue. Note: Bentley uses "Deliverable" and "Transmittal" for exactly this.

**Transmittal**
In record configuration, the event record of a deliverable version being issued for review: sender, recipients, version, purpose code, issue and due dates. Moves no file on-platform; it flips the DRR edit lock and, on issue, reveals the closed round to the consultant, freezes the snapshot, and notifies recipients. In integrate configuration it drives a physical handover to the incumbent, deferred. (No longer reserved: minted as a live term.)

---

## Open items

Open questions are not held here. They live in the **[grill tracker](docs/grill-sessions/grill-questions.md)**, the sole source for open questions across the system; this glossary holds settled language only, and a term lands here once its concept is agreed. The previously listed open item — *signal-derived guidance crossing organisations* — now sits in the grill backlog, to be settled when the per-document guidance-note ADR is grilled.

New terms are agreed and folded in here as they firm up, so this remains the single source of truth for language.
