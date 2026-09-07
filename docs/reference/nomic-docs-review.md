# Nomic Platform Documentation — evidence report

> **Provenance.** Researched 2026-09-07 by a browser session at the owner's
> direction, walking the whole docs.nomic.ai tree; landed by the co-captain,
> who re-fetched three load-bearing pages (the workflow overview, the
> ProjectSight permission refusal, syncing-vs-indexing) and found the report
> exact on each. The owner's framing for the research — Infora's wedge is
> owning the information layer, Nomic connects to context that lives
> elsewhere — is recorded in the report's own "Surprises" section, which
> exists so the evidence could contradict it. **Context, never authority,
> and never a citation in an ADR** (this folder's standing rule).

Walked on 7 September 2026 from https://docs.nomic.ai/docs/core/workflows/workflow-builder outward across the whole docs.nomic.ai tree (product docs, API docs, and the Help centre). The site shows no per-page "last updated" markers or version numbers; the footer reads "Copyright © 2026 Nomic, Inc." and the API is labelled "v0 … experimental" [API-OV]. All facts below cite a page key; the key → URL table is at the end. Anything in quotation marks is verbatim; everything else is paraphrase.

## Ten-line summary

1. Nomic's docs describe a per-tenant AEC "AI workspace and project delivery agent" whose central object is the Assistant (an agent over files) and whose workflow is a saved, versioned configuration of that same agent — instructions, tools, permanent context files, per-run requested-file slots, model and thinking — not a multi-step pipeline [WO][ASST].
2. Files are not merely referenced: Nomic has its own file manager, its own folder tree ("My Uploads"), its own upload API, its own file versions, and it stores parsed content and embeddings per file version [FILES][IDX][API-FW].
3. Integrations (SharePoint, Egnyte, Autodesk Forma, Bentley ProjectWise, Fieldwire, Trimble ProjectSight) sync files, folders, metadata, versions and permissions into Nomic on "the connector's sync schedule"; the docs never state a refresh interval and never say whether file bytes are copied or fetched on demand [H-SYNC][H-CONN][IDX].
4. Syncing does not index. Content is searchable only after a separate, paid, per-page indexing step that a user or admin triggers (Egnyte is the one connector that can auto-index) [FILES][IDX].
5. Access rules for synced files are inherited from the source system and, per the docs, cannot be changed inside Nomic; access rules for uploaded files, projects, sessions, workflows and artifacts are Nomic's own [ASST][H-SHARE][H-SSO].
6. Workflow permissions are a first-class, documented model: per-person Can run / Can edit / Owner, promote-to-everyone gated to org or project admins, draft-and-release versioning with restore, archive vs delete [WM].
7. Artifacts (documents, HTML decks, tables, drawing reviews) are Nomic-native structured objects with version history, export, and a finding-status lifecycle; they "follow the permissions of the conversation, workflow run, or workflow seed that created them" [ART].
8. Every admin-section page (roles, identity, settings, deployment, security, analytics, all integration onboarding guides) is password-gated — only their intro paragraphs are public, so setup/auth/tenant specifics for SharePoint and others are NOT publicly documented [ADM-*].
9. "Built-in skills" are not a marketplace of user-made skills: they are seven fixed procedures inside Assistant (drawing review, code check, submittal review, BIM query, CAD query, document/deck drafting, project research) that load from how you phrase the request; there is no documented way for users to author a new skill — users author workflows instead [ASST].
10. There is no documented multi-organisation or cross-tenant model. Each customer is one tenant at `<org>.drive.nomic.ai`; a project holds one firm's members; the only cross-party mechanism documented is exporting findings back into Autodesk Forma or Fieldwire [H-ACCESS][PROJ][DRD].

---

## 1. Workflows

### What a workflow is
- A workflow "locks in tools, instructions, context, and thinking so every run follows the same playbook" [WO]. Each workflow defines: Instructions (the system prompt), Tools (capabilities the agent may call — "search, read files, drawing judge, sub-agents, tables, and so on"), Context (files/folders always available), Requested files (per-run inputs), Project scope (optional), Thinking (Low/Medium/High/Extra High) [WO].
- The docs are explicit that a workflow does not add capability: "The same agent, tools, and models back a conversation and a workflow run. A workflow packages one of these jobs with fixed instructions, permanent context, and a file-request form … it does not unlock capability Assistant lacks in chat" [ASST].
- A workflow is a single agent run with a system prompt, not a chained pipeline of steps. "Steps" exist only as numbered sections inside the Instructions text [AI]. Parallelism happens inside the run via sub-agents the agent dispatches ("dispatch multiple sub-agents in parallel — often one per issue class"), plus a "fast, read-only Explore sub-agent" for reconnaissance [AI].
- Two flavours are documented at the API level: prompt-driven workflows (take `prompt.text`) and slot-driven workflows (take named file inputs via `workflowInputs`) [API-AG].

### Triggers / how a run starts
- Manually: Workflows tab → pick workflow → start → fill requested-file slots → wait [RW]. From a project's Workflows page, runs "open in the project chat experience and remain associated with that project" [WO].
- Programmatically: `POST /api/v0/agents` with `workflowId` (Business/Enterprise only; "Individual plan accounts do not include the Agent API") [API-AG][API-OV]. API agents "always run to completion (the background sessionType)" [API-AG].
- From a completed chat: "+ menu … Create workflow to create a new workflow from the session, or Edit workflow when the conversation came from an existing workflow run" [H-BUILD].
- From project email (marketing-level claim only): Outlook and Gmail integrations exist "so Assistant can work from project email — drafting replies, triaging threads, and starting workflows"; no setup or behaviour is documented [INT].
- ABSENT: no documented scheduling, cron, file-arrival trigger, or webhook trigger. The only "unattended" mode is Extra High thinking ("runs until the task is complete") launched from the API [WO][API-AG]. The submittal page says the workflow "can also be launched from the Agent API if you want to hang it off an existing submittal intake process" — i.e., the customer's system does the triggering [ASR].

### Inputs
- Requested files: named slots with description, required/optional, single/multiple. Multi slots accept folders, which Nomic "expands … to its indexed document children at runtime"; single slots accept documents only [WO][RW].
- Context: persistent files/folders; "Folders work too — Nomic will pull from everything inside. Update them as your standards evolve; runs always use the latest version" [H-CTX].
- Linked Artifacts: markdown docs attached to the workflow that the agent "can read and update … across runs" [ART][WB].
- Capabilities: Code search and Web search, off by default "including on cloned Nomic workflows"; an org admin can disable either org-wide [WB].
- Model and thinking: chosen by the human, never by the builder agent [WB]. API launch can override the workflow's model "for that run only" [API-AG].

### Outputs and where they land
- Runs "produce artifacts — documents, tables, or drawing-review outputs — shown in the artifact panel" of the run's chat session; downloadable as Excel, JSON, PDF markups where applicable; follow-up prompts continue the same session [RW].
- Artifact types and exports: Document → .md/.docx/.pdf; HTML document → .pptx/.pdf/.html; Table → .xlsx/.json; Drawing Review → annotated PDF + findings table (xlsx/json) [ART]. Org admins can upload a .docx reference template so Word exports inherit house fonts/colours/headings [ART].
- Via API: `GET /agents/{id}/artifacts/{artifactId}` returns MARKDOWN_DOCUMENT content or a TABLE with JSON schema + row elements; types TABLE_SCHEMA and TABLE_ELEMENT also exist [API-AG].
- ABSENT: no documented way for a workflow to write its output to a file location (Files folder, SharePoint, Egnyte). Outputs stay as artifacts in the session; the only "push out" is drawing-review findings → Forma issue/RFI or Fieldwire task/RFI [DRD][ACC][FW].

### Who can see and run a workflow; permissions on outputs
- Business/Enterprise only; "Individual plan workflows stay in your account" [WM].
- New workflows "start as Invited people only" [WB][WM]. Roles: "Can run — run the workflow. This is the default"; "Can edit — edit the workflow, release versions, and manage its sharing"; "Owner — full control … Shown for the creator; not an option you assign directly" [WM].
- Promote to "Everyone in your organization" (or everyone in the project) — "Only an organization admin — or, for a project-scoped workflow, a project admin — can promote" [WM].
- Data access at run time is the runner's, not the author's: "Workflows respect the same permissions as the rest of Nomic: the agent only sees files you can access in the project or session" [RW]; "Teammates who can run a workflow still only see the files and project context they personally have access to" [H-SHARE].
- Outputs: "Workflow outputs, including artifacts, follow the permissions of the run or session that produced them. Sharing a run or session lets teammates view the generated outputs, while source file access is still checked separately" [H-SHARE]; "it does not make private source files or unrelated artifacts visible" [ART].
- Run history: the workflow's Runs tab; the Versions tab shows per-version run count, "average and total spend" [WM]. Admin analytics list workflows with owner, visibility, project, run count, avg spend [API-AN].
- Scope: org-wide or project-scoped; moving scope means "only you and invited people can access it in the new location; named collaborators keep their access" [WM].

### Catalogue of documented Nomic (starter) workflows — inputs → outputs [NW]
- Drawing Standards Creation (Drafting): Markups, RFIs, Existing Standards → Drawing Review Standards (markdown artifact).
- Drawing Standards Review (Review): Drawing Set, Internal Standards → Drawing Review.
- Residential Drawing Standards Check (Review, demo with standards artifact pre-attached): Drawing Set → Drawing Review.
- Submittal Review (Coordination): Submittal, Specifications and/or Drawing Set → Annotated Submittal, Review Report (with approval recommendation and copy-ready stamp comment).
- RFI Response (Coordination): Pasted RFI (chat), optional project files → RFI Response.
- RFI Anticipator (Review): Drawing Set, Project Specifications → RFI Findings, RFI Summary, Sheet Index, Detail Inventory, Callout Graph.
- Submittal Log Generator (Drafting): Specs, Drawings, Addenda → Submittal Log (Excel-ready), Executive Summary.
- Drawing Revision Analysis (Review): Baseline Drawing Set, Revised Drawing Set, optional Prior Baseline Sheet Inventory → Revision Issues Table, Scope Impact Report, Reusable Sheet Inventories.
- Invoice Processing Automation (Extraction): Invoices (PDF, image) → Invoice Table + Excel.
- RFP response drafter (Drafting): RFP Document, Past Proposals → Draft Response, Response Outline.
- Code Compliance is listed alongside but is a capability toggle, not a catalogued workflow [NW]. The API example also shows a "Code Compliance Check" workflow with empty `requestedFiles` (prompt-only) [API-FW].

---

## 2. Workflow Builder

### The authoring surface
- "The Workflow Builder is the two-panel editor … a configuration form on the left and an optional builder agent chat on the right. Fill the form in yourself, design it in conversation with the builder agent, or mix both" [WB].
- Sequence documented: (1) Workflows → Create Workflow or `/workflows/new` (from a project page, files it in that project); (2) describe to the builder agent or fill fields; (3) "Set model and context yourself where needed; the builder agent cannot set these for you"; (4) Create/Save → "New workflows start as Invited people only. Sharing, promotion, and scope live on the Sharing tab, not on this form" [WB].
- Form fields: Workflow Name, Category, Description, Inputs and Outputs (labels only — "don't affect how the workflow executes" [AI]), Capabilities (Code search, Web search), Context, Requested Files, Linked Artifacts, Instructions ("the most important field"), Model (+ thinking) [WB].

### Plain language vs configuration
- The builder agent conversation: "You describe the task … The assistant asks follow-up questions … summarizes its understanding … presents a proposed design and asks for confirmation before making changes … populates the form … You iterate together" [WB]. A one-line opener like "I want a workflow that checks drawings against our internal standards" is documented as sufficient [WB].
- What the agent can set: Name, Description, Category, Inputs, Outputs, Requested Files (incl. optional/multiple slots), Instructions ("strongest area"), Linked Artifacts. What it cannot: Model, Context files, Sharing/scope [WB].
- Collaboration guardrails: "The assistant reads before writing … Manual edits are respected … Confirmation before overwriting" [WB]. Available on the edit page after creation too [WB].
- The Instructions field itself is free text; the recommended structure is five sections — role statement, output format, numbered steps, tool instructions (naming tools like "drawing judge" and "upsert_table_element"), verification step [AI]. This means a well-built workflow requires prompt-engineering-style authoring in plain English, including knowing tool names and limits ("You can ask the drawing judge up to twenty questions at a time") [AI].

### Validation, testing, review before going live
- No documented schema validation, dry-run simulator, or test suite. The documented guardrails are: draft-and-release versioning ("Saving in the builder never changes what other people run; that only happens when you explicitly release"), "Run draft" on real inputs with a Draft badge, and a release confirmation dialog that "confirms who it affects — only you, you and your collaborators, or everyone with access" [WM].
- Help-centre practice guidance (not enforced by the product): calibration packet, run same packet after each edit, SME review before promotion, name conventions [H-BUILD][H-GOV][H-CREATE].
- Spend estimate shown "on the run kickoff screen, Nomic workflow rows, and the workflow builder when editing an existing workflow"; "being rolled out and may not be enabled yet" [CE].

### Editing, versioning, sharing
- Settings page tabs: Edit, Sharing, Versions, Runs, Danger zone; the tab is in the URL "so links are shareable" [WM].
- Versioning: "Editing builds a draft; releasing makes a version the live version"; a new version is created only when the top of history is already released, "so repeated edits while drafting do not pile up versions" [H-CREATE]. Versions show creator, run count, spend, configuration; Restore copies an old version into a new one ("Restore & publish" or "Restore to draft"); nothing is deleted [WM].
- Cloning: Nomic workflows can be cloned from the row menu "when you want to customize without overwriting the original" [NW].
- Archive removes org/project-wide access, keeps versions and runs; Delete is permanent [WM].
- Concurrency caveat: prompts disappearing mid-edit "is almost always a stale editor caused by another tab editing the same workflow" — no documented locking [H-TROUBLE].

### What a non-technical user can and cannot do (per the docs)
- Can: create a workflow by describing it in conversation; have the agent draft instructions and slots; run any workflow they're invited to via a "file-request form instead of writing instructions" [WO]; clone a Nomic workflow; follow up in chat after a run; export artifacts; accept/ignore/export drawing findings (session owner only) [H-REVIEW].
- Must still do by hand: pick model and thinking, attach context files, configure sharing; get an admin to promote to everyone [WB][WM].
- Cannot (nothing documented): add new tools/capabilities beyond the two toggles; create chained multi-workflow pipelines; schedule runs; write outputs to external locations; author a new "built-in skill".

---

## 3. Integrations — SharePoint and other file systems

### Overall model (what is documented vs. not)
- Two integration classes: "Project Delivery (Autodesk Forma, Bentley, Fieldwire)" where "Admins choose which external projects become Nomic projects", and "File Storage (SharePoint, Egnyte)" where "Admins choose which sites or folders to bring into Nomic" and synced folders "can be attached to projects or workflows" [INT]. Trimble ProjectSight is a third project-delivery source in private preview [PS]. Outlook and Gmail are named as "Project communications" integrations with no user-facing page [INT].
- All live integrations are Business/Enterprise; Individual plan is upload-only [INT][UP].
- What sync brings in, generically: "Folder names, File names, Metadata, Permissions, Version information. After sync, the file appears in Nomic, but its contents are not searchable until it is indexed" [H-SYNC].
- Refresh cadence: "Source edits show up in Nomic as new file versions on the connector's sync schedule, not while someone is still editing" [H-CONN]. The schedule itself is never stated anywhere public. ABSENT: no interval, no webhook/change-notification statement, no manual "sync now" documented.
- Copy vs. read-in-place: not stated explicitly for any connector. Evidence leaning towards Nomic holding its own copy/derivatives: (a) indexing stores "parsed content and embeddings … reused across every session, workflow, and search" per file version [IDX]; (b) synced files show a Source column and can be filtered by integration in Nomic's own Files view [FILES]; (c) ProjectSight "drawings are imported as PDFs" [PS]; (d) Fieldwire "syncs project files into Nomic" [FW]; (e) the file-search API returns a path "including integration root" [API-FW]. Evidence that source systems remain authoritative: "Nomic is not where issues get resolved — that happens in Autodesk Forma or Fieldwire after export" [DRD]; "Autodesk Forma and Fieldwire remain the source of truth for coordination work after export" [H-REVIEW].
- Integration files cannot be parsed via the API: "Only files uploaded through the upload endpoint are supported — integration files (SharePoint, Egnyte, etc.) cannot be parsed via the API" [API-PARSE].
- Uploads vs. sync are not linked: "Uploading a revised copy directly creates a separate file in Nomic. Direct uploads are not linked back to the source file, even when the name matches" [H-CONN]. Integration files cannot be moved into My Uploads [UP].
- Permissions, general rule (documented capability, repeated consistently): "Assistant respects the same permission boundaries as the source system" [ASST]; "Files from connected systems keep their source permissions and cannot be changed from the share dialog" [ASST]; "Being an organization admin does not override source-system file permissions" [H-SSO]; recommended test: "Confirm permissions with two users who have different source-system access" [H-CONN].
- Admin setup guides for every connector are password-protected: "This content requires a password. Contact Nomic to request access" [ADM-INT][ADM-SP][ADM-EG][ADM-ACC][ADM-BEN][ADM-PS][ADM-FW]. Consequently the questions "admin consent / service account / tenant config / auth type" are NOT publicly documented for SharePoint, Egnyte, Forma or Bentley. Only fragments leak through the public intros and Help pages (below).

### SharePoint
- What connects: "sites and document libraries" selected by the admin [SP][ADM-SP intro].
- What Assistant sees: "Documents and PDFs — Full text content", "File metadata — Names, creators, and modification dates", "Folder structure" [SP].
- Permissions: "You only see files you have access to in SharePoint … Assistant respects SharePoint permissions" [SP]. Sync "bring[s] files, folders, metadata, and permissions into Nomic" [FILES].
- Indexing: not automatic — "Syncing a file from an integration does not index it" [FILES]; run Index Folder once and it "keeps working as the sync brings in new files" [FILES]. Index "for yourself only, or for everyone in your organization" [FILES][IDX].
- Scoping: SharePoint is a file-storage integration; without Forma/Bentley "your admin should sync the sites and folders that matter, then attach those folders to projects or workflow context" [SP][APR].
- Auth/identity: ABSENT publicly. The Help page says "Authorize with the account your team has approved for crawling or syncing" and asks admins to decide "Whether users need personal account connections" — implying a crawling account model with optional per-user connections, but nothing more is public [H-CONN].
- Refresh: not stated beyond "the connector's sync schedule" [H-CONN].
- Exports back: none documented for SharePoint.
- Version history: not listed for SharePoint (it is listed for Egnyte) [SP][EG].

### Egnyte
- Same shape as SharePoint plus "Version history — Assistant can compare different versions of the same file" [EG].
- Unique: "an admin can turn on auto-indexing for an Egnyte sync" [FILES][IDX][H-SYNC].
- Admin guide gated [ADM-EG].

### Autodesk Forma (page URL still `/acc`; formerly ACC)
- Project-linked: "When an Autodesk Forma project is linked to a Nomic project, Assistant automatically has access to all project files … No manual file attachment required. Files sync as they're added or updated" [ACC]. Sees: drawing sheets, PDFs/documents, project metadata [ACC].
- Indexing claim conflict: the Forma page says "new and updated files are indexed automatically" [ACC], while Files/Indexing/APR pages say Forma syncs do NOT index and need Index Folder [FILES][IDX][APR]. Both statements are on live pages; the more detailed pages (Files, Indexing, Active Project Research, Syncing-vs-indexing) all say manual.
- Service account: "the connected service account needs at least View + Download on the folders you sync. A published sheet or model view with no downloadable source file does not arrive in Nomic" [H-CONN] — this is the only public statement of an integration's identity model (a service account).
- Exports back: Accepted findings → "Create Issue" or "Create RFI" in Forma; "Title, description, severity, discipline, and citation context are included"; "Attachment upload to the external system is not included in the current release" [ACC][H-REVIEW]. "RFI Automation — Assistant can automatically respond to RFIs in Autodesk Forma. When enabled…" — a claim with no setup steps [ACC].
- Admin guide gated [ADM-ACC].

### Bentley ProjectWise
- Mirrors the Forma page: project-linked, auto-sync, same "indexed automatically" wording, same conflict with Indexing pages [BEN][IDX]. No export-back documented. Admin guide gated [ADM-BEN].

### Fieldwire (private preview)
- Admin saves a "Fieldwire API token"; "Only Fieldwire projects and files visible to the configured API token can be discovered, imported, and synced" — i.e., a token-scoped, not per-user, permission model [FW][ADM-FW intro]. A Nomic project is created per imported Fieldwire project; file sync only "when file sync is enabled for your workspace" [FW]. Exports: Create Task / Create RFI [FW].

### Trimble ProjectSight (private preview)
- "ProjectSight drawings are imported as PDFs"; Trimble Connect folders/files/versions sync [PS]. Permissions: "Nomic reflects the ProjectSight project membership and Trimble Connect folder access that the connected account can read" [PS]. Notable refusal: "ProjectSight's native File Library is not currently synced because ProjectSight does not provide the folder-permission information Nomic needs to safely make that content available" [PS]. Setup uses "a ProjectSight administrator or dedicated integration account" [PS].

### Uploads (Nomic-native storage)
- Uploaded files go to "My Uploads — a private, fixed folder"; "Private by default"; can be organised into folders and attached to projects; PDFs and legacy Office auto-index, .docx/.pptx/xlsx need manual indexing [UP][FILES]. ZIPs are stored unexpanded; Markdown is readable when attached but not indexable; images not indexed [H-UPLOAD].
- API: `POST /files/upload` up to 500 MB, "streamed directly to storage", optional `path` creating folders automatically; returns a `fileVersionId` [API-FW]. `GET /files/search` searches "files readable by the authenticated user" with an `integrationId` filter [API-FW].
- Uploaded private files can be shared to link recipients (Individual) or the organisation (Business/Enterprise) from the share dialog; integration files cannot [ASST][H-SHARE].

### Where data lives (per the docs)
- Nomic stores: uploaded file bytes (upload API "streamed directly to storage") [API-FW]; per-version parsed content and embeddings for indexed files [IDX]; derived BIM artifacts and extracted DWG data cached per file version [BIM][CAD]; artifacts with version history [ART]; conversations and sub-agent chats [ASST]; spend events [MP]; audit logs [API-AUDIT].
- Deployment: "Nomic separates infrastructure into three planes: application, data, and model"; "Dedicated application and data planes apply to Business and Enterprise. Individual plan accounts run on Nomic-hosted shared infrastructure" [ADM-DEPLOY intro]. Enterprise adds "residency options" and "custom deployment" [PLANS]. Details gated.
- Customer data and models: "Nomic does not use customer data to train general-purpose public models. Some AI work may use approved model providers" [H-SEE]. Foundation models are Anthropic and Google, pass-through priced, plus a Nomic Token Fee of $0.50/M tokens [MODELS].
- Tenancy: "Nomic is hosted per-tenant: every customer has their own URL like <your-org>.drive.nomic.ai" [H-ACCESS]; "Self-signup is not enabled for customer tenants" [H-ACCESS].
- ABSENT: nothing on multi-organisation projects, guest users from other firms, cross-tenant sharing, or federated access. Session sharing is limited to project members or "Organization members with the link" [ASST].

---

## 4. Built-in skills

### The catalogue [ASST]
"Assistant ships with procedures for the work AEC teams do most. There is nothing to switch on and no separate assistant to pick — it loads the right procedure from how you phrase the request":
- Drawing review — in: drawing set (PDF sheets), optional standards; out: Drawing Review table + PDF callout markups. Runs Survey → Scope (Light/Thorough/Comprehensive) → Review (one sub-agent per issue class; each finding "verified before it lands") → Results [DR][RT]. Built-in checklists for architectural, structural, mechanical, plumbing, electrical, civil, fire protection, telecom, landscape plus sheet-wide checks [DR]. Cost "about $0.50/sheet" [RT].
- Code or accessibility check — requires Codes Search; in: drawing page/screenshot/spec excerpt + jurisdiction; out: cited answer or findings with code citation per row [CC]. "Assistant never asserts a clearance, slope, height, count, or code section from memory" [CC]. 380+ codes claimed on the page header; the visible table lists 184 general codes, mostly US (ICC, NFPA, ASHRAE, ACI, AISC, ASTM, etc.); jurisdictions in the API list are US, Canada, Australia, UAE, Singapore, Brazil — no UK or EU [CC][API-CODES].
- Submittal review — in: submittal + specs and/or drawings; out: annotated submittal + five-section report (determination, identification, findings, stamp comment, close) [ASR].
- BIM query — in: IFC/IFCZIP (≤200 MB / 25 MB; IFC2X3–IFC4X3; up to ten models at once); out: answers with clickable element citations, version diff, bounding-box clash candidates [BIM].
- CAD/DWG query — in: DWG ≤200 MB (DXF viewer-only; up to four DWGs); out: layers/blocks/attributes/labels with entity citations; can isolate layers in the viewer; no editing [CAD].
- Document or deck — out: markdown documents, HTML decks/one-pagers exportable to .docx/.pdf/.pptx [ASST][ART].
- Research across the project — in: indexed project context; out: cited answers [APR].
- Engineering/construction-specific: all except document/deck drafting and generic research. Nothing on civil/rail/linear infrastructure, environmental consenting, or UK/EU regulatory content is documented.

### Tools underneath skills [ASST][AI][API-AG]
- Base tools: Search Files (Nomic Embeddings), Read File (Parse models), Render Page (page pixels into a vision model), List Directory, Artifacts (create/edit/read), exact-text/regex search across attached files and markdown artifacts.
- Specialised tools named: drawing judge, markup placement, geometry location, BIM query, DWG query, code search (`find_relevant_codes`), web search, sandboxed code execution, sub-agent dispatch (`dispatch_page_agents`, `dispatch_subagents`, `explore`), `upsert_table_element`, `find_relevant_pages`, think, compact.

### Skill vs workflow; user-made skills; combining
- Skill = an Assistant procedure invoked by phrasing; workflow = the same agent with fixed instructions/context/slots/model [ASST][WO]. Starter workflows are the packaged form of the skills ("Nomic workflows … package the agent with opinionated instructions") [NW].
- ABSENT: no documented mechanism for users to create, upload, or share a new skill; no skill marketplace; no MCP/tool plug-in. The only "SKILL.md" in the docs is for external coding agents calling the Agent API [API-QS].
- Combining: a workflow's instructions can direct the agent to use Explore, sub-agents, drawing judge, code search etc. — composition is by prose instruction, not by wiring skills together [AI]. Chat sessions can layer a code pass onto an in-progress drawing review in the same table [CC].

---

## 5. The context model

- Unit of organisation: Project = files/folders (context) + conversations + members (Business/Enterprise) + optional project number [PROJ]. Projects can be linked 1:1 to a Forma/Bentley/ProjectSight/Fieldwire project so content syncs automatically [PROJ][FW]. Project roles: Admin, Member [PROJ]. Project number is exposed on API and analytics "the intended way to attribute AI spend to a job in an external system" [PROJ].
- Context is per session: from the project the session belongs to, plus files attached directly [ASST]. "If no files or folders are attached, conversations in the project will only use files manually added during that session" [PROJ]. Projects "do not automatically make every new conversation remember everything a user has ever asked" [H-PROJ].
- Nomic's own hierarchy: Files view (all sources), folders, My Uploads, integration roots; search filters by status/type/integration [FILES].
- Who holds access rules: four documented layers — login (SSO/email code), org role (Admin/Member), project membership, source-system permissions [H-SSO]. Source-system permissions govern synced files and are read-only inside Nomic; Nomic governs uploaded-file sharing, project membership, session visibility (Private / Anyone with link / Shared in Project / Shared in Org), workflow roles, and artifact visibility [ASST][WM][H-SHARE]. Directory sync (SCIM) can own user existence and roles [H-USERS].
- Identity for integrations: service/crawling account model documented for Forma and implied for SharePoint/Egnyte; API token for Fieldwire; admin/integration account for ProjectSight [H-CONN][FW][PS]. Per-user OAuth connections are hinted ("Whether users need personal account connections") but not documented [H-CONN].
- Grounding and traceability: "Citations appear as clickable references … linking back to the specific file and page"; Word/Markdown/text citations jump to the quoted passage; BIM citations open the model viewer on the element; CAD citations zoom the DWG; "each claim is cited independently" [ASST]. Drawing findings carry drawing citation, standard citation, code citation, and are "verified before they are written" [DRD]. Code citations reference licensed excerpts, not full codebooks [H-CODES]. Instructions guidance shows citations as markdown links with a `citationId` [AI]. The API exposes the full agent conversation with thinking, tool calls and sub-agent IDs, so a run is auditable programmatically [API-AG].
- Audit: audit-log API covers "user account changes, API key revocations, and other administrative events" for SIEM ingestion; Enterprise adds "audit logs and IT runbooks" [API-AUDIT][PLANS]. ABSENT: no documented audit event for file access, artifact export, or workflow release.

---

## 6. Surprises (things that cut against "workflow tooling over other people's context")

1. Nomic runs its own file store and file manager with folders, versions, a 500 MB upload API that creates folder paths, and a private My Uploads root — the Individual plan is entirely upload-based [FILES][UP][API-FW][PLANS].
2. Indexed content persists inside Nomic per file version and is reused everywhere; the docs price and audit this storage-like step per page ($0.012) [IDX].
3. Structured records are native: TABLE artifacts have a JSON schema and keyed row elements, updated via `upsert_table_element` by sub-agents, versioned, and retrievable by API [API-AG][AI][ART].
4. A finding lifecycle with statuses (New → Accepted → Exported/Addressed/Ignored, Reopen) and owner-only state changes lives in Nomic, plus an automated "closing quality pass" that marks findings Ignored [H-REVIEW]. Yet the docs simultaneously insist "Nomic is not where issues get resolved" [DRD].
5. Workflow governance is unusually complete for a "prompt": draft/release, restore, per-person roles, admin-gated promotion, archive, per-version spend and run counts [WM].
6. The builder can reverse-engineer a workflow from a finished conversation and its artifacts [H-BUILD].
7. Permissions are inherited, not re-modelled — and Nomic refuses to sync a source (ProjectSight File Library) when the source cannot supply folder permissions [PS]. This is a strong statement that Nomic will not apply its own ACLs over another system's files.
8. Artifacts survive deletion of the agent that made them ("their creatingSessionId is set to null and they remain retrievable") [API-AG].
9. Org-level Word export template, project job numbers on analytics, spend caps with approval requests, and CSV exports position Nomic as a controlled production tool, not a sandbox [ART][PROJ][H-CAPS].
10. Counter-evidence for Infora's framing on the other side: no scheduling, no output-to-file-system, no cross-tenant or multi-party project model, no user-authored skills, no UK/EU code library, and integrations only read from — never write documents to — SharePoint/Egnyte. Exports are findings → Forma/Fieldwire only [ACC][FW].
11. Docs inconsistency worth knowing: Forma/Bentley pages claim automatic indexing; the Files, Indexing, Research and Help pages say sync never indexes [ACC][BEN][FILES][IDX][H-SYNC].
12. HTML "PowerPoint" export is a browser-side HTML→pptx conversion, "an approximation" [H-PPTX].

---

## Coverage

### Visited and read in full
Core: workflow-builder, workflows/overview, workflow-management, nomic-workflows, run-workflow, authoring-instructions, files, projects, artifacts, assistant, quickstart, docs root.
Capabilities: drawing-review/overview, review types (everyday-vs-milestone), drawing-review/details, code-compliance, active-project-research, automated-submittal-reviews, bim-models, cad-drawings.
Integrations: overview, uploads, sharepoint, egnyte, acc (Autodesk Forma), bentley, projectsight, fieldwire.
Models & pricing: overview, plans, models, indexing, cost-estimation.
Admin (public intro only — body password-gated): getting-started, implementation-hub, roles-and-permissions, identity-and-access, settings, integrations/integrations, integrations/sharepoint, integrations/egnyte, integrations/acc, integrations/bentley, integrations/projectsight, integrations/fieldwire, deployment-options, security-and-privacy, analytics-and-monitoring, administration-and-maintenance.
API: overview, agents, agents/quickstart, files-and-workflows, parse, codes-search, users, api-keys, audit-logs, analytics, rate-limits.
Help: workflows (create-and-edit, build-from-real-task, improve-quality, troubleshoot-builder, add-context-files-instructions, governance-and-sharing); files-and-integrations (upload-files, syncing-vs-indexing, connect-file-storage-integrations, powerpoint-export); sharing-and-projects (both); reviews (run-drawing-review, run-code-compliance-check, review-accept-reject-export, download-marked-up-drawings, code-citations-licensed-standards); security-and-privacy (all three); usage-and-spend (spend-caps, understand-usage-and-spend, why-did-this-run-cost-so-much); pilot-setup (all three); troubleshooting/agent-issues; access-and-login (add-users-and-members, cant-access-instance, delete-individual-account).

### Reached in navigation but not read (judged low relevance)
/help/files-and-integrations/use-cad-drawings, /help/usage-and-spend/individual-billing, /help/troubleshooting/report-a-bug, /help/access-and-login/sign-up-individual, /help/access-and-login/invite-or-login-code, /api/agents/notebook, /api/api-reference (OpenAPI explorer).

### Not reachable
All admin-section bodies (password-protected). External: nomic.ai/changelog, nomic.ai/pricing, SKILL.md download, Colab notebook — outside docs.nomic.ai and not fetched.

### Seen but unsourced / claims-only
- "380+ codes and standards" is a headline claim [CC][docs root]; the enumerable public table shows 184 [CC].
- Outlook/Gmail email integrations and Forma "RFI Automation" have one-sentence descriptions and no setup or behaviour pages [INT][ACC].
- The implementation hub promises "live proof from the instance, and a report that writes itself" — intro text only, body gated [ADM-HUB].

---

## Citation keys

| Key | URL |
|---|---|
| WB | https://docs.nomic.ai/docs/core/workflows/workflow-builder |
| WO | https://docs.nomic.ai/docs/core/workflows/overview |
| WM | https://docs.nomic.ai/docs/core/workflows/workflow-management |
| NW | https://docs.nomic.ai/docs/core/workflows/nomic-workflows |
| RW | https://docs.nomic.ai/docs/core/workflows/run-workflow |
| AI | https://docs.nomic.ai/docs/core/workflows/authoring-instructions |
| FILES | https://docs.nomic.ai/docs/core/files |
| PROJ | https://docs.nomic.ai/docs/core/projects |
| ART | https://docs.nomic.ai/docs/core/artifacts |
| ASST | https://docs.nomic.ai/docs/core/assistant |
| QS | https://docs.nomic.ai/docs/quickstart |
| DR | https://docs.nomic.ai/docs/capabilities/drawing-review/overview |
| RT | https://docs.nomic.ai/docs/capabilities/drawing-review/everyday-vs-milestone |
| DRD | https://docs.nomic.ai/docs/capabilities/drawing-review/details |
| CC | https://docs.nomic.ai/docs/capabilities/code-compliance |
| APR | https://docs.nomic.ai/docs/capabilities/active-project-research |
| ASR | https://docs.nomic.ai/docs/capabilities/automated-submittal-reviews |
| BIM | https://docs.nomic.ai/docs/capabilities/bim-models |
| CAD | https://docs.nomic.ai/docs/capabilities/cad-drawings |
| INT | https://docs.nomic.ai/docs/integrations/overview |
| UP | https://docs.nomic.ai/docs/integrations/uploads |
| SP | https://docs.nomic.ai/docs/integrations/sharepoint |
| EG | https://docs.nomic.ai/docs/integrations/egnyte |
| ACC | https://docs.nomic.ai/docs/integrations/acc |
| BEN | https://docs.nomic.ai/docs/integrations/bentley |
| PS | https://docs.nomic.ai/docs/integrations/projectsight |
| FW | https://docs.nomic.ai/docs/integrations/fieldwire |
| ADM-INT | https://docs.nomic.ai/docs/admin/integrations/integrations |
| ADM-SP | https://docs.nomic.ai/docs/admin/integrations/sharepoint |
| ADM-EG | https://docs.nomic.ai/docs/admin/integrations/egnyte |
| ADM-ACC | https://docs.nomic.ai/docs/admin/integrations/acc |
| ADM-BEN | https://docs.nomic.ai/docs/admin/integrations/bentley |
| ADM-PS | https://docs.nomic.ai/docs/admin/integrations/projectsight |
| ADM-FW | https://docs.nomic.ai/docs/admin/integrations/fieldwire |
| ADM-GS | https://docs.nomic.ai/docs/admin/getting-started |
| ADM-HUB | https://docs.nomic.ai/docs/admin/implementation-hub |
| ADM-ROLES | https://docs.nomic.ai/docs/admin/roles-and-permissions |
| ADM-ID | https://docs.nomic.ai/docs/admin/identity-and-access |
| ADM-SET | https://docs.nomic.ai/docs/admin/settings |
| ADM-DEPLOY | https://docs.nomic.ai/docs/admin/deployment-options |
| ADM-SEC | https://docs.nomic.ai/docs/admin/security-and-privacy |
| ADM-AN | https://docs.nomic.ai/docs/admin/analytics-and-monitoring |
| ADM-MAINT | https://docs.nomic.ai/docs/admin/administration-and-maintenance |
| MP | https://docs.nomic.ai/docs/models-and-pricing/overview |
| PLANS | https://docs.nomic.ai/docs/models-and-pricing/plans |
| MODELS | https://docs.nomic.ai/docs/models-and-pricing/models |
| IDX | https://docs.nomic.ai/docs/models-and-pricing/indexing |
| CE | https://docs.nomic.ai/docs/models-and-pricing/cost-estimation |
| API-OV | https://docs.nomic.ai/api/overview |
| API-AG | https://docs.nomic.ai/api/agents |
| API-QS | https://docs.nomic.ai/api/agents/quickstart |
| API-FW | https://docs.nomic.ai/api/files-and-workflows |
| API-PARSE | https://docs.nomic.ai/api/parse |
| API-CODES | https://docs.nomic.ai/api/codes-search |
| API-USERS | https://docs.nomic.ai/api/users |
| API-KEYS | https://docs.nomic.ai/api/api-keys |
| API-AUDIT | https://docs.nomic.ai/api/audit-logs |
| API-AN | https://docs.nomic.ai/api/analytics |
| API-RL | https://docs.nomic.ai/api/rate-limits |
| H-GOV | https://docs.nomic.ai/help/workflows/workflow-governance-and-sharing |
| H-CREATE | https://docs.nomic.ai/help/workflows/create-and-edit-workflows |
| H-BUILD | https://docs.nomic.ai/help/workflows/build-workflow-from-real-task |
| H-IMPROVE | https://docs.nomic.ai/help/workflows/improve-workflow-quality |
| H-TROUBLE | https://docs.nomic.ai/help/workflows/troubleshoot-builder-issues |
| H-CTX | https://docs.nomic.ai/help/workflows/add-context-files-instructions |
| H-SYNC | https://docs.nomic.ai/help/files-and-integrations/syncing-vs-indexing |
| H-CONN | https://docs.nomic.ai/help/files-and-integrations/connect-file-storage-integrations |
| H-UPLOAD | https://docs.nomic.ai/help/files-and-integrations/upload-files |
| H-PPTX | https://docs.nomic.ai/help/files-and-integrations/powerpoint-export |
| H-SHARE | https://docs.nomic.ai/help/sharing-and-projects/share-files-folders-sessions-workflow-outputs |
| H-PROJ | https://docs.nomic.ai/help/sharing-and-projects/use-projects-organize-files-workflows |
| H-SEE | https://docs.nomic.ai/help/security-and-privacy/what-nomic-can-and-cannot-see |
| H-SSO | https://docs.nomic.ai/help/security-and-privacy/sso-permissions-connected-system-access |
| H-NET | https://docs.nomic.ai/help/security-and-privacy/it-allowlisting-network-access |
| H-REVIEW | https://docs.nomic.ai/help/reviews/review-accept-reject-export-drawing-issues |
| H-RUNDR | https://docs.nomic.ai/help/reviews/run-drawing-review |
| H-RUNCC | https://docs.nomic.ai/help/reviews/run-code-compliance-check |
| H-DL | https://docs.nomic.ai/help/reviews/download-marked-up-drawings |
| H-CODES | https://docs.nomic.ai/help/reviews/code-citations-licensed-standards |
| H-CAPS | https://docs.nomic.ai/help/usage-and-spend/spend-caps |
| H-USAGE | https://docs.nomic.ai/help/usage-and-spend/understand-usage-and-spend |
| H-COST | https://docs.nomic.ai/help/usage-and-spend/why-did-this-run-cost-so-much |
| H-KICK | https://docs.nomic.ai/help/pilot-setup/pilot-kickoff-checklist |
| H-WEEK | https://docs.nomic.ai/help/pilot-setup/run-successful-first-week-pilot |
| H-TRAIN | https://docs.nomic.ai/help/pilot-setup/train-first-user-cohort |
| H-AGENT | https://docs.nomic.ai/help/troubleshooting/agent-issues |
| H-USERS | https://docs.nomic.ai/help/access-and-login/add-users-and-members |
| H-ACCESS | https://docs.nomic.ai/help/access-and-login/cant-access-instance |
| H-DELETE | https://docs.nomic.ai/help/access-and-login/delete-individual-account |
