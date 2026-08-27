# The Ask eval harness

The eval-harness design, documented beside the code it describes. The seed
set and the two-libraries rule live on the board
([docs/build/plan.md](../docs/build/plan.md), Slice Ask Wave 1).
Built at T-255 as a vertical slice: the case schema, one fixture declared as
data with a loader, a runner that executes through the real HTTP API, and one
permission case. T-256 filled in the assertion set.

```bash
pnpm --filter @infora/evals run eval          # the full tier: every case bar hold-out
pnpm --filter @infora/evals run eval:smoke    # the every-commit subset
pnpm --filter @infora/evals run eval -- --tier release --repeats 5
pnpm --filter @infora/evals run test          # the harness's own acceptance suite
```

Both need the dev database migrated (`pnpm --filter @infora/db run migrate`).
Neither needs the seed, and neither touches it: a fixture brings its own
organisations, users and project.

## The shape

| | |
| --- | --- |
| `cases/*.yaml` | a case: fixture, question, acting user, assertions ([07](../docs/build/plan.md) §1) |
| `fixtures/*.yaml` | a frozen corpus fixture: the access graph, then the corpus (§3) |
| `src/harness.ts` | the real app on a loopback socket, with the deterministic fake providers |
| `src/runner.ts` | one case → one result |
| `src/assertions.ts` | the assertion registry |
| `src/report.ts` | the per-category table and the result file (§4) |
| `results/` | result files, gitignored — a run's output, never the record |

## Four properties worth keeping

**Execution goes through HTTP.** The runner logs in, opens a conversation and
asks the question over a socket, because the API boundary is where identity is
established ([requester.ts](../apps/api/src/requester.ts)). A runner calling
internal functions would test everything except the thing a permission case
exists to test.

**Nothing unevaluable is ever a pass.** An assertion type the registry does not
implement, a Lens or orchestration mode a case pins before it exists, an
assertion naming something the fixture does not declare, an assertion whose
evidence the run did not record — each is an `error`, loudly. The failure mode
this guards is a harness that reports green while checking nothing.

**Per category and per mode, never an aggregate.** `EvalReport` has no total
field and `formatReport` prints no total row (§4.1) — pinned structurally in
`src/report.test.ts`, against the shape rather than the wording, so a `passRate`
added later in good faith cannot slip past a test that only looked for "total".
Declared and model-chosen runs are reported separately, always, because a gain
in one must not mask a regression in the other. Hold-out results are not emitted
outside a release run, not even as a count, because a count is feedback (§7).

**A fixture is immutable and isolated.** Changing one creates a new fixture, so
cases pinned to the old keep meaning. Every load materialises its own
organisations, users and project under a fresh namespace; it is not a separate
Postgres schema, because every migration pins `public` in its foreign keys and
grants, and the isolation that matters is enforced anyway — retrieval is
project-scoped in SQL and, since T-247, under row-level security beneath that.

Fixtures also write their own pinned index, `eval-embed` (ADR-0024: each
embedding model is its own index over the same corpus). `ingestVersions` walks
every version in the database and replaces its chunks wholesale under the model
it was given, so a fixture sharing `fake-embed` with the ingest suite can be
re-chunked underneath a running case — which showed up as an intermittent
failure when the suites ran in parallel. A frozen fixture another suite can
rewrite is not frozen.

## The assertion set (T-256)

| Assertion | Read from | Notes |
| --- | --- | --- |
| `must_cite` | the run's citations | |
| `must_not_cite` | citations **and** the answer text | the permission assertion (§1.1) |
| `must_contain` / `must_not_contain` | the answer text | plain string = case-insensitive substring; `/pattern/flags` = regex; `~claim` = **model-graded** (T-257) |
| `max_uncited_claims` | the `open_world` rail outcomes | counted off the verifier's decision, never by parsing prose |
| `expect_calls` / `expect_not_called` | the plan's steps | **deferred, see below** |
| `gold_passages` + `min_precision` / `min_recall` | the retrieve step's source set | chunk grain: a gold passage is `version_key#chunk_index` |

Every type has a passing *and* a failing test, as evaluators
(`src/assertions.test.ts`) and through HTTP (`src/harness.test.ts`), because an
evaluator that always returns `[]` passes every positive test on its own.

