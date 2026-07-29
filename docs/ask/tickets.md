# Ask — the ticket set (Phase 2)

**Status:** drafted 2026-07-29. **T-245 – T-297.** Next free after this block:
**T-298** — bump [plan.md](../build/plan.md) line 13 in the same commit that
claims numbers.

Requirements this set is built to satisfy: [docs/ask/](README.md).
Findings it remediates: [phase-0-discovery.md §2](phase-0-discovery.md).

**Definition of done, every ticket** (inherited from the board): typed against
`packages/contracts`; unit-tested; no surface reaches below the API; no code
path resolves its own permissions; lints and builds clean in CI. **Plus, for
this slice:** the eval smoke set runs green per category before a ticket is
reported complete.

🔒 = **security-boundary ticket.** Reported with evidence in the Phase 0
interrogation format — claim, `file:line`, verdict — and reviewed separately.

---

## Reading order

| Wave | Tickets | Why here |
| --- | --- | --- |
| **0 — Permissions** | T-245 – T-254 | Owner-ruled first. Every one is cheaper now than after workers exist |
| **1 — Eval harness** | T-255 – T-259 | Lands early so it tests everything after it, not as a final chore |
| **2 — Orchestration** | T-260 – T-268 | The plan artefact, starting from a no-behaviour-change slice |
| **3 — Workers** | T-269 – T-280 | The registry, then workers in dependency order |
| **4 — Lens** | T-281 – T-283 | Surface-and-prompt only; independently shippable |
| **5 — Routing** | T-284 – T-286 | |
| **6 — Clarifying** | T-287 – T-288 | |
| **7 — Teach** | T-289 – T-291 | Needs the eval harness (T-255) to terminate in |
| **8 — Interface** | T-292 – T-296 | |

The app is shippable at every point. No ticket leaves a long-lived broken state.

---

# Wave 0 — Permissions

## T-245 — Conflict register: schema and predicate 🔒
**Type:** security · **Epic:** permissions · **Depends on:** none
**Blocks:** T-246

**Context.** Nothing prevents one person holding live Participant grants on a
promoter's scheme and an objector's scheme (finding F1). ADR-0018 isolates
organisations, not individuals across projects. Ruled in scope and sequenced
first; **ADR-0046 is Accepted, all three forks settled**.

**Scope.** Migration for `conflict_exclusions` — **individual grain by default**
(a named Participant/user may not hold live grants on both sides), with an
**optional organisation-level form** that binds every Participant of the
organisation (ADR-0046 §7). Symmetric by construction: the relation is unordered
and there is no asymmetric form (§9). Currency-by-state interval — declared /
live / withdrawn, never deleted. The exclusion predicate in
`packages/governance` beside `resolveAccess`, a pure function of loaded rows.
Re-check inside `resolveAccess` as defence in depth. Contracts types.

**Out of scope.** Detecting undeclared conflicts. Time-limited or decaying
exclusions. The admin surface and the attestation (T-246).

**Acceptance.**
1. An exclusion row records the declaring organisation and admin, when, its two
   sides, its grain (individual or organisation), and its state.
2. `resolveAccess` returns `null` for a Participant whose grant breaches a live
   exclusion; **all existing predicate tests pass unchanged**.
3. Where both grains are present, the organisation-level exclusion is the
   ceiling and the individual one narrows within it — it can never widen
   (the ADR-0015 subset invariant).
4. A withdrawn exclusion stops denying; the row survives and past refusals stay
   attributable to it.
5. The relation is symmetric: declaring X↔Y and Y↔X produce one row, not two,
   and a test asserts the unordered key.
6. **The register is org-private on the ADR-0018 private floor** — readable by
   the declaring organisation's own admins only, never by a project owner and
   never across the wall.

**Test notes.** Unit tests on the predicate for every branch. Eval category:
permission — a seed case asserting a conflicted grant denies.

**Security notes.** Non-negotiable 2 (data layer, never a prompt). The first
*positive-exclusion* control in the platform; it must fail closed — an
unreadable or malformed exclusion denies rather than permits. Acceptance 6
matters as much as the rest: the per-person list reveals which people are walled
from what, which is close to revealing the engagements.

**Estimate.** M. **Largest risk:** acceptance 3 — two grains interacting is
where a subset invariant quietly inverts.

---

## T-246 — Conflict register: refusal, retrospective report, attestation, admin surface 🔒
**Type:** security · **Epic:** permissions · **Depends on:** T-245

**Context.** A predicate nobody can administer is not a control. And the project
owner needs assurance without gaining the register (ADR-0046 §8).

**Scope.** Refuse Participant creation that breaches a live exclusion. Declaring
an exclusion **reports** existing conflicting grants and never revokes them. The
**attestation**: a per-project setting obliging each member organisation to
attest that it operates a conflict policy and has declared the exclusions its
engagements require — an audited record (who, which organisation, when), not a
view of the register. Admin surface for the declaring org: declare, view,
withdraw, retrospective conflict list. Owner surface: attestation requirement
and status. Audit rows throughout.

**Out of scope.** Bulk import. Notifications (no notification system exists —
grill-tracker residual).

**Acceptance.**
1. A conflicting Participant grant is refused with **exactly** the ADR-0046 §9
   wording — names that a wall applies, directs to the requester's own org
   admin, and **never names the conflicting scheme, project or engagement**.
2. The declaring organisation's own admin sees the full reason, because they own
   the register; nobody else does, including the project owner.
3. Declaring an exclusion over existing conflicting grants lists them and
   revokes nothing.
4. An owner can require an attestation and see which member organisations have
   attested and when — **and cannot see any exclusion row**.
5. Withdrawing an exclusion is audited and immediately stops refusing.
6. Semantic tokens, no `window.prompt` (standing A2.1 acceptance tests).

**Test notes.** Acceptance 1 and 4 are the leak tests: assert on the response
body and the owner-facing payload, not on the UI.

**Security notes.** Acceptance 1 is a deliberate, ruled trade — a bare denial
was rejected because it leaks *more* through human escalation (ADR-0046 §9).
Acceptance 4 is the trust-plus-audit boundary: the owner gets evidence a control
exists, never its contents.

**Estimate.** M. **Largest risk:** acceptance 4. An attestation surface that
accidentally exposes counts or dates from the register is the obvious way to
leak it back.

---

## T-247 — RLS, the chunk-import dep rule, and the prompt-permission CI guard 🔒
**Type:** security · **Epic:** permissions · **Depends on:** none
**Blocks:** nothing — deliberately early and cheap

**Context.** Finding F6: the tenant filter is unavoidable by construction but
there is no row-level security, so a future query written elsewhere against
`version_chunks` would return everything. Correct today; fails *open* at the
database. RLS is already committed as an infra-session item (grill tracker,
pre-infra rulings); this lands the Ask-relevant half early.

**Scope.** Postgres RLS on `version_chunks`. A source-level rule fencing the
`versionChunks` symbol to the packages that read and ingest it. A CI grep guard
for permission-shaped strings in prompt templates.

**Out of scope.** RLS across the remaining drawers (infra session). **RLS on
`containers` — split out to T-297** during the build: `version_chunks` has two
non-test consumers (retrieval, ingest) so its scope can be declared inside
`groundedLibrary` with no caller changes, while `containers` has thirteen across
the whole API, every one of which would need transaction scoping. That is a
refactor with its own risk profile, not a line in this ticket.

**Acceptance.**
1. With the application's own pre-filters removed in a test harness, a query as
   the app role returns no rows outside the session's project — proving RLS is
   load-bearing, not decorative.
