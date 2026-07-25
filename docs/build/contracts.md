# Contracts — the skeleton's typed API (first cut)

> **Status: first cut, 2026-07-04.** The handful of typed contracts the walking skeleton needs — the seed of `packages/contracts`, written against the [data model](data-model.md), the [walking skeleton](walking-skeleton.md) and ADR-[0028](../adr/0028-orchestration-run-agent-model.md) / [0029](../adr/0029-context-assembly-contract.md) / [0031](../adr/0031-copilot-ask-surface.md). Scoped drawer-by-drawer like the data model: only what M0–M6 call, nothing wider. Types are TypeScript; the wire format is JSON over HTTPS. Review alongside the first `packages/contracts` commit.

## Principles (from the design layer, restated as API law)

1. **One typed API, thin surfaces.** Every surface — `web` (one app, role-scoped views — was `web-consultant`; the planned `web-owner` split is superseded, T-110, 2026-07-14), `word-addin`, `copilot-agent` — calls these contracts and resolves nothing locally (component 8). `packages/contracts` is the single source of truth; `apps/api` implements it.
2. **No scope-widening parameter exists.** No call takes a corpus, store, organisation or visibility argument that could widen what the requester reaches. Scope is derived server-side from `(environment, requester)` — the ADR-0029 shape, applied to the whole API, not just assembly.
3. **The requester is resolved, never supplied.** Identity comes from the session (or Entra SSO for Copilot, ADR-0031), resolved server-side to `(user, organisation, participant)`. No endpoint accepts a caller-supplied identity.
4. **Deny is silent.** An unentitled request returns the same `404 not_found` as a nonexistent resource — existence is never leaked across the wall (M1's deny path).
5. **Append-only reads are reconstructions.** `Run`/`Step`/`Signal` reads return the immutable record; there is no mutating verb on any append-only table (ADR-0028 §3).

---

## 1. The Context-assembly contract (internal — the ADR-0029 gateway)

Not an HTTP endpoint. The one call at the `knowledge`/`orchestration` package boundary; every retrieval — baseline and sub-agent — goes through it (ADR-0028 §4).

```ts
type AssemblyEnvironment =
  | { kind: 'project'; projectId: Id }
  | { kind: 'workspace'; organisationId: Id };   // ADR-0025; workspace unused in the skeleton

type AssemblyRequest = {
  request: { text: string; mode: 'baseline' | 'targeted' };  // ADR-0029 §4
  environment: AssemblyEnvironment;
  requester: { organisationId: Id; participantId: Id };
};

type AssembledItem = {
  channel: 'grounded' | 'guiding' | 'informing';             // ADR-0021
  corpus?: 'library' | 'authority';                          // grounded only
  source: { versionId: Id } | { authorityRef: string };      // what a citation resolves to
  content: string;
};

type AssembledInput = {
  items: AssembledItem[];          // grounded-first within the budget (ADR-0029 §5)
  budget: { tokenLimit: number; tokensUsed: number };
};

// the one gateway (ADR-0029 §1–2): access resolution runs INSIDE, before retrieval
function assemble(req: AssemblyRequest): Promise<AssembledInput>;
```

In the skeleton, `guiding` and `informing` may return empty; the signature carries them so the upgrade (Session 6) doesn't ripple into the orchestrator.

## 2. Shared types

```ts
type Id = string;                                            // uuid
type Surface = 'web' | 'word_addin' | 'copilot';             // ADR-0031
type StepType = 'retrieve' | 'draft' | 'ground_check' | 'cite' | 'delegate';
type Resolution = 'accepted' | 'edited' | 'rejected';

type Citation = {
  id: Id;
  source: { versionId: Id; documentReference: string } | { authorityRef: string };
  claimSpan?: { start: number; end: number };                // where in the content it backs
};

type Step = {
  id: Id; runId: Id; parentStepId: Id | null;
  type: StepType; status: 'running' | 'completed' | 'failed';
  startedAt: string; endedAt: string | null;
  model?: { id: string; version: string };                   // the Router's choice
  usage?: { tokensPrompt: number; tokensCompletion: number; cost: number };
  sourceSet: Array<{ versionId: Id } | { authorityRef: string }>;  // defensibility field 1 (ADR-0028 §7)
  railOutcomes: Array<{ rail: string; outcome: 'passed' | 'withheld' | 'open_world';
                        detail?: string }>;                        // defensibility field 2; detail carries
                                                                   // e.g. the withheld claim text for the UI.
                                                                   // 'open_world' added 2026-07-09 (T-089): an uncited
                                                                   // model-knowledge claim kept in *chat*, labelled —
                                                                   // document-targeted drafting stays grounded-only
  childRunId?: Id;                                           // when type = 'delegate'
};

type Run = {
  id: Id; conversationId: Id; parentRunId: Id | null;
  agentId: string; agentProvenance: 'infora' | 'custom';
  state: 'running' | 'completed' | 'failed';
  request: string;                                           // the prompt/task text — part of the record
  response: string | null;                                   // the produced answer — part of the record too
                                                             // (added 2026-07-08, T-052; ADR-0031 §6 renders it in Copilot)
  startedAt: string; endedAt: string | null;
  steps: Step[];                                             // the append-only tree, flattened by parentStepId
  suggestions: Suggestion[];                                 // zero or more, per-item (ruled 2026-07-06)
  citations: Citation[];                                     // the answer's citations when no Suggestion carries them
                                                             // (untargeted chat — cite-step citations surfaced; added
                                                             // 2026-07-09, T-088, discharging the step-citation residual
                                                             // for the web surface and M6 alike)
};

type Suggestion = {
  id: Id; runId: Id; workItemId: Id | null; sandboxDocumentId: Id;
  kind: 'insert' | 'replace';
  anchor?: { quote: string };                                // advisory span against the sandbox head;
                                                             // null/absent in the skeleton (unanchored insert)
  content: string; rationale: string;
  citations: Citation[];
  signal?: { resolution: Resolution; resolvedAt: string };   // set once resolved
};
```

## 3. External endpoints, by milestone

### Conversations & runs (M3, M6)

```
POST /projects/:projectId/conversations
  body:  { surface: Surface, workItemId?: Id }
  →      { conversationId: Id }                    // bound to the project environment for life (ADR-0025/0031)

POST /conversations/:conversationId/runs
  body:  { request: string, sandboxDocumentId?: Id }   // the Ask/draft turn; document targeted when drafting
  →      Run                                       // completed, with steps, suggestion and citations
                                                    // (v1 returns on completion; streaming is a later, additive change)

GET  /runs/:runId          → Run                    // the immutable audit read (owner path, M5)
GET  /conversations/:conversationId → { runs: Run[] }
```

Read scope (ruled 2026-07-12, superseding 2026-07-06's project-record read): **every Run is readable
by its producing organisation only**, work-item bound or not; any other reader gets `404 not_found`
(principle 4). The record is retained background data anchored to the work — the consultant carries
the professional liability for the work product, and the client owner reviews the *document* through
the review cycle (ADR-0005–0014), never the agent's internals. The work-item read returns its
review-cycle facts to every entitled reader; its `runs` list carries the requester organisation's
own runs only.

```
GET /projects/:projectId/history → { items: HistoryEntry[] }
     // added 2026-07-13 (T-108): the requester's own prompted turns on the
     // project, newest first — Ask chats and agent use in a document alike.
     // Self-scoped by construction (only runs the caller requested), so the
     // producer-private read above is not widened. A turn's document is read
     // off its suggestions (the run row names none — residual, tracker).

type HistoryEntry = { runId: Id; conversationId: Id; request: string;
                      state: Run['state']; startedAt: string;
                      sandboxDocument: { id: Id; title: string } | null };  // null = an Ask chat turn
```

### Work items (M3, M5)

```
GET /projects/:projectId/work-items                → { items: WorkItem[] }
GET /work-items/:workItemId                        → WorkItem & { runs: Run[] }

type WorkItem = { id: Id; projectId: Id; type: string; title: string;
                  status: string; assigneeParticipantId: Id | null };
```

### Sandbox documents (M4 — the draft-location decision)

```
POST  /projects/:projectId/sandbox-documents       body: { title, containerId? } → SandboxDocument
      // containerId added 2026-07-18 (T-129): the draft's plan-row link
      // (ADR-0032) — own-org library containers on this project only
GET   /projects/:projectId/sandbox-documents       → { items: SandboxDocument[] }
      // list added 2026-07-08 (T-051): the requester's organisation's private
      // project sandbox (ADR-0018) — org-scoped by construction, no parameter
GET   /sandbox-documents/:id                       → SandboxDocument
GET   /sandbox-documents/:id/suggestions           → { items: Suggestion[] }
      // added 2026-07-08 (T-082): the document's Suggestions, newest first —
      // what the Editor's Suggestions tab renders; same scope as the document
PATCH /sandbox-documents/:id                       body: { content }          → SandboxDocument
      // manual editing: no Suggestion, no Signal, no ceremony — by design

type SandboxDocument = { id: Id; projectId: Id; organisationId: Id;
                         title: string; content: string; updatedAt: string };
```

### Sandbox comments (T-112, owner-ruled 2026-07-18)

```
GET    /sandbox-documents/:id/comments             → { items: SandboxComment[] }
       // roots and replies flat; the surface assembles threads via
       // parentCommentId; same scope as the document — the org-private
       // sandbox, so the wall needs no new rule
POST   /sandbox-documents/:id/comments             body: { body, anchor?, parentCommentId?, mentions? } → SandboxComment
PATCH  /sandbox-comments/:id                       body: { body, mentions? }  → SandboxComment
       // author-only — mutable like the sandbox (distinct from the
       // append-only DRR Comment, Slice A)
DELETE /sandbox-comments/:id                       → 204
       // author-only; deleting a root deletes its thread
POST   /sandbox-comments/:id/status                body: { status: 'open' | 'closed' } → SandboxComment
       // root only; any entitled participant, not just the author —
       // "suggest an edit" is prose in a comment, and the colleague who
       // makes the manual edit closes the thread
GET    /projects/:projectId/participants           → { items: ProjectParticipant[] }
       // the @-mention picker: the requester's organisation's participants
       // on the project — org-scoped by construction, like the sandbox list;
       // mention delivery (notifications) is parked on the tracker

type SandboxComment = { id: Id; sandboxDocumentId: Id; parentCommentId: Id | null;
                        author: { participantId: Id; name: string };
                        body: string; anchor: string | null;   // anchor advisory, never blocking
                        status: 'open' | 'closed';
                        closedBy: { participantId: Id; name: string } | null;
                        closedAt: string | null; mentions: Id[];
                        createdAt: string; updatedAt: string };
type ProjectParticipant = { participantId: Id; userId: Id; name: string };
```

### Suggestion resolution — the Signal (M4)

```
POST /suggestions/:suggestionId/resolution
  body:  { resolution: Resolution, editedContent?: string }   // editedContent required iff 'edited'
  →      { signalId: Id, sandboxDocument?: SandboxDocument }  // updated document on accept/edit
```

Exactly one Signal per Suggestion (v1); a second call is `409 conflict`. Accept applies `content`, edit applies `editedContent`, reject applies nothing.

### Library (M2 read path, seed browsing)

```
GET /projects/:projectId/library
  →  { items: Array<{ containerId: Id; documentReference: string;
                      currentVersionId: Id; state: 'live' }> }
      // one row per container — the ruled list unit (2026-07-06); version history
      // expands within the container view when Slice A lands.
      // pre-filtered to the requester's access-resolved slice; superseded/withdrawn
      // stay out of grounding by ADR-0013 and are omitted here for the skeleton

GET /versions/:versionId
  →  { versionId; documentReference; versionReference; content;
       containerState: 'live' | 'superseded' | 'withdrawn' | 'rejected'; isCurrent }
      // added 2026-07-09 (T-094): a citation chip opens the version it names.
      // scoped like the library (the version's project, through the wall);
      // superseded/withdrawn stay readable here — the immutable record's
      // citations must resolve — with state carried for the surface to badge.
      // grounding untouched: retrieval's pre-filters admit none of this
```

*2026-07-18 (T-114, mechanical completion):* `containerState` gains `'rejected'` (ADR-0032/0013 — a closed-rejected deliverable stands as a record, never grounding). Both library reads are now explicitly scoped to **library-scope** containers: a freeze-series (sandbox-scope) container is org-private working machinery (ADR-0032), so its versions 404 here by construction and get their own org-scoped reads with Slice A's internal cycle (T-125).

### Auth & session (M1, M6)

```
POST   /auth/session          // skeleton login for seeded users (see plan.md ticket note)
DELETE /auth/session          // sign out (added 2026-07-14, T-111): clears the cookie, 204;
                              // idempotent and unauthenticated by design — the cookie is the
                              // session, so a stale or absent one signs out the same way
GET  /me                      → { userId, name, organisationId, organisationName,
                                  participants: Array<{ projectId: Id; participantId: Id;
                                                        projectName: string;
                                                        ownerOrganisationName: string;
                                                        membershipRole: 'owner' | 'member' }> }
      // display facts added 2026-07-08 (T-050): the workspace landing and the
      // rail render names and role badges; every fact is the requester's own
      // entitlement, so this completes the read rather than widening any scope
      // + email and preferences { theme } added 2026-07-09 (T-092)
      // + orgRole ('admin' | 'member') added 2026-07-18 (T-117, ADR-0033) — the
      //   requester's own administration role, a self fact gating only the
      //   settings Administration panel; never project access

PATCH /me                     body: { name?, preferences?: { theme? } }  → MeResponse
POST  /me/password            body: { currentPassword, newPassword }    → 204 (401 on wrong current)
      // personal settings (T-092, 2026-07-09): both writes are self-scoped —
      // the session's own user row, no id parameter, no wall implication;
      // password change stays useful as the break-glass path after Entra SSO
```

Copilot adds no endpoints: the API plugin (ADR-0031) calls the same contracts with `surface: 'copilot'`, identity mapped from Entra SSO via `User.external_identity`.

## 4. Slice A — document management (T-116, 2026-07-18)

The review-cycle slice's contracts, written against ADR-0032/0033/0034 and the rebuilt Drawers 1/2/5. Implemented ticket by ticket (T-117–T-128); until a ticket lands its endpoints 501.

### Roster & administration (ADR-0033, T-117)

```
GET    /projects/:projectId/participants  → { items: RosterEntry[] }
       // WIDENED (ADR-0033, supersedes the T-112 org-scoped note): the project
       // roster is visible to every Participant — the wall hides work, never
       // presence. Removed entries stay listed for attribution; pickers
       // filter to live ones.
GET    /organisation/users                → { items: OrgUser[] }
       // org admin only: the requester's own organisation's users (the enrol
       // picker); self-org by construction
POST   /projects/:projectId/participants  body: { userId } → RosterEntry
       // org admin enrols their own organisation's user (ADR-0015's level two)
DELETE /projects/:projectId/participants/:participantId → RosterEntry
       // org admin, own org only: closes the interval (removed_at) — the row
       // survives, live grants auto-revoke from that moment
POST   /projects/:projectId/memberships   body: { organisationId } → Membership
       // owner grants a seat (state active); a member proposes one (state
       // proposed — confers nothing, ADR-0019)
POST   /memberships/:membershipId/confirmation → Membership   // owner confirms

type RosterEntry = { participantId: Id; userId: Id; name: string;
                     organisationId: Id; organisationName: string;
                     membershipRole: 'owner' | 'member'; removedAt: string | null };
type OrgUser = { userId: Id; name: string; email: string; orgRole: 'admin' | 'member' };
type Membership = { id: Id; organisationId: Id; organisationName: string;
                    projectId: Id; role: 'owner' | 'member';
                    state: 'proposed' | 'active'; createdAt: string };
```

### The deliverable plan (ADR-0008/0033, T-118/T-119)

```
GET   /projects/:projectId/plan   → { items: PlanRow[] }
      // access-decided, no parameter: a member reads its own organisation's
      // rows (the TIDP); the owner reads every organisation's (the MIDP
      // consolidation). At-a-glance facts are derived by query, never stored
      // twice (the 2026-07-18 metadata ruling).
POST  /projects/:projectId/plan   body: { documentReference, title, metadata? } → PlanRow
      // a producing-organisation act (ADR-0033): creates the planned
      // container on the requester's organisation's plan AND its
      // document_production work item (status 'planned' — event-driven from
      // here, never hand-set)
PATCH /containers/:containerId    body: { metadata } → PlanRow
      // producing organisation only; the coded reference is immutable once
      // a version exists

type PlanRow = { containerId: Id; documentReference: string;
                 producingOrganisationId: Id; producingOrganisationName: string;
                 metadata: Record<string, unknown>;
                 state: 'live' | 'superseded' | 'withdrawn' | 'rejected';
                 workItem: { id: Id; title: string; status: string } | null;   // null = owner-added reference material
                 currentVersion: { versionId: Id; versionReference: string; createdAt: string } | null;
                 deliverableCode: { code: string; description: string } | null; // the latest round's verdict — derived
                 authors: AppointmentGrant[]; reviewers: ReviewerGrant[] };
```

### Appointments (ADR-0017/0033, T-118/T-119)

```
POST /containers/:containerId/authors    body: { participantId, isLead? } → AppointmentGrant
     // the producing side writes its own set (lead author amends, ADR-0017);
     // authors must belong to organisations sharing the deliverable's sandbox
POST /containers/:containerId/reviewers  body: { participantId, isLead? } → ReviewerGrant
     // the producing organisation PROPOSES (unconfirmed — confers no access);
     // an owner-made grant is auto-confirmed
POST /authors/:grantId/revocation        → AppointmentGrant     // closes the interval
POST /reviewers/:grantId/revocation      → ReviewerGrant
POST /reviewers/:grantId/confirmation    → ReviewerGrant
     // owner only — and exactly where ADR-0015 bites: confirming a reviewer
     // whose organisation lacks the deliverable share forces share-first,
     // or decline

type AppointmentGrant = { id: Id; containerId: Id; participantId: Id; name: string;
                          isLead: boolean; grantedAt: string; revokedAt: string | null };
type ReviewerGrant = AppointmentGrant & { confirmedAt: string | null };  // null = proposed
```

### Deliverable shares (ADR-0016 as data, T-119)

```
POST /containers/:containerId/shares   body: { organisationId } → DeliverableShare
     // owner only; the shared organisation must hold an active seat; the
     // only thing that opens a deliverable across the wall (ADR-0016)
POST /shares/:shareId/revocation       → DeliverableShare      // owner; interval closes

type DeliverableShare = { id: Id; containerId: Id; organisationId: Id;
                          organisationName: string; grantedAt: string;
                          revokedAt: string | null };
```

Visibility is **producer | owner | live share**, applied as one SQL predicate in the library list, the version read and the grounding query (so surfaces and retrieval cannot drift). Confirming a reviewer whose organisation lacks visibility returns `409 { detail: 'share_required' }` — ADR-0015's share-first, as an error the surface can act on. `PlanRow` gains `sharedWith` (live shares; `[]` for non-owner readers). The seed shares the reference library with the consultant organisation, preserving the walking-skeleton journey on the now-real wall.

### Acceptance codes (ADR-0003, T-116)

```
GET /projects/:projectId/acceptance-codes → { items: AcceptanceCode[] }
    // the project's copied scheme; scheme editing (retire-and-replace) is an
    // owner curation surface, post-slice

type AcceptanceCode = { id: Id; code: string; description: string;
                        level: 'comment' | 'deliverable' | 'both';
                        isAccepting: boolean; sortOrder: number;
                        retiredAt: string | null };
```

### Promotion & the freeze (ADR-0002/0032, T-120/T-125)

```
POST /sandbox-documents/:id/promotion  → PromotionResult
     // the near-empty hand-off (ADR-0008 — "no wizard" is the acceptance
     // test): snapshots the head (or the freeze series' QA-accepted frozen
     // version — ADR-0032's two legal sources, never a drifted head) into
     // the LINKED plan container (container_id required). First promotion
     // launches the project cycle: round 1 opens, lock to the reviewers.
     // On an active cycle it is the transmittal back: allowed only from the
     // respond phase; round N+1 opens, the lock returns to the reviewers.
POST /sandbox-documents/:id/freeze     → { versionId; versionReference; containerId }
     // T-125: snapshot into the document's sandbox-scope freeze container
     // (auto-created at first freeze); org-private by construction; the
     // head locks while a sandbox-scope round is open

type PromotionResult = { versionId: Id; versionReference: string;
                         cycleId: Id; roundId: Id; roundNumber: number };
```

### The review cycle (ADR-0005–0014/0032, T-123/T-124/T-126)

```
GET /containers/:containerId/cycle → ReviewCycle | null
    // the active (or latest closed) cycle with its rounds; ADR-0014 phasing
    // applied server-side — the OPEN round's comments are omitted for the
    // authoring side; issued rounds are permanently visible to all entitled
POST /rounds/:roundId/comments             body: { body, anchor?, acceptanceCodeId? } → ReviewComment
    // reviewing side, while the round is open; comments are live and
    // cross-organisation within the review group (ADR-0007)
PATCH /review-comments/:commentId          body: { body?, acceptanceCodeId?, anchor? } → ReviewComment
    // while the round is open only: the author edits their own, the lead
    // reviewer moderates any (ADR-0007); frozen at issue by the DB itself
POST /rounds/:roundId/deliverable-code     body: { acceptanceCodeId } → Round
    // lead reviewer: the authoritative per-round verdict, suggested from
    // the comment codes (ADR-0003), set while the round is open
POST /rounds/:roundId/issue                body: { recipients?, purposeCode?, dueAt? } → { transmittalId: Id; cycle: ReviewCycle }
    // lead reviewer closes and issues: transmittal recorded, snapshot
    // frozen, the round revealed to the authoring side, the lock flipped —
    // or, when the round's deliverable code is accepting, the cycle closes
    // accepted: the work item closes, the version auto-admits to the
    // library and starts grounding (ADR-0003/0011/0013)
POST /review-comments/:commentId/response  body: { body, nextVersionId?, nextVersionAnchor?, noChangeReason? } → ReviewResponse
    // authoring side, during the respond phase; exactly one of the link or
    // the reason (ADR-0004); one response per comment
POST /cycles/:cycleId/close-rejected       → ReviewCycle
    // lead author or project owner — the explicit audited stop (ADR-0032):
    // container → rejected (stays in the library, never grounds), work
    // item → rejected

type ReviewCycle = { id: Id; containerId: Id;
                     state: 'active' | 'accepted' | 'closed_rejected';
                     editLockHolder: 'authoring' | 'reviewing';
                     launchedAt: string; closedAt: string | null;
                     rounds: Round[] };
type Round = { id: Id; number: number; versionId: Id; versionReference: string;
               state: 'open' | 'issued' | 'responded';
               reviewPeriodTarget: string | null;                 // guides, never gates (ADR-0005)
               deliverableCode: AcceptanceCode | null;
               comments: ReviewComment[]; transmittals: Transmittal[] };
type ReviewComment = { id: Id; roundId: Id; versionId: Id;
                       author: { participantId: Id; name: string };
                       body: string; acceptanceCode: { id: Id; code: string } | null;
                       anchor: CommentAnchor | null; createdAt: string;
                       response: ReviewResponse | null };
type CommentAnchor = { page?: number; quote?: string;             // rendition-agnostic structured
                       rects?: Array<{ x: number; y: number; w: number; h: number }>;
                       point?: { x: number; y: number } };        // fields, never a sidecar (ADR-0006)
type ReviewResponse = { id: Id; commentId: Id;
                        author: { participantId: Id; name: string };
                        body: string; nextVersionId: Id | null;
                        nextVersionAnchor: CommentAnchor | null;
                        noChangeReason: string | null; createdAt: string };
type Transmittal = { id: Id; roundId: Id; direction: 'issue' | 'return';
                     sender: { participantId: Id; name: string };
                     recipients: Id[]; purposeCode: string | null;
                     issuedAt: string; dueAt: string | null };
```

### Renditions, upload & ambient history (ADR-0034, T-121/T-122/T-128)

```
GET  /versions/:versionId/renditions → { items: Rendition[] }
GET  /renditions/:renditionId/file   → the bytes (content-type per format)
POST /projects/:projectId/sandbox-uploads   multipart: { file } → SandboxDocument
     // origin 'uploaded': the native file is canonical (docx/xlsx/pptx)
POST /sandbox-documents/:id/conversion      → SandboxDocument
     // "open in editor": uploaded → authored, in place, deliberate; the
     // original file lands in the ambient history; fidelity is honest
GET  /sandbox-documents/:id/history  → { items: SandboxDocumentVersion[] }
POST /sandbox-documents/:id/restore  body: { historyVersionId } → SandboxDocument
     // restore copies a snapshot back into the head — never rewrites history
DELETE /sandbox-documents/:id        → SandboxDocument   // soft-delete (T-128):
POST /sandbox-documents/:id/undelete → SandboxDocument   // the recycle bin is
GET  /projects/:id/sandbox-documents?deleted=1           // self-service — the
     // ProjectWise A1 fold-in; recovery is never a helpdesk ticket

type Rendition = { id: Id; versionId: Id; kind: 'native' | 'pdf';
                   format: 'docx' | 'xlsx' | 'pptx' | 'pdf'; createdAt: string };
type SandboxDocumentVersion = { id: Id; sandboxDocumentId: Id;
                                createdBy: { participantId: Id; name: string };
                                createdAt: string };   // content fetched by restore/preview, not listed
```

*Type extensions (same date):* `WorkItem` gains `containerId: Id | null` (the ADR-0032 addendum join — null for reference material and future non-document types) and its `status` vocabulary becomes the event-driven set `planned | drafting | in_review | accepted | rejected` when T-127 lands. `SandboxDocument` gains `origin: 'authored' | 'uploaded'`, `kind: 'text' | 'slides'`, `format: 'infora_text' | 'docx' | 'xlsx' | 'pptx'`, `containerId: Id | null` (the missing link, ADR-0032) and `headLocked: boolean`.

*Router security seam + egress audit (2026-07-22, ADR-0037, T-139–T-144).* The `@infora/model` Router gained a policy layer without changing its callers. Adapters optionally declare `attributes: RouteAttributes` (`region`/`retention`/`jurisdiction`/`eligibility`) and an `endpoint`; a `DeploymentSecurity = { policy: TierPolicy; defaultClassification }` (built by `securityForTier(tier, classification)`) is passed at Router construction. Every `chat`/`embed` call now selects a tier-conforming route (`selectRoute`, constraint-then-optimise) and **fails closed** with a `SecurityPolicyError` when none conforms — an undeclared endpoint reads as `UNATTRIBUTED` and conforms to nothing. `ChatRequest` gains optional `classification` (the elevation seam; v1 resolves the deployment default on the Router). `ChatResult`/`EmbedResult` gain `egress: EgressFacts`, threaded through `GroundedDraftResult` → `draft-leaf` → `StepAudit` into new `steps.egress_{endpoint,region,retention,classification}` columns (migration `0016`) and `Step.egress`. Structural non-bypass is enforced by an ESLint rule + a repo-walking guard test (provider SDKs live only in `packages/model`).

## 5. Error envelope

```ts
type ApiError = { error: 'not_found' | 'conflict' | 'invalid' | 'unauthenticated'; detail?: string };
```

`not_found` covers both nonexistence and denial (principle 4). There is no `forbidden` on cross-wall reads — that would leak existence.

## What this cut deliberately omits

~~Promotion and the review cycle endpoints~~ *(arrived 2026-07-18 with Slice A, §4 above)*. Still omitted: attached sources; workflow launch beyond the single chat/draft path; acceptance-scheme editing (retire-and-replace is an owner curation surface, post-slice); notification delivery (the parked mention/transmittal channel — tracker); pagination and webhooks; streaming (additive later). Each arrives with its slice, matching the data model's drawers.

## Cross-cutting behaviours (2026-07-25, T-216/T-217/T-219)

```
GET /health → 200 { ok: true } | 503 { ok: false }   // sessionless liveness
     // probe: one `select 1` against the database; exempted from the session
     // middleware the same way POST /auth/session is
```

- **Request id (T-219).** Every response carries `X-Request-Id` (a per-request
  `crypto.randomUUID()`), and the API emits one structured JSON log line per
  request at the boundary — `method`, `path`, `status`, `durationMs`,
  `requestId` — suppressed under `NODE_ENV=test`.
- **Rate limits (T-217).** In-memory sliding windows: `POST /auth/session`
  per IP (default 10/min, `RATE_LIMIT_LOGIN_PER_MINUTE`) and
  `POST /conversations/:id/runs` per user (default 30/min,
  `RATE_LIMIT_RUNS_PER_MINUTE` — run creation invokes paid model calls). Over
  the window answers `429 { error: 'rate_limited' }` in the §5 envelope
  (`rate_limited` joins the `error` vocabulary). The store is per-process;
  it becomes shared (Redis) at the infra session.
- **CORS + security headers (T-216).** Origins outside the explicit allowlist
  (`ALLOWED_ORIGINS`, defaulting to the local dev/e2e web origins) receive no
  CORS headers at all; every response carries `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
