# 03 — Orchestration and the plan artefact

The chat agent's job is classification and orchestration, not creativity:

```
classify intent → assemble context → clarify → plan → dispatch workers
               → synthesise → verify → present
```

Two modes, honestly distinguished in the spec, the record and the UI.

---

## 1. The two modes

Owner-ruled 2026-07-29: **both modes ship, honestly labelled.** This reverses
part of an accepted invariant, so it is written down as a reversal rather than
absorbed quietly — ADR-0027 §3 and ADR-0028 §5 are amended, not reinterpreted.

| | **Declared orchestration** | **Model-chosen orchestration** |
| --- | --- | --- |
| The plan comes from | A codified workflow's pre-declared DAG | The chat agent, per request |
| Repeatable | Yes — same inputs, same steps, same order | No — the step sequence may differ between runs |
| Evaluable end to end | Yes | Per-answer only |
| Grounding guarantee | Full | **Full — identical** |
| Citation guarantee | Full | **Full — identical** |
| Audit completeness | Full | **Full — identical** |
| Suited to | The work the product exists to do | Exploration, one-off questions, discovery |
| Label | `declared` | `model_chosen` |

### 1.1 What model-chosen orchestration does and does not cost

This is the part most easily got wrong, so it is stated precisely.

**It does not weaken grounding, citation or audit.** The deterministic
ground-check is code and sits *outside* the plan — it runs on every answer in
both modes, on the source set the run actually admitted
([ground-check.ts:27-47](../../packages/governance/src/ground-check.ts#L27-L47)). Citations resolve the same way. Every step
writes the same append-only Step row with the same audit fields. A model-chosen
run is exactly as provable, claim by claim, as a declared one.

**What it costs is repeatability of the step sequence.** Ask the same question
twice in model-chosen mode and the workers invoked, their order, and their
parameters may differ — so the *evidence set* may differ, even over a frozen
corpus. That is the honest limit, and it is the one the brief's citation
determinism principle cares about.

**The honest sentence to a client:** *"We can always show you exactly what it
saw and prove every claim is sourced. For this class of run we cannot promise it
takes the same route twice."*

### 1.2 The labelling requirement — hard, not cosmetic

A user must never be unable to tell which kind of answer they are holding.

- **The plan artefact records `mode`** (§3). It is a stored column, not derived.
- **The completion footer states the mode** in words, not an icon ([08](08-interface.md) §5).
- **The run record stores it**, so history and export carry it.
- **The eval harness reports the two modes as separate categories** from the
  first seed case ([07](07-eval-harness.md) §4), so a regression in declared orchestration cannot be
  masked by a gain in model-chosen, or the reverse.
- **Teach submissions carry the mode**, so a correction against a model-chosen
  run is not treated as evidence about a declared workflow ([06](06-teach.md) §3).

### 1.3 Routing between them

The chat agent's single most valuable behaviour is **recognising that a question
is really a codified workflow, and routing into it rather than improvising.**

Classification runs at the frontier tier and produces one of:

1. **A declared workflow, fully bound** → run it.
2. **A declared workflow with unbound required parameters** → clarify ([05](05-clarifying-questions.md)),
   then run it.
3. **No matching workflow** → model-chosen orchestration.
4. **Out of scope** → say so, and say why.

Outcome 3 is a signal, not just a fallback. **The rate of outcome 3 is a
first-class product metric**, reported per category by the eval harness: a
rising share of model-chosen runs on repeated question shapes means a workflow
is missing, and the shapes cluster into the ticket that declares it. This is how
the brief's "avoid the generic powerful agent" becomes measurable rather than
aspirational.

### 1.4 There is no user-facing mode selector — deliberately

The obvious feature request is a control letting a user say "use the codified
workflow, don't improvise." **That control already exists in a better form: the
Tools chip** ([08](08-interface.md) §2.4). Pinning a tool biases classification toward its
workflow for the conversation, which is the same intent expressed in the user's
own vocabulary — *"use the consultation-analysis tool"* rather than *"use
declared orchestration mode."*

Adding a mode selector alongside it would be worse in three specific ways.
It asks the user to reason about the system's internals rather than about their
work. It creates an unanswerable state — declared mode selected, no workflow
matching the question — whose only honest resolutions are refusing a question
the system could have answered, or silently ignoring the setting. And a user who
pins declared mode and forgets gets degraded answers indefinitely, with the
cause three clicks away.

So: **the system chooses the mode and labels it honestly; the user chooses the
tool.** Revisit only if the fall-through metric shows users routinely wanting a
workflow the classifier is not selecting — in which case the fix is the
classifier or the workflow set, not a switch.

---

## 2. The stages

Orchestration passes through named stages. These are the same stages the
progress rail shows ([08](08-interface.md) §4), and **a stage that did not run is never
displayed as having run.**

| Stage | Mode | What happens |
| --- | --- | --- |
| `understand` | both | Classify intent; select workflow or decide model-chosen |
| `load_context` | both | Resolve the slice, assemble the Lens, entitle the worker set |
| `clarify` | both, conditional | Ask scoping questions if confidence is low or parameters unbound |
| `plan` | both | Write the plan artefact, `draft` → `ready` |
| `search_corpus` | conditional | `corpus_retrieval` |
| `check_authority` | conditional | `authority_lookup` |
| `research_web` | conditional | `web_research` |
| `analyse` | both | The declared steps, or the model-chosen dispatch loop |
| `verify` | both | Deterministic ground-check, **always**; `verifier`, if declared |
| `present` | both | Synthesise under the Lens; assemble the citation manifest |

Independent steps fan out in parallel; dependent steps chain. Parallelism is
expressed in the plan's `depends_on` edges, not inferred at run time.

---

## 3. The plan artefact

**The plan is the analysis.** It is a persisted, inspectable, editable object —
not conversational preamble, not chat text, not a rendering of the transcript.

### 3.1 Schema

```yaml
plan:
  id:              uuid
  run_id:          uuid            # the Run this plan drives
  conversation_id: uuid
  project_id:      uuid            # the assembly environment (ADR-0025)
  requester_participant_id: uuid   # identity, from the record not the caller

  mode:            declared | model_chosen
  workflow_id:     string | null   # set iff mode = declared
  workflow_version: int | null

  lens_id:         string
  lens_version:    int

  state:           draft | awaiting_clarification | ready | running
                   | complete | failed | superseded

  question:        string          # as asked
  restatement:     string          # as understood — shown to the user
  assumptions:     [string]        # named when clarification was skipped

  steps:
    - id:            uuid
      ordinal:       int
      stage:         enum          # §2
      worker:        worker-id | null
      inputs:        object        # the worker's declared input schema
      depends_on:    [step_id]
      state:         pending | running | complete | failed | skipped
      step_row_id:   uuid | null   # the append-only Step this became
      output_ref:    uuid | null
      edited_by:     participant_id | null
      edited_at:     timestamp | null

  clarifications:  [see 05 §5]
  created_at:      timestamp
  superseded_by:   plan_id | null  # an edit-and-rerun creates a new plan
```

### 3.2 Storage

A new drawer-3 table, `plans`, plus `plan_steps`, alongside `runs` and `steps`.

**Plans are versioned by supersession, not mutation.** Editing a step and
re-running creates a **new plan** with `superseded_by` set on the old one — the
same currency-by-state pattern used for containers, participants, deliverable
shares and ontology edges throughout the codebase. This matters because a plan
is evidence: "what did your AI do" must survive the user editing it afterwards.

**A plan is not append-only in the trigger sense** — a `draft` plan is mutable
while it is being clarified. It becomes immutable at `ready`, and the transition
is one-way. The existing append-only trigger pattern (T-008) applies from
`ready` onward.

### 3.3 Permissions

The plan inherits the run's read scope exactly: **readable by the producing
organisation only**, per the 2026-07-12 ruling ([runs.ts:200-212](../../apps/api/src/runs.ts#L200-L212)). The
run record is producer-private background data; the client reviews the
*document* through the review cycle, never the agent's internals.

- Read: the producing organisation's entitled Participants.
- Edit and re-run: **the requesting Participant only.** A colleague in the same
  organisation can read a plan but not re-run it as themselves — re-running is a
  new Run with a new requester, which is the honest record.
- The plan is resolved through `resourceScope` on its home project, exactly like
  runs and conversations ([requester.ts:100-108](../../apps/api/src/requester.ts#L100-L108)).

### 3.4 Edit and re-run

The user can view the plan, edit a step's inputs, remove a step, or add one from
the entitled worker set, then re-run.

- Editing is **bounded by entitlement**: a user cannot add a worker they are not
  entitled to, because the set offered is the assembled set ([02](02-worker-registry.md) §9).
- Editing cannot widen scope. A step's scope is derived from the run's
  `EntitledSlice`; it is not an editable field.
- An edited plan is always `mode: model_chosen`, **even if it started as
  `declared`** — a hand-edited workflow is no longer the declared workflow, and
  labelling it as one would be a lie. The UI says so at the point of editing.
- Re-running writes a new Run, a new plan, and sets `superseded_by` on the old.

---

## 4. Declared workflows — the DAG format

A codified workflow is a plan template. Same shape as §3.1's `steps`, with
parameters instead of bound values.

```yaml
workflow:
  id:          string
  version:     int
  label:       string
  description: string
  status:      active | draft

  parameters:
    - name, type, required: bool, default?, description
      # description is shown to the user when this parameter needs clarifying

  output_schema: object      # what the workflow returns

  steps:
    - id, stage, worker, inputs (may reference {{parameters.x}} and
      {{steps.y.output}}), depends_on

  requires_workers: [worker-id]   # validated at load against the registry
  writes:          none | sandbox_document
```

**Validation at load, not at run:**

- Every `worker` is in the registry; every `requires_workers` entry is reachable.
- The DAG is acyclic and every `depends_on` resolves.
- No step declares a scope; scope is inherited and not expressible.
- A workflow declaring `writes` must declare its label-propagation behaviour
  ([09](09-permissions-remediation.md) R2).
- `status: draft` loads in non-production only — the same rule as Lenses.

**Home:** `packages/workflows`, currently an empty stub
([index.ts](../../packages/workflows/src/index.ts)). Workflow definitions are domain content and sit beside the
Lens definitions in the authoring layer, versioned like code with an owner and a
review process.

### 4.1 The first workflows

Not specified here — they are the product and deserve their own design pass.
[07](07-eval-harness.md) requires at least one declared workflow to exist for the vertical slice, so
one is ticketed: **"answer a question about the project"**, which is the current
four-step chain declared as a DAG, changing no behaviour. It exists to prove the
runner, the plan artefact and the eval path end to end before anything new is
built on them.

---

## 5. Migration from the current chain

The existing `runChain` is a fixed four-step spine ([chain.ts:103-127](../../packages/orchestration/src/chain.ts#L103-L127)). It
becomes the default declared workflow, in three steps that each keep the app
shippable:

1. **Persist a plan for the existing chain, changing no behaviour.** The four
   steps become four plan steps; the plan is written and readable. Nothing about
   execution changes. This is the vertical slice.
2. **Execute from the plan rather than from the hard-coded sequence.** The
   executor walks `plan.steps` honouring `depends_on`. The default plan is still
   the same four steps in the same order, so behaviour is unchanged and the eval
   smoke set proves it.
3. **Add workers, workflows and model-chosen mode** on top of a plan executor
   that is already carrying production traffic.

At no point is there a long-lived broken state, and at every point the
grounded-answer path works.

---

## 6. Failure and partial results

The current chain fails hard: a leaf failure finishes that step `failed`, the
run `failed`, and stops ([chain.ts:94-98](../../packages/orchestration/src/chain.ts#L94-L98)). For a multi-worker plan that is
too blunt — one failed web search should not discard a completed corpus search.

- A step failure marks that step `failed` and every step depending on it
  `skipped`.
- Independent branches continue.
- The run completes as `completed_with_failures` if any output survived, `failed`
  if none did.
- **The answer states what did not run.** A missing branch is reported in the
  answer body, not buried in the footer — it is exactly the kind of absence
  shared-core rule 1.5 exists to surface.
- The progress rail shows failed and skipped stages as such, never as completed
  ([08](08-interface.md) §4).

This needs a `run_state` enum addition and is flagged as a security-adjacent
schema change only in that it touches the append-only audit tables.