2. A test package importing `versionChunks` fails `pnpm run check:deps`.
3. The grep guard fails CI when a permission-shaped string is added to a prompt
   template, and passes on the current tree (which has zero hits).

**Test notes.** Acceptance 1 is the one that matters; write it so a wrong
implementation (RLS policy present but permissive) fails it.

**Security notes.** Defence in depth for non-negotiable 2. Do not let RLS become
an excuse to relax the application pre-filters — both stay.

**Estimate.** M. **Largest risk:** the connection role — *realised, and caught
by acceptance 1*. The dev substrate's `infora` role is the database superuser,
and a superuser bypasses RLS entirely, FORCE or not; the first implementation
returned all 120 rows unscoped. The fix is a separate unprivileged `infora_app`
role for the application, with migrations and the seed staying on the owner
connection. This changes the developer setup (`.env`, README, CI) — the cost of
making RLS real rather than decorative.

---

## T-248 — Scope attenuation on `EntitledSlice` 🔒
**Type:** security · **Epic:** permissions · **Depends on:** none
**Blocks:** T-269

**Context.** Finding F8. A child run carries the parent's participant id
verbatim, so escalation is impossible — but scope is *equal*, never narrowable,
and non-negotiable 3 requires a worker's access to be a **subset** of its
caller's.

**Scope.** An optional narrowing on `EntitledSlice` (container ids and/or
classification terms), intersected into `liveLibraryFilter`, never unioned.
Monotonic composition: a child's narrowing intersects with its parent's, and no
operation removes one.

**Out of scope.** Per-worker narrowing declarations (T-269).

**Acceptance.**
1. A narrowed slice returns a strict subset of what the same unnarrowed slice
   returns, over the same fixture.
2. Composing two narrowings yields the intersection; there is no code path that
   widens.
