# The Ask eval harness

The machinery behind [docs/build/ask/07-eval-harness.md](../docs/build/ask/07-eval-harness.md).
Built at T-255 as a vertical slice: the case schema, one fixture declared as
data with a loader, a runner that executes through the real HTTP API, and one
permission case. T-256 filled in the assertion set.

```bash
pnpm --filter @infora/evals run eval    # every case in cases/, per-category table + result file
pnpm --filter @infora/evals run test    # the harness's own acceptance suite
```

Both need the dev database migrated (`pnpm --filter @infora/db run migrate`).
Neither needs the seed, and neither touches it: a fixture brings its own
organisations, users and project.

## The shape

| | |
| --- | --- |
| `cases/*.yaml` | a case: fixture, question, acting user, assertions ([07](../docs/build/ask/07-eval-harness.md) §1) |
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
independence rule the `verifier` runs under, [04](../docs/build/ask/04-model-routing.md) §3): same-family grading is
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

## What is not here yet

CI tiers, hold-out and flake detection (T-258), and the sixteen-case seed set
(T-259) — `PERM-02` is still the one case in `cases/`. The report's per-Lens and
per-worker breakdowns (§4.1) wait for the things they name (T-281, T-269).