**The set metrics are at passage grain**, which is what T-253 made possible by
recording `chunkId` on the Step row's source set. Precision measured at document
grain reads a version as one hit however much of it was irrelevant. Retrieving
nothing scores precision **zero**, not the vacuous 1.0 the arithmetic gives —
an empty answer must never read as perfectly precise. A retrieved source
recorded without its chunk makes the metric `Unevaluable` rather than being
counted or dropped, either of which fakes a number.

**`expect_calls` / `expect_not_called` are implemented and deferred.** The
evaluators are complete and unit-tested both ways; the runner cannot yet observe
what they read. A plan exists (T-260) but nothing reads one over HTTP until
T-261, and every plan step's `worker` is null until the registry at T-269. So
the observation carries `workersCalled: null` and a case declaring either type
is an `error` — because `[]` would make `expect_not_called` pass for every
worker in the world, for ever.

## Model-graded assertions and the fourth verdict (T-257)

Some assertions cannot be a regex — "the answer states the exceedance is
against a baseline" is a claim about meaning, and a substring pins it either by
coincidence or not at all. A `must_contain` / `must_not_contain` entry written
with a leading `~` is handed to a model instead:

```yaml
must_contain:
  - "0.41 mg/l"                                   # substring
  - /HB-\d\d/                                     # regex
  - ~the exceedance is stated against a baseline  # model-graded
```

**The grading model is never the family that produced the answer** (§6, the same
independence rule the `verifier` runs under, [04](../docs/build/plan.md) §3): same-family grading is
largely self-agreement — the failure it cannot see is the failure it just made.
A same-family grader is **refused, not called**. No grader, or a refused one,
makes the claim **`ungraded`** — a fourth verdict beside pass / fail / error,
never a pass, in its own report column, and it blocks the gate. A skip that
counted as green would be indistinguishable from a check that held.

Verdict precedence is `error > fail > ungraded > pass`: a known failure is more
informative than an unchecked claim, so it takes the label, and the ungraded
claim is still recorded with the reason no grade was taken.

The smoke tier has no grader by construction — it runs on the fake router with
no provider calls (§5) — so a case with a graded claim does not belong in it.
Wiring it is `startHarness({ grader })`; `family` is the harness's own record
until `packages/model` carries families (T-284/T-286), at which point the
producing family comes off the run's draft step instead.

### The grader ruling for the MVP (T-282, 2026-08-01)

T-282 required a choice — **configure an independent family for the nightly
tier, or accept human review for the MVP — and record which.**

**Ruled: human review, recorded here.** It is not really a fork. Configuring an
independent family needs a second provider, which sits behind the
infra/security decision session (the gate that blocks any external pilot), and
needs the router to carry a family concept at all, which is T-284/T-286. Neither
is available to an MVP ticket, so "configure one" is not a thing this ticket
could have chosen; pretending otherwise would have shipped a decision nobody
could act on.

**What that means in practice.** The four `LENS-*` cases run, reach the prompt,
and come back **`ungraded`**. That blocks the eval gate, **by design and not as
a bug**: `ungraded` is never a pass (§6), and a register claim nobody assessed
must not read as one that held. Until a family lands, the register half of these
cases is checked by a person reading the four answers side by side — which is
the honest description of what is happening, and is why the report now carries a
per-Lens table (§4.1) naming exactly which Lens is unchecked.

**What is still machine-checked meanwhile**, and it is not nothing: each
`LENS-*` case carries a plain substring beside its `~claim`, asserting that the
Lens **reached the prompt at all**. Without it, a run where the Lens was
silently dropped would produce the same `ungraded` verdict as one where it
applied and nobody could grade it — and those are very different failures.
`PERM-05`'s identical-source-set half is fully machine-checked, at the API
boundary as well (`apps/api/src/lens.test.ts`).

**When this is revisited:** when T-284/T-286 land a family-aware router, or when
the infra session names a second provider — whichever is first.

#### Revisit performed 2026-08-01 — the trigger fired, and the ruling stands

The infra/security session named a second provider (**Bedrock**, ADR-0047 §13,
ticketed T-320/T-321), so the second limb of the trigger fired the same day the
ruling was written. The revisit it obliges has been done, and the outcome is
that **human review stands** — for a reason the trigger's own wording missed.

