# Infora — Architecture & Component Understanding

Companion to the glossary (`infora-ubiquitous-language.md`). This document captures our shared understanding of the system: the overarching architecture, then each component, what we have agreed, and the open questions to resolve.

**How to use it.** Four document types divide the labour. `CONTEXT.md` is the **language** (the canonical terms). This document is the **vision and whole-system overview**: the aim, the four architecture views, and a thin overview of each component. Each **component doc** (for example `docs/architecture/access-model.md`, `docs/architecture/document-management.md`) is the **structure** of one component: a prose overview plus a sub-component register. `docs/adr/` holds the **decisions** (why each fork went the way it did). A component is grilled one at a time with `grill-with-docs`, walking its open questions until each is precise enough to generate the code; as a component locks, its detail moves out of this doc into its own component doc and the section here shrinks to an overview with a pointer. Components not yet grilled still carry their open questions and **candidate ADRs** below, as the live roadmap.

---

## Where we got to

We started from Legora's "agentic operating system" launch and took the view that the same category shape — a vertical agentic OS — is a stronger bet in planning and construction than in legal, because the lifecycle is longer, the parties more fragmented, and the client mandate is a natural adoption mechanism. We then corrected the central model: Infora is **not** a hierarchy with a promoter on top. It is a **network**. An organisation works through its workspace across many projects, owns some and joins others, and carries a private, portable toolkit (its context) everywhere. "Owner" is a per-project role that can be held by a client or a consultant.

We locked a glossary, then broke the system into **nine components** with a grilling order, access model first because everything inherits from it.

---

## The overarching emerging architecture

Four views of the same system: the network model (who relates to whom), the layered stack (what the platform is made of), the app architecture (how the running system is organised), and the repository structure (how the code is laid out). Then the first build slice.

### 1. The network model

An organisation acts through its **workspace**. Each **project** is a shared space with exactly one **owner** organisation and other organisations as **members**. A **programme** groups projects under a single owner. The owner controls what is shared; **ethical walls** isolate members from each other. Org context is private and portable; project context is shared by access.

