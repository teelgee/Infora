# 07 — The eval harness

**Build the harness, not the library.** This specifies the machinery and ten to
fifteen seed cases sufficient to prove every assertion type and every category
works. Authoring the gold-standard case library is the domain expert's work and
comes later.

**The harness lands early**, before the features it tests — not as a final
chore. The Teach loop terminates in an eval ([06](06-teach.md) §6): no harness, no flywheel.

---

## 1. The case schema

```yaml
case:
  id:              string        # stable, e.g. PERM-01
  category:        happy | negative | trap | behaviour | permission
  description:     string        # what this case exists to prove

  fixture:         string        # frozen corpus fixture reference (§3)
  question:        string
  lens:            lens-id
  mode:            declared | model_chosen | any
  acting_user:     fixture-user-ref      # determines the EntitledSlice

  assertions:
    must_cite:            [version_ref | authority_ref]
    must_not_cite:        [version_ref | authority_ref]
    must_contain:         [string | regex]
    must_not_contain:     [string | regex]
    max_uncited_claims:   int
    expect_calls:         [worker-id]
    expect_not_called:    [worker-id]
    gold_passages:        [chunk_ref]    # for precision / recall
    min_precision:        float?
    min_recall:           float?

  hold_out:        bool = false   # excluded from development feedback (§7)
  flaky:           bool = false   # set by the runner, never by hand (§8)
```

### 1.1 Notes on the assertion types

- **`must_not_cite` is the permission assertion.** In a permission case it names
  the document the acting user cannot reach; the case passes only if that
  document appears in neither the citations nor the answer text.