**A second *provider* is not a second *family*.** Bedrock's headline Anthropic
offering is Claude, which is the family the build already runs on, and **grading
Claude's output with Claude is not independence** — it is the same model marking
its own homework through a different endpoint. T-320 as written names a provider
and not a family, so landing it does not by itself make the eleven `ungraded`
cases gradable.

**The real condition is narrower than the trigger said:** *a configured route to
a non-Anthropic family*. Bedrock can satisfy it — it also serves Llama, Mistral,
Nova and Cohere — but only if T-320 is deliberately pointed at one of them
rather than at Claude. That is a free option worth taking while the adapter is
being written, and T-320's board entry now says so.

**Until then nothing changes:** `ungraded` is still never a pass (§6), the four
`LENS-*` cases are still checked by a person reading the answers side by side,
and the substring assertion still catches a silently-dropped Lens. Re-rule when
a non-Anthropic route exists, not when T-320 merely lands.

## Tiers, hold-out and flake (T-258)

| Tier | When | Runs |
| --- | --- | --- |
| `smoke` | every change | **every** permission case, plus one per category and per Lens. Deterministic, no model-graded cases |
| `full` | nightly | every case bar hold-out, repeated 3× for flake |
| `release` | pre-release | every case, hold-out included |

**`smoke` is wired into CI (T-345, 2026-08-27)** — `.github/workflows/ci.yml`,
after the test suites and before the e2e run — so "every change" is now the
pipeline's behaviour and not only this table's intent. The step names **no
case**: `selectCases` decides what a tier runs, so a permission case added
tomorrow is in the mandatory set without anyone editing a workflow file, which
is the whole reason selection is a function rather than a comment in a CI file.
The step needs the migrated database and **not** the seed — a fixture brings its
own organisations, users and project — and makes no provider call, so it costs
nothing and needs no key.

`full` and `release` are still run by hand. Scheduling the nightly tier is a
different problem from wiring this one: it makes real model calls, so it needs
provider credentials in CI and a spend it is worth deciding on deliberately, and
it is where the `ungraded` cases live. Named here rather than left implied.

**Permission cases are never thinned** — a regression in one is an incident, not
a quality problem (§2), and "make smoke faster" is the change that would cross
that line first. **A hold-out case is not run outside a release run**, not
merely filtered out of the report afterwards (§7): never executing it is the
control, and the report filter is the backstop. Both are tested independently.

**A model-graded case cannot run in smoke** (no independent grader), which
collides with permission cases being mandatory there. That collision is resolved
at the case schema: **a permission case may not declare a `~claim`** — a
reasonable thing to require of a case whose subject is whether a document
leaked.

**Flake detection** (§8) repeats each case in the nightly tiers and marks
disagreeing verdicts `flaky`, set by the runner and never by an author. A flaky
case is counted in its own column — not in `pass`, `fail` or `error`, because
its verdict is one of several the same case produced — and gets its own section
naming the mode and the consequence. **The asymmetry:** a flaky *declared* case
fails the build, because a declared workflow that takes different routes over a
frozen fixture has broken its central promise; a flaky *model-chosen* case does
not, because a non-repeatable sequence is its design. An **unlabelled** run gets
the declared treatment — the exemption needs evidence, and the absence of a
label is not evidence.

## Lens cases (T-282)

A case may declare `lens:`, and the runner passes it as `lensId` on the run
(T-299). It is resolved against **the harness's own registry**, loaded with
production semantics — the four active Lenses and not the draft `commercial`,
because a case that could reach a draft Lens would be evidence about a
configuration nobody ships. A case naming an id the deployment does not offer
is an `error` naming the ids it does, rather than an opaque `400` surfacing as
"asking the question returned 400".

`LENS-01` to `LENS-04` are the register guard: **the same question, the same
corpus and the same acting user under all four Lenses.** One Lens case in
isolation proves only that *a* Lens applied; the set is what proves the four
differ. They are `behaviour` cases and they are the reason the report gained a
per-Lens table.

The harness's fake chat prefixes its answer with the reader named in the system
prompt, so a Lens's effect is observable through HTTP. **A run naming no Lens
gets the original reply byte for byte** — T-260's acceptance pins the smoke
result to prove the plan artefact changes nothing, and a baseline that moved for
an unrelated reason would silently invalidate that pin.