3. The existing "no parameter exists to widen scope" test
   ([wall.test.ts:126](../../packages/knowledge/src/wall.test.ts#L126)) is extended to assert narrowing cannot widen
   either, and passes.
4. An empty narrowing set means "no narrowing", not "narrow to nothing" — and a
   test pins which.

**Test notes.** Eval category: permission. Property-style test over composition.

**Security notes.** The signature guarantee is the thing being protected. Any
new parameter on `assemble` is a review event.

**Estimate.** M. **Largest risk:** acceptance 4 — the empty-set ambiguity is
exactly the kind of thing that silently inverts a filter.

---

## T-249 — Label propagation on write-back 🔒
**Type:** security · **Epic:** permissions · **Depends on:** none
**Blocks:** T-280, T-295

**Context.** Finding F2. Written output takes the writer's own organisation
([sandbox.ts:129](../../apps/api/src/sandbox.ts#L129)), not the most restrictive label among its sources. Ask's
"Open in editor" is a live instance: an answer grounded on a deliverable
narrowed to named Participants (ADR-0035 §3) can land in a `multi_org` sandbox.

**Scope.** Compute the most restrictive label across a run's source set
(participant-narrowed ⊂ single-org ⊂ multi-org ⊂ project-wide). Enforce on
every write path: refuse a destination broader than the computed label, with a
stated reason naming both labels. Explicit override, recorded and attributed.

**Out of scope.** The destination selector UI (T-295).

**Acceptance.**
1. An answer grounded on a participant-narrowed deliverable is refused a write
   to a multi-org sandbox, and the refusal names both labels.
2. The same write to a single-user sandbox succeeds with no warning.
3. An override is recorded with the overriding participant, timestamp and both
   labels, and is visible in the audit trail.
4. Every existing write path is covered — "Open in editor", sandbox document
   create/patch — proven by a test per path, not by inspection.

**Test notes.** Eval category: permission. Acceptance 4 needs an enumeration of
write paths in the PR description.

**Security notes.** Non-negotiable 4. Override must never be a config default.

**Estimate.** L. **Largest risk:** enumerating every write path. A missed one is
a silent hole, and the code has several (T-106 editor carry, sandbox create,
suggestions).

---

## T-250 — The untrusted-content type barrier 🔒
**Type:** security · **Epic:** permissions · **Depends on:** none
**Blocks:** T-279

**Context.** Finding F3. No web fetch exists today, so the guarantee holds by
omission. The seam is already declared (`attached_sources.kind = 'web'`, stored
and never read), and the prompt is built by concatenating `retrieved.items`, so
any pipeline appending an item reaches the model.

**Scope.** An `ExternalSource` type distinct from `AssembledItem`, with **no**
conversion function. A `packages/external` leaf package whose dependency
manifest excludes `@infora/db` and `@infora/knowledge`, enforced by a dep rule.
Resolve the reserved `web` attached-source kind — wire it under the barrier or
remove it, so no declared-but-unenforced path sits in the schema.

**Out of scope.** The `web_research` worker itself (T-279).

**Acceptance.**
1. A test file attempting to pass an `ExternalSource` to `groundedDraft` fails
   to compile, and that failure is asserted in CI (a `tsc --noEmit` expected-error
   fixture, not a comment).
2. `packages/external` importing `@infora/db` fails `pnpm run check:deps`.
3. The `web` attached-source kind is either enforced or gone; the PR states
   which and why.

**Test notes.** Acceptance 1 is the whole ticket. A runtime check would not
satisfy it — the requirement is that the mistake is not expressible.

**Security notes.** Non-negotiable 5. This is the ticket that makes prompt
injection in a fetched page structurally unable to reach client data.

**Estimate.** M. **Largest risk:** acceptance 1's mechanism — expected-compile-error
testing is unusual in this repo and needs a pattern establishing.

---

## T-251 — Session lifetime and a server-side session record 🔒
**Type:** security · **Epic:** permissions · **Depends on:** none
**Blocks:** T-252

**Context.** Finding F4. The cookie is set with no `maxAge`/`expires`
([auth.ts:41-46](../../apps/api/src/auth.ts#L41-L46)) — a browser-session cookie with no server-side expiry and
no session table. A signed cookie alone cannot be revoked.

**Scope.** A `sessions` table. Absolute lifetime + idle timeout, both config.
Revocation. The middleware validates against the record, not only the signature.

**Out of scope.** Entra SSO — the infra/security session owns production
identity. This is session *lifecycle*, which must hold whatever provider lands.

**Acceptance.**
1. A session past its absolute lifetime is rejected with 401, cookie signature
   valid or not.
2. A revoked session is rejected on the next request.
3. Idle timeout extends on activity and expires without it; both bounds are
   config-driven and tested at their edges.
4. Sign-out revokes the record, not just the cookie.

**Test notes.** Time is injected, never `Date.now()` in the assertion path.

**Security notes.** Prerequisite for long-running plans (T-252).

**Estimate.** M. **Largest risk:** interaction with the existing signed-cookie
path; the middleware is on every request.

---

## T-252 — Per-step slice re-resolution 🔒
**Type:** security · **Epic:** permissions · **Depends on:** T-251, T-260

**Context.** Finding F4, second half. The retrieve leaf re-reads the
participant's organisation but does not re-run `resolveAccess`
([retrieve-leaf.ts:72-81](../../packages/orchestration/src/retrieve-leaf.ts#L72-L81)). A Participant revoked mid-run keeps authority to
the end of the chain. Seconds today; minutes once a plan fans out.

**Scope.** Re-resolve the `EntitledSlice` at the start of every plan step. A
step whose re-resolution fails does not run; the run reports what it completed
and why it stopped.

**Out of scope.** Cancellation (existing grill-tracker residual).

**Acceptance.**
1. Revoking a Participant between step 1 and step 2 stops the run at step 2.
2. The run's record shows the completed steps and a stated reason for stopping.
3. No step executes against a stale slice — proven by a test that revokes
   mid-run, not by inspection.

**Test notes.** Needs a plan with ≥2 steps, so it sequences after T-260.

**Security notes.** Non-negotiable 3. Revocation taking effect immediately is
already the platform's posture for sandbox grants (ADR-0036); this brings runs
into line.

**Estimate.** M. **Largest risk:** cost — re-resolution per step adds queries on
the hot path; measure before optimising.

---

## T-253 — Passage-grain audit
**Type:** security · **Epic:** permissions · **Depends on:** none

**Context.** Finding F5. `step.source_set` records version ids, so "what did
your AI see" answers at document-version grain, not passage grain.

**Scope.** Record `chunk_id` alongside `version_id` in `source_set`. A read that
reconstructs a run's assembled context from its source set, producer-private
like the rest of the run record.

**Out of scope.** Retention policy (Slice C).

**Acceptance.**
1. A completed run's assembled passages are reconstructible exactly, in order.
2. The reconstruct read is refused to a non-producing organisation with the same
   404 as nonexistence.
3. No passage text is duplicated into the audit tables — reconstruction reads
   the immutable chunk rows.

**Test notes.** Eval category: permission (acceptance 2).

**Security notes.** Converts "we log what it saw" from a claim into a
demonstration for a client security review.

**Estimate.** S. **Largest risk:** none material.

---

## T-254 — Real cost attribution
**Type:** infra · **Epic:** permissions · **Depends on:** none

**Context.** Finding F7. Rates default to `0` and the app binds the draft leaf
with no options ([app.ts:118](../../apps/api/src/app.ts#L118)), so **every step in the live system records a
cost of exactly zero.** Token counts are real; money is not.

**Scope.** Provider rates per model id in deployment config, passed at leaf
construction. Aggregation read at organisation and user grain over a date range,
producer-private.

**Out of scope.** The rate-limit store move to Redis (infra session; restated in
[04](04-model-routing.md) §6 as a dependency, not owned here).

**Acceptance.**
1. A completed run in the running app records a non-zero cost per model-calling
   step, with the rate traceable to config.
2. Aggregation returns per-organisation totals matching the sum of its steps.
3. A step that made no model call records null cost, not zero — the two are
   different facts and the schema already distinguishes them.

**Test notes.** Acceptance 3 guards against the bug this ticket exists to fix
recurring in a new form.

**Estimate.** S. **Largest risk:** none material.

---

# Wave 1 — Eval harness

## T-255 — Eval harness vertical slice ⭐
**Type:** infra · **Epic:** eval-harness · **Depends on:** T-247
**Blocks:** every ticket after it (by the smoke-set rule)

**Context.** The harness lands before the features it tests. The Teach loop
terminates in an eval; no harness, no flywheel. The substrate mostly exists —
a deterministic fake router and fake embeddings ([test-router.ts](../../packages/knowledge/src/test-router.ts)) and tests
that already build access graphs against a real DB.

**Scope.** The thinnest end-to-end path: case schema (id, category, fixture,
question, acting user, one assertion type), a fixture declared as **data** with
a loader that materialises it into an isolated schema, a runner that executes
**through the real API with a real session**, and one permission case that
passes.

**Out of scope.** The full assertion set (T-256), categories and reporting
(T-257), CI tiers (T-258).

**Acceptance.**
1. `pnpm run eval` loads a fixture, runs one permission case through the HTTP
   API, and reports pass/fail.
2. The case runs deterministically — ten consecutive runs give the same verdict.
3. Execution goes through the API boundary; a test asserting the runner does not
   import `@infora/knowledge` or `@infora/db` directly passes.
4. Fixtures are immutable and versioned; mutating one in place is not possible.

**Test notes.** Acceptance 3 is the one that makes permission cases meaningful —
a runner calling internal functions tests nothing about the boundary where
identity is established.

**Security notes.** Permission cases are the reason this ticket sequences here.

**Estimate.** L. **Largest risk:** fixture isolation. Shared-DB test isolation is
already a known pattern in this repo; follow it rather than inventing one.

---

## T-256 — The full assertion set and set metrics
**Type:** infra · **Epic:** eval-harness · **Depends on:** T-255

**Scope.** `must_cite`, `must_not_cite`, `must_contain`, `must_not_contain`,
`max_uncited_claims`, `expect_calls`, `expect_not_called`, and gold-passage
precision/recall.

**Out of scope.** Model-graded assertions (T-257).

**Acceptance.**
1. Each assertion type has a case that passes and a case that fails, both in the
   fixture set — a wrong implementation cannot pass both.
2. `max_uncited_claims` is counted off the `open_world` rail outcomes on the
   Step row, not by parsing prose.
3. `expect_calls` / `expect_not_called` read from the plan's steps.
4. Precision/recall are computed against named gold passages and reported
   separately from answer verdicts.

**Test notes.** Acceptance 1 is the anti-vagueness guard for this whole ticket.

**Estimate.** M. **Largest risk:** `expect_calls` depends on the plan existing
(T-260); until then it is asserted against the fixed chain's steps.

---

## T-257 — Categories, per-category reporting, and the mode split
**Type:** infra · **Epic:** eval-harness · **Depends on:** T-256

**Scope.** The five categories (happy, negative, trap, behaviour, permission).
Per-category pass-rate table plus a machine-readable result file. Breakdown by
orchestration mode, Lens and worker. Model-graded assertions under the
independence rule.

**Out of scope.** Hold-out and flake (T-258).

**Acceptance.**
1. The report emits **per category, and never a single aggregate number** — a
   test asserts no top-level aggregate field exists in the result file.
2. Declared and model-chosen modes are reported separately, always.
3. A model-graded assertion records the grader's family; where the grader would
   be the producing family, the case reports `ungraded`, never a pass.
4. The result file records fixture id, routing table id, Lens id and version.

**Test notes.** Acceptance 1 sounds pedantic and is the point — an aggregate is
how a permission regression gets averaged into invisibility.

**Estimate.** M. **Largest risk:** none material.

---

## T-258 — CI tiers, hold-out, flake detection
**Type:** infra · **Epic:** eval-harness · **Depends on:** T-257

**Scope.** Smoke tier (every change, fake router, all permission cases + one per
category and Lens) wired into `pnpm run check`. Full tier (nightly and
pre-release, real models). Hold-out excluded from development feedback. Repeat-run
flake detection.

**Acceptance.**
1. The smoke set runs in CI on every change and blocks on a regression **in any
   category**.
2. Hold-out results are not emitted outside a release run — including counts.
3. A case with inconsistent verdicts across N runs is marked `flaky` and
   reported in its own section, not counted in pass rates.
4. **A flaky declared-mode case fails the build; a flaky model-chosen case does
   not** — and the report says which it is.

**Test notes.** Acceptance 4 encodes the honest asymmetry from [03](03-orchestration-and-plan.md) §1.1.

**Estimate.** M. **Largest risk:** smoke-tier runtime. If it is slow it will be
skipped, and then it protects nothing.

---

## T-259 — The seed set
**Type:** infra · **Epic:** eval-harness · **Depends on:** T-258

**Scope.** The sixteen cases in [07](07-eval-harness.md) §9, in **Infora's own library**, on
fictional fixtures. Permission cases mandatory and in the smoke tier.

**Acceptance.**
1. All five categories and every assertion type are exercised by at least one
   case.
2. `PERM-05` passes: the same question under all four Lenses returns an
   identical source set.
3. `BEH-05` passes: promoting `commercial.yaml` to `active` fails validation
   with all three named messages.
4. The library is structurally separated from any organisation-owned library
   ([07](07-eval-harness.md) §3.1) — a test asserts the two cannot merge in either direction.

**Test notes.** `PERM-05` and `BEH-05` protect design decisions rather than
behaviour and are the two most likely to be quietly dropped. They are acceptance
criteria for that reason.

**Estimate.** M. **Largest risk:** cases 2 and 3 depend on the Lens work
(T-281/T-282); sequence them into the set as those land rather than blocking.

---

# Wave 2 — Orchestration

## T-260 — The plan artefact, persisted for the existing chain ⭐
**Type:** refactor · **Epic:** orchestration · **Depends on:** T-255
**Blocks:** T-252, T-261, T-262

**Context.** The vertical slice: persist a plan for the chain that already runs,
**changing no behaviour**. This is what makes everything after it inspectable.

**Scope.** `plans` and `plan_steps` tables in drawer 3. Write a plan for every
run — the existing four steps as four plan steps, `mode: declared`,
`workflow_id: null` for now. Versioned by supersession, not mutation; immutable
from `ready` onward.

**Out of scope.** Executing *from* the plan (T-262). Reading it over HTTP
(T-261).

**Acceptance.**
1. Every run writes a plan whose steps correspond 1:1 to its Step rows, linked
   by `step_row_id`.
2. **The eval smoke set is unchanged, green, and byte-identical in its answers**
   — this ticket changes no behaviour and must prove it.
3. A plan at `ready` cannot be mutated; the attempt is rejected by the trigger.
4. `mode` is a stored column, not derived.

**Test notes.** Acceptance 2 is the whole safety case for the refactor.

**Estimate.** M. **Largest risk:** none, by design — that is why it is the slice.

---

## T-261 — Plan read API and permissions 🔒
**Type:** feature · **Epic:** orchestration · **Depends on:** T-260

**Scope.** `GET /plans/:planId` and the plan on the run read. Producer-private,
resolved through `resourceScope` on its home project. Edit-and-rerun is
restricted to the requesting Participant.

**Acceptance.**
1. A plan is readable by the producing organisation's entitled Participants.
2. A different organisation gets the same 404 as nonexistence.
3. A colleague in the same organisation can read but not re-run.
4. The read carries no field derived from the caller — identity comes from the
   record.

**Test notes.** Eval category: permission.

**Security notes.** Inherits the 2026-07-12 producer-private ruling; do not
re-open it.

**Estimate.** S. **Largest risk:** none material.

---

## T-262 — Execute from the plan
**Type:** refactor · **Epic:** orchestration · **Depends on:** T-260

**Scope.** The executor walks `plan.steps` honouring `depends_on`, replacing the
hard-coded four-step sequence in `runChain`. The default plan remains the same
four steps in the same order.

**Out of scope.** Parallel fan-out (arrives with T-269's workers, which is when
independent steps first exist).

**Acceptance.**
1. Behaviour is unchanged: eval smoke set green, answers identical to T-260.
2. `depends_on` is honoured; a step never runs before its dependency completes.
3. The hard-coded sequence is gone — a grep for the old ordering in `chain.ts`
   returns nothing.

**Estimate.** M. **Largest risk:** the ground-check must stay outside the plan
(ADR-0028 amendment). If it becomes a plan step a planner could skip it, which
breaks the guarantee both modes rest on. Acceptance: a test asserts ground-check
runs even for a plan that does not declare it.

---

## T-263 — Step and run state migration
**Type:** infra · **Epic:** orchestration · **Depends on:** T-262

**Scope.** `step_type` enum gains the worker step types (`plan`, `clarify`,
`worker`, `verify`, `synthesise`). `run_state` gains
`completed_with_failures`. Contracts updated.

**Acceptance.**
1. Existing rows are unaffected; the migration is additive.
2. The contracts types and the DB enum cannot drift — a test asserts they match.

**Estimate.** S. **Largest risk:** the enum is referenced across `contracts`;
a drift here surfaces as a runtime cast failure, hence acceptance 2.

---

## T-264 — Workflow DAG format, loader and validator
**Type:** feature · **Epic:** orchestration · **Depends on:** T-263

**Context.** `packages/workflows` is an empty stub. A declared workflow is a plan
template.

**Scope.** The YAML declaration format ([03](03-orchestration-and-plan.md) §4), loader, and validation at
load: every worker in the registry, acyclic DAG, resolvable `depends_on`, no
step declaring a scope, `writes` declaring label-propagation behaviour, drafts
non-production only.

**Acceptance.**
1. Each validation rule has a fixture that fails it, with a message naming the
   file, the step and the rule.
2. A workflow declaring a scope on a step fails to load — scope is inherited and
   not expressible.
3. A cyclic DAG fails to load.
4. `status: draft` is absent in a production-configured load.

**Test notes.** Mirror the Lens validator's message quality bar (T-281).

**Security notes.** Acceptance 2 is a scope-widening guard.

**Estimate.** M. **Largest risk:** none material.

---

## T-265 — `workflow_runner` and the first declared workflow
**Type:** feature · **Epic:** orchestration · **Depends on:** T-264, T-269

**Scope.** The `workflow_runner` worker. One declared workflow — "answer a
question about the project", the existing four-step chain as a DAG, changing no
behaviour. Scope inherited and un-widenable at every step.

**Acceptance.**
1. The declared workflow produces answers identical to the pre-T-265 path; eval
   smoke set green.
2. A workflow step cannot widen scope — asserted by test, not inspection.
3. `steps_run` and `parameters_bound` are returned and visible on the plan.
4. The run's `mode` reads `declared` and `workflow_id` is set.

**Estimate.** M. **Largest risk:** `workflow_runner` is the one non-leaf worker;
keeping it from becoming a general escape hatch is a review discipline, not a
test.

---

## T-266 — Model-chosen orchestration and mode labelling
**Type:** feature · **Epic:** orchestration · **Depends on:** T-265

**Context.** Owner-ruled: both modes ship, honestly labelled. ADR-0027 and
ADR-0028 amended accordingly.

**Scope.** Classification producing one of the four outcomes ([03](03-orchestration-and-plan.md) §1.3). The
model-chosen dispatch loop over the entitled worker set. Mode stored on the
plan, the run, and Teach submissions. Fall-through rate as a reported metric.

**Acceptance.**
1. A question matching a declared workflow routes into it (`ROUTE-01`).
2. A question matching none produces a model-chosen plan.
3. **Ground-check runs on every answer in both modes** — asserted for a
   model-chosen plan that does not declare verification.
4. The mode is present on the plan, the run record, and any Teach submission,
   and stated in words in the completion footer.
5. The eval report shows the two modes as separate categories.

**Test notes.** Acceptance 3 is the guarantee the ADR amendment rests on. A
wrong implementation would pass 1, 2, 4 and 5.

**Security notes.** 🔒-adjacent: model-chosen worker selection must draw only
from the **entitled** set ([02](02-worker-registry.md) §9), never the full registry.

**Estimate.** L. **Largest risk:** classification quality. A poor classifier
routes everything to model-chosen and the product quietly becomes the generic
agent the design forbids — which is why the fall-through rate is a metric.

---

## T-267 — Plan edit and re-run
**Type:** feature · **Epic:** orchestration · **Depends on:** T-266

**Scope.** Edit a step's inputs, remove a step, add one from the **entitled**
set; re-run. Re-running writes a new Run and a new plan and sets
`superseded_by`.

**Acceptance.**
1. An edited plan re-runs and produces a new Run; the old plan is marked
   superseded and remains readable.
2. **An edited plan is `mode: model_chosen`, even if it started `declared`** —
   and the UI says so at the point of editing.
3. A user cannot add a worker they are not entitled to; the option is absent,
   not disabled.
4. Scope is not an editable field.

**Test notes.** Acceptance 2 is a labelling-honesty requirement, not a nicety.

**Estimate.** M. **Largest risk:** none material.

---

## T-268 — Partial failure semantics
**Type:** feature · **Epic:** orchestration · **Depends on:** T-266

**Context.** The current chain fails hard ([chain.ts:94-98](../../packages/orchestration/src/chain.ts#L94-L98)). For a
multi-worker plan that is too blunt: one failed web search should not discard a
completed corpus search.

**Scope.** Failed step → dependants `skipped`, independent branches continue.
`completed_with_failures` when some output survived. The answer states what did
not run.

**Acceptance.**
1. A failed independent branch does not prevent the run completing.
2. Dependants of a failed step are `skipped`, never `failed`.
3. **The answer body reports what did not run** — in the body, not only the
   footer.
4. The progress rail shows failed and skipped stages as such, never completed.

**Test notes.** Acceptance 3 is shared-core rule 1.5 (absence detection) applied
to the system's own failures.

**Estimate.** M. **Largest risk:** none material.

---

# Wave 3 — Workers

## T-269 — Worker registry, typed contract, entitlement assembly ⭐
**Type:** feature · **Epic:** worker-registry · **Depends on:** T-248, T-263
**Blocks:** T-265, T-272 – T-280

**Context.** The vertical slice for this epic: the registry plus one worker
(`corpus_retrieval`, wrapping the path that already works).

**Scope.** The worker declaration type (name, purpose, tier, input/output
schemas, tools, scope expression, writes, cacheability, narrowing). Registry
loading and validation. **Entitlement assembly**: the orchestrator's tool set is
built from the requester's slice, the deployment tier and the organisation's
licences — an unentitled worker is **absent, not disabled**.

**Out of scope.** Every worker but `corpus_retrieval`.

**Acceptance.**
1. A worker invocation writes a Step (and, where it delegates, a child Run) on
   the existing append-only tree.
2. An unentitled worker is absent from the assembled set, and the model is never
   told it exists — asserted by inspecting the assembled tool set, not the prose.
3. A sovereign-tier deployment assembles no `web_research`, falling out of the
   existing router policy rather than a new switch.
4. A worker's declared narrowing is applied to its slice (T-248) and cannot
   widen it.
5. Eval smoke set green; behaviour unchanged.

**Test notes.** Eval category: permission (acceptance 2, 3, 4).

**Security notes.** 🔒 Non-negotiable 3 and the "do not present a tool then
refuse it" rule.

**Estimate.** L. **Largest risk:** the registry becoming a place where a generic
worker can be added without review. Mitigation is the review discipline in
[02](02-worker-registry.md) §0 and the `ROUTE-01` eval.

---

## T-270 — SPIKE: locator extraction
**Type:** spike · **Epic:** worker-registry · **Depends on:** none
**Blocks:** T-271

**Context.** The chunker records no page/paragraph/section
([chunker.ts](../../packages/data/src/chunker.ts)), so non-negotiable 1 ("document, **locator** and version")
cannot be met at locator grain. Phase 0 left this genuinely open: what is
extractable differs by source format (`infora_text`, docx, pdf, xlsx, pptx).

**Scope.** Timeboxed investigation. Per format: what locator is reliably
extractable, at what cost, and — **owner-ruled 2026-07-29** — whether the
**verbatim-passage fallback** is workable there. The ruling settles the product
question the spike would otherwise have had to raise: where no locator is
extractable, the citation carries the quoted text so the reader can search for
it, and the answer never degrades silently to version grain. The spike's job is
now the engineering half only.

**Acceptance.**
1. A written recommendation covering all five formats, with a worked example per
   format from a real seed document.
2. Per format: locator extractable (and its shape), or verbatim-quote fallback —
   with the chunk-boundary question answered, since a quote spanning a chunk
   boundary is the case that breaks the fallback.
3. A cost estimate for re-ingesting the existing corpus.

**Estimate.** S (timeboxed). **Largest risk:** acceptance 2's chunk-boundary
case. PDF paragraph numbering being unreliable is expected and now has a ruled
answer; a quote that cannot be reproduced contiguously does not.

---

## T-271 — Locators through the ingest pipeline
**Type:** feature · **Epic:** worker-registry · **Depends on:** T-270

**Scope.** Per the spike's recommendation: locator capture in the chunker,
persisted on `version_chunks`, carried through retrieval, the citation record
and the rendered citation — **plus the verbatim-passage fallback** where a
format yields no reliable locator (owner-ruled 2026-07-29).

**Acceptance.**
1. A citation resolves to document, version and **a locator** end to end,
   visible in the UI, for every format where the spike found one extractable.
2. Where no locator is available, the citation carries the **verbatim passage**
   — never an empty locator, never an invented one, and **never a bare version
   reference**.
3. The quoted passage is reproducible against the stored chunk: pasting it into
   the source document finds it. Asserted by test, per format.
4. Re-ingest is idempotent and the per-model chunk index rule is preserved.

**Test notes.** This closes the largest honesty gap in the current system.
Acceptance 3 is the one that makes the fallback worth having — a quote that
cannot be found in the document is worse than no quote, because it looks
checkable and is not.

**Estimate.** L. **Largest risk:** re-ingesting the corpus; the migration path
for existing chunks belongs in the plan, not as an afterthought.

---

## T-272 — `corpus_retrieval` — coverage note, chunk ids, structured output
**Type:** feature · **Epic:** worker-registry · **Depends on:** T-269, T-253

**Scope.** The full declared output shape: passages with chunk id, version,
locator, superseded flag and relevance, plus the `coverage_note`. Cache keyed on
query + corpus version + **scope hash computed from the resolved slice**.

**Acceptance.**
1. `coverage_note` states what slice was searched, how many candidates the
   pre-filter admitted, and which requested terms found nothing.
2. The cache key includes the scope hash; two users with different entitlements
   never share a cache entry — asserted by test.
3. Output conforms to the declared schema; a non-conforming return fails.

**Security notes.** 🔒 Acceptance 2. A cache without scope in the key is a
permission bypass with extra steps.

**Estimate.** M. **Largest risk:** acceptance 2.

---

## T-273 — `include_superseded` with mandatory flagging
**Type:** feature · **Epic:** worker-registry · **Depends on:** T-272

**Scope.** The deliberate opt-in. Superseded passages flagged in the output
object **and at every point of use in the answer**.

**Acceptance.**
1. Default remains exclusion; the existing wall test still passes unchanged.
2. With the flag set, superseded passages return and are marked.
3. A superseded source used in an answer carries a flag **in the prose at the
   point of use**, not only in the manifest.

**Test notes.** Eval category: trap.

**Security notes.** Non-negotiable 10.

**Estimate.** S. **Largest risk:** acceptance 3 — the flag is easy to render in
the footer and easy to forget in the body, which is where it matters.

---

## T-274 — `extractor` and the named schemas
**Type:** feature · **Epic:** worker-registry · **Depends on:** T-269

**Scope.** The worker plus the first named schemas (commitments,
consultee_responses, mitigation_measures, exa_questions, deadlines, parameters)
as versioned domain content beside the Lens files. `strict` default true;
`failures` a first-class output.

**Acceptance.**
1. Every record carries source and locator.
2. A record that does not fully conform is reported in `failures` with a reason,
   **never coerced** — asserted with a deliberately malformed fixture.
3. Adding a schema requires no code change.

**Estimate.** M. **Largest risk:** acceptance 2 is the one that makes the
commitments register trustworthy; a silently coerced record is worse than none.

---

## T-275 — `verifier` on an independent model family
**Type:** feature · **Epic:** worker-registry · **Depends on:** T-269, T-286

**Scope.** Per-claim verdicts (supported / partial / unsupported /
contradicted) with locator and rationale. Runs **on top of** the deterministic
ground-check.

**Acceptance.**
1. The deterministic ground-check still runs on every answer, unchanged and
   unbypassed — asserted by a test that removes the verifier from a plan.
2. The verifier is refused dispatch to the family that produced the claims; where
   no independent family conforms to the tier, the step is `skipped` with a
   stated reason and **never silently run same-family**.
3. Skipped verification is visible in the completion footer and counted in the
   eval report.

**Test notes.** Acceptance 1 is the guard against this ticket being implemented
as a replacement rather than a layer.

**Security notes.** Not a permission boundary, but a guarantee boundary —
reviewed with the same care.

**Estimate.** M. **Largest risk:** implementing it as a replacement for the
deterministic check. [02](02-worker-registry.md) §7 tables the distinction; cite it in the PR.

---

## T-276 — SPIKE: the authority corpus
**Type:** spike · **Epic:** worker-registry · **Depends on:** none
**Blocks:** T-277

**Context.** `authorityRef` runs through contracts, the citation table and the
ground-check, but **there is no store and no pipeline** — the canon half of
Ask's promise has no data. The grill tracker already carries this as an open
Context item (encoding format, currency cadence, v1 jurisdiction scope).

**Scope.** Timeboxed. **The licensing fork is already ruled** (owner,
2026-07-29, ADR-0023 extended): the corpus is **two-tier**. Infora ships the
**standard tier**, deliberately confined to freely shippable material — UK
legislation, NPSs, PINS Advice Notes, s.51 advice, DCOs and Decision Letters,
all Crown copyright under the Open Government Licence — so **Infora buys no
per-customer standards subscriptions**. Organisations add their own
**organisation tier** (licensed ISO/BSI material they already subscribe to,
sector guidance, policy) into their portable org context.

The spike therefore covers: exactly which instruments the standard tier holds at
v1 and where each is sourced; how an in-force interval is modelled (commencement,
amendment, supersession by date); how the org tier is ingested and by whom; and
how the two tiers' differing currency guarantees are represented.

**Acceptance.**
1. A written recommendation naming the v1 standard-tier instrument list with a
   source and licence basis for each — and confirming none requires a paid
   licence.
2. A proposed schema for `authority_instruments` / `authority_provisions`
   carrying `tier`, the in-force interval, and `currency`
   (`infora_maintained` | `org_declared`) with `last_reviewed`.
3. A recommendation on org-tier ingest: who may add, in what formats, and how an
   org-declared in-force interval is captured without pretending to Infora's
   guarantee.
4. Confirmation that jurisdiction scope at v1 is England & Wales NSIP consenting
   only, or a stated reason to widen it.

**Estimate.** M (timeboxed). **Largest risk:** acceptance 1 — if any instrument
the Lenses depend on turns out not to be freely shippable, the tier boundary
moves and the commercial answer changes with it.

---

## T-277 — Authority corpus store and ingest
**Type:** feature · **Epic:** worker-registry · **Depends on:** T-276

**Scope.** Per the spike: schema, migration, in-force interval modelling, and
**both tiers** — Infora's standard-tier ingest, and org-tier ingest by an
organisation owner into its portable org context.

**Acceptance.**
1. An instrument is stored with its tier, in-force interval and supersession
   pointer.
2. A query for a past `in_force_at` returns the version in force **at that
   date**, not the current one.
3. **An organisation's tier is invisible to every other organisation** — a
   provision added by Org A is absent for Org B, indistinguishable from
   nonexistence, and a test asserts it across the wall.
4. An org-tier entry carries an org-declared interval and `last_reviewed`, and
   **cannot be recorded as `infora_maintained`** — the two currency guarantees
   are structurally distinct, not a flag someone can set wrongly.
5. The org tier travels with the organisation to every project it works on,
   without being copied per project.

**Security notes.** 🔒 Acceptance 3 — the org tier sits on the ADR-0018 private
floor, so this is a wall test, not merely a scoping one. The standard tier's
global read-only posture is different from anything else in the system and needs
its own review.

**Estimate.** L. **Largest risk:** in-force interval modelling. Getting it wrong
makes every staleness answer wrong, and staleness is a shared-core rule.

---

## T-278 — `authority_lookup`
**Type:** feature · **Epic:** worker-registry · **Depends on:** T-277, T-269

**Scope.** The worker, resolving the standard tier ∪ the requester's own
organisation tier, with `in_force_at`, a per-tier `currency_note`, and a cache
key carrying `org_shelf_version`.

**Acceptance.**
1. `currency_note` names what has been revised since `in_force_at`, **per
   tier** — org-declared currency is never reported as Infora-maintained.
2. An answer resting on a revised instrument names the version relied on
   (`BEH-04`).
3. Every returned provision carries its `tier`.
4. **Cache entries are never shared across differing org shelves** — asserted by
   a test where two organisations issue the identical query and one holds a
   provision the other does not.

**Security notes.** 🔒 Acceptance 4. A cache keyed only on the query would serve
one organisation's private shelf to another — the same class of bug as an
unscoped retrieval cache (T-272).

**Estimate.** M. **Largest risk:** acceptance 4.

---

## T-279 — `web_research` 🔒
**Type:** feature · **Epic:** worker-registry · **Depends on:** T-250, T-269

**Context.** ADR-0022 amended: agent-performed web research is carved out of the
attached-source never-cites rule; user-pinned sources keep the original rule.

**Scope.** The worker in `packages/external`, behind the T-250 barrier. Search
and fetch, returning `ExternalSource[]` labelled `external-untrusted`. Egress
recorded on the Step alongside model egress.

**Acceptance.**
1. The worker's dependencies carry **no** `Db`, `assemble` or `EntitledSlice` —
   it cannot query a store, and the dep rule proves it.
2. Every returned source carries URL, publisher, date and retrieval timestamp.
3. A fetch is recorded as egress on the Step.
4. Corpus content is never present in the worker's context — asserted by a test
   that inspects its actual inputs.
5. User-pinned web attached sources remain non-citing, unchanged.

**Test notes.** Acceptance 4 and 5 together are the ADR-0022 amendment's two
halves.

**Security notes.** Non-negotiable 5. The whole safety case is that the worker
holding injected text never holds corpus data.

**Estimate.** M. **Largest risk:** acceptance 5 — the two web paths are easy to
conflate once both exist.

---

## T-280 — `document_builder` 🔒
**Type:** feature · **Epic:** worker-registry · **Depends on:** T-249, T-269

**Scope.** Draft into a tenant template with a source manifest and the computed
label. `sources` is explicit (version ids from the orchestrator), never
self-retrieved.

**Acceptance.**
1. The manifest lists every source used, with reference, version and locator.
2. The computed label is returned and enforced against the destination (T-249);
   a broader destination is refused.
3. Withheld claims are returned and surfaced, not dropped.
4. The worker does not retrieve — it has no retrieval tool in its declaration.

**Security notes.** The write path. Non-negotiable 4.

**Estimate.** L. **Largest risk:** template handling is new ground; the manifest
and label are the parts that must not be compromised for it.

---

# Wave 4 — Lens

## T-281 — `packages/lenses`: loader, validator, one Lens wired ⭐
**Type:** feature · **Epic:** lens · **Depends on:** none

**Context.** Vertical slice. "Role" is taken (Membership role); the persona is a
**Lens** (CONTEXT.md).

**Scope.** A new leaf package depending on `contracts` only. The definitions move
verbatim from [lenses/](lenses/). Schema validation at startup with
domain-expert-readable failures. Composition into the system prompt: shared core
→ mode statement → Lens overlay → task. One Lens wired end to end.

**Out of scope.** The other four Lenses (T-282); switching UX (T-283).

**Acceptance.**
1. A Lens whose `prohibitions` attempt to negate a shared-core rule **fails to
   load**, with a message naming the file, the field and the specific rule.
2. Every validation failure message names file, field and rule in language a
   domain expert can act on — reviewed against [lenses/AUTHORING.md](lenses/AUTHORING.md), not a
   schema-library stack trace.
3. `status: draft` loads in non-production only.
4. **The Lens is not a parameter of `resolveAccess`, `assemble` or
   `groundedLibrary`** — asserted by a signature test.
5. `commercial.yaml` promoted to `active` fails with all three messages named in
   its header comment (`BEH-05`).

**Test notes.** Acceptance 4 is non-negotiable 11 made structural.

**Security notes.** 🔒-adjacent: acceptance 4 is what stops a persona becoming a
data filter.

**Estimate.** M. **Largest risk:** acceptance 2. Error-message quality is the
thing that decides whether this layer stays domain-expert-owned or quietly
reverts to engineers.

---

## T-282 — The four active Lenses and the draft
**Type:** feature · **Epic:** lens · **Depends on:** T-281

**Scope.** All four active Lens definitions plus the Commercial draft, moved to
the runtime package. `example_exchanges` become eval cases.

**Acceptance.**
1. All four load and validate; the draft loads only in non-production.
2. Each Lens's `example_exchanges` are runnable eval cases in the behaviour
   category.
3. `BEH-01` – `BEH-03` pass (Planning refuses outcome prediction; Communications
   flags unpublished material; PM marks inferred dates).
4. `PERM-05` passes: identical source set across all four Lenses.

**Estimate.** M. **Largest risk:** the register differences being cosmetic rather
than real. The example exchanges as eval cases are the guard.

---

## T-283 — Lens switching, persistence, logging
**Type:** feature · **Epic:** lens · **Depends on:** T-282

**Scope.** Mid-conversation switching; history keeps the Lens it was produced
under. Persistence to `user.preferences`; default `planning-environmental` as
config. Lens id + version logged per request.

**Acceptance.**
1. Switching re-renders the next answer only; prior turns keep their Lens and
   display it.
2. The active Lens and version are recorded on every run and visible in the
   footer.
3. The default is config-driven, not hard-coded.

**Estimate.** S. **Largest risk:** none material.

---

# Wave 5 — Model routing

## T-284 — Task-class routing
**Type:** feature · **Epic:** model-routing · **Depends on:** T-263

**Context.** `Router.chat(task, request)` accepts a task argument and **ignores
it** ([router.ts:77](../../packages/model/src/router.ts#L77)). The seam exists; the routing does not.

**Scope.** The routing table as configuration, honouring the task argument. Hot
reload in non-production only.

**Acceptance.**
1. **Tier conformance is applied before task selection**, unchanged — a
   non-conforming cheaper model is never selected, and the existing fail-closed
   tests pass untouched.
2. Each task class dispatches to its configured route; the choice is recorded on
   the Step.
3. The system runs entirely on frontier models with a config change only.
4. The routing table id is recorded in every eval result file.

**Security notes.** 🔒-adjacent: acceptance 1. The tier constraint is ADR-0037's
guarantee and must not be weakened by adding a second axis above it.

**Estimate.** M. **Largest risk:** acceptance 1 — the ordering is easy to invert
when adding the new axis.

---

## T-285 — Fallback chains
**Type:** feature · **Epic:** model-routing · **Depends on:** T-284

**Acceptance.**
1. A fallback is attempted **only if it also conforms to the deployment tier**.
2. An exhausted chain fails the step with a stated reason; the run continues per
   T-268.
3. Every attempt, including failures, writes a Step audit row with egress facts.

**Security notes.** 🔒-adjacent. Availability is never traded for tier
conformance.

**Estimate.** S. **Largest risk:** acceptance 1.

---

## T-286 — The verify independence constraint
**Type:** feature · **Epic:** model-routing · **Depends on:** T-284
**Blocks:** T-275

**Acceptance.**
1. Verification is refused dispatch to the family that produced the claims.
2. Where no independent conforming family exists, verification is **unavailable**
   and the step is skipped with a stated reason — never silently same-family.
3. The constraint is enforced in code, not only expressed in config; a config
   naming the same family fails at dispatch.

**Estimate.** S. **Largest risk:** acceptance 3 — config-only enforcement would
pass a naive test.

---

# Wave 6 — Clarifying questions

## T-287 — Clarification schema, plan states, binding
**Type:** feature · **Epic:** clarifying-questions · **Depends on:** T-266

**Scope.** The `clarifications` structure, the `awaiting_clarification` plan
state, binding answers into workflow parameters or orchestrator scope, and the
`assumptions` array populated from skipped questions. Lens-aware content from
`clarifying_bias`.

**Acceptance.**
1. A workflow with unbound required parameters triggers scoping deterministically.
2. Answers bind into the plan and are visible there.
3. **Skipping all proceeds on stated assumptions named at the top of the
   answer**, not in a footer.
4. A skipped question records the recommendation that was not taken.
5. **No clarifying question offers an option the user cannot reach** — asserted
   against a narrowed fixture.

**Security notes.** 🔒-adjacent: acceptance 5. A scoping question is about
relevance, never permission.

**Estimate.** M. **Largest risk:** acceptance 5.

---

## T-288 — The scoping surface
**Type:** feature · **Epic:** clarifying-questions · **Depends on:** T-287

**Scope.** Paginated numbered questions with a position indicator; options with
an info affordance explaining the **consequence**; at most one RECOMMENDED
badge; Custom free text; Skip this question; Skip All Questions always visible.
Labelled **Scoping**, not "clarify".

**Acceptance.**
1. Skip All is reachable from every question without scrolling.
2. At most one option per question carries the badge; zero is valid.
3. Every option's info affordance states a consequence, not a definition —
   reviewed against [05](05-clarifying-questions.md) §2.1's worked example.
4. Semantic tokens, no `window.prompt`.

**Estimate.** M. **Largest risk:** acceptance 3 degrading into glossary
expansion, which is the difference between a colleague and a form.

---

# Wave 7 — Teach

## T-289 — Teach capture 🔒
**Type:** feature · **Epic:** teach · **Depends on:** T-266

**Context.** Owner-ruled: no aggregation across customers. Teach lands entirely
inside the originating organisation's boundary — ADR-0026 applied unchanged.

**Scope.** The control on completed responses; the dialogue with model-drafted
editable text; the explicit in-organisation transmission statement; the
confirmation checkbox (*"safe to reuse on this organisation's other
projects"*); tier pre-selection. The submission record with **real**
identifiers, `plan_pointer` as a pointer, and mode + Lens captured.

**Acceptance.**
1. Submission is disabled until the checkbox is ticked.
2. The dialogue states in plain words that the text stays inside the
   organisation.
3. **No submission field leaves the organisation** — asserted by a test over the
   write path and the absence of any egress call.
4. `plan_pointer` resolves only for a reviewer already entitled to that project.
5. Mode and Lens version are captured.

**Security notes.** ADR-0026's boundary. Acceptance 3 is the ticket's reason for
being a security ticket.

**Estimate.** M. **Largest risk:** the checkbox wording. The old
"confidential or sensitive" wording implies an egress that does not happen and
asks the wrong question — see [06](06-teach.md) §2.1.

---

## T-290 — The reviewer queue 🔒
**Type:** feature · **Epic:** teach · **Depends on:** T-289

**Scope.** An **organisation-facing** queue for the firm's curator and org
admin. List, filter, view, Approve / Reject / Convert to eval case / Re-tier.
Append-only audit.

**Acceptance.**
1. The queue is access-resolved; a reviewer sees only submissions from projects
   they are entitled to, and the wall holds inside the queue.
2. **Promotion takes a required, non-nullable approving participant id** — there
   is no `autoApprove` flag, config key or environment variable, and a grep
   proves it.
3. Every action is audited with who, when and reason.
4. Content can be **removed**, not only added.

**Security notes.** Acceptance 2 is the "no code path that could be flipped on"
requirement, made checkable.

**Estimate.** M. **Largest risk:** acceptance 1 — a queue is exactly the kind of
cross-cutting list where a wall is forgotten.

---

## T-291 — Correction → organisation eval case
**Type:** feature · **Epic:** teach · **Depends on:** T-290, T-259

**Scope.** Conversion into a case in **that organisation's own library**, pinned
to a fixture from its own corpus, with the expect-it-to-fail gate.

**Acceptance.**
1. A converted case is created in the organisation's library, never Infora's.
2. **The new case is run against the current system at conversion; a case that
   passes is closed as noise and not added.**
3. The two libraries cannot merge in either direction — asserted by test.
4. The generated case is pinned to a frozen fixture, not the live corpus.

**Test notes.** Acceptance 2 is what keeps the library meaningful; without it the
suite inflates with cases that can never catch a regression.

**Estimate.** M. **Largest risk:** generating a fixture from a live corpus
without capturing enough of the access graph to make the case reproducible.

---

# Wave 8 — Interface

## T-292 — Composer chips
**Type:** feature · **Epic:** interface · **Depends on:** T-283, T-284

**Scope.** Lens, Model, Data sources, Tools, Context indicator.

**Acceptance.**
1. The Lens picker states in the picker itself that a Lens does not change what
   you can see.
2. The Model chip defaults to Auto, pins per conversation only, resets clearly,
   and **lists only tier-conforming routes** — a non-conforming model is absent,
   not disabled.
3. The Data sources chip shows a **warning state when zero sources are in
   scope**.
4. The Data sources list shows only entitled documents, built from the same
   pre-filter as retrieval.
5. Refinement narrows only; the selection is intersected server-side.

**Security notes.** 🔒-adjacent: acceptance 4 and 5.

**Estimate.** L. **Largest risk:** acceptance 5 — a client-side "refinement" that
the server treats as authoritative would be a scope-widening bug.

---

## T-293 — The progress rail
**Type:** feature · **Epic:** interface · **Depends on:** T-268

**Acceptance.**
1. Stages are driven by plan step states, **never a client-side timer**.
2. A stage that did not run is never shown as having run.
3. Failed and skipped stages render as failed and skipped.
4. A conditional stage that was not needed is absent or explicitly marked not
   run — never quietly completed.

**Test notes.** E2E with a plan that skips a branch, asserting the rail.

**Estimate.** M. **Largest risk:** acceptance 1. A timer-driven rail looks right
most of the time, which is what makes it a trust problem rather than a bug.

---

## T-294 — The completion footer and plan view
**Type:** feature · **Epic:** interface · **Depends on:** T-267, T-293

**Acceptance.**
1. **The orchestration mode is stated in words**, always visible, not behind
   Details.
2. The Lens and version are shown.
3. Details exposes the plan (editable, re-runnable), workers invoked, per-step
   model and cost with pins marked, and the full citation manifest.
4. Where verification could not be taken independently, the footer says so.
5. `RunTrace` is reused, not duplicated.

**Estimate.** M. **Largest risk:** none material.

---

## T-295 — The output destination selector 🔒
**Type:** feature · **Epic:** interface · **Depends on:** T-249, T-280

**Acceptance.**
1. Destinations are the sandboxes the user can reach, at their real scope.
2. A destination broader than the source material **warns naming both labels**
   and is blocked by default.
3. The override is explicit, recorded on the plan and in the audit trail.
4. The computed label appears in the completion footer.

**Security notes.** Non-negotiable 4. Cannot ship before T-249 — a selector
without propagation implies a guarantee the backend does not make.

**Estimate.** M. **Largest risk:** none beyond T-249's.

---

## T-296 — Four-register rendering
**Type:** feature · **Epic:** interface · **Depends on:** T-279, T-278, T-271

**Acceptance.**
1. Record, Inference, Authority and External render **visually distinct**, by
   chip shape and colour — not by tooltip.
2. **An external source is not mistakable for a project or authority citation at
   a glance** — reviewed as an explicit acceptance, not assumed.
3. Superseded sources carry a flag **in the prose at the point of use**.
4. Semantic tokens only.

**Test notes.** Acceptance 2 is a judgement call and is reviewed by a person;
state in the PR who reviewed it and against what.

**Estimate.** M. **Largest risk:** acceptance 2 is the visible half of the
ADR-0022 carve-out and the half a client will judge.

---

# Dependency summary

```
T-247 ─┐
T-248 ─┼─► T-269 ─┬─► T-272 ─► T-273
T-263 ─┘          ├─► T-274
                  ├─► T-275 ◄── T-286 ◄── T-284 ─► T-285
T-255 ─► T-256 ─► T-257 ─► T-258 ─► T-259
   └──► T-260 ─┬─► T-261
               ├─► T-262 ─► T-263 ─► T-264 ─► T-265 ─► T-266 ─┬─► T-267 ─► T-294
               └─► T-252 ◄── T-251                            ├─► T-268 ─► T-293
                                                              ├─► T-287 ─► T-288
                                                              └─► T-289 ─► T-290 ─► T-291
T-245 ─► T-246
T-249 ─► T-280 ─► T-295
T-250 ─► T-279 ─► T-296
T-270 ─► T-271 ─► T-296
T-276 ─► T-277 ─► T-278 ─► T-296
T-281 ─► T-282 ─► T-283 ─► T-292
```

**No owner gate outstanding.** ADR-0046's three forks were settled 2026-07-29
and the ADR is Accepted, so T-245 is execution-ready.

**Added during the build:** **T-297 — RLS on `containers`** (split from T-247;
see that ticket's Out of scope). Sequences with, or after, the Wave 2
orchestration work, since both want a per-request transaction seam.

**Spikes:** T-270 (locators), T-276 (authority corpus). Both can start
immediately and in parallel with Wave 0 — neither blocks it. T-276 is the one
that may still surface an owner decision: the licensing of standards is a
commercial question the spike can frame but not answer.
