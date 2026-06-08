# Infora — Ubiquitous Language

The agreed term set for Infora. One word per concept, one concept per word. Every diagram, document, interface label, and the eventual code should use these terms exactly as defined here. Where a term collides with established industry usage (especially Bentley / ProjectWise), the collision is noted so we use the word deliberately.

Status: agreed. Open items, where any remain, are listed at the end.

---

## Parties

**Organisation (Org)**
A company with an Infora account. The boundary for all private data. Examples: a consultant firm, a client body, a contractor.

**Workspace**
An organisation's environment in Infora. One per organisation. It holds the org's private context (knowledge, precedents, custom workflows) and surfaces every project and programme the org owns or is a member of. An organisation acts through its workspace.

**User**
An individual belonging to one organisation.

**Client / Consultant / Contractor**
Roles an organisation plays on a given project, not fixed account types. The same organisation can be a client on one project and a consultant on another.

---

## Project, programme and access

**Project**
A defined construction scheme (for example, build the road from A to B). The central unit of the platform. Has a lifecycle and persists for years.

**Programme**
A set of projects under a single owner organisation, where each project is individual and belongs to at most one programme. Example: National Grid runs an upgrade programme; each upgrade is its own project. The programme owner owns its projects and so has a portfolio view across the set.

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

**Ethical wall**
The isolation between organisations on a project, and the standing default rather than a feature switched on. By default an organisation sees only its own work, what the owner has shared with it, and the shared sandboxes it is in. Two things are private to an organisation and never shared, not even with the owner: its org context and its private sandbox. The owner opens cross-organisation visibility deliberately, by sharing deliverables and by adding organisations to shared sandboxes; within an open review round, comments are visible across the review group (ADR-0014), the one live cross-organisation window. See ADR-0018.

---

## Context and knowledge

**Context**
The umbrella for everything that can be assembled into an agent's working input. Has two scopes (org context and project context).

**Org context**
Context private to one organisation and portable to every project it touches. Held in the org's workspace. Contains the org's sources, knowledge, precedents, and custom workflows.

**Project context**
Context scoped to one project and shared among its members by access. Contains the project's sources, knowledge, and history.

**Source**
A raw ingested document or dataset, held in either context.

**Knowledge**
Curated, structured memory distilled from sources and work: decisions, commitments, precedent positions, history. The compounding layer. (Sits inside Context; Context is the umbrella, Knowledge is the curated store within it.)

**Precedent**
A reusable exemplar (document, clause, or approach) held in org context and brought to any project.

**Project library**
The curated, owner-controlled corpus of trusted project knowledge, and the only corpus the AI grounds on for both chat queries and drafting. A flat collection of deliverables identified by coded references, not a folder structure: sorted, searched and queried by code, never navigated as a tree. Accepted deliverables enter automatically on acceptance; the owner may also add other material (reference documents, standards, baseline data) and shares each deliverable with named organisations. Library visibility is default-deny: a deliverable is seen only by the owner organisation, its author, and organisations the owner has shared it with. Generalises the real-world MIDP. The sandbox and the DRR are not part of it.

---

## Work and workflows

**Workflow**
A defined, governed, repeatable process that produces an output. Examples: document production, assurance, feedback triage.

**Assurance (workflow)**
The AI workflow that checks a document against predetermined rules and style guides. Distinct from the Assurance cycle: a team typically runs the assurance workflow on a draft, then pushes the document through the assurance cycle to publish it.

**Sandbox**
A working area free of document controls (no versioning ceremony, no locking) where teams produce work-in-progress and informal deliverables, assisted by the AI. A sandbox is either shared across a chosen set of organisations or private to one organisation; sharing is set when it is created. A private sandbox is part of an organisation's private floor and is never visible to others, not even the owner. Document controls are absent, but access controls always apply, and the AI never grounds on the sandbox (ADR-0011). A shared sandbox is where organisations collaborate on work in progress, including co-authoring one deliverable (ADR-0019).

**Promote**
The act of taking a sandbox working copy into the assurance cycle as a candidate controlled revision. The crossing from sandbox to controlled record. Distinct from approve (passing a gate) and transmit (issuing the approved deliverable).

**Assurance cycle**
The controlled product-lifecycle process that turns a sandbox document into an assured, published Formal deliverable: metadata, naming convention, document coding, a defined review-and-approval gate sequence, and transmittal. Ships built-in on the Network Rail standard deliverable lifecycle (configurable by users in future). Distinct from the Assurance workflow.

**Formal deliverable**
A document that has been through the assurance cycle and issued as a controlled record. In a record configuration Infora holds that record; in an integrate configuration Infora transmits it to the incumbent.

**Deliverable plan**
The schedule (table) of all deliverable containers to be produced on a project, agreed at the outset and evolving over time. Holds the naming rules and, per row, the reference, review group and status. The real-world TIDP and MIDP are instances of this.

