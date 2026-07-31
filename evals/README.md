# The Ask eval harness

The machinery behind [docs/build/ask/07-eval-harness.md](../docs/build/ask/07-eval-harness.md).
Built at T-255 as a vertical slice: the case schema, one fixture declared as
data with a loader, a runner that executes through the real HTTP API, and one
permission case.

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
assertion naming something the fixture does not declare — each is an `error`,
loudly. The failure mode this guards is a harness that reports green while
checking nothing.

**Per category, never an aggregate.** `EvalReport` has no total field and
`formatReport` prints no total row (§4.1). Hold-out results are not emitted
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

## What is not here yet

The full assertion set and set metrics (T-256), categories and the mode split
(T-257), CI tiers, hold-out and flake detection (T-258), and the sixteen-case
seed set (T-259). `must_not_cite` is the one assertion type implemented, and
`PERM-02` the one case.
