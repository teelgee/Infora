# Authoring a declared workflow

*T-264. The companion to [the Lens authoring guide](../../lenses/definitions/AUTHORING.md),
and deliberately its twin: same directory-of-YAML shape, same two lifetimes,
same draft rule. Two layers a domain specialist edits should not need two
mental models.*

A workflow definition is **a plan template** — the plan artefact's step shape
with **parameters** where a plan has bound values. Declaring one is what makes a
piece of work *evaluable end to end*: the steps and their order are written down
before the run, so the same inputs produce the same sequence. That is exactly
what model-chosen orchestration cannot promise, and it is the only thing the two
modes' guarantees differ by — grounding, citation and audit are identical in
both.

Adding a workflow is **adding a file**. The loader is the only code involved and
it does not change.

## The fields

```yaml
id: project-question          # kebab-case, never reused; must equal the filename
version: 1                    # bumped on ANY change; recorded on every plan it produces
label: Project question
description: One sentence a user would recognise.
status: active                # active | draft — draft loads in non-production ONLY

parameters:
  - name: question
    type: string              # string | number | boolean | id | id_list
    required: true
    description: The question to answer.   # SHOWN TO THE USER when it needs clarifying

output_schema:
  answer: the grounded, cited answer text

steps:
  - id: retrieve
    stage: search_corpus      # a PlanStage — what the progress rail shows
    worker: corpus_retrieval  # must be in the worker registry at load
    inputs:
      query: '{{parameters.question}}'
    depends_on: []

requires_workers: [corpus_retrieval]
writes: none                  # none | sandbox_document
```

`inputs` may reference `{{parameters.NAME}}` and `{{steps.ID.output}}` and
nothing else. A step may only read a step it **depends on** — otherwise the
reference is to an output that may not have been produced yet, which is a race
dressed as a template.

## The five rules, and why each exists

Everything is **validated at load, never at run**. A workflow whose step names a
worker that does not exist must fail when the deployment starts, in front of
whoever changed it — not half way through a customer's run, with two steps
already spent and an answer that will never arrive.

1. **Every worker is in the registry**, and so is every `requires_workers`
   entry. A step naming a worker that does not exist is a run that fails at the
   step, having already spent everything before it.
2. **The DAG is acyclic and every `depends_on` resolves.** A cycle has no
   execution order at all; a dangling edge is a step waiting for something that
   will never happen.
3. **No step declares a scope.** Scope derives from the run's entitled slice and
   is not expressible here — so a workflow, including one a customer authors,
   has no field with which to widen reach. `scope`, `corpus`, `visibility`,
   `project_id` and their relatives are rejected **by name**, with this reason,
   rather than as unknown fields: there is no correct spelling.
4. **A workflow that writes declares how the label travels.** `writes:
   sandbox_document` requires `label_propagation: refuse | require_override`
   (finding F2) — what happens when the computed label of the sources is broader
   than the destination's. `refuse` withholds the write; `require_override`
   permits it only against an explicit, attributed, reasoned override row, never
   a config key. `writes: none` must **not** declare one: behaviour declared for
   a write that never happens goes stale unnoticed.
5. **`status: draft` loads in non-production only.** In production a draft is
   *absent from the registry entirely* — not present-but-disabled — the same
   rule as a draft Lens and an unentitled worker. A capability the viewer cannot
   use is never advertised to them.

6. **A fan-out's width comes from a parameter, and from nowhere else.** A step
   may carry `fan_out: '{{parameters.NAME}}'`, where `NAME` is a declared
   `id_list` parameter, and becomes **one step per element** at plan time;
   `{{item}}` inside that step's `inputs` is the element. A `fan_out` naming
   `{{steps.x.output}}` is rejected, and the rejection is the point: a step's
   output can be model-written, so a width read from one would make the plan's
   **shape** model-chosen while the plan still called itself declared — losing
   the one promise (same inputs, same steps, same order) a declared workflow is
   sold on. The width is arithmetic over a list the *code that bound the
   parameter* computed. A `verify` step may not fan out, for the same reason it
   may not name a worker.

Each of the six has a fixture in `src/validate.test.ts` that fails it. A rule
with no failing fixture is a rule nobody has checked.

## `worker:` is an instruction, not a label (T-396)

Since the executor rule (ADR-0053 §7) **a step naming a capability runs that
capability**. Before it, `runChain` dispatched on stage and read `worker` never,
so a name was documentation — and `project-question.yaml` carried one that way.
Do not do that. Omit `worker` for a stage the orchestrator runs itself
(`analyse` is its own thinking leaf, `present` is citation resolution, `verify`
is the ground-check's record), and name one only where you mean that thing to
execute. A capability that `writes` will only run inside a workflow that
declared `writes` **and** its `label_propagation`; the run refuses otherwise,
before any spend.

## Messages

Error messages name the **file**, the **field** and the **rule**, in the field's
YAML spelling (`depends_on`, not `dependsOn`). This layer is owned by planning
and environmental specialists, and message quality is exactly where an
"engineers only" system quietly reasserts itself.
