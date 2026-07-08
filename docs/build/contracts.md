# Contracts — the skeleton's typed API (first cut)

> **Status: first cut, 2026-07-04.** The handful of typed contracts the walking skeleton needs — the seed of `packages/contracts`, written against the [data model](data-model.md), the [walking skeleton](walking-skeleton.md) and ADR-[0028](../adr/0028-orchestration-run-agent-model.md) / [0029](../adr/0029-context-assembly-contract.md) / [0031](../adr/0031-copilot-ask-surface.md). Scoped drawer-by-drawer like the data model: only what M0–M6 call, nothing wider. Types are TypeScript; the wire format is JSON over HTTPS. Review alongside the first `packages/contracts` commit.

## Principles (from the design layer, restated as API law)

1. **One typed API, thin surfaces.** Every surface — `web-consultant`, `web-owner`, `word-addin`, `copilot-agent` — calls these contracts and resolves nothing locally (component 8). `packages/contracts` is the single source of truth; `apps/api` implements it.
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
  railOutcomes: Array<{ rail: string; outcome: 'passed' | 'withheld';
                        detail?: string }>;                        // defensibility field 2; detail carries
                                                                   // e.g. the withheld claim text for the UI
  childRunId?: Id;                                           // when type = 'delegate'
};

type Run = {
  id: Id; conversationId: Id; parentRunId: Id | null;
  agentId: string; agentProvenance: 'infora' | 'custom';
  state: 'running' | 'completed' | 'failed';
  request: string;                                           // the prompt/task text — part of the record
  startedAt: string; endedAt: string | null;
  steps: Step[];                                             // the append-only tree, flattened by parentStepId
  suggestions: Suggestion[];                                 // zero or more, per-item (ruled 2026-07-06)
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

Read scope (ruled 2026-07-06): a Run bound to a Work item is project record — readable by the owner
role in full. An ad-hoc Run (no Work item; every Copilot run in v1) is readable by the requester's
organisation only; any other reader gets `404 not_found` (principle 4). The owner's audited override
(ADR-0018) is post-skeleton.

```
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
POST  /projects/:projectId/sandbox-documents       body: { title }            → SandboxDocument
GET   /projects/:projectId/sandbox-documents       → { items: SandboxDocument[] }
      // list added 2026-07-08 (T-051): the requester's organisation's private
      // project sandbox (ADR-0018) — org-scoped by construction, no parameter
GET   /sandbox-documents/:id                       → SandboxDocument
PATCH /sandbox-documents/:id                       body: { content }          → SandboxDocument
      // manual editing: no Suggestion, no Signal, no ceremony — by design

type SandboxDocument = { id: Id; projectId: Id; organisationId: Id;
                         title: string; content: string; updatedAt: string };
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
```

### Auth & session (M1, M6)

```
POST /auth/session            // skeleton login for seeded users (see plan.md ticket note)
GET  /me                      → { userId, name, organisationId, organisationName,
                                  participants: Array<{ projectId: Id; participantId: Id;
                                                        projectName: string;
                                                        ownerOrganisationName: string;
                                                        membershipRole: 'owner' | 'member' }> }
      // display facts added 2026-07-08 (T-050): the workspace landing and the
      // rail render names and role badges; every fact is the requester's own
      // entitlement, so this completes the read rather than widening any scope
```

Copilot adds no endpoints: the API plugin (ADR-0031) calls the same contracts with `surface: 'copilot'`, identity mapped from Entra SSO via `User.external_identity`.

## 4. Error envelope

```ts
type ApiError = { error: 'not_found' | 'conflict' | 'invalid' | 'unauthenticated'; detail?: string };
```

`not_found` covers both nonexistence and denial (principle 4). There is no `forbidden` on cross-wall reads — that would leak existence.

## What this first cut deliberately omits

Promotion and the review cycle endpoints (post-skeleton slice — the DRR/Comment tables exist but only the owner's read touches them here, via the work-item/run read); attached sources; workflow launch beyond the single chat/draft path; pagination and webhooks; streaming (additive later). Each arrives with its slice, matching the data model's drawers.