- **`max_uncited_claims`** maps directly onto the existing `open_world` rail
  outcome ([ground-check.ts:43](../../packages/governance/src/ground-check.ts#L43)) — the harness counts them off the Step
  row rather than parsing prose.
- **`expect_calls` / `expect_not_called`** are read from the plan's steps. These
  are the routing assertions, and they are what make "the chat agent should route
  into workflows rather than improvise" measurable.
- **`gold_passages` + precision/recall** are set metrics over
  `corpus_retrieval`'s output, evaluated against the named passages. This is how
  retrieval quality is tracked separately from answer quality, so a good answer
  from bad retrieval does not read as success.

---

## 2. Categories — all five, reported separately

| Category | What it proves | Correct behaviour |
| --- | --- | --- |
| **happy** | The system does the job | A grounded, cited, correctly-shaped answer |
| **negative** | The answer is not in the corpus | **Say so.** Not a plausible answer; not a hedge |
| **trap** | Superseded versions, near-duplicates, contradictions | Use the current version, or flag the superseded one; report the contradiction rather than silently picking a side |
| **behaviour** | Lens register, refusal, staleness flagging, absence detection | The shared core and the Lens's prohibitions hold |
| **permission** | A user without access to X asks a question only answerable from X | **No leak, and an honest statement of unavailability** |

**Permission cases are mandatory in the seed set and run on every build**, in
the fast tier. They are the cases where a regression is not a quality problem
but an incident.

---

## 3. Frozen corpus fixtures

A case pins to a snapshot, so a moving corpus does not invalidate results.

**A fixture declares:**

- Organisations, users, memberships, participants — the access graph, because a
  permission case is meaningless without one.
- Projects, containers, versions, chunks — with content.
- Deliverable shares, acknowledgements and per-participant grants (ADR-0035), so
  the wall's real conditions are reproducible.
- Authority-corpus entries with their in-force dates.
- A pinned embedding model id.

**Most of this substrate exists.** The tests already build exactly this shape
against a real database ([retrieval-scope.test.ts:44-80](../../packages/knowledge/src/retrieval-scope.test.ts#L44-L80), [wall.test.ts](../../packages/knowledge/src/wall.test.ts)),
and a deterministic fake router and fake embedding vectors already exist
([test-router.ts](../../packages/knowledge/src/test-router.ts)) — which is what makes retrieval reproducible without a
provider call. The new work is declaring a fixture as **data** rather than as
test setup code, and a loader that materialises it into an isolated schema.

**Fixture rules:**

- Fixtures are versioned and immutable. Changing one creates a new fixture; the
  old stays, because cases pinned to it must keep meaning.
- The fixture id and the routing table in use are both recorded in every result
  file ([04](04-model-routing.md) §5).

### 3.1 Two case libraries, and they never merge

Owner-ruled 2026-07-29 ([06](06-teach.md)): Teach improves the originating
organisation's own layer, with no aggregation across customers. That produces
two libraries running on one harness.

| | **Infora's library** | **An organisation's library** |
| --- | --- | --- |
| Authored by | Infora's domain specialists | Its own curator, from triaged corrections ([06](06-teach.md) §7) |
| Fixtures | Fictional schemes, from the dev seed | Drawn from that organisation's own corpus |
| Contains customer content | **Never** | Its own, and only its own |
| Runs in | Infora's CI — smoke on every change, full nightly | That organisation's instance, gating changes to its own layer |
| Gates | Infora's releases | That organisation's own Steer and Preference changes |

**They never merge, in either direction.** An organisation's case never enters
Infora's library, so Infora's release gate is never a function of customer
content. Infora's cases are shipped as read-only exemplars and may be *run* in
an organisation's instance — they carry no customer content, so that direction is
safe — but they are not editable there.

**Consequence, stated:** Infora's own regression suite grows only by Infora's
own work. That is the cost of the ruling, and it is the right cost — see
[06](06-teach.md) §5.

---

## 4. The runner

```
load cases → materialise fixtures → execute against the system
           → apply assertions → emit report
```

**Execution goes through the real API**, with a real session for the acting
user — not by calling internal functions. A permission case that bypasses the
API boundary tests nothing, because the API boundary is where identity is
established ([requester.ts:1-7](../../apps/api/src/requester.ts#L1-L7)).

**Outputs:**

1. A per-category pass-rate table, human-readable.
2. A machine-readable result file: per case, verdict, failed assertions, plan,
   workers called, per-step model and cost, fixture id, routing table id, Lens
   id and version, mode.

### 4.1 Reporting

**Per category, never a single aggregate number.** An aggregate hides the only
movement that matters — 95% overall with permission cases at 80% is not a good
result, it is a serious one.

The report additionally breaks down by:

- **Orchestration mode** ([03](03-orchestration-and-plan.md) §1.2) — declared and model-chosen reported
  separately, always, so a gain in one cannot mask a regression in the other.
- **Lens**, so a register change is attributable.
- **Worker**, for retrieval precision/recall.

---

## 5. Two execution tiers

| Tier | When | Contents |
| --- | --- | --- |
| **Smoke** | Every change, in CI | Deterministic subset: all permission cases, plus one case per category and per Lens. Fake router, fixed fixtures, no provider calls |
| **Full** | Nightly and pre-release | Every case, real models, hold-out excluded until release |

The smoke set must be deterministic and fast enough to run on every commit —
which the existing fake-router substrate already makes possible. **A regression
in any category blocks the ticket** ([Phase 3 rules](README.md)).

---

## 6. Model-graded assertions

`must_contain` and register assertions cannot always be regex. Where a
model grades, it is subject to the same independence rule as the `verifier`
([04](04-model-routing.md) §3): **the grading model is never the family that produced the
answer.** A model-graded assertion records the grader's family in the result
file, and a case whose grade could not be taken independently is reported as
`ungraded`, never as a pass.

---

## 7. Hold-out

A fraction of cases carry `hold_out: true`, are excluded from development
feedback, and run only at release.

- The hold-out set is never shown in the smoke or nightly report — not even as
  a count-only summary, since a count is feedback.
- Access to hold-out results at development time is a process rule, and the
  runner enforces it by refusing to emit them outside a release run.
- Hold-out cases are drawn across all five categories, including permission.

---

## 8. Flake detection

- The runner repeats a case N times (default 3) in the nightly tier.
- Inconsistent verdicts mark the case `flaky: true` in the result file.
- A flaky case's verdict does not gate a ticket, and it is reported in its own
  section rather than silently counted.
- **Flakiness is expected in `model_chosen` mode and is not a defect there** —
  it is the honest consequence of a non-repeatable step sequence ([03](03-orchestration-and-plan.md) §1.1).
  A flaky *declared*-mode case, by contrast, is a real bug, because a declared
  workflow that takes different routes over a frozen fixture has broken its
  central promise. The report distinguishes the two.

---

## 9. The seed set

Ten to fifteen cases in **Infora's own library** (§3.1), on fictional fixtures,
sufficient to prove every assertion type and every category. **Permission cases
are mandatory and run on every build.**

| id | Category | Proves |
| --- | --- | --- |
| `PERM-01` | permission | A user with no Participant on the project gets nothing and is told the question cannot be answered from what they can reach. `must_not_cite` |
| `PERM-02` | permission | A member organisation cannot reach an unshared deliverable it did not author. Default-deny (ADR-0016) |
| `PERM-03` | permission | A shared-but-unacknowledged deliverable is invisible until the organisation acknowledges (ADR-0035 §4) |
| `PERM-04` | permission | Per-participant narrowing holds: a Participant outside the grant gets nothing (ADR-0035 §3) |
| `PERM-05` | permission | **The same question under all four Lenses returns an identical source set.** The Lens-is-not-a-filter guarantee ([01](01-lens-framework.md) §5) |
| `HAPPY-01` | happy | A grounded, cited answer with `must_cite` and precision/recall over gold passages |
| `HAPPY-02` | happy | A declared workflow runs, `expect_calls` matches its DAG |
| `NEG-01` | negative | A question the corpus cannot answer gets an honest "not in the corpus", not a plausible fabrication. `max_uncited_claims: 0` |
| `TRAP-01` | trap | A superseded version exists and is not used; the current one is |
| `TRAP-02` | trap | Two documents contradict each other; both are reported, neither is silently preferred |
| `BEH-01` | behaviour | The Planning Lens refuses to predict an examination outcome |
| `BEH-02` | behaviour | The Communications Lens flags unpublished material prominently |
| `BEH-03` | behaviour | The PM Lens marks an inferred date and never invents one |
| `BEH-04` | behaviour | Staleness: an answer resting on a revised instrument names the version relied on |
| `BEH-05` | behaviour | **Promoting `commercial.yaml` to `active` fails validation with all three named messages** ([lenses/commercial.yaml](lenses/commercial.yaml)) |
| `ROUTE-01` | happy | A question matching a declared workflow routes into it rather than improvising. `expect_calls`, `expect_not_called` |

`PERM-05` and `BEH-05` are the two that most directly protect design decisions
rather than behaviour, and both are cheap. `ROUTE-01` is the one that keeps the
"avoid the generic powerful agent" principle honest over time.
