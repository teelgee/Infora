# S10 — The agent action model: three task natures (ruled 2026-08-09, executes after the DMS build)

> Continuation of the 2026-08-09 DMS directed session (S1–S9, whose record
> now lives in [grill-history.md](grill-history.md) — the standalone session
> file was absorbed on execution), ruled after that file was cut. **Deliberately NOT part of the
> S1–S9 execution passes** — this executes as its own ADR-0027 revision once
> the current build lands. Until then it binds nothing; T-337 and the S6
> builder stand exactly as ruled.

## The ruling

The axis for what an embedded agent may do is the **nature of the task**,
never the surface it runs on. Three natures:

1. **Content work** — drafting, rewriting, checking prose. Suggestion →
   human acceptance stays **doctrine**: the output is the professional work
   product liability attaches to, and the accept/edit/reject Signal is the
   moat (ADR-0026/0027). The editor loop is unchanged.
2. **Administrative work** — folder structures, schema setup, plan
   housekeeping: menial day-to-day coordination. The agent may **execute
   directly** within the invoker's permissions. Governance is the ordinary
   endpoint guards, the act **audited as agent-performed** (agent runs gain
   first-class actor identity in the audit trail), and a visible "what the
   agent did" receipt with undo — reversible or additive acts only.
   Preview-confirm surfaces (the S6 tree builder, T-337's checked list) are
   retained where they are good UX, **not because doctrine requires them**.
3. **Read-only assistance** — preflight checks, reports, summaries. No
   ceremony: run it, show the findings (board precedent: the cycle preflight
   is a validator, not an agent).

**Absolute and orthogonal:** no agent act ever crosses the wall or fires a
gate. Promote, issue, accept, transmit, reviewer confirmation, purge and
library removal are human acts, always. The audit-liability posture is
untouched.

## Consequences when executed

- ADR-0027 revision: the three natures, the gate/wall absolute, agent actor
  identity in the audit trail.
- **Q-031 closes against this ruling**: bulk is legal within nature-2
  administrative acts (one receipt, undoable), never at gates.
- New design work before the first nature-2 agent: the receipt-with-undo
  surface pattern, and the actor-identity row (personal-data.md check).
- The zoned-CDE model explored in the same discussion (agent freedom by
  WIP/Shared/Published zone) was **considered and dropped** — location is
  not the axis; task nature is. Recorded so it is not re-derived.

## Grounding (2026 market survey, same discussion)

Legora aOS and Harvey run multi-step agent loops end-to-end; Salesforce
Agentforce executes without per-act approval (and its security critics flag
exactly that); GitHub's coding agent acts freely in isolation and delivers a
PR — review moved to the artefact, not the keystroke; Procore agents draft
RFIs and manage submittal reviews. The ruling adopts the acceleration for
administrative work while keeping content acceptance and the contractual
gates human — the two places the market's move genuinely does not fit a
cross-organisation controlled-document platform.
