# Infora — Ubiquitous Language

**Contents:** [Parties](#parties) · [Project, programme and access](#project-programme-and-access) · [Context and knowledge](#context-and-knowledge) · [Work, workflows and tools](#work-workflows-and-tools) · [Governance](#governance) · [System description](#system-description) · [Foundation](#foundation) · [Reserved terms](#reserved-terms-defined-to-avoid-collision-used-only-when-earned) · [Open items](#open-items)

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

**Knowledge section**
The surface where the writing rules live: an item in every project's rail holding **two shelves** — the organisation's own (its rulebook, its saved starting outlines; org-private and identical on every project it touches) and the project's (its style guides, readable by every participant, curated by the owner organisation's super user). The firm's shelf is **one shelf reached through two doors**, also appearing in the organisation's own workspace, where no project material is shown. Standards, policy and legislation are **not** a third shelf — they are library reference material. Distinct from Knowledge above, which is the curated memory store; this is the screen over the guiding and informing channels' style material (ADR-0054).

**Rule set**
What a project style guide becomes once loaded: a versioned list of **typed rules somebody accepted**, not prose the checker reads. Each rule carries its **kind** — term, pattern, structure, measured or judgement, typed by *how it is enforced* rather than what it is about, so that four kinds of the five are settled in code and only judgement rules cost a model call — plus the **scope** it applies to, its **exceptions** in two typed halves — the **contexts** where it never applies (quotations, references, code, headings) and the exact **terms** it leaves alone *(split in review 2026-09-01 on T-430's evaluation)* — its **register**, whether it raises findings or only steers drafting, its severity, and its **origin**. A **glossary** is the term kind, not a separate object. Amending is a new version, never an edit (ADR-0054).

**Register (of a rule)**
Which language settings a rule applies under: the document creator's existing choices — technical, non-technical, simple English — plus *all*. Deliberately the creator's own vocabulary and not a new one, so the person choosing how a document is written and the rules that then bind it are answering the same question (ADR-0054 decision 5). A fresh sense of an already-busy word: distinct from the commitments register, the deferred register, the conflict register and the personal-data register, all of which are lists of records — this is a property of one rule.

**Rule origin**
Which of three things a rule is, and the distinction is load-bearing rather than descriptive: **extracted** (pulled from an uploaded standard, and keeping a pointer to the client's exact wording, which is what a finding quotes), **typed** (written by a person, quoting nothing and saying so), or **Infora-proposed** (offered from Infora's own baseline where the uploaded standard is silent for a register, marked as Infora's own, and binding only once accepted). Only the first can be quoted as the client's own rule (ADR-0054, ADR-0048 §5).

**Precedent**
A reusable exemplar (document, clause, or approach) held in org context and brought to any project.

**Project library**
The curated, owner-controlled corpus of trusted project knowledge: the project's own grounded corpus for both chat queries and drafting, and one of the two corpora on the grounded channel (the other being the authority corpus — ADR-0021). A collection of deliverables identified by coded references, presented **flat or foldered per project configuration** (refined 2026-07-06): folders organise the view but are never access objects — visibility stays per deliverable, per organisation, default-deny — and sort, search and query by code remain primary. Accepted deliverables enter automatically on acceptance; the owner may also add other material (reference documents, standards, baseline data) and shares each deliverable with named organisations. **Library membership no longer decides grounding on its own** (2026-08-27): a deliverable grounds when it is in the library **and** its **record state** is `live` **and** its acceptance code carries the project's grounding rule — the derived answer being its **context state**. So the library is a superset of the grounded corpus in two ways rather than one. Library visibility is default-deny: a deliverable is seen only by the owner organisation, its author, and organisations the owner has shared it with — and, on the share branch, only once the receiving organisation has acknowledged the transmittal for the current version (the **share acknowledgement**, ADR-0035) and the reader is within any intra-organisation narrowing present. Generalises the real-world MIDP. The sandbox and the DRR are not part of it.

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
One or more documents or data the user explicitly selects and pins as direct input to an agent session, distinct from channel retrieval (where the system chooses what to pull). The sources may be **sandbox file(s)** (the most important case — material the channels never reach), an **uploaded PDF**, or a **web search** result. Pinned input is scoped to the agent session (the **Conversation**, ADR-0028) and persists across its turns — a working set the team need not re-pin each turn — rather than to a single generation, but it never joins any corpus: the trust is the user's, user-vouched and ephemeral to the session. Reconciles ADR-0011 (the AI never grounds on the sandbox automatically) with user-directed use of sandbox material (ADR-0022, refined 2026-07-22: one or several sources, and Conversation-scoped persistence). Shown with a visible user-supplied marker, never as a grounded library citation and never emitting a citation into the shared record, so the trust distinction stays honest and the audit records who vouched for it.

**Guidance note**
A per-document guidance artefact: a living `.md` generated and maintained for each document or artefact from the **Signals** gathered as people edit and interact with an agent on it — how to draft it, what to watch for, the producing team's standing instructions. It **steers** any agent working on the document: it guides generation but never grounds a claim and is never cited. It is a living layer that travels with the document and sits beside the immutable controlled revisions, not inside them (ADR-0002). Its visibility follows **document access** — it is seen only by those who can see the document: the sandbox members while it is in a sandbox, and whoever the owner has shared the deliverable with once it is in the project library. So it is document-scoped, not org-private informing (which never leaves its organisation). Not an annotation sidecar: ADR-0006 retired the sidecar for comment anchors, and this is document guidance, not markup. *(Residual cross-organisation confidentiality question tracked in the [grill tracker](docs/grill-sessions/grill-questions.md), to be settled when the guidance-note ADR is grilled.)*

---

## Work, workflows and tools

**Workflow**
A defined, governed, repeatable process that produces an output. Examples: document production, assurance, feedback triage. The engine's term — on the surfaces users meet workflows packaged as **tools** (renamed from the Workflows nav section, 2026-07-13, T-109).

**Tool**
The packaged, launchable capability a user meets on the Tools surface. The minimal tool is a single workflow with a name and description; a richer tool (e.g. a QA tool) steps through several workflows. Users see tools; *workflow* stays the engine's term for the codified sequence underneath. Three provenances (owner-ruled 2026-07-13): **standard** (Infora's, for all users), **org-built** (the organisation's own — travelling with its users into projects, never visible across the wall, per the org-context informing rule ADR-0020), and **individually-built** (org-visible in the MVP; per-org privacy is a future organisation choice). Building your own happens in the Tools surface (the Slice F builder); the built workflow surfaces as your own tool.

**App**
A tool a team has built for it in the Tools section — a returns form the client sees as a dashboard, a land register on a map, a health-and-safety board with an analyst inside — with an agent writing the screens (ADR-0056). An **app instance** lives in exactly one **project**, carries a **scope of an app** (below), has one **owner** (a person on the project) and declares its **app tables**, its interfaces and who may open each, its schedule, the analysis and prompts its agent runs, and the **connections** it requires. **An app has no identity of its own: it acts as whoever is looking at it** — every read and write passes through the one access gateway as the viewing person, so an interface can only narrow what a viewer could already see. A scheduled run acts as the app's owner, narrowed to the tables and connections the app declared, and stops when the owner's entitlement goes. Its agent produces a **static insight per run**, kept as a row; a chat over the same data is an addition whose answers are not kept. An app **exports a file** — the app produces, a person issues — carrying only what the exporting person may see, stamped with what data generated it and when, never with a producer. App tables are outside the drafting and Ask agents' reach; an app reading a sandbox file its viewer can open is not grounding (ADR-0011 addendum). Each organisation decides who among its own people may build; an app whose builder or owner loses the right is reassigned or closed, never left running ownerless. Distinct from a **Playbook** (the firm-held template it may be deployed from) and from a **Tool** (the app is one of the four kinds on the Tools surface).

**App table**
The third kind of project thing, beside library records and sandbox content (ADR-0056 §2). A table an app declares — name, columns, types — whose rows live in the project. **Every row is stamped with the organisation whose person entered it and with that person**, and is read by that organisation and the project owner organisation, within the app's scope, and by nobody else — unless the **project owner shares the table** with a named organisation, all rows, as a deliberate revocable act shaped like the library share. Edits keep the previous version. A table may carry an **acceptance step** (draft → submitted → accepted or rejected; a correction is a new row that supersedes), chosen **per table by the builder**, whose agent must prompt the choice; **acceptance is the moment a row changes hands** — before it, the row is the submitting organisation's own material and deletable on its request; after it, the row is the project owner's record and is retained. A table with no acceptance step never changes hands. When an organisation leaves the project its accepted rows stay, its unaccepted rows follow the sandbox revocation rule (stay, invisible, audited owner override, deletable or exportable by the departing organisation), and the owner reassigns or closes the instance. Not sandbox content (a shared room with no wall inside it) and not a library record (which grounds).

**Scope of an app**
The participant scope of an app instance, on the sandbox's ladder (ADR-0036): a chosen set of organisations, one organisation, a team within one, or named people — initial at creation, live-mutable and revocable after it. It says who may *open* the app at all; what each person then sees inside it is decided row by row by the app table rule, never by the scope. A sandbox is something an app connects to, not where it lives.

**Playbook**
An app kept as a template in a firm's own workspace — its intellectual property, org-private, never visible across the wall (ADR-0056 §10). The "dumb" template of an app: the finished definition of its steps (tables and their acceptance choice, interfaces and who opens them, schedule, the analysis and prompts its agent runs, the connections it *requires*) plus any **reference tables the firm authored and declares as such** (emission factors, review categories) — and **never a row that was entered in a project, no connection and no credential**. Deploying a playbook into a project **copies** the definition into a new app instance, which names the playbook version it came from; changing the playbook never changes a deployed instance. An app built from scratch inside a client's project may be saved back to the firm's workspace as a playbook, the platform stripping every project-entered row on the way. Infora's own pre-built apps arrive as supplied playbooks on the same shelf. Q-014's wall-through-the-definition test, made mechanical.

**Connection**
A link from Infora to a system outside it — an ArcGIS enterprise account, a database — owned by the **organisation that owns that system**, set up once by a person who may already reach it, and lent to app instances in projects the organisation is a member of (ADR-0057). Its credential is a **dedicated integration credential**, never a person's login, written once into the deployment's secrets store and never read back. A connection **declares its reach** — the named layers, tables or endpoints, and whether it **reads** or **writes** — and an app borrows only that; outward calls are denied except to the declared reach and audited every time, and fail closed outside the deployment tier's permitted reach. Data a read connection brings in lands in an app table stamped with the connecting organisation. A **writing connection** is a separate kind: lending it into a project needs the project owner's audited approval, because data leaving the project is the owner's call. A connection leaves with its organisation. Distinct from a **Connector** (component 7's integration to a document-management or spatial system by reference or handover).

**Lens**
How an answer is written for the professional reading it — register, depth, what the answer leads with, default output shape, and which ambiguity gets asked about first. Ask supports several (Planning & Environmental, Engineer, Project Manager, Communications; Commercial drafted), chosen from a chip and changeable at any time including mid-conversation. **A Lens changes register, never reach:** it has no effect whatsoever on what data a user can see, is not a parameter of access resolution or retrieval, and cannot become one — permissions are orthogonal to Lens, and the picker says so in plain words. Named *Lens* rather than *role* because **Role** is already taken (Membership role, owner/member — ADR-0015/0016), and a persona that sounds like a permission is exactly the confusion the design exists to prevent. Capital-L *Lens* is this term; the lower-case word is still used in its ordinary English sense elsewhere in this glossary (feature and component as "two lenses on the same system"). A Lens is declarative content — a YAML file in the authoring layer, owned by Infora's planning specialists, versioned like code — so adding one needs no code change, and a Lens whose prohibitions try to weaken a shared-core rule (provenance, the register separation, no unqualified professional opinion, staleness, version discipline) fails to load rather than degrading silently. Specified in [docs/ask/01-lens-framework.md](docs/build/plan.md).

**Assurance (workflow)**
The AI workflow that checks a document against predetermined rules and style guides. Distinct from the Assurance cycle: a team typically runs the assurance workflow on a draft, then pushes the document through the assurance cycle to publish it.

**Sandbox**
A working area free of formal document controls where teams produce work-in-progress and informal work, assisted by the AI, organising it in folders as they wish. Not uncontrolled history, though: every sandbox document carries an ambient version history (below), and a team may freeze it for an internal formal review (ADR-0032) — ceremony a team chooses, never a gate. Sandboxes exist at two scopes (refined 2026-07-06). In the workspace: the **personal sandbox**, a per-user private area within the organisation's workspace — private to that user and sitting inside the org's absolute private floor, never reachable by another organisation or any project owner (ADR-0018); this refines the former org-wide "workspace sandbox" (whether an org admin can reach a user's personal sandbox is a small open item, to settle with the sandbox drawer). In a project: **project sandboxes** (ADR-0036) — a project holds an **unlimited number** of them, each defined by a **participant scope** on a ladder from broad to narrow: shared across a chosen set of organisations (e.g. Org B and Org C together), a single organisation, a team within an organisation, or specific named users. Narrower is a strict subset of broader, so **separation is achieved by provisioning a narrower sandbox, never by walling off a shared one** — the sandbox *is* the boundary, with no wall inside it. The participant scope is the sandbox's **initial** scope at creation, then **live-mutable and revocable** over its whole life (consistent with the interval/revocation model, ADR-0033/0035, and the colocated store's immediate effect, ADR-0024): adding an organisation or user grants access from that moment; revoking drops its live visibility and retrieval immediately, while everything the revoked party authored stays in the sandbox, attributed and intact. A single-organisation (or narrower) project sandbox is not visible to other organisations and, by default, not to the project owner either; the project owner holds an override to gain visibility when necessary, which is exceptional and audited, not the standing state (ADR-0018). Document controls are absent, but access controls always apply, and the AI never grounds on the sandbox (ADR-0011) — though a user may pin a sandbox file to a single generation as an Attached source (ADR-0022). **"Team" is not a first-class entity** — the team rung is simply a named set of an organisation's users, not a new access primitive. A sandbox, and any internal review run inside it, is **participant-private**: visible only to its admitted participant set at whatever rung, which is what replaces any notion of a wall *inside* a shared space. The default home for a producing organisation's **formal (TIDP-planned) deliverables** is its own single-organisation sandbox — where it drafts them before promotion; a shared sandbox is the exception, for cross-organisation collaboration on work in progress, including co-authoring one deliverable (ADR-0019), where the authoring team may span the organisations sharing it.

**Promote**
The act of taking a version of sandbox work into the assurance cycle as a candidate controlled revision — either a snapshot of the live head or a QA-accepted frozen version, never a head that has drifted past its QA (ADR-0032). The crossing from sandbox to controlled record. Distinct from approve (passing a gate) and transmit (issuing the approved deliverable), and from **bind** (below): binding links a draft to its planned container and locks identity but does not snapshot or launch review; promotion is the later event that does both.

**Ambient version history**
The automatic, SharePoint-style version history every sandbox document carries: snapshots at save boundaries, browsable and restorable. A working tool, not a record — nothing review-grade binds to it and it never grounds. Distinct from a frozen Version (below) and from the controlled record's immutable versions (ADR-0002).

**Freeze (check out)**
Snapshotting a sandbox document's head into an immutable frozen Version at sandbox scope so a formal review cycle can run on it — the same primitive as promotion with a different target scope (ADR-0032). **Automatic at internal-cycle initiation:** starting a sandbox-scope review cycle freezes the head and locks it — there is no separate manual freeze step. While the round is open the head stays locked, with audited early release by the lead; it **unlocks when the round closes**, ready for the author or team to edit the head and respond to the DRR. The freeze series is **participant-private** to the sandbox's set (org-private in a single-organisation sandbox, shared with the co-authoring organisations in a shared one) and never crosses the wall to the client or any organisation outside the sandbox.

**Review cycle**
One launch of the review workflow on a deliverable: an authoring side and a reviewing side working rounds of frozen versions to a terminal state — accepted, or closed-rejected by explicit audited action. Role-agnostic and scope-parameterised (ADR-0032): a sandbox-scope instance is the participant-private internal formal review; a project-scope instance is the wall-crossing client review. The DRR is the cycle's record, **visible to the cycle's named participants** — the authoring and reviewing sides chosen at initiation (a subset of the sandbox participant set for an internal cycle), never beyond them. **Who initiates:** the internal (sandbox-scope) cycle may be initiated by the author or anyone in the team, who names the review participants at initiation and thereby sets DRR access; the project-scope cycle is launched by the lead author promoting (ADR-0017). The one workflow document management owns (ADR-0012).

**Assurance cycle**
The controlled product-lifecycle process that turns a sandbox document into an assured, published Formal deliverable: metadata, naming convention, document coding, a defined review-and-approval gate sequence, and transmittal. Ships built-in on the Network Rail standard deliverable lifecycle (configurable by users in future). Distinct from the Assurance workflow.

**Formal deliverable**
A document that has been through the assurance cycle and issued as a controlled record. In a record configuration Infora holds that record; in an integrate configuration Infora transmits it to the incumbent.

**Deliverable plan**
Each producing organisation's schedule of the deliverable containers it will produce (the real-world TIDP), evolving over time: per row the coded reference, metadata, authoring team, status, and proposed reviewers where known (ADR-0033). The owner consolidates every organisation's plan into the single project schedule (the MIDP view), curates access, and confirms reviewer appointments. An organisation's plan is its set of planned containers — the two plan surfaces are filtered views of one substrate. Holds the **naming scheme**: owner-defined and project-wide (one coding standard the whole project's references obey), but **not fixed** — a producer that needs a new field value or code type proposes it and the owner folds it into the project-wide scheme. A producer **self-generates** each container's coded reference within the current scheme (an auto-incrementing serial within its own allocation); cross-organisation uniqueness rides the originator field, so two producers never collide. The producer never receives codes one at a time from the owner; negotiation lives at the scheme level, not per code.

**The four axes** *(agreed 2026-08-27)*
Four separate things are routinely all called "status", and Infora keeps one word per axis. Three are ISO 19650's and are adopted whole ([iso-19650.md](docs/reference/iso-19650.md)); the fourth is Infora's own. **CDE state** — where a container sits. **Status code** — what an issue may be used for. **Revision code** — which issue it is. **Record state** — whether it may still be relied on. A fifth term, **context state**, is the derived answer to *may an agent use this*, and is not an axis but a computation over three of them.

**CDE state**
Where an information container sits in the shared-information workflow: **work in progress**, **shared**, **published**, and **archive** (ISO 19650-1 cl. 3.3.15, Figure 10). Derived, never hand-set — the status code is what tells you which state a container is in, which is deliberately how ISO avoids projects segregating a CDE into folders per state: **state is metadata, not location**. ⚠ **Archive is not a destination.** It is *"a journal of information transactions providing an audit trail of container development"*, continuous and running alongside the other three — so a superseded or withdrawn document does not "move to archive", and Record state (below) is what carries that instead.

**Status code**
What an issue of a container is authorised to be used for, assigned by its originator (ISO 19650-2 cl. 5.1.7; UK National Annex). The **2021** set is `S0`–`S5` for work in progress and shared, and `A1, An…` for published. Two acts, two parties: `S4` is **authorization** by the lead appointed party, `S5` is **acceptance** by the appointing party, and only after both does a contractual `An` container exist. Published codes are **stage-agnostic** — what each `An` means is defined in the project's own information standard, not by the standard. A status code is **not** a purpose of issue, though fixed relationships exist between them. ⚠ *"Suitability"* is the older BS 1192 / PAS 1192-2 word for what a status code expresses; prefer **status code**. And beware the **2018** table, which most free material still reproduces: in it `S5` meant *withdrawn*, `S6`/`S7` and `CR` existed, and `A2` implied a RIBA stage — all superseded.

**Revision code**
Which issue of a container this is. ISO's form is three-part — `P01.02`: the prefix `P` (preliminary, non-contractual) or `C` (contractual), a two-digit primary revision, and a two-digit WIP version of it. Infora runs a **`v0.x` working series** in the sandbox before the first issue, then `P{NN}` at freeze or promotion and `C{NN}` at client acceptance — a **deliberate deviation** in notation, not in meaning (ADR-0041).

**Record state**
Whether a document may still be relied on: `live`, `superseded`, `withdrawn`, `rejected` (ADR-0013). **Infora's own axis, and the only one of the four that is** — ISO never needed it, because a human always reads the current revision from a register, whereas an un-withdrawn container **grounds silently**. Set by a person, audited, with a reason. **Authority follows the publication boundary**: while a container is pre-publication the record is the producing organisation's, and once published into the owner's library it is the owner's, with the producer proposing. A document in any state but `live` stays in the library, stays readable, and stays auditable — it simply stops being current.

**Context state**
Whether an agent may use a container: the **derived** answer to *is this in the context layer*. Computed from three facts and **never set directly** — in the library (ADR-0011), record state `live` (ADR-0013), and admitted by an acceptance code the project has marked as grounding (ADR-0003). **Not access** (component 2 resolves that, and this changes nothing about who may see what) and not a stored decision: a switch that set it independently of its inputs would give the platform two state machines that disagree. A deliverable displays its context state with the input that produced it — *not used for AI answers — superseded* — and a user may still pin an out-of-context document as an **Attached source**, badged user-supplied and never cited.

**Supersede**
A document becoming no longer current. **Three ways, and they are not the same act.** *Automatic* when a newer version of the same container is promoted — structural, and the producer's own doing. *By edge* when a **different document** becomes the authoritative one: a `supersedes` **relationship edge** between two containers (ADR-0045), proposed by either party and **confirmed by the owner**, whose confirmation sets the target's record state. *Never by a bare state-set on a library container*, because supersession is a claim about two documents and an edge is what records both ends. A superseded document stays in the project library and leaves the grounded corpus.

**Withdraw**
A document being marked no longer to be relied on **with nothing replacing it** — which is why it is a record state and not an edge: there is no second document to point at. Carries a **mandatory reason**, whose visibility follows the container it is about, so the producing organisation reads it and an organisation the deliverable was never shared with learns nothing. The producing organisation is **notified** (ADR-0049). Set by the producing organisation while the container is pre-publication and by the owner once it is in the library, with the producer proposing. The document stays in the project library and remains auditable, but leaves the grounded corpus. ⚠ Distinct from **removing a planned row from a delivery plan**, which shares the enum value and is always the producing organisation's own act.

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

**Working document (bound / unbound)**
A document drafted in a sandbox (ADR-0038). Two tracks, distinguished by exactly one fact: whether it links to a planned container. **Bound** — it carries a `container_id` linking it to a planned TIDP container (ADR-0032 addendum), so it wears that container's coded reference and plan-owned identity, inherited by reference through the link, and is destined for that container on promotion. **Unbound** — no link: a free, internal-only working document with light, author-owned metadata that may never leave the sandbox as-is. The distinguishing fact is the link's presence, never a status flag or document kind. An unbound document cannot reach the controlled record until a **binding transition** creates a plan row and links it (the unplanned path — ADR-0008 "the plan may evolve", ADR-0032). Term minted 2026-07-22.

**Binding transition**
The first-class, audited, one-way event that links a sandbox working document to a planned TIDP container (ADR-0038) — the moment it becomes the intended draft of that deliverable, wears the container's coded reference, and has its identity metadata locked. A **coordination act, not promotion**: it tells the team "this draft will become deliverable X", but the document stays a **live sandbox draft** — still editable, not snapshotted, not in any review cycle — and may sit **bound but not promoted** indefinitely while drafting continues. Fired by the producing side (creating a plan row is a producing-org act, ADR-0033; the lead author is the natural hand); it can coincide with "draft this planned deliverable" (created already bound) or happen later on an existing working document (the unplanned path). **One-way:** a bound document never silently reverts to a free working file — that would let the plan-owned code be edited off-plan; a binding mistake is unwound through the records lifecycle (withdraw / reject the container), never by unbinding. Distinct from **Promote**, the later event that snapshots the head into an immutable Version and launches the review cycle.

**Identity metadata**
The plan-owned fields that fix a deliverable's identity: its coded reference, discipline, and the review-group / authoring appointments. Held on the container / plan (ADR-0033), set by the producing organisation at planning. On a **bound** working document it is **read-only in the sandbox**, inherited by reference through the link, so it stays stable across the working-doc → version → container lifecycle (ADR-0002's "reference unchanged across versions"); changing it means editing the plan container — a producing-org planning act — not editing the document. On an **unbound** working document there is no plan owner, so nothing is locked (see Authoring metadata). The lock is a consequence of binding, not a property of every sandbox document.

**Authoring metadata**
The document-specific fields that accrue on a working document in the sandbox and carry on promotion into the version: revision attributes (rev / suitability codes), its **Classification** and **Relationship edges** (against the project ontology, ADR-0045), `origin` / `kind` / `format` (ADR-0034). Freely editable by the authoring team. On a **bound** document it accrues alongside the locked identity metadata; on an **unbound** document *all* metadata is authoring metadata — freely editable, author-owned — until a binding transition makes any identity fields plan-owned and locks them. Its accrual is **not a promotion gate**: promotion stays a near-empty hand-off (ADR-0008), identity coming from the plan.

**Project ontology**
The project's legible model of *how its documents relate*, in two layers (ADR-0045). The **classification vocabulary** — the schema layer — is a controlled set of terms deliverables classify against (discipline, system / asset breakdown, work package, document type, phase), **seeded by copy** at project creation from an Infora default grounded in **Uniclass 2015 / ISO 19650** (ADR-0041), then owned by the **project-library owner** and extended the way the naming scheme is (a producer proposes a value, the owner folds it into the project-wide vocab). One shared vocabulary per project, not per organisation — the wall hides content, not the classification skeleton, and a shared skeleton is what lets the owner's MIDP compare like with like across producers. The **relationship edges** — the instance layer — are the typed links below. Colocated in Postgres and **derived from the record, never hand-maintained** (Claude-owned mechanics, ADR-0045); it is metadata and structure, never a grounded corpus (grounding is unchanged — ADR-0011/0021).

**Classification**
A deliverable's placement in the project's classification vocabulary. **Agent-proposed** at planning / promotion and shown on the container as an **editable field** the authoring team can correct (it rides the plan metadata, giving ADR-0008's deferred per-project metadata *schema* its shape). What the owner's MIDP and the retrieval pre-filter (ADR-0022) key off to compare and scope across producers.

**Relationship edge**
A first-class, append-only, directional link between two containers — `supersedes`, `references`, `responds-to`, `is-part-of`, `derived-from` (ADR-0045). Replaces "relationships to other documents" as free text (see Authoring metadata). **Agent-proposed on promotion and human-confirmed** before going live — nothing structural is auto-written without a person in the loop; cross-organisation naming is reconciled by ontology matching (org A's "flood study" = org B's "FRA"). **On a library container the confirming hand is the owner's** (2026-08-27), because the record is the owner's once published; either party may propose. **`supersedes` is the one edge type with a lifecycle consequence** — confirming it sets the target's **record state** to superseded and therefore stops it grounding; the other four describe and change nothing. Currency-by-state like everything else (ADR-0013): a stale edge is retired, never deleted. What lets an agent run the structural checks RAG cannot — collision, coverage / lost-work, supersede-impact.

**Standard workflow**
A workflow provided by Infora; surfaces as a **standard tool** on the Tools page, available to all users.

**Custom workflow**
A workflow built by an organisation, held in org context, deployable to any project the organisation works on; surfaces as one of the organisation's own **tools**, visible only to that organisation's users (individually-built tools are org-visible in the MVP — 2026-07-13 scoping ruling, tracker).

**Capability**
A reusable domain skill that workflows compose. Examples: grounded generation, compliance check, tabular review, plain-English, document understanding.

**Notification**
A persisted record that something happened which a named user should know about: recipient, event type, a reference to its subject (a round, a document, a comment), and a read state. **Its visibility follows the thing it points at** — a notification is never a channel by which a fact reaches someone who could not otherwise reach it. The in-app list is the surface of record; **email is a nudge that carries a pointer and a bare fact, never content**, because an email leaves the platform into a mailbox where access resolution no longer applies. The pilot set is *round issued*, *@-mention*, and — added 2026-08-27 — *record state changed by another organisation's act*, which tells a producing organisation that a deliverable of theirs has been withdrawn or superseded by an owner-confirmed edge. That third event deliberately excludes the routine case where a producer's own promotion supersedes the prior version (ADR-0049).

**Finding**
A single structured result from the **checker** — never prose. It names the input it arose from (the corpus, an attached document, or the firm's rulebook), **anchors into the draft** at a locator, and carries a severity and its evidence; it may also carry a proposed revision, which is offered as a **suggestion** and never applied automatically. A finding states a *defect*, never a *verdict*: it says a paragraph asserts a figure with no source, not that a chapter is compliant — the system does not give an unqualified professional opinion. Where the evidence is a house rule, the finding may quote it **verbatim without citing it**: a rule is an instruction to the author, not a fact about the scheme, so it never enters the citation register and must not render as a source. A finding quoting an organisation's rulebook is **org-private** and never crosses the wall (ADR-0048).

**Agent**
The software actor that performs the work: it carries out the steps of a workflow, drawing on capabilities and the assembled working input, and produces suggestions and outputs. It is the actor, distinct from the *workflow* (the governed process it runs), the *capability* (a reusable skill it draws on), the *run* (the audit record of its execution), and *orchestration* (the layer that plans the work and routes it across specialist sub-agents). Every agent executes inside exactly one assembly environment (ADR-0025), reaching only that environment's channels, and runs within the governance envelope, bound by the project's Rails — it cannot step outside them. An agent has one of two provenances, mirroring workflows: an **Infora-built agent** ships with the platform and runs the standard workflows; a **custom agent** (org-built) is built by an organisation, held in org context, and deployable to any project the org works on — the build-your-own layer of the long-term vision. Both kinds run in the same environment under the same envelope: a custom agent deployed into a project inherits that project owner's Rails and may tighten its own organisation's private work but can never loosen them (governance authority to be recorded in a forthcoming ADR).

**Work item**
One unit of work on a project — for document production, the deliverable's *work half*, linked one-to-one to its Container (ADR-0032 addendum). Carries a type (the workflow behind it), a status, and an assignee. Its status is event-driven, never hand-set: planned → drafting → in review → accepted or rejected, moved by the review cycle's events. The underlying type, not the spoken label: in the interface a work item is titled by its real name (for example, "Statement of community consultation"), the way you would say "the document" or "the review". Reserved alternatives below.

**Conversation**
The persistent thread an agent interaction happens in — the chat-interface "thread" that accumulates messages and the Runs they trigger. Every Run happens in exactly one Conversation; a Conversation may carry many Runs over its life. A Conversation is optionally bound to a Work item when its thread is doing governed project work; an ad-hoc chat question is a Conversation with no Work item. (M1.) **On a document, the Conversation is a shared, *multiplayer* thread** (ADR-0039): its prompts and responses are visible to the document's **sandbox participant scope** (ADR-0036 participant-private), so teammates work one agent thread rather than private lanes. Two things are **not** pooled by a shared thread: each Run's org **informing channel**, resolved per-run to the *invoking* Participant's organisation and never reachable from another organisation's run (ADR-0025, ADR-0020); and each Run's audit internals, which stay producing-organisation-private (the liability model, T-104). A shared thread shares outputs, never one organisation's private steer or run internals.

**Multiplayer**
The collaborative mode of the editor and the document workspace: several Participants work the same document, its inline drafting canvas, and its shared agent **Conversation** at once, seeing each other's contributions (ADR-0039). Its visibility boundary is the document's **sandbox participant scope** (ADR-0036 participant-private) — multiplayer is shared with exactly that set and never beyond it, so in a single-organisation sandbox the org's team share it, and in a cross-organisation shared sandbox the co-authoring organisations do (a scope the owner opened, ADR-0019). Shared across the players: the canvas, the Conversation thread (prompts and responses), edits, and the document **guidance note**. Not pooled, even in multiplayer: each Run's org **informing channel** (per-invoker, ADR-0025/0020) and each Run's audit internals (producing-organisation-private, T-104). Drafting is produced inline on the canvas and accepted into standard text — the shared thread, not a persistent suggestions panel, is the shared record of how a draft was worked. Modelled on the "multiplayer" pattern of collaborative editors (Figma, Notion).

**Run**
The recorded execution of an agent — one agent execution, whether a chat answer or a workflow step. Used in the same sense as the Assistants-API "Run." Has exactly one parent Conversation and an optional Work item link; a Work item accumulates many Runs over its life. The unit of the agent-execution audit trail, append-only and immutable once written (mirroring the DRR and ADR-0002). Decomposes into Steps, and may itself be a child Run spawned by a sub-agent, so the run/step record is a tree.

**Step**
One atomic action within a Run — a retrieval, a capability call, a generation. The granular unit each Run records for the audit trail (the Assistants-API "run step"). A Step may delegate to a sub-agent, spawning a **child Run**, so a Run is a tree of Runs and Steps. Sub-agents are real from v1: the main chat agent delegates retrieval to a sub-agent whose child Run finds relevant documents and folds them into the main agent's context. All retrieval — baseline and agentic — runs **through Context** (the assembly API, M3), never reaching stores directly, so access-resolution-before-retrieval (ADR-0020, ADR-0022) holds by construction. Append-only with its Run. (M1.)

**Comment**
Human review input on a document, raised against a specific version within a round. May be authored in Infora or ingested from a Word document. Carries an acceptance code and, on the next version, an authoring-side Response. Distinct from a Suggestion.

**Response**
The authoring side's reply to a Comment: either a link to the specific section of the next version that addresses it, or an explicit no-change with a reason (ADR-0004). A first-class record in the DRR — and, paired with its comment, the comment-to-resolution data the moat distils (ADR-0032).

**Acceptance code**
A review verdict expressed as a code. Reviewers set one on each comment; the lead reviewer sets the authoritative one for the deliverable. The classification scheme is configurable per project — seeded by copying Infora's default at project creation, so one project's edits never touch another's; whether a code ends the cycle (accepting) is a property of that code in the project's scheme. A code once used is immutable: retired and replaced, never redefined, so history never re-reads. **A code carries three properties** (2026-08-27): whether it **ends the cycle** (`is_accepting`), whether it is **contractual** — only a contractual accepting code issues the `C` revision, ISO's own preliminary/contractual split — and whether it **grounds**, admitting the deliverable to the AI's reach. The default scheme seeds from the **2021** UK National Annex (`S0`–`S5`, `A1, An…`), and grounding must be project-configurable because the standard itself makes published codes stage-agnostic and leaves each code's meaning to the project's information standard. **The terminal verb is a configurable label over a fixed state.** The cycle's terminal *state* is fixed in the model — **accepted** or **closed-rejected**; the verb shown is a per-project *label* over it ("accept" by default, "approve" where a project prefers it), and the internal (sandbox-scope) gate may label differently from the client gate, each being its own cycle instance with its own scheme. Vary the word, never the state: retrieval, grounding and records lifecycle key off the fixed state (`is_accepting`), never the label, so one project's wording never changes another's behaviour.

**Anchor**
The structured location of a comment on a version's PDF: page plus highlight coordinates or a dropped point, with the selected text. Stored on the DRR comment record and bound to the version.

**Suggestion**
An agent-produced change offered for accept, edit, or reject. Distinct from a Comment (a Comment is human; a Suggestion is the agent).

**Signal**
A captured resolution decision on a Comment or a Suggestion. The feedback data behind the moat, and it feeds **two separate flywheels** (ADR-0026, amended 2026-08-26). *The organisation's own:* a firm's Signals improve that firm's portable layer alone, drawn only from its own owned, abstracted material, never reaching another organisation. *Infora's:* a **de-identified characterisation of what a person changed** — abstracted inside the customer's boundary, and collated across several organisations — may improve the shipped product for every customer. That second path rests only in artefacts a person can read, version, argue with and delete (Lens definitions, checker rules, workflow definitions, eval cases) and **never in model weights**; a convention seen at one firm alone is that firm's house style rather than the discipline's, and stays in its own layer. The Signal row itself never leaves the organisation. Compounding is still by retrieval and codified workflows, **not** by training a shared model on customer data, and any future training use stays per-tenant on the originating organisation's own de-identified Signals. The Signal sink is grilled in Session 7.

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

## The consenting domain (NSIP / DCO)

Added 2026-07-29 with the Ask agent harness. The rest of this glossary is Infora's own language plus the ISO 19650 / CDE document-control vocabulary the platform is built on; this section is the **customer's** language — the statutory regime Infora's first users work inside. It is held here because Ask's credibility rests on using it exactly, and because a term used loosely in a prompt or a Lens becomes a wrong answer in a real examination. Terms are defined as practitioners use them, not as a statute would.

**NSIP**
Nationally Significant Infrastructure Project. The class of scheme consented through the Planning Act 2008 regime rather than through ordinary town and country planning.

**DCO**
Development Consent Order. The consent granted for an NSIP — a statutory instrument that both permits the scheme and carries the requirements and powers it operates under. **Requirement** in a DCO is the analogue of a planning condition; where this glossary's own "requirement" is meant, context distinguishes them.

**PINS**
The Planning Inspectorate. Administers the regime and publishes advice under it.

**ExA**
Examining Authority. The inspector or panel of inspectors examining an application. Ask never predicts what an ExA will conclude (see **Lens**, the shared core).

**PEIR**
Preliminary Environmental Information Report. The pre-application document consulted on. **Distinct from the ES**, at a different stage with a different statutory function — conflating the two is a real and damaging error, and every Lens prohibits it.

**ES**
Environmental Statement. The environmental assessment submitted with the application.

**EIA**
Environmental Impact Assessment. The process; the ES is its output. Governed for this regime by the Infrastructure Planning (EIA) Regulations 2017.

**HRA / AA**
Habitats Regulations Assessment, and the Appropriate Assessment within it where a likely significant effect on a European site cannot be ruled out. Under the Conservation of Habitats and Species Regulations 2017.

**NPS**
National Policy Statement. The primary policy test against which an application is judged. Versioned and periodically redesignated, which is why **which version applies** is a first-order question rather than a detail (see **Authority corpus**).

**s.51 advice**
Advice published by PINS under section 51 of the Planning Act 2008. Public, scheme-specific, and part of the canon.

**Rule 6 / Rule 8 letter**
Procedural letters setting and confirming the examination timetable.

**ISH / OFH**
Issue Specific Hearing / Open Floor Hearing.

**Deadline 1, 2, 3…**
The examination's submission windows. A programme fact, and the anchor for most Project Manager Lens questions.

**RIES**
Report on the Implications for European Sites.

**DL**
Decision Letter from the Secretary of State. With precedent DCOs, part of the canon.

**CoCP**
Code of Construction Practice. Secures construction-phase controls; frequently the document where a commitment actually lives.

**REAC**
Register of Environmental Actions and Commitments. The commitments register. **A REAC entry is a commitment, never a discretionary option** — a rule every Lens carries.

**Rochdale Envelope**
The parameter range within which design flexibility is assessed. Moving outside it is an assessment question, not a design one — the boundary the Engineer Lens is built to make visible.

**Advice Note 7**
PINS advice on EIA process and content.

**The canon**
Collective term for the stable, public, hierarchical body of consenting law, policy and guidance: the Planning Act 2008, the Infrastructure Planning (EIA) Regulations 2017, the Habitats Regulations 2017, National Policy Statements, PINS Advice Notes, s.51 advice, and precedent DCOs and Decision Letters. **In Infora this is the authority corpus (ADR-0023, extended 2026-07-29)** — versioned by in-force date rather than by document revision, and citable directly. It is **two-tier**: a **standard tier** Infora ships, confined to freely shippable material (the instruments listed above are Crown copyright under the Open Government Licence, so Infora buys no per-customer standards subscriptions), and an **organisation tier** an org owner adds — licensed standards it already subscribes to (ISO, BSI), sector guidance, its own policy — held in that organisation's portable org context, travelling to every project it works on, and never crossing the wall. Both tiers ground and are cited; org placement does not make the organisation tier *informing*, because the operative test is what the material is (a published external instrument with an issuing body, version and in-force date), not who loaded it (ADR-0021). Currency splits with the tiers: Infora maintains it for the standard tier and cannot for the organisation tier, so org-tier entries carry an org-declared interval and a last-reviewed date, reported distinctly. Prefer *authority corpus* in build and design language; *the canon* is the customer's word for the same thing. Distinct from the **project library**, which is one scheme's own record.

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
The model-agnostic layer that routes each model call along two distinct axes, in order: a **security tier** first filters which models and endpoints are *eligible* (a hard constraint — region, jurisdiction, retention), then **task-based selection** picks the best-suited model *within* that eligible set (an optimisation across capability, cost and latency). Constraint first, optimisation second — a task never overrides a security tier (ADR-0028 §9). v1 ships one adapter behind the interface.

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
The audited event record of a deliverable version being issued, carrying the same facts in both kinds — sender, recipients, deliverable and version, purpose code, issue and due dates — and differing only in consequence (ADR-0035 §1). A **review transmittal** issues a version into its review round: it flips the DRR edit lock and, on issue, reveals the closed round to the authoring side, freezes the snapshot, and notifies recipients (ADR-0010/0014). A **non-review transmittal** (below) issues a promoted library deliverable to an organisation outside any cycle and carries none of that — no round, no edit lock, no snapshot. An **external transmittal** (below, added 2026-09-01 — ADR-0055) issues one to a party with no Infora account at all, and carries none of it either — so the "both kinds" above is now three. In integrate configuration a transmittal drives a physical handover to the incumbent, deferred. (No longer reserved: minted as a live term.)

**Non-review transmittal**
The owner's issue of a promoted library deliverable to one or more organisations, outside any review cycle (ADR-0035 §1–§2) — the audited, first-class realisation of ADR-0016's owner share, replacing the silent visibility flip. Only the project owner issues it, and issuing sets each receiving organisation's ceiling on that deliverable (the share). It carries an inherent organisation-level acknowledgement gate (below) and never touches a review round or the edit lock. The producing organisation and the owner see the deliverable with no transmittal and no gate.

**External transmittal**
The third transmittal kind: a promoted library deliverable issued to a party with **no Infora account** — a landowner, a consultation respondent, a one-off supplier — from the project library, as an **expiring link to one named version**. The recipient is a **recipient record** (below), never an Organisation and never a Participant, so no clause of the ethical wall changes: there is no grant to resolve, because the link is the access. Carries no round, no edit lock, no snapshot and **no acknowledgement gate** — the download is the receipt. The sender supplies the recipient's email, the **reason**, and the **message** accompanying the link; the owner organisation may set a standard message carried on every external email, and sets which tier of person may issue at all, with everyone below that line requesting and someone above approving (ADR-0055).

**Recipient record**
A name and an email address, and nothing else: the person an external transmittal was issued to. Not an Organisation, not a Participant, not a Membership, and never inside the access model. **There is no identity behind it** — anyone holding the link is the recipient — so it records who a document was *sent* to, never who read it, which is exactly the guarantee the emailed attachment it replaces gives. The first personal data Infora holds about someone with no account (ADR-0055).

**Share acknowledgement**
The receiving organisation's recorded acceptance of a non-review transmittal, which must be fired once before the deliverable is visible or groundable to anyone in that organisation (ADR-0035 §4). **Organisation-level in effect**: one acknowledgement clears the gate for every entitled Participant of the organisation, by whichever Participant fired it. Recorded as an audited row (who, for which organisation, which deliverable and version, when) and **per version** — a newly promoted version re-triggers the gate. Enforced at retrieval, not only at the surface: until the organisation has acknowledged the current version, no Participant of it retrieves the deliverable's chunks, opens it, or resolves its citations. Distinct from per-reader open-tracking, which this is not.

**Acknowledgement mode (controller / open)**
A per-(organisation, project) setting for who may fire the one organisation-level share acknowledgement (ADR-0035 §4). In **controller mode** (the default for a newly admitted organisation) only the organisation's nominated document controller may acknowledge — receipt then precedes the controller's intra-organisation distribution, the ISO 19650 pattern — with the org admin as the fallback so an organisation with no controller nominated is never locked out. In **open mode** any entitled Participant may, the first firing clearing the gate for the whole organisation. The two modes differ only in who is permitted to fire it; its effect is identical.

**Per-participant deliverable grant**
The receiving organisation's optional narrowing of a shared deliverable to named Participants of its own (ADR-0035 §3), held by its org admin (or controller in controller mode), never the project owner. Sits **under** the organisation-level ceiling the share sets and can never widen it (ADR-0015). With no grant present the whole-organisation default holds — every entitled Participant sees the deliverable; with a grant present, visibility narrows to the granted Participants only. Grants may be set by hand or driven by a **standing routing rule** keyed on the deliverable's coded reference (a discipline or team mapped to a code pattern), which grants the right Participants automatically when a matching deliverable is transmitted.

---

## Open items

Open questions are not held here. They live in the **[grill tracker](docs/grill-sessions/grill-questions.md)**, the sole source for open questions across the system; this glossary holds settled language only, and a term lands here once its concept is agreed. The previously listed open item — *signal-derived guidance crossing organisations* — now sits in the grill backlog, to be settled when the per-document guidance-note ADR is grilled.

New terms are agreed and folded in here as they firm up, so this remains the single source of truth for language.