<svg width="100%" viewBox="0 0 680 444" role="img" xmlns="http://www.w3.org/2000/svg"><title>Network model</title>
<style>
.t{font:500 13px system-ui,-apple-system,sans-serif;fill:#28261f;}
.s{font:400 11px system-ui,-apple-system,sans-serif;fill:#6b6760;}
.box{fill:#f7f7f5;stroke:#d6d3cd;stroke-width:.5;}
.teal{fill:#e7f4f0;stroke:#159a74;stroke-width:.5;}
.purple{fill:#ecebfb;stroke:#6d5dd3;stroke-width:.5;}
</style>
<rect class="purple" x="44" y="150" width="184" height="124" rx="12"/>
<text class="t" x="136" y="176" text-anchor="middle">Your firm</text>
<text class="s" x="136" y="193" text-anchor="middle">Consultant workspace</text>
<rect x="58" y="208" width="156" height="52" rx="8" fill="none" stroke="#7f77dd" stroke-width=".5" stroke-dasharray="4 4"/>
<text class="s" x="136" y="224" text-anchor="middle">Private toolkit</text>
<text class="s" x="136" y="241" text-anchor="middle">travels to every project</text>
<line x1="228" y1="200" x2="296" y2="98" stroke="#9b988f" stroke-width="1"/>
<line x1="228" y1="212" x2="296" y2="222" stroke="#9b988f" stroke-width="1"/>
<line x1="228" y1="224" x2="296" y2="346" stroke="#9b988f" stroke-width="1"/>
<rect class="teal" x="298" y="46" width="338" height="104" rx="12"/>
<text class="t" x="316" y="72" text-anchor="start">Road A to B</text>
<rect class="box" x="316" y="84" width="176" height="22" rx="5"/><text class="s" x="404" y="99" text-anchor="middle">Owner: National Grid</text>
<rect class="purple" x="316" y="116" width="84" height="22" rx="5"/><text class="s" x="358" y="131" text-anchor="middle">Your firm</text>
<rect class="box" x="408" y="116" width="66" height="22" rx="5"/><text class="s" x="441" y="131" text-anchor="middle">Atkins</text>
<rect class="box" x="482" y="116" width="58" height="22" rx="5"/><text class="s" x="511" y="131" text-anchor="middle">BAM</text>
<rect class="teal" x="298" y="170" width="338" height="104" rx="12"/>
<text class="t" x="316" y="196" text-anchor="start">Footbridge upgrade</text>
<rect class="purple" x="316" y="208" width="150" height="22" rx="5"/><text class="s" x="391" y="223" text-anchor="middle">Owner: your firm</text>
<rect class="box" x="316" y="240" width="208" height="22" rx="5"/><text class="s" x="420" y="255" text-anchor="middle">Small client</text>
<rect class="teal" x="298" y="294" width="338" height="104" rx="12"/>
<text class="t" x="316" y="320" text-anchor="start">Rail depot expansion</text>
<rect class="box" x="316" y="332" width="176" height="22" rx="5"/><text class="s" x="404" y="347" text-anchor="middle">Owner: Network Rail</text>
<rect class="purple" x="316" y="364" width="84" height="22" rx="5"/><text class="s" x="358" y="379" text-anchor="middle">Your firm</text>
<rect class="box" x="408" y="364" width="60" height="22" rx="5"/><text class="s" x="438" y="379" text-anchor="middle">Mott</text>
<text class="s" x="340" y="424" text-anchor="middle">You join many projects and own some. Your toolkit travels to all of them; each owner controls who sees what.</text>
</svg>

### 2. The layered stack

The platform as reusable layers. The model is rented at the bottom; the durable moat is the project knowledge that compounds and the governance that wraps everything. Org context and project context both feed the layers above.

<svg width="100%" viewBox="0 0 680 558" role="img" xmlns="http://www.w3.org/2000/svg"><title>Layered stack</title>
<style>
.t{font:500 13px system-ui,-apple-system,sans-serif;fill:#28261f;}
.s{font:400 11px system-ui,-apple-system,sans-serif;fill:#6b6760;}
.box{fill:#f7f7f5;stroke:#d6d3cd;stroke-width:.5;}
.teal{fill:#e7f4f0;stroke:#159a74;stroke-width:1;}
</style>
<rect x="40" y="40" width="600" height="478" rx="18" fill="none" stroke="#159a74" stroke-width="1" stroke-dasharray="5 5"/>
<text class="t" x="340" y="64" text-anchor="middle">Governance, security &amp; multi-party access</text>
<text class="s" x="340" y="82" text-anchor="middle">Audited, isolated, scoped per project</text>
<rect class="box" x="72" y="98" width="536" height="46" rx="8"/><text class="t" x="340" y="115" text-anchor="middle">Surfaces &amp; interfaces</text><text class="s" x="340" y="132" text-anchor="middle">Workspace, project home, document management, Word add-in</text>
<rect class="box" x="72" y="155" width="536" height="46" rx="8"/><text class="t" x="340" y="172" text-anchor="middle">Workflows</text><text class="s" x="340" y="189" text-anchor="middle">Governed end-to-end processes, standard and custom</text>
<rect class="box" x="72" y="212" width="536" height="46" rx="8"/><text class="t" x="340" y="229" text-anchor="middle">Domain capabilities</text><text class="s" x="340" y="246" text-anchor="middle">Grounded drafting, compliance, review, tabular</text>
<rect class="teal" x="72" y="269" width="536" height="46" rx="8"/><text class="t" x="340" y="286" text-anchor="middle">Project knowledge</text><text class="s" x="340" y="303" text-anchor="middle">Compounds across the lifecycle</text>
<rect class="box" x="72" y="326" width="536" height="46" rx="8"/><text class="t" x="340" y="343" text-anchor="middle">Connected data</text><text class="s" x="340" y="360" text-anchor="middle">Documents, drawings, GIS / CAD, consents</text>
<rect class="box" x="72" y="383" width="536" height="46" rx="8"/><text class="t" x="340" y="400" text-anchor="middle">Agentic orchestration</text><text class="s" x="340" y="417" text-anchor="middle">Plans and routes specialist sub-agents</text>
<rect class="box" x="72" y="440" width="536" height="46" rx="8"/><text class="t" x="340" y="457" text-anchor="middle">Model layer</text><text class="s" x="340" y="474" text-anchor="middle">Model-agnostic routing</text>
<rect class="box" x="150" y="528" width="14" height="14" rx="3"/><text class="s" x="170" y="539">Replicable infrastructure</text>
<rect class="teal" x="400" y="528" width="14" height="14" rx="3"/><text class="s" x="420" y="539">Compounding moat</text>
</svg>

### 3. The app architecture

The running system. Every surface passes through the **access layer**, which resolves identity, project role, ownership, and ethical walls before anything below is touched. The engine draws on both context stores at once. Governance and audit wrap the lower layers.

<svg width="100%" viewBox="0 0 680 478" role="img" xmlns="http://www.w3.org/2000/svg"><title>App architecture</title>
<style>
.t{font:500 13px system-ui,-apple-system,sans-serif;fill:#28261f;}
.s{font:400 11px system-ui,-apple-system,sans-serif;fill:#6b6760;}
.box{fill:#f7f7f5;stroke:#d6d3cd;stroke-width:.5;}
.teal{fill:#e7f4f0;stroke:#159a74;stroke-width:.5;}
.purple{fill:#ecebfb;stroke:#6d5dd3;stroke-width:1;}
</style>
<defs><marker id="aC" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#9b988f"/></marker></defs>
<rect class="box" x="50" y="44" width="180" height="44" rx="8"/><text class="t" x="140" y="66" text-anchor="middle">Consultant app</text>
<rect class="box" x="250" y="44" width="180" height="44" rx="8"/><text class="t" x="340" y="66" text-anchor="middle">Owner / client app</text>
<rect class="box" x="450" y="44" width="180" height="44" rx="8"/><text class="t" x="540" y="66" text-anchor="middle">Word add-in</text>
<line x1="140" y1="88" x2="140" y2="106" stroke="#9b988f"/><line x1="340" y1="88" x2="340" y2="106" stroke="#9b988f"/><line x1="540" y1="88" x2="540" y2="106" stroke="#9b988f"/>
<line x1="140" y1="106" x2="540" y2="106" stroke="#9b988f"/>
<line x1="340" y1="106" x2="340" y2="148" stroke="#9b988f" marker-end="url(#aC)"/>
<rect x="44" y="118" width="592" height="344" rx="16" fill="none" stroke="#159a74" stroke-dasharray="5 5"/>
<text class="s" x="624" y="132" text-anchor="end">Governance &amp; audit</text>
<rect class="purple" x="64" y="150" width="552" height="52" rx="8"/><text class="t" x="340" y="170" text-anchor="middle">Access resolution &amp; ethical walls</text><text class="s" x="340" y="187" text-anchor="middle">Who sees what, per project and per org</text>
<line x1="340" y1="202" x2="340" y2="220" stroke="#9b988f" marker-end="url(#aC)"/>
<rect class="box" x="64" y="224" width="552" height="44" rx="8"/><text class="t" x="340" y="246" text-anchor="middle">Engine: orchestration, capabilities, workflows</text>
<line x1="195" y1="268" x2="195" y2="286" stroke="#9b988f" marker-end="url(#aC)"/><line x1="485" y1="268" x2="485" y2="286" stroke="#9b988f" marker-end="url(#aC)"/>
<rect class="purple" x="64" y="290" width="262" height="58" rx="8"/><text class="t" x="195" y="312" text-anchor="middle">Org context</text><text class="s" x="195" y="330" text-anchor="middle">Private, portable across projects</text>
<rect class="teal" x="354" y="290" width="262" height="58" rx="8"/><text class="t" x="485" y="312" text-anchor="middle">Project context</text><text class="s" x="485" y="330" text-anchor="middle">Per scheme, shared by access</text>
<line x1="195" y1="348" x2="195" y2="370" stroke="#9b988f" marker-end="url(#aC)"/><line x1="485" y1="348" x2="485" y2="370" stroke="#9b988f" marker-end="url(#aC)"/>
<rect class="box" x="64" y="374" width="262" height="52" rx="8"/><text class="t" x="195" y="394" text-anchor="middle">Model layer</text><text class="s" x="195" y="412" text-anchor="middle">Model-agnostic routing</text>
<rect class="box" x="354" y="374" width="262" height="52" rx="8"/><text class="t" x="485" y="394" text-anchor="middle">Connected data</text><text class="s" x="485" y="412" text-anchor="middle">DMS, GIS / CAD, consents</text>
</svg>

### 4. The repository structure

A pnpm + Turborepo monorepo, TypeScript throughout. Surfaces are apps; the layers are packages; the governance envelope and access policy are cross-cutting packages enforced at the API boundary.

```
infora/
├─ apps/
│  ├─ api/                # only deployable that touches the DB and models
│  ├─ web-consultant/     # React: workspace + project home, editor, chat, review
│  ├─ web-owner/          # React: owner/client portfolio view (later)
│  └─ word-addin/         # Office.js task pane, thin client → api (later)
├─ packages/
│  ├─ model/              # model-agnostic router + provider adapters
│  ├─ orchestration/      # planner, sub-agents, tool registry, run state
│  ├─ data/               # connectors, ingestion, retrieval (pgvector)
│  ├─ knowledge/          # project + org context stores, signal capture (moat)
│  ├─ capabilities/       # grounded-gen, compliance, tabular, plain-english
│  ├─ workflows/          # standard + custom workflows composing capabilities
│  ├─ governance/         # audit log, grounding/NLI, rails, access policy
│  ├─ db/                 # Postgres + pgvector: schema, migrations, seed
│  ├─ contracts/          # shared types + API schema (single source of truth)
│  └─ ui/                 # shared React kit + design tokens
└─ turbo.json  pnpm-workspace.yaml  tsconfig.base.json
```

Dependencies flow inward and down: surfaces depend only on `contracts` and `ui`; `api` composes `workflows`; `workflows` use `capabilities` and `orchestration`; those draw on `model`, `data`, `knowledge`. `governance` and `db` are depended on, never depend back.

### 5. The first build slice (walking skeleton)

A thin slice of the whole shape rather than one layer built deep, so the architecture is proven end to end before anything is built out. The journey: a consultant opens a project, asks the chat to draft a short governed section from the project's own sources; the orchestrator runs a real chain (retrieve, draft, ground-check, cite) and logs every step; the draft appears in the editor with citations; the consultant accepts, edits, or rejects, and that signal is captured; the owner logs in on a different role and sees the work item with live status and the full audited run, with access correctly scoped.

What is real even in the skeleton: the access model, the audit trail, and the accept/edit/reject signal capture. What is thin: one model adapter, a fixed orchestration chain, grounded generation real with other capabilities stubbed.

---

## The nine components

Grilling order. Access model first; everything inherits from it.

### 1. Access model

**Responsibility.** Resolve who can see and do what, across organisations, workspaces, projects, programmes, roles, and ethical walls, below the UI and before any data is touched. The purple access layer in the app-architecture diagram.

**Status: locked.** Grilled and decided in ADRs 0014-0019; the full breakdown is in [access-model.md](access-model.md). In short: a network with one owner organisation per project; two access levels (organisation Membership sets the ceiling, user-level Participant grants narrow within it and never pierce a wall); members uniform with only the owner distinct (contributor and viewer retired); a flat coded library, default-deny per deliverable, shared only by the owner; ethical walls as the standing posture, with a private floor (org context and the private sandbox) invisible even to the owner; the authoring and review sides appointed symmetrically and amendable by each lead; and DRR access split into permanent per-round visibility plus a single alternating edit lock flipped by transmittal.

### 2. Context

**Responsibility.** Hold and assemble everything that becomes an agent's working input, split into org context (private, portable) and project context (shared per access).

**What we have agreed.** Context is the umbrella; Knowledge is the curated store within it. Source is raw ingested material; Knowledge is curated, structured memory (decisions, commitments, precedent positions, history) distilled from sources and signals. Precedents live in org context and travel to any project. The moat compounds on two axes: per-project knowledge and per-firm portable knowledge.

**Open questions to grill.**
- How is context assembled and ranked at query time? Retrieval strategy, what gets pulled, how org and project context are combined in one input.
- How is Knowledge distilled from Sources and Signals? Automatic, manual curation, or both?
- How are precedents selected and applied to a new project?
- Store and embedding choices (pgvector noted for the skeleton); is that the long-term answer?
- How is org context kept strictly out of other members' view while still improving shared output?

**Candidate ADR.** The org-context / project-context split as two distinct stores. Hard to reverse; it is the structural expression of the network model.

### 3. Document management (the wedge engine)

**Responsibility.** Store, version, review, approve and publish written deliverables, and hold the project library the AI grounds on, with the controlled-document basics (document-versus-file separation, immutable versions, locking, audit) that make the AI trustworthy. The engine room of the wedge.

**Status: locked.** Grilled and decided in ADRs 0001-0013; the full breakdown is in [document-management.md](document-management.md). In short: working copy separated from controlled record, with immutable versions and one revision in flight at a time; every deliverable planned up front as an empty container; review on the PDF in a native Infora viewer with anchored comments stored as structured fields (the Word add-in is consultant authoring, not a reviewer capture path, in build 1); one live append-only DRR per deliverable; two-level acceptance coding; an assurance cycle whose rounds close only by human action; transmittal as an on-platform event that moves no file; two record configurations (record and integrate); and the project library as the sole grounded corpus, default-deny and owner-curated.

### 4. Standard workflows

**Responsibility.** Infora-provided governed processes that compose capabilities to produce an output: document production, assurance (formerly "QA"), feedback triage, compliance check, internal reports, data interrogation, consultation analysis. The workflow is the type behind a work item.

**What we have agreed.** Each new workflow compounds platform value at low marginal cost. Workflows compose capabilities and run through orchestration. A run is the recorded execution behind a work item.

**Open questions to grill.**
- Which workflows ship first (the MVP set)?
- How is a standard workflow defined? Config, code, composed steps?
- Where are the human-in-the-loop checkpoints?
- How does a workflow drive a work item's status, and how does that tie to the document review/approval lifecycle in component 3?

### 5. Custom-workflow builder

**Responsibility.** Let an organisation build its own workflows, held in org context and deployable to any project the org works on. Org-owned IP. A different problem from running a predefined workflow.

**What we have agreed.** Custom workflows live in org context and are part of the portable toolkit; they are a reason a consultant adopts Infora independent of any client mandate.

**Open questions to grill.**
- Who can build (which role)? What is the building interface: no-code composition of capabilities, prompt-based, or something else?
- Do custom workflows inherit the governance rails automatically?
- Sharing: within the org only, or shareable/sellable across orgs later?
- Validation and testing before a custom workflow is deployed to a live project.

### 6. Compliance capability

**Responsibility.** Test output and documents for conformance to policy and legislation (the DCO regime, planning policy, PINS requirements) and surface gaps and non-conformances. A capability that workflows compose.

**What we have agreed.** Compliance-against-legislation is a capability, distinct from the wider governance envelope. It is what produced the "3 flags" state on the environmental statement work item in the mock.

**Open questions to grill.**
- How is the regulatory framework encoded and kept current as legislation changes?
- Jurisdiction scope for v1.
- Is this checking, generative, or both?
- How are results presented and made actionable (flags, severity, links to the offending text)?

### 7. Governance envelope

**Responsibility.** The cross-cutting concern that makes autonomy trustworthy: grounding (tie every claim to a source, withhold unsupported output), citations, rails (register, negative constraints, confidence calibration), and the audit trail of every agent, user, and system action. Plus the security and compliance posture (the audit trail diagram, the dashed envelope in the stack).

**What we have agreed.** Governance wraps every layer rather than sitting as one. The audit trail is regulator-defensible: it lets you show exactly how any output was produced and grounded, which matters at examination and judicial review. Security posture targets include SOC 2, Cyber Essentials, G-Cloud, GDPR, and zero training on customer data.

**Open questions to grill.**
- Where are rails defined and owned: per capability, per workflow, per org?
- How are grounding thresholds tuned, and what exactly happens to withheld output?
- Audit retention and export format.
- How does the envelope apply to custom workflows users build?
- Data residency and sovereignty routing (links to the model layer), given public-sector buyers.

**Candidate ADR.** Audit-of-every-action as a foundational invariant rather than a later feature.

### 8. Spatial connectors

**Responsibility.** Read and reference spatial and model data — GIS, CAD, BIM — through connectors. Not the storage-and-editing lifecycle of component 3. A later component.

**What we have agreed.** This is a different beast from written documents: spatial and model data (effectively BIM), accessed by reference, not generated and reviewed the same way. Deliberately deferred.

**Open questions to grill.**
- Which products first (Bentley iModels/ProjectWise, Esri, others)?
- Read-only reference, or something deeper?
- How does spatial data enter context, and how is it linked to documents (the Bentley "add spatial location" idea)?
- Confirm timing and priority relative to the wedge.

### 9. Surfaces

**Responsibility.** The interfaces where people and agents meet: the workspace home, the project home (with the left project nav rail), the document-management interface, the consultant workspace (chat plus editor), the owner/client portfolio view (the generalised "control tower"), and the Word add-in. Meet users where they already work.

**What we have agreed.** The project is the context everything sits inside; the command bar is the agent entry; each workflow is its own launchable surface. The left rail carries the project switcher, the sections (Home, Ask, Workflows, Documents, Knowledge, Review), and the firm-scoped user. The owner sees the same home with a portfolio switcher above the project. All surfaces reuse one typed API (`contracts`) so new surfaces add without divergence.

**Open questions to grill.**
- Workspace home versus project home: layout and what lives where.
- The owner portfolio view design.
- Mobile scope.
- The boundary between the document-management interface (component 3) and the generic project surfaces.

---

## The Word plug-in (cross-cutting, do not lose)

The Word add-in spans two components, Surfaces (it is a surface) and Document management (it is the consultant authoring surface), so it is recorded here explicitly.

It is a **thin client**: a task-pane web app (Office.js plus a manifest) with no intelligence locally, calling the same API as every other surface, so it inherits orchestration, context, capabilities, governance, audit, and access scoping. On open it resolves which project the document belongs to. Its job is **governed editing**: agent changes land as native Word tracked changes carrying a citation and rationale, never silent rewrites; the user accepts, edits, or rejects using Word's own review controls, and that resolution is the **Signal**. It is a consultant authoring surface, not a reviewer capture path: reviewers comment on the PDF in Infora's own viewer (ADR-0004), so the add-in does not capture review comments in build 1. Deployment is a GTM lever: Office add-ins push centrally through the M365 admin centre, so an owner can roll Infora out to every appointed consultant at once.

<svg width="100%" viewBox="0 0 680 280" role="img" xmlns="http://www.w3.org/2000/svg"><title>Word add-in data flow</title>
<style>
.t{font:500 13px system-ui,-apple-system,sans-serif;fill:#28261f;}
.s{font:400 11px system-ui,-apple-system,sans-serif;fill:#6b6760;}
.box{fill:#f7f7f5;stroke:#d6d3cd;stroke-width:.5;}
.teal{fill:#e7f4f0;stroke:#159a74;stroke-width:1;}
</style>
<defs><marker id="aE" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#9b988f"/></marker></defs>
<text class="s" x="340" y="34" text-anchor="middle">Context + capability request</text>
<rect class="box" x="50" y="78" width="170" height="66" rx="8"/><text class="t" x="135" y="104" text-anchor="middle">Word document</text><text class="s" x="135" y="122" text-anchor="middle">Selection, text, changes</text>
<rect class="box" x="255" y="78" width="170" height="66" rx="8"/><text class="t" x="340" y="104" text-anchor="middle">Add-in task pane</text><text class="s" x="340" y="122" text-anchor="middle">Thin client, no models</text>
<rect class="box" x="460" y="78" width="170" height="66" rx="8"/><text class="t" x="545" y="104" text-anchor="middle">Infora backend</text><text class="s" x="545" y="122" text-anchor="middle">The full stack</text>
<line x1="220" y1="111" x2="253" y2="111" stroke="#9b988f" marker-end="url(#aE)"/><line x1="425" y1="111" x2="458" y2="111" stroke="#9b988f" marker-end="url(#aE)"/>
<path d="M545 144 L545 186 L135 186 L135 148" fill="none" stroke="#159a74" stroke-width="1" marker-end="url(#aE)"/>
<text class="s" x="340" y="204" text-anchor="middle">Proposed as tracked changes; accept / edit / reject captured</text>
<rect class="teal" x="50" y="226" width="580" height="38" rx="8"/><text class="s" x="340" y="247" text-anchor="middle">Every suggestion, source access and model call written to the audit trail</text>
</svg>

---

## Consolidated open questions and grilling order

Grill in this order, because later components inherit from earlier ones.

1. **Access model.** Locked. See [access-model.md](access-model.md) and ADRs 0014-0019.
2. **Context.** In progress. Assembly and ranking at query time; access-resolved grounding; knowledge distillation; precedent selection; store choice.
3. **Document management.** Locked. See [document-management.md](document-management.md) and ADRs 0001-0013.
4. **Standard workflows.** MVP set; how defined; checkpoints; status and the approval lifecycle.
5. **Custom-workflow builder.** Who builds and how; rails inheritance; sharing; validation.
6. **Compliance capability.** Encoding the framework; jurisdiction; checking versus generative; presenting results.
7. **Governance envelope.** Where rails live; grounding thresholds; audit retention; residency routing.
8. **Spatial connectors.** Products first; depth; linking to documents; timing.
9. **Surfaces.** Workspace versus project home; owner portfolio view; mobile; document-management boundary.

**Candidate ADRs still to write as decisions firm up:** the org/project context split (component 2); audit-of-every-action as an invariant (component 7). Already decided: the network-with-single-owner model (access model); the document record-versus-integrate stance and native hosting (ADR-0001).