**Supersede**
A document becoming no longer current. Automatic when a newer version is promoted, or set deliberately by the owner. A superseded document stays in the project library but leaves the grounded corpus.

**Withdraw**
An owner-set state marking a document as no longer to be relied on. The document stays in the project library and remains auditable, but leaves the grounded corpus.

**Record configuration**
A per-project setting that determines where the published controlled record sits. Two values: *record* (Infora holds the controlled record end to end) and *integrate* (Infora transmits the approved deliverable to an incumbent document management system that holds it). The two differ only in post-publication custody.

**Document reference**
The stable identifier for a controlled document, unchanged across every version.

**Container**
The persistent home of a single deliverable, identified by its document reference and unchanged across versions. Holds the version history and both renditions (native source and PDF). A row in the deliverable plan.

**Version reference**
The changing part of the reference, appended to the document reference, that identifies the version (v1, v2 and so on).

**Rendition**
A representation of a version of a deliverable. The native file is the owned source; the PDF is the authoritative review-and-record rendition, bound to the native file at promotion.

**Standard workflow**
A workflow provided by Infora.

**Custom workflow**
A workflow built by an organisation, held in org context, deployable to any project the organisation works on.

**Capability**
A reusable domain skill that workflows compose. Examples: grounded generation, compliance check, tabular review, plain-English, document understanding.

**Work item**
One unit of work on a project. Carries a type (the workflow behind it), a status, and an assignee. The underlying type, not the spoken label: in the interface a work item is titled by its real name (for example, "Statement of community consultation"), the way you would say "the document" or "the review". Reserved alternatives below.

**Run**
The recorded execution of orchestration behind a work item. The unit of the audit trail.

**Comment**
Human review input on a document, raised against a specific version. May be authored in Infora or ingested from a Word document. Carries an acceptance code and, on the next version, a consultant response. Distinct from a Suggestion.

**Acceptance code**
A review verdict expressed as a code. Reviewers set one on each comment; the lead reviewer sets the authoritative one for the deliverable. The classification scheme is configurable per project; whether a code blocks acceptance is a property of that code in the project's scheme.

**Anchor**
The structured location of a comment on a version's PDF: page plus highlight coordinates or a dropped point, with the selected text. Stored on the DRR comment record and bound to the version.

**Suggestion**
An agent-produced change offered for accept, edit, or reject. Distinct from a Comment (a Comment is human; a Suggestion is the agent).

**Signal**
A captured resolution decision on a Comment or a Suggestion. The feedback data behind the moat and the future training set.

**Deliverable Review Record (DRR)**
The single live log of a deliverable's review across every version: comments, consultant responses, and acceptance coding. Spans v1, v2, v3 and so on as one artifact. Its history is append-only: once a version is issued, that version's comments and responses become permanent and cannot be rewritten. Users only ever interact with the live DRR. At each transmittal (lead reviewer to consultant, and consultant back) the system freezes an internal snapshot of the comments and responses as the formal record, retrievable if needed but never a document users open. Replaces the Excel Document Review Notice; no separate notice is ever issued.

**Reviewer**
A project member assigned to review a transmitted deliverable. May belong to any organisation on the project, not only the owner. Adds and codes comments in the DRR. Appointed per deliverable at planning, when the review group is named on the deliverable plan (ADR-0008), not at transmittal.

**Lead reviewer**
A reviewer with authority over a deliverable's review. May edit or amend other reviewers' comments and codes, and sets the authoritative overall acceptance code for the document.

**Review group**
The named reviewers and the lead reviewer appointed to a deliverable's review. Holds the DRR edit lock while a round is open, so only the group may write comments and codes then. It does not hold visibility alone: every party with deliverable access sees each issued round. The consultant never joins the group; it takes the edit lock in its own right when the lead reviewer issues the round. Named on the deliverable plan and amendable by the owner at any time, including mid-cycle.

**Edit lock**
The single write token on a deliverable's DRR that decides who may add or change comments, codes and responses. It alternates with the review cycle, driven by transmittal in both directions: the appointed reviewers hold it while a round is open, the authoring team holds it once the lead reviewer issues the round, and it returns to the reviewers when the lead author promotes the next version. Distinct from visibility, which is permanent for every issued round and shared by all parties with deliverable access, with only the open round hidden from the consultant. Distinct also from the document check-in/out lock, which governs a controlled revision, not the review record. See ADR-0014.

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
A governance rule applied at generation time: register, negative constraints, confidence calibration.

**Compliance**
Conformance to policy and legislation (the DCO regime, planning policy, PINS requirements).

**Audit trail**
The complete record of every agent, user, and system action on a run or project.

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

None outstanding. Future additions to be agreed and folded in here so this remains the single source of truth.