## The seed set (T-259)

Thirteen eval cases on `hollowfield-reservoir-2`, plus the four `LENS-*`
register cases on `hollowfield-reservoir`. What each one proves is written at
the top of its own file, which is where it belongs; three things are only
sayable here.

**Two of the sixteen are deferred, and named rather than faked.** `HAPPY-02`
and `ROUTE-01` rest on `expect_calls`, which needs a readable plan (T-261) and
a worker registry (T-269). The assertion already errors rather than passing
vacuously (T-256), so authoring them now would put two permanent errors in the
seed set.

**`BEH-05` is not an eval case and cannot be one.** Every case executes a run
over HTTP; `BEH-05` is a claim about what happens when a FILE is loaded — no
run, no requester, no answer. Forcing it into a case shape would produce a case
that asserts nothing about a run. It ships as a pinned test beside the validator
it tests (`packages/lenses/src/validate.test.ts`, *"produces exactly the three
messages `commercial.yaml` promises"*), and `commercial.yaml`'s own header
states the three messages, so the test and the file can be checked against each
other by eye.

**Two case shapes were added for it**, and neither is an assertion, because
neither has an Observation to read:

| Shape | Case | What it does |
| --- | --- | --- |
| `expect_refused: true` | `PERM-01` | the verdict IS the refusal. A user with no Participant cannot open a conversation — the API answers 404, because denial and nonexistence read identically — so there is no run to assert over. A `403`, or any status but 404, is an **error** rather than a pass: it would mean the API had begun distinguishing denial from nonexistence, which is itself the leak. A refused case may declare no assertions. |
| `lens_invariance: [ids]` | `PERM-05` | the runner asks the question once per named Lens and compares the admitted **source sets**. It compares sources and never answers: two Lenses producing identical answers is a different failure — a Lens that did nothing — and conflating the two would let either hide. That half is `LENS-01`–`LENS-04`'s job. |

**What the substrate can and cannot decide, stated per case rather than
discovered.** Six cases pass deterministically today — all five permission
cases and `HAPPY-01`. The rest carry model-graded `~claims` and come back
**`ungraded`**, which blocks the gate and is never a pass. That is the honest
state, not a gap being hidden: `NEG-01`'s `max_uncited_claims: 0` is left in the
file as a commented line rather than deleted, because the fake router emits one
deliberately unsupported claim on every question and the assertion would fail
for a reason unrelated to the behaviour under test. A red mark against an
untested behaviour is worse than no mark.

**The fixture is sized (T-312).** `hollowfield-reservoir-3` is 291 documents:
eleven written, each carrying a comment naming the Lens exchange or case it
serves, and 280 generated from a `background:` recipe that is deterministic from
its seed — so the fixture is frozen (§3) without listing them. Background is
**shared and acknowledged**, because background the acting user cannot see is
filtered out before the vector comparison and competes with nothing; and it may
never contain a term a case turns on (`RESERVED_TERMS`, asserted in
`background.test.ts`), because a filler document mentioning phosphate would not
make a case harder, it would make it ambiguous.

**Sizing it exposed the substrate.** `fakeVector` has two basis vectors —
"contains the word alpha", or not — which is right for suites asking whether a
document is reachable, and useless for one asking which is best. At 291
documents every vector was identical and the ranking was the tie-break on chunk
id. The harness now uses its own hashed-bag-of-words vectoriser
(`src/embedding.ts`), beside the pinned model id it already declared;
`fakeVector` is unchanged for everyone else.

**Precision is bounded by `gold ÷ budget`.** Retrieval admits eight chunks, so a
case declaring one gold passage can score at most 0.125 however well it answers.
`case.ts` refuses a `min_precision` above that ceiling at authoring time — a
case that can only fail reports a defect in the system under test that is really
a defect in the assertion.

## What is not here yet

The report's per-worker breakdown (§4.1) waits for the registry (T-269); the
per-Lens half landed with T-282. ~~No CI workflow calls `eval:smoke` yet~~ —
**wired 2026-08-27 (T-345)**; the nightly `full` tier is not scheduled, and that
is a credentials-and-spend decision rather than a missing mechanism.
